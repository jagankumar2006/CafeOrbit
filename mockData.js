const { query } = require('./src/config/db');
(async () => {
  try {
    for(let i=1; i<=5; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0] + ' 12:00:00';
      await query.run('INSERT INTO orders (order_number, session_id, subtotal, tax, total_amount, status, created_at) VALUES (?, 1, 500, 50, ?, "Paid", ?)', [`MOCK-${i}`, 550 + (i * 100), dateStr]);
    }
    console.log('Mock historical data injected!');
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
})();
