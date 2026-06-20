const { query } = require('./src/config/db');

async function alter() {
  try {
    await query.run("ALTER TABLE orders MODIFY COLUMN status ENUM('Draft', 'Paid', 'Completed', 'Cancelled') NOT NULL DEFAULT 'Draft'");
    console.log("SUCCESS");
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}
alter();
