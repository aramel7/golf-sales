// 기본 준비
const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();

const app = express();

// 👉 포트 설정 (Render에서 자동으로 PORT 줌)
const PORT = process.env.PORT || 3000;

// 👉 DB 연결 (파일 생성됨)
const db = new sqlite3.Database('./database.db');

// 👉 JSON 데이터 받기
app.use(express.json());

// 👉 public 폴더 사용 (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

//////////////////////////////////////////////////////
// ✅ DB 초기화 + 관리자 계정 생성
//////////////////////////////////////////////////////

function initDB() {
  return new Promise((resolve, reject) => {

    // 👉 users 테이블 만들기
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT
      )
    `, async (err) => {
      if (err) {
        console.error('DB 생성 실패:', err);
        reject(err);
      } else {
        console.log('DB 준비 완료');

        try {
          // 👉 관리자 계정 생성
          const hashed = await bcrypt.hash('golf1234', 10);

          db.run(`
            INSERT OR IGNORE INTO users (username, password)
            VALUES (?, ?)
          `, ['admin', hashed]);

          console.log('🔥 관리자 계정 생성 완료');

          resolve();
        } catch (error) {
          console.error('관리자 생성 실패:', error);
          reject(error);
        }
      }
    });
  });
}

//////////////////////////////////////////////////////
// ✅ 로그인 API
//////////////////////////////////////////////////////

app.post('/login', (req, res) => {

  const { username, password } = req.body;

  // 👉 사용자 찾기
  db.get(`
    SELECT * FROM users WHERE username = ?
  `, [username], async (err, user) => {

    if (err) {
      console.error(err);
      return res.status(500).json({ error: '서버 오류' });
    }

    if (!user) {
      return res.status(401).json({ error: '아이디 없음' });
    }

    // 👉 비밀번호 비교
    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).json({ error: '비밀번호 틀림' });
    }

    // 👉 성공
    res.json({ message: '로그인 성공' });
  });
});

//////////////////////////////////////////////////////
// ✅ 서버 실행
//////////////////////////////////////////////////////

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`서버 실행됨 👉 http://localhost:${PORT}`);
  });
});