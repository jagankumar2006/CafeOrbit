require('dotenv').config();
const mysql = require('mysql2/promise');

// Connection pool — reuses connections efficiently
let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host:     process.env.DB_HOST     || 'localhost',
      port:     parseInt(process.env.DB_PORT) || 3306,
      user:     process.env.DB_USER     || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME     || 'cafeorbit',
      waitForConnections: true,
      connectionLimit:    10,
      queueLimit:         0,
      multipleStatements: true
    });
  }
  return pool;
}

// Unified query interface — same shape as the old SQLite wrapper
const query = {
  // Returns a single row (or undefined)
  async get(sql, params = []) {
    const [rows] = await getPool().execute(sql, params);
    return rows[0];
  },

  // Returns all matching rows as an array
  async all(sql, params = []) {
    const [rows] = await getPool().execute(sql, params);
    return rows;
  },

  // Runs INSERT / UPDATE / DELETE — returns { id, changes }
  async run(sql, params = []) {
    const [result] = await getPool().execute(sql, params);
    return {
      id:      result.insertId      ?? null,
      changes: result.affectedRows  ?? 0
    };
  },

  // Executes a raw multi-statement SQL block (used by initDb)
  async exec(sql) {
    const conn = await getPool().getConnection();
    try {
      await conn.query(sql);
    } finally {
      conn.release();
    }
  }
};

// Creates the database if it doesn't exist, then initialises all tables
async function initDb() {
  // Step 1: Connect without a database to create it if needed
  const tempConn = await mysql.createConnection({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || ''
  });
  await tempConn.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'cafeorbit'}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  await tempConn.end();

  // Step 2: Run the full CREATE TABLE IF NOT EXISTS schema
  const schema = `
    CREATE TABLE IF NOT EXISTS users (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      name          VARCHAR(255) NOT NULL,
      email         VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role          ENUM('User/Admin', 'Employee/Cashier') NOT NULL DEFAULT 'Employee/Cashier',
      status        ENUM('Active', 'Archived')             NOT NULL DEFAULT 'Active'
    );

    CREATE TABLE IF NOT EXISTS product_categories (
      id    INT AUTO_INCREMENT PRIMARY KEY,
      name  VARCHAR(100) NOT NULL UNIQUE,
      color VARCHAR(7)   NOT NULL DEFAULT '#6F4E37'
    );

    CREATE TABLE IF NOT EXISTS products (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      name            VARCHAR(255)   NOT NULL,
      category_id     INT            REFERENCES product_categories(id),
      price           DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
      unit_of_measure VARCHAR(50)    NOT NULL DEFAULT 'pcs',
      tax_percentage  DECIMAL(5,2)   NOT NULL DEFAULT 18.00,
      image_url       VARCHAR(1024),
      description     TEXT,
      created_at      DATETIME       DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS floors (
      id   INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS tables (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      floor_id     INT          REFERENCES floors(id),
      table_number VARCHAR(50)  NOT NULL,
      seats_count  INT          NOT NULL DEFAULT 2,
      is_active    TINYINT(1)   NOT NULL DEFAULT 1,
      qr_s3_url    VARCHAR(1024),
      UNIQUE KEY uq_floor_table (floor_id, table_number)
    );

    CREATE TABLE IF NOT EXISTS customers (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      name         VARCHAR(255) NOT NULL,
      email        VARCHAR(255),
      phone_number VARCHAR(50),
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS payment_methods (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      name       ENUM('Cash', 'Digital/Card', 'UPI QR') NOT NULL,
      is_enabled TINYINT(1)   NOT NULL DEFAULT 1,
      upi_id     VARCHAR(255)
    );

    CREATE TABLE IF NOT EXISTS promotions (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      type             ENUM('Coupon', 'Automated Product Promotion', 'Automated Order Promotion') NOT NULL,
      code             VARCHAR(50) UNIQUE,
      discount_type    ENUM('Percentage', 'Fixed Amount') NOT NULL DEFAULT 'Percentage',
      discount_value   DECIMAL(10,2) NOT NULL,
      min_quantity     INT,
      min_order_amount DECIMAL(10,2),
      is_active        TINYINT(1) NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS pos_sessions (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      user_id         INT           NOT NULL,
      opened_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      closed_at       DATETIME,
      opening_balance DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      closing_balance DECIMAL(10,2)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      order_number   VARCHAR(100)  NOT NULL UNIQUE,
      session_id     INT           NOT NULL,
      table_id       INT,
      customer_id    INT,
      subtotal       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      tax            DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      total_amount   DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      status         ENUM('Draft','Paid','Cancelled') NOT NULL DEFAULT 'Draft',
      created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      order_id         INT           NOT NULL,
      product_id       INT           NOT NULL,
      quantity         INT           NOT NULL,
      unit_price       DECIMAL(10,2) NOT NULL,
      tax_amount       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      discount_amount  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      line_total       DECIMAL(10,2) NOT NULL,
      kds_status       ENUM('Waiting','Preparing','Cooked') NOT NULL DEFAULT 'Waiting',
      is_item_completed TINYINT(1)   NOT NULL DEFAULT 0
    );
  `;

  try {
    await query.exec(schema);
    console.log('[DB] MySQL schema checked/initialized successfully.');
  } catch (err) {
    console.error('[DB] Schema initialization failed:', err.message);
    throw err;
  }
}

module.exports = {
  query,
  initDb,
  getPool
};
