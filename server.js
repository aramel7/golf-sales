const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database('./database.db');

// DB 초기화 + 관리자 생성
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT
    )
  `);

  bcrypt.hash('golf1234', 10, (err, hash) => {
    if (err) return;

    db.run(`
      INSERT OR IGNORE INTO users (username, password)
      VALUES (?, ?)
    `, ['admin', hash], () => {
      console.log('🔥 관리자 계정 생성 완료');
    });
  });
});

// 로그인 API
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
    if (err) {
      console.log('❌ DB 에러:', err);
      return res.status(500).json({ success: false });
    }

    if (!user) {
      return res.json({ success: false, message: '아이디 없음' });
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.json({ success: false, message: '비밀번호 틀림' });
    }

    res.json({ success: true });
  });
});

// 서버 실행
app.listen(PORT, () => {
  console.log(`🚀 서버 실행됨 👉 ${PORT}`);
});