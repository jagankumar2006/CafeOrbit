const { query } = require('./src/config/db');
(async () => {
  try {
    const kpiRow = await query.get(`
      SELECT 
        COUNT(id) as total_orders,
        COALESCE(SUM(CASE WHEN status IN ('Paid', 'Completed') THEN total_amount ELSE 0 END), 0) as total_revenue,
        COALESCE(AVG(CASE WHEN status IN ('Paid', 'Completed') THEN total_amount ELSE NULL END), 0) as avg_order_value
      FROM orders
    `);
    console.log('kpiRow:', kpiRow);

    const categorySales = await query.all(`
      SELECT 
        c.name as category_name,
        c.color as category_color,
        COUNT(oi.id) as item_count,
        COALESCE(SUM(oi.line_total), 0) as category_revenue
      FROM product_categories c
      LEFT JOIN products p ON p.category_id = c.id
      LEFT JOIN order_items oi ON oi.product_id = p.id
      LEFT JOIN orders o ON oi.order_id = o.id AND o.status IN ('Paid', 'Completed')
      GROUP BY c.id
    `);
    console.log('categorySales:', categorySales);

    const timelineSales = await query.all(`
      SELECT 
        SUBSTR(created_at, 1, 10) as order_date,
        COUNT(id) as order_count,
        SUM(total_amount) as revenue
      FROM orders
      WHERE status IN ('Paid', 'Completed')
      GROUP BY order_date
      ORDER BY order_date ASC
      LIMIT 10
    `);
    console.log('timelineSales:', timelineSales);

  } catch(e) {
    console.error('SQL Error:', e);
  }
  process.exit(0);
})();
