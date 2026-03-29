require('dotenv').config();
const express = require('express');
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

// ─── 회원가입 ─────────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '아이디와 비밀번호를 입력하세요' });
    }
    if (username.length < 3) {
      return res.status(400).json({ error: '아이디는 3자 이상이어야 합니다' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: '비밀번호는 4자 이상이어야 합니다' });
    }
    const { rows } = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (rows.length > 0) {
      return res.status(409).json({ error: '이미 사용 중인 아이디입니다' });
    }
    const hash = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO users (username, password_hash) VALUES ($1, $2)', [username, hash]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '회원가입 실패' });
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

// ─── 쿠폰 회원 조회 ──────────────────────────────────────────
app.get('/api/coupon/members', auth, async (req, res) => {
  try {
    const { search } = req.query;
    const where = search ? 'WHERE m.name ILIKE $1 OR m.phone ILIKE $1' : '';
    const params = search ? [`%${search}%`] : [];
    const { rows } = await pool.query(`
      SELECT m.id, m.name, m.phone, m.gender, m.memo,
             COALESCE(SUM(t.remaining),0)::int AS remaining,
             MAX(t.purchase_date)::text AS last_purchase,
             MAX(t.expire_date)::text   AS expire_date
      FROM coupon_members m
      LEFT JOIN coupon_tickets t ON t.member_id = m.id
      ${where} GROUP BY m.id ORDER BY m.name
    `, params);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: '회원 조회 실패' }); }
});

// ─── 쿠폰 회원 등록 ──────────────────────────────────────────
app.post('/api/coupon/members', auth, async (req, res) => {
  try {
    const { name, phone, gender, memo } = req.body;
    if (!name) return res.status(400).json({ error: '이름을 입력하세요' });
    const { rows } = await pool.query(
      'INSERT INTO coupon_members(name,phone,gender,memo) VALUES($1,$2,$3,$4) RETURNING *',
      [name, phone||'', gender||'남', memo||'']
    );
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: '회원 등록 실패' }); }
});

// ─── 쿠폰 회원 수정 ──────────────────────────────────────────
app.put('/api/coupon/members/:id', auth, async (req, res) => {
  try {
    const { name, phone, gender, memo } = req.body;
    if (!name) return res.status(400).json({ error: '이름을 입력하세요' });
    const { rows } = await pool.query(
      'UPDATE coupon_members SET name=$1,phone=$2,gender=$3,memo=$4 WHERE id=$5 RETURNING *',
      [name, phone||'', gender||'남', memo||'', req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: '회원을 찾을 수 없습니다' });
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: '회원 수정 실패' }); }
});

// ─── 쿠폰 회원 삭제 ──────────────────────────────────────────
app.delete('/api/coupon/members/:id', auth, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM coupon_members WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: '회원을 찾을 수 없습니다' });
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '회원 삭제 실패' }); }
});

// ─── 잔여 이용권 조회 (이용 처리 모달용) ─────────────────────
app.get('/api/coupon/tickets/:memberId', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, ticket_type, remaining, purchase_date::text, expire_date::text
       FROM coupon_tickets WHERE member_id=$1 AND remaining>0 ORDER BY expire_date`,
      [req.params.memberId]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: '이용권 조회 실패' }); }
});

// ─── 이용권 구매 ─────────────────────────────────────────────
app.post('/api/coupon/tickets', auth, async (req, res) => {
  try {
    const { member_id, ticket_type, purchase_date } = req.body;
    if (!member_id || !ticket_type || !purchase_date)
      return res.status(400).json({ error: '필수 항목을 입력하세요' });
    if (![10, 20, 30].includes(Number(ticket_type)))
      return res.status(400).json({ error: '올바른 이용권 종류를 선택하세요' });
    const months = Number(ticket_type) === 10 ? 1 : 3;
    const ed = new Date(purchase_date);
    ed.setMonth(ed.getMonth() + months);
    const expireDate = ed.toISOString().split('T')[0];
    const { rows } = await pool.query(
      'INSERT INTO coupon_tickets(member_id,ticket_type,remaining,purchase_date,expire_date) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [member_id, ticket_type, ticket_type, purchase_date, expireDate]
    );
    res.json({ ...rows[0], expire_date: expireDate });
  } catch (err) { console.error(err); res.status(500).json({ error: '이용권 등록 실패' }); }
});

// ─── 이용 처리 ───────────────────────────────────────────────
app.post('/api/coupon/use', auth, async (req, res) => {
  try {
    const { ticket_id, member_id, used_date } = req.body;
    if (!ticket_id || !member_id || !used_date)
      return res.status(400).json({ error: '필수 항목을 입력하세요' });
    const { rows } = await pool.query(
      'SELECT remaining FROM coupon_tickets WHERE id=$1 AND member_id=$2', [ticket_id, member_id]
    );
    if (!rows.length) return res.status(404).json({ error: '이용권을 찾을 수 없습니다' });
    if (rows[0].remaining <= 0) return res.status(400).json({ error: '잔여 횟수가 없습니다' });
    await pool.query('UPDATE coupon_tickets SET remaining=remaining-1 WHERE id=$1', [ticket_id]);
    await pool.query(
      'INSERT INTO coupon_usage_log(ticket_id,member_id,used_date) VALUES($1,$2,$3)',
      [ticket_id, member_id, used_date]
    );
    const { rows: updated } = await pool.query('SELECT remaining FROM coupon_tickets WHERE id=$1', [ticket_id]);
    res.json({ remaining: updated[0].remaining });
  } catch (err) { console.error(err); res.status(500).json({ error: '이용 처리 실패' }); }
});

// ─── 이용 내역 조회 ──────────────────────────────────────────
app.get('/api/coupon/logs', auth, async (req, res) => {
  try {
    const { search } = req.query;
    const where = search ? 'WHERE m.name ILIKE $1' : '';
    const params = search ? [`%${search}%`] : [];
    const { rows } = await pool.query(`
      SELECT u.id, u.used_date::text, m.name, m.phone,
             t.ticket_type, t.remaining, u.created_at
      FROM coupon_usage_log u
      JOIN coupon_members m ON m.id=u.member_id
      JOIN coupon_tickets t ON t.id=u.ticket_id
      ${where} ORDER BY u.used_date DESC, u.id DESC
    `, params);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: '이용 내역 조회 실패' }); }
});

// ─── 이용 취소 ───────────────────────────────────────────────
app.delete('/api/coupon/logs/:id', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT ticket_id FROM coupon_usage_log WHERE id=$1', [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: '내역을 찾을 수 없습니다' });
    await pool.query('UPDATE coupon_tickets SET remaining=remaining+1 WHERE id=$1', [rows[0].ticket_id]);
    await pool.query('DELETE FROM coupon_usage_log WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '이용 취소 실패' }); }
});

// ─── 쿠폰 통계 ───────────────────────────────────────────────
app.get('/api/coupon/stats', auth, async (_req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const ym = today.slice(0, 7);
    const [
      { rows: [{ total_members }] },
      { rows: [{ active_members }] },
      { rows: [{ today_use }] },
      { rows: [{ month_use }] },
      { rows: [{ total_remaining }] },
      { rows: expire_soon },
      { rows: expired }
    ] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS total_members FROM coupon_members'),
      pool.query(`SELECT COUNT(DISTINCT m.id)::int AS active_members FROM coupon_members m
                  WHERE EXISTS(SELECT 1 FROM coupon_tickets t WHERE t.member_id=m.id AND t.remaining>0)`),
      pool.query('SELECT COUNT(*)::int AS today_use FROM coupon_usage_log WHERE used_date=$1', [today]),
      pool.query('SELECT COUNT(*)::int AS month_use FROM coupon_usage_log WHERE used_date::text LIKE $1', [`${ym}%`]),
      pool.query('SELECT COALESCE(SUM(remaining),0)::int AS total_remaining FROM coupon_tickets'),
      pool.query(`SELECT m.name, t.expire_date::text, t.remaining,
                         (t.expire_date - CURRENT_DATE)::int AS days_left
                  FROM coupon_tickets t JOIN coupon_members m ON m.id=t.member_id
                  WHERE t.remaining>0 AND t.expire_date>=CURRENT_DATE AND t.expire_date<=CURRENT_DATE+7
                  ORDER BY t.expire_date`),
      pool.query(`SELECT m.name, t.expire_date::text, t.remaining
                  FROM coupon_tickets t JOIN coupon_members m ON m.id=t.member_id
                  WHERE t.remaining>0 AND t.expire_date<CURRENT_DATE
                  ORDER BY t.expire_date`)
    ]);
    res.json({ total_members, active_members, today_use, month_use, total_remaining, expire_soon, expired });
  } catch (err) { console.error(err); res.status(500).json({ error: '통계 조회 실패' }); }
});

// ─── 비품 카테고리 ───────────────────────────────────────────
app.get('/api/supply/categories', auth, async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM supply_categories ORDER BY sort_order, id');
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: '카테고리 조회 실패' }); }
});
app.post('/api/supply/categories', auth, async (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name) return res.status(400).json({ error: '카테고리명을 입력하세요' });
    const { rows } = await pool.query(
      'INSERT INTO supply_categories(name,color) VALUES($1,$2) RETURNING *',
      [name, color || '#2e7d32']
    );
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: '카테고리 추가 실패' }); }
});
app.delete('/api/supply/categories/:id', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM supply_categories WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '카테고리 삭제 실패' }); }
});

// ─── 비품 품목 자동완성 ──────────────────────────────────────
app.get('/api/supply/items', auth, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT item_name, COUNT(*) cnt FROM supply_purchases GROUP BY item_name ORDER BY cnt DESC LIMIT 50'
    );
    res.json(rows.map(r => r.item_name));
  } catch (err) { console.error(err); res.status(500).json({ error: '품목 조회 실패' }); }
});

// ─── 비품 구매 CRUD ──────────────────────────────────────────
app.get('/api/supply/purchases', auth, async (req, res) => {
  try {
    const { year_month, start, end, category_id } = req.query;
    const conds = []; const params = []; let pi = 1;
    if (year_month)  { conds.push(`TO_CHAR(sp.date,'YYYY-MM')=$${pi++}`); params.push(year_month); }
    if (start)       { conds.push(`sp.date>=$${pi++}`); params.push(start); }
    if (end)         { conds.push(`sp.date<=$${pi++}`); params.push(end); }
    if (category_id) { conds.push(`sp.category_id=$${pi++}`); params.push(category_id); }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const { rows } = await pool.query(`
      SELECT sp.id, sp.date::text, sc.name AS category_name, sc.color,
             sp.category_id, sp.item_name, sp.quantity, sp.unit_price, sp.amount, sp.notes, sp.created_at
      FROM supply_purchases sp
      LEFT JOIN supply_categories sc ON sc.id=sp.category_id
      ${where} ORDER BY sp.date DESC, sp.created_at DESC
    `, params);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: '구매 조회 실패' }); }
});
app.post('/api/supply/purchases', auth, async (req, res) => {
  try {
    const { date, category_id, item_name, quantity, unit_price, amount, notes } = req.body;
    if (!date || !item_name || !amount) return res.status(400).json({ error: '필수 항목을 입력하세요' });
    const { rows } = await pool.query(
      'INSERT INTO supply_purchases(date,category_id,item_name,quantity,unit_price,amount,notes) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [date, category_id || null, item_name, quantity || 1, unit_price || 0, amount, notes || '']
    );
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: '구매 등록 실패' }); }
});
app.put('/api/supply/purchases/:id', auth, async (req, res) => {
  try {
    const { date, category_id, item_name, quantity, unit_price, amount, notes } = req.body;
    if (!date || !item_name || !amount) return res.status(400).json({ error: '필수 항목을 입력하세요' });
    const { rows } = await pool.query(
      'UPDATE supply_purchases SET date=$1,category_id=$2,item_name=$3,quantity=$4,unit_price=$5,amount=$6,notes=$7 WHERE id=$8 RETURNING *',
      [date, category_id || null, item_name, quantity || 1, unit_price || 0, amount, notes || '', req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: '구매 내역을 찾을 수 없습니다' });
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: '구매 수정 실패' }); }
});
app.delete('/api/supply/purchases/:id', auth, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM supply_purchases WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: '내역을 찾을 수 없습니다' });
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '삭제 실패' }); }
});

// ─── 비품 통계 ───────────────────────────────────────────────
app.get('/api/supply/stats', auth, async (_req, res) => {
  try {
    const [{ rows: monthly }, { rows: byCat }, { rows: topItems }] = await Promise.all([
      pool.query(`
        SELECT TO_CHAR(date,'YYYY-MM') AS month,
               COALESCE(SUM(amount),0)::int AS total, COUNT(*)::int AS count
        FROM supply_purchases
        WHERE date >= CURRENT_DATE - INTERVAL '12 months'
        GROUP BY month ORDER BY month
      `),
      pool.query(`
        SELECT sc.name, sc.color,
               COALESCE(SUM(sp.amount),0)::int AS total, COUNT(sp.id)::int AS count
        FROM supply_categories sc
        LEFT JOIN supply_purchases sp ON sp.category_id=sc.id
        GROUP BY sc.id, sc.name, sc.color ORDER BY total DESC
      `),
      pool.query(`
        SELECT item_name, COUNT(*)::int AS purchase_count,
               COALESCE(SUM(amount),0)::int AS total_amount
        FROM supply_purchases
        GROUP BY item_name ORDER BY total_amount DESC LIMIT 10
      `)
    ]);
    res.json({ monthly, byCat, topItems });
  } catch (err) { console.error(err); res.status(500).json({ error: '통계 조회 실패' }); }
});

// ─── 비품 예산 ───────────────────────────────────────────────
app.get('/api/supply/budget/:year_month', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT budget FROM supply_budget WHERE year_month=$1', [req.params.year_month]
    );
    res.json({ budget: rows[0]?.budget || 0 });
  } catch (err) { console.error(err); res.status(500).json({ error: '예산 조회 실패' }); }
});
app.put('/api/supply/budget/:year_month', auth, async (req, res) => {
  try {
    const { budget } = req.body;
    await pool.query(`
      INSERT INTO supply_budget(year_month,budget) VALUES($1,$2)
      ON CONFLICT(year_month) DO UPDATE SET budget=$2
    `, [req.params.year_month, budget || 0]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '예산 저장 실패' }); }
});

// ─── 서버 시작 ────────────────────────────────────────────────
initDB().then(() => {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`⛳ 골프존파크 매출 서버 실행 중: http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('DB 초기화 실패:', err);
  process.exit(1);
});
