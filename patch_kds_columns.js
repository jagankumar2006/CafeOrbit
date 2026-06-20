const { query } = require('./src/config/db');

async function patchColumns() {
  try {
    console.log('Adding completed_at to order_items...');
    await query.run('ALTER TABLE order_items ADD COLUMN completed_at DATETIME NULL');
    console.log('Successfully added completed_at column.');
  } catch (err) {
    if (err.message.includes('Duplicate column name')) {
      console.log('Column already exists.');
    } else {
      console.error('Error altering table:', err);
    }
  }
  process.exit();
}

patchColumns();
