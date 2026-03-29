// db.js (초간단 버전)

const sqlite3 = require('sqlite3').verbose();

// DB 파일 생성
const db = new sqlite3.Database('./database.db');

// 테이블 생성
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room INTEGER,
      payment TEXT,
      amount INTEGER,
      memo TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

module.exports = db;