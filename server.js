require('dotenv').config();
const express = require('express');
const PORT = 3000;
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const { pool, initDB } = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── 인증 미들웨어 ───────────────────────────────────────────
const auth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: '인증이 필요합니다' });
  }
  try {
    req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: '로그인이 만료되었습니다. 다시 로그인해주세요.' });
  }
};

// ─── 로그인 ──────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '아이디와 비밀번호를 입력하세요' });
    }
    const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다' });
    }
    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, username: user.username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다' });
  }
});

// ─── 비밀번호 변경 ────────────────────────────────────────────
app.post('/api/change-password', auth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = rows[0];
    if (!await bcrypt.compare(current_password, user.password_hash)) {
      return res.status(401).json({ error: '현재 비밀번호가 올바르지 않습니다' });
    }
    if (new_password.length < 4) {
      return res.status(400).json({ error: '새 비밀번호는 4자 이상이어야 합니다' });
    }
    const hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '비밀번호 변경 실패' });
  }
});

// ─── 매출 조회 ────────────────────────────────────────────────
app.get('/api/sales', auth, async (req, res) => {
  try {
    const { date, start, end } = req.query;
    let rows;
    if (start && end) {
      ({ rows } = await pool.query(
        'SELECT * FROM sales WHERE date BETWEEN $1 AND $2 ORDER BY date DESC, created_at DESC',
        [start, end]
      ));
    } else {
      const d = date || new Date().toISOString().split('T')[0];
      ({ rows } = await pool.query(
        'SELECT * FROM sales WHERE date = $1 ORDER BY created_at DESC',
        [d]
      ));
    }
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '매출 조회 실패' });
  }
});

// ─── 매출 등록 ────────────────────────────────────────────────
app.post('/api/sales', auth, async (req, res) => {
  try {
    const { date, room_number, payment_method, amount, memo } = req.body;
    if (!date || !room_number || !payment_method || !amount) {
      return res.status(400).json({ error: '필수 항목을 모두 입력하세요' });
    }
    if (room_number < 1 || room_number > 8) {
      return res.status(400).json({ error: '방 번호는 1~8 사이여야 합니다' });
    }
    if (!['card', 'cash', 'transfer'].includes(payment_method)) {
      return res.status(400).json({ error: '올바른 결제수단을 선택하세요' });
    }
    if (amount <= 0) {
      return res.status(400).json({ error: '금액은 0보다 커야 합니다' });
    }
    const { rows } = await pool.query(
      'INSERT INTO sales (date, room_number, payment_method, amount, memo) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [date, room_number, payment_method, amount, memo || '']
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '매출 등록 실패' });
  }
});

// ─── 매출 수정 ────────────────────────────────────────────────
app.put('/api/sales/:id', auth, async (req, res) => {
  try {
    const { room_number, payment_method, amount, memo } = req.body;
    const { rows } = await pool.query(
      'UPDATE sales SET room_number=$1, payment_method=$2, amount=$3, memo=$4 WHERE id=$5 RETURNING *',
      [room_number, payment_method, amount, memo || '', req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: '내역을 찾을 수 없습니다' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '수정 실패' });
  }
});

// ─── 매출 삭제 ────────────────────────────────────────────────
app.delete('/api/sales/:id', auth, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM sales WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: '내역을 찾을 수 없습니다' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '삭제 실패' });
  }
});

// ─── 통계 ─────────────────────────────────────────────────────
app.get('/api/stats', auth, async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: '날짜 범위를 지정하세요' });

    const [{ rows: daily }, { rows: rooms }, { rows: payments }] = await Promise.all([
      pool.query(`
        SELECT date::text,
          COALESCE(SUM(amount),0)::int AS total,
          COALESCE(SUM(CASE WHEN payment_method='card' THEN amount ELSE 0 END),0)::int AS card_total,
          COALESCE(SUM(CASE WHEN payment_method='cash' THEN amount ELSE 0 END),0)::int AS cash_total,
          COALESCE(SUM(CASE WHEN payment_method='transfer' THEN amount ELSE 0 END),0)::int AS transfer_total,
          COUNT(*)::int AS count
        FROM sales WHERE date BETWEEN $1 AND $2
        GROUP BY date ORDER BY date
      `, [start, end]),
      pool.query(`
        SELECT room_number,
          COALESCE(SUM(amount),0)::int AS total,
          COUNT(*)::int AS count
        FROM sales WHERE date BETWEEN $1 AND $2
        GROUP BY room_number ORDER BY room_number
      `, [start, end]),
      pool.query(`
        SELECT payment_method,
          COALESCE(SUM(amount),0)::int AS total,
          COUNT(*)::int AS count
        FROM sales WHERE date BETWEEN $1 AND $2
        GROUP BY payment_method
      `, [start, end])
    ]);

    res.json({ daily, rooms, payments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '통계 조회 실패' });
  }
});

// ─── 서버 시작 ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`서버 실행됨 👉 http://localhost:${PORT}`);
});
