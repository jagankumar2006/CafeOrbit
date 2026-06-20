const { query, broadcastEvent } = require('../config/db');

// --- PUBLIC MENU ---
async function getMenu(req, res) {
  try {
    const categories = await query.all('SELECT * FROM product_categories ORDER BY id ASC');
    const products = await query.all(`
      SELECT p.*, c.name AS category_name
      FROM products p
      LEFT JOIN product_categories c ON p.category_id = c.id
      ORDER BY p.id ASC
    `);
    
    res.json({ categories, products });
  } catch (err) {
    console.error('[Customer Controller] getMenu error:', err);
    res.status(500).json({ error: 'Failed to load menu.' });
  }
}

// --- PUBLIC ORDERING ---
async function placeOrder(req, res) {
  const { table_id, order_type, items } = req.body;
  
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Order must contain at least one item.' });
  }

  try {
    // 1. Get or create a "Guest" POS session for the day
    let session = await query.get('SELECT * FROM pos_sessions WHERE closed_at IS NULL AND user_id = ?', [1]); // 1 represents admin/system
    if (!session) {
      const createRes = await query.run(
        'INSERT INTO pos_sessions (user_id, opening_balance) VALUES (?, ?)',
        [1, 0]
      );
      session = { id: createRes.id };
    }

    // 2. Fetch product details to calculate totals
    const productIds = items.map(i => i.product_id);
    const placeholders = productIds.map(() => '?').join(',');
    const products = await query.all(`SELECT id, price, tax_percentage FROM products WHERE id IN (${placeholders})`, productIds);
    
    let subtotal = 0;
    let tax_total = 0;

    items.forEach(item => {
      const p = products.find(prod => prod.id === item.product_id);
      if (p) {
        const itemTotal = p.price * item.quantity;
        subtotal += itemTotal;
        tax_total += itemTotal * (p.tax_percentage / 100);
      }
    });

    const grand_total = subtotal + tax_total;

    // 3. Insert Order
    // Guest orders are automatically pushed to 'Kitchen' status upon creation
    const orderRes = await query.run(
      `INSERT INTO orders (order_number, session_id, table_id, subtotal, tax, discount_amount, total_amount, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [`TEMP-${Date.now()}`, session.id, table_id || null, subtotal, tax_total, 0, grand_total, 'Draft']
    );

    const orderId = orderRes.id;
    const orderNum = `ORD-${String(orderId).padStart(4, '0')}`;
    
    await query.run('UPDATE orders SET order_number = ? WHERE id = ?', [orderNum, orderId]);

    // 4. Insert Order Items (with KDS status 'Waiting')
    for (const item of items) {
      const p = products.find(prod => prod.id === item.product_id);
      if (p) {
        await query.run(
          `INSERT INTO order_items (order_id, product_id, quantity, unit_price, tax_amount, discount_amount, line_total, kds_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            orderId,
            item.product_id,
            item.quantity,
            p.price,
            (p.price * (p.tax_percentage / 100)),
            0,
            (p.price * item.quantity) + (p.price * item.quantity * (p.tax_percentage / 100)),
            'Waiting'
          ]
        );
      }
    }

    // 5. Broadcast to KDS via WebSocket
    console.log('[Customer Controller] is global.broadcastEvent defined?', !!global.broadcastEvent);
    if (global.broadcastEvent) {
      const kdsPayload = {
        orderId: orderId,
        orderNumber: orderNum,
        createdAt: new Date().toISOString(),
        tableName: table_id ? `T-0${table_id}` : 'Takeaway',
        items: items.map(it => {
          const p = products.find(prod => prod.id === it.product_id);
          return {
            itemId: it.product_id,
            name: p ? p.name : 'Unknown Product',
            quantity: it.quantity
          };
        })
      };
      global.broadcastEvent('KDS_NEW_TICKET', kdsPayload);
    }

    res.status(201).json({
      message: 'Order placed successfully.',
      order_id: orderId,
      order_number: orderNum,
      total_amount: grand_total
    });

  } catch (err) {
    console.error('[Customer Controller] placeOrder error:', err);
    res.status(500).json({ error: 'Failed to place order.' });
  }
}

module.exports = {
  getMenu,
  placeOrder
};
