const { query } = require('./src/config/db');

async function patchEnum() {
  try {
    console.log('Altering kds_status ENUM...');
    await query.run("ALTER TABLE order_items MODIFY COLUMN kds_status ENUM('Waiting','To Cook','Preparing','Cooked','Completed') NOT NULL DEFAULT 'Waiting'");
    console.log('Successfully updated kds_status ENUM to include Waiting and Cooked.');
  } catch (err) {
    console.error('Error altering table:', err);
  }
  process.exit();
}

patchEnum();
