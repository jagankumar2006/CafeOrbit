-- CafeOrbit POS Database DDL Schema (MySQL 8 Compatible)
-- Run against a MySQL 8.x server with: mysql -u root -p cafeorbit < db/migrations.sql

-- Create database if it doesn't already exist
CREATE DATABASE IF NOT EXISTS cafeorbit CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE cafeorbit;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(255)                             NOT NULL,
    email         VARCHAR(255)                             NOT NULL UNIQUE,
    password_hash VARCHAR(255)                             NOT NULL,
    role          ENUM('User/Admin', 'Employee/Cashier')   NOT NULL DEFAULT 'Employee/Cashier',
    status        ENUM('Active', 'Archived', 'Deleted')      NOT NULL DEFAULT 'Active'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 2. Product Categories Table
CREATE TABLE IF NOT EXISTS product_categories (
    id    INT AUTO_INCREMENT PRIMARY KEY,
    name  VARCHAR(100) NOT NULL UNIQUE,
    color VARCHAR(7)   NOT NULL DEFAULT '#6F4E37'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cat_name ON product_categories(name);

-- 3. Products Table
CREATE TABLE IF NOT EXISTS products (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(255)   NOT NULL,
    category_id     INT,
    price           DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
    unit_of_measure VARCHAR(50)    NOT NULL DEFAULT 'pcs',
    tax_percentage  DECIMAL(5,2)   NOT NULL DEFAULT 18.00,
    image_url       VARCHAR(1024),              -- Local upload path
    description     TEXT,
    created_at      DATETIME       DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_product_category FOREIGN KEY (category_id)
        REFERENCES product_categories(id) ON DELETE RESTRICT
);

-- 4. Floors Table
CREATE TABLE IF NOT EXISTS floors (
    id   INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

-- 5. Tables Table
CREATE TABLE IF NOT EXISTS tables (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    floor_id     INT,
    table_number VARCHAR(50)  NOT NULL,
    seats_count  INT          NOT NULL DEFAULT 2,
    is_active    TINYINT(1)   NOT NULL DEFAULT 1,
    qr_s3_url    VARCHAR(1024),              -- Local PDF/QR path
    UNIQUE KEY uq_floor_table (floor_id, table_number),
    CONSTRAINT fk_table_floor FOREIGN KEY (floor_id)
        REFERENCES floors(id) ON DELETE CASCADE
);

-- 6. Customers Table
CREATE TABLE IF NOT EXISTS customers (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    name         VARCHAR(255) NOT NULL,
    email        VARCHAR(255),
    phone_number VARCHAR(50),
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 7. Payment Methods Table
CREATE TABLE IF NOT EXISTS payment_methods (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    name       ENUM('Cash', 'Digital/Card', 'UPI QR') NOT NULL,
    is_enabled TINYINT(1)   NOT NULL DEFAULT 1,
    upi_id     VARCHAR(255)
);

-- 8. Promotions Table
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

-- 9. POS Sessions Table
CREATE TABLE IF NOT EXISTS pos_sessions (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT           NOT NULL,
    opened_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at       DATETIME,
    opening_balance DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    closing_balance DECIMAL(10,2),
    CONSTRAINT fk_session_user FOREIGN KEY (user_id)
        REFERENCES users(id)
);

-- 10. Orders Table
CREATE TABLE IF NOT EXISTS orders (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    order_number    VARCHAR(100)   NOT NULL UNIQUE,
    session_id      INT            NOT NULL,
    table_id        INT,
    customer_id     INT,
    subtotal        DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
    tax             DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
    discount_amount DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
    total_amount    DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
    status          ENUM('Draft', 'Paid', 'Completed', 'Cancelled') NOT NULL DEFAULT 'Draft',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_order_session  FOREIGN KEY (session_id)  REFERENCES pos_sessions(id),
    CONSTRAINT fk_order_table    FOREIGN KEY (table_id)    REFERENCES tables(id),
    CONSTRAINT fk_order_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE INDEX IF NOT EXISTS idx_orders_sess   ON orders(session_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- 11. Order Items Table
CREATE TABLE IF NOT EXISTS order_items (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    order_id          INT           NOT NULL,
    product_id        INT           NOT NULL,
    quantity          INT           NOT NULL CHECK (quantity > 0),
    unit_price        DECIMAL(10,2) NOT NULL,
    tax_amount        DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    discount_amount   DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    line_total        DECIMAL(10,2) NOT NULL,
    kds_status        ENUM('Waiting','To Cook','Preparing','Cooked','Completed') NOT NULL DEFAULT 'Waiting',
    is_item_completed TINYINT(1)    NOT NULL DEFAULT 0,
    completed_at      DATETIME      NULL,
    CONSTRAINT fk_item_order   FOREIGN KEY (order_id)   REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_item_product FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX IF NOT EXISTS idx_order_items_ord ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_kds ON order_items(kds_status);
