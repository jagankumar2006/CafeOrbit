require('dotenv').config();
const bcrypt = require('bcryptjs');
const { initDb, query, getPool } = require('./src/config/db');

async function seed() {
  console.log('[Seed] Starting database seeding...');
  await initDb();

  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    // Disable FK checks so we can truncate in any order
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    await conn.query('TRUNCATE TABLE order_items');
    await conn.query('TRUNCATE TABLE orders');
    await conn.query('TRUNCATE TABLE pos_sessions');
    await conn.query('TRUNCATE TABLE promotions');
    await conn.query('TRUNCATE TABLE payment_methods');
    await conn.query('TRUNCATE TABLE tables');
    await conn.query('TRUNCATE TABLE floors');
    await conn.query('TRUNCATE TABLE products');
    await conn.query('TRUNCATE TABLE product_categories');
    await conn.query('TRUNCATE TABLE customers');
    await conn.query('TRUNCATE TABLE users');
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    conn.release();
    console.log('[Seed] All tables cleared.');

    // 1. Seed Users
    const adminHash   = await bcrypt.hash('admin123',   10);
    const cashierHash = await bcrypt.hash('cashier123', 10);

    await query.run(
      'INSERT INTO users (name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?)',
      ['Orbit Admin', 'admin@cafeorbit.com', adminHash, 'User/Admin', 'Active']
    );
    await query.run(
      'INSERT INTO users (name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?)',
      ['Alice Cashier', 'cashier@cafeorbit.com', cashierHash, 'Employee/Cashier', 'Active']
    );
    console.log('[Seed] Users seeded  →  admin@cafeorbit.com / admin123');

    // 2. Seed Categories
    const cat1 = await query.run('INSERT INTO product_categories (name, color) VALUES (?, ?)', ['Espresso Coffee', '#6F4E37']);
    const cat2 = await query.run('INSERT INTO product_categories (name, color) VALUES (?, ?)', ['Soft Drinks',     '#3B82F6']);
    const cat3 = await query.run('INSERT INTO product_categories (name, color) VALUES (?, ?)', ['Bakery & Pastry', '#F59E0B']);
    const cat4 = await query.run('INSERT INTO product_categories (name, color) VALUES (?, ?)', ['Pizzas',          '#EF4444']);
    const cat5 = await query.run('INSERT INTO product_categories (name, color) VALUES (?, ?)', ['Desserts',        '#EC4899']);
    console.log('[Seed] Categories seeded');

    // 3. Seed Products
    // Espresso Coffee
    await query.run(
      'INSERT INTO products (name, category_id, price, unit_of_measure, tax_percentage, description) VALUES (?, ?, ?, ?, ?, ?)',
      ['Filter Coffee',       cat1.id, 150.00, 'cup',    10.00, 'Authentic South Indian strong filter coffee.']
    );
    await query.run(
      'INSERT INTO products (name, category_id, price, unit_of_measure, tax_percentage, description) VALUES (?, ?, ?, ?, ?, ?)',
      ['Cutting Chai',    cat1.id, 50.00, 'glass',    10.00, 'Classic Mumbai style strong cutting chai.']
    );
    await query.run(
      'INSERT INTO products (name, category_id, price, unit_of_measure, tax_percentage, description) VALUES (?, ?, ?, ?, ?, ?)',
      ['Masala Chai',  cat1.id, 80.00, 'cup',    10.00, 'Spiced tea brewed with ginger, cardamom, and fresh milk.']
    );

    // Soft Drinks
    await query.run(
      'INSERT INTO products (name, category_id, price, unit_of_measure, tax_percentage, description) VALUES (?, ?, ?, ?, ?, ?)',
      ['Thums Up',              cat2.id, 60.00, 'bottle',    12.00, 'Taste the thunder! Strong carbonated cola.']
    );
    await query.run(
      'INSERT INTO products (name, category_id, price, unit_of_measure, tax_percentage, description) VALUES (?, ?, ?, ?, ?, ?)',
      ['Fresh Nimbu Pani',   cat2.id, 90.00, 'glass', 12.00, 'Freshly squeezed lemonade with sparkling water, mint, and masala.']
    );

    // Bakery 
    await query.run(
      'INSERT INTO products (name, category_id, price, unit_of_measure, tax_percentage, description) VALUES (?, ?, ?, ?, ?, ?)',
      ['Bun Maska',   cat3.id, 120.00, 'pcs', 5.00, 'Soft bun slathered with generous amounts of butter.']
    );
    await query.run(
      'INSERT INTO products (name, category_id, price, unit_of_measure, tax_percentage, description) VALUES (?, ?, ?, ?, ?, ?)',
      ['Punjabi Samosa',  cat3.id, 40.00, 'pcs', 5.00, 'Crispy pastry stuffed with spiced potatoes and peas.']
    );

    // Pizzas
    await query.run(
      'INSERT INTO products (name, category_id, price, unit_of_measure, tax_percentage, description) VALUES (?, ?, ?, ?, ?, ?)',
      ['Paneer Tikka Pizza',  cat4.id, 350.00, 'pcs', 18.00, 'Loaded with spicy paneer tikka, onions, and capsicum.']
    );
    await query.run(
      'INSERT INTO products (name, category_id, price, unit_of_measure, tax_percentage, description) VALUES (?, ?, ?, ?, ?, ?)',
      ['Chicken Tikka Pizza',   cat4.id, 450.00, 'pcs', 18.00, 'Loaded with roasted chicken tikka chunks and extra cheese.']
    );

    // Desserts
    await query.run(
      'INSERT INTO products (name, category_id, price, unit_of_measure, tax_percentage, description) VALUES (?, ?, ?, ?, ?, ?)',
      ['Gulab Jamun', cat5.id, 150.00, 'pcs', 10.00, 'Classic Indian dessert - fried dough balls soaked in sweet syrup.']
    );
    console.log('[Seed] Products seeded');

    // 4. Seed Floors and Tables
    const f1 = await query.run('INSERT INTO floors (name) VALUES (?)', ['Ground Floor']);
    const f2 = await query.run('INSERT INTO floors (name) VALUES (?)', ['First Floor']);
    const f3 = await query.run('INSERT INTO floors (name) VALUES (?)', ['Rooftop Garden']);

    await query.run('INSERT INTO tables (floor_id, table_number, seats_count, is_active) VALUES (?, ?, ?, ?)', [f1.id, 'T-01', 2, 1]);
    await query.run('INSERT INTO tables (floor_id, table_number, seats_count, is_active) VALUES (?, ?, ?, ?)', [f1.id, 'T-02', 4, 1]);
    await query.run('INSERT INTO tables (floor_id, table_number, seats_count, is_active) VALUES (?, ?, ?, ?)', [f1.id, 'T-03', 4, 1]);
    await query.run('INSERT INTO tables (floor_id, table_number, seats_count, is_active) VALUES (?, ?, ?, ?)', [f2.id, 'T-04', 2, 1]);
    await query.run('INSERT INTO tables (floor_id, table_number, seats_count, is_active) VALUES (?, ?, ?, ?)', [f2.id, 'T-05', 6, 1]);
    await query.run('INSERT INTO tables (floor_id, table_number, seats_count, is_active) VALUES (?, ?, ?, ?)', [f3.id, 'T-06', 4, 1]);
    await query.run('INSERT INTO tables (floor_id, table_number, seats_count, is_active) VALUES (?, ?, ?, ?)', [f3.id, 'T-07', 2, 1]);
    console.log('[Seed] Floors & Tables seeded');

    // 5. Seed Payment Methods
    await query.run('INSERT INTO payment_methods (name, is_enabled, upi_id) VALUES (?, ?, ?)', ['Cash',         1, null]);
    await query.run('INSERT INTO payment_methods (name, is_enabled, upi_id) VALUES (?, ?, ?)', ['Digital/Card', 1, null]);
    await query.run('INSERT INTO payment_methods (name, is_enabled, upi_id) VALUES (?, ?, ?)', ['UPI QR',       1, 'cafeorbit@ybl']);
    console.log('[Seed] Payment Methods seeded');

    // 6. Seed Promotions
    // Product-level: Buy 2+, get ₹2.50 off per item
    await query.run(
      'INSERT INTO promotions (type, discount_type, discount_value, min_quantity, min_order_amount, is_active) VALUES (?, ?, ?, ?, ?, ?)',
      ['Automated Product Promotion', 'Fixed Amount', 1.50, 2, null, 1]
    );
    // Order-level: order > ₹30 gets 10% off
    await query.run(
      'INSERT INTO promotions (type, discount_type, discount_value, min_quantity, min_order_amount, is_active) VALUES (?, ?, ?, ?, ?, ?)',
      ['Automated Order Promotion', 'Percentage', 10.00, null, 30.00, 1]
    );
    // Coupon codes
    // when apply 20% discount 
    await query.run(
      'INSERT INTO promotions (type, code, discount_type, discount_value, min_quantity, min_order_amount, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['Coupon', 'WELCOME10', 'Percentage',  10.00, null, null, 1]
    );
    await query.run(
      'INSERT INTO promotions (type, code, discount_type, discount_value, min_quantity, min_order_amount, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['Coupon', 'SAVEFIVE',  'Fixed Amount', 5.00, null, null, 1]
    );
    console.log('[Seed] Promotions seeded');

    console.log('\n✅ [Seed] All data seeded successfully into MySQL.\n');
    process.exit(0);
  } catch (err) {
    if (conn) conn.release();
    console.error('[Seed] Error during seeding:', err.message);
    process.exit(1);
  }
}

seed();
