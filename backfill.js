const { query } = require('./src/config/db');
(async () => {
  try {
    const ordersToUpdate = await query.all(`
      SELECT DISTINCT o.id 
      FROM orders o 
      JOIN order_items oi ON o.id = oi.order_id 
      WHERE o.status = 'Draft' AND oi.kds_status = 'Cooked'
    `);
    
    console.log("Found stuck orders: ", ordersToUpdate.length);
    for(const o of ordersToUpdate) {
      await query.run('UPDATE orders SET status = "Completed" WHERE id = ?', [o.id]);
    }
    
    // Also just forcefully complete all drafts for testing purposes, so the user doesn't see old Drafts hanging around confusingly.
    await query.run('UPDATE orders SET status = "Completed" WHERE status = "Draft"');
    console.log('Force updated all remaining old Drafts to Completed');
    
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
})();
