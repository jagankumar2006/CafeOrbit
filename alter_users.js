const { query } = require('./src/config/db');

async function alter() {
  try {
    await query.run("ALTER TABLE users MODIFY COLUMN status ENUM('Active', 'Archived', 'Deleted') NOT NULL DEFAULT 'Active'");
    console.log("SUCCESS");
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}
alter();
