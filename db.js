require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL,
      room_number INTEGER NOT NULL,
      payment_method VARCHAR(20) NOT NULL,
      amount INTEGER NOT NULL,
      memo TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date)`);

  // ─── 비품구매 테이블 ──────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS supply_categories (
      id         SERIAL PRIMARY KEY,
      name       VARCHAR(50) NOT NULL,
      color      VARCHAR(20) DEFAULT '#2e7d32',
      sort_order INTEGER     DEFAULT 0,
      created_at TIMESTAMP   DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS supply_purchases (
      id          SERIAL PRIMARY KEY,
      date        DATE         NOT NULL,
      category_id INTEGER      REFERENCES supply_categories(id) ON DELETE SET NULL,
      item_name   VARCHAR(100) NOT NULL,
      quantity    INTEGER      NOT NULL DEFAULT 1,
      unit_price  INTEGER      NOT NULL DEFAULT 0,
      amount      INTEGER      NOT NULL,
      notes       TEXT         DEFAULT '',
      created_at  TIMESTAMP    DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS supply_budget (
      id         SERIAL PRIMARY KEY,
      year_month VARCHAR(7) NOT NULL UNIQUE,
      budget     INTEGER    NOT NULL DEFAULT 0
    )
  `);
  // 기본 카테고리 삽입
  const { rows: scats } = await pool.query('SELECT COUNT(*) FROM supply_categories');
  if (parseInt(scats[0].count) === 0) {
    const defaults = [
      ['청소용품','#4caf50',1], ['사무용품','#2196f3',2],
      ['시설관리','#ff9800',3], ['음료·다과','#e91e63',4], ['기타','#9e9e9e',5]
    ];
    for (const [name, color, sort_order] of defaults) {
      await pool.query(
        'INSERT INTO supply_categories(name,color,sort_order) VALUES($1,$2,$3)',
        [name, color, sort_order]
      );
    }
  }

  // ─── 쿠폰관리 테이블 ──────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS coupon_members (
      id         SERIAL PRIMARY KEY,
      name       VARCHAR(50) NOT NULL,
      phone      VARCHAR(20) DEFAULT '',
      gender     VARCHAR(5)  DEFAULT '남',
      memo       TEXT        DEFAULT '',
      created_at TIMESTAMP   DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS coupon_tickets (
      id            SERIAL PRIMARY KEY,
      member_id     INTEGER NOT NULL REFERENCES coupon_members(id) ON DELETE CASCADE,
      ticket_type   INTEGER NOT NULL,
      remaining     INTEGER NOT NULL,
      purchase_date DATE    NOT NULL,
      expire_date   DATE    NOT NULL,
      created_at    TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS coupon_usage_log (
      id        SERIAL PRIMARY KEY,
      ticket_id INTEGER NOT NULL REFERENCES coupon_tickets(id)  ON DELETE CASCADE,
      member_id INTEGER NOT NULL REFERENCES coupon_members(id)  ON DELETE CASCADE,
      used_date DATE    NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // 관리자 계정이 없으면 기본값으로 생성 (admin / golf1234)
  const { rows } = await pool.query('SELECT COUNT(*) FROM users');
  if (parseInt(rows[0].count) === 0) {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'golf1234';
    const hash = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO users (username, password_hash) VALUES ($1, $2)', [username, hash]);
    console.log(`기본 관리자 계정 생성 완료: ${username} / ${password}`);
  }
}

module.exports = { pool, initDB };
