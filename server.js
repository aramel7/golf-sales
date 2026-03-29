require('dotenv').config();
const express = require('express');
const PORT = process.env.PORT || 3000;
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const { pool, initDB } = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ✅ 관리자 계정 자동 생성
async function createAdmin() {
  const hashed = await bcrypt.hash('golf1234', 10);

  await pool.query(`
    INSERT INTO users (username, password_hash)
    VALUES ('admin', $1)
    ON CONFLICT (username) DO NOTHING
  `, [hashed]);

  console.log('관리자 계정 생성 완료');
}

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

    const { rows } = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );

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
    res.status(500).json({ error: '서버 오류' });
  }
});

// ─── 서버 시작 (🔥 여기 핵심)
initDB().then(async () => {

  await createAdmin(); // 👈 관리자 생성

  app.listen(PORT, () => {
    console.log(`서버 실행됨 👉 http://localhost:${PORT}`);
  });

});