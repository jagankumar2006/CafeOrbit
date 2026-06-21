const { query } = require('../config/db');

// Start/Open session
async function openSession(req, res) {
  const { opening_balance } = req.body;
  const userId = req.user.userId;

  if (opening_balance === undefined) {
    return res.status(400).json({ error: 'Opening balance is required.' });
  }

  try {
    // Check if user already has an active session
    const active = await query.get(
      'SELECT id FROM pos_sessions WHERE user_id = ? AND closed_at IS NULL',
      [userId]
    );
    if (active) {
      return res.status(400).json({ error: 'You already have an active open session.' });
    }

    const result = await query.run(
      'INSERT INTO pos_sessions (user_id, opening_balance, opened_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [userId, opening_balance]
    );

    res.status(201).json({
      message: 'Session opened successfully.',
      session: { id: result.id, userId, opening_balance, opened_at: new Date().toISOString() }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to open session.' });
  }
}

// Close session
async function closeSession(req, res) {
  const { sessionId, closing_balance } = req.body;
  if (!sessionId || closing_balance === undefined) {
    return res.status(400).json({ error: 'Session ID and closing balance are required.' });
  }

  try {
    const session = await query.get('SELECT * FROM pos_sessions WHERE id = ?', [sessionId]);
    if (!session) return res.status(404).json({ error: 'Session not found.' });
    if (session.closed_at) return res.status(400).json({ error: 'Session already closed.' });

    await query.run(
      'UPDATE pos_sessions SET closed_at = CURRENT_TIMESTAMP, closing_balance = ? WHERE id = ?',
      [closing_balance, sessionId]
    );

    res.json({ message: 'Session closed successfully.', sessionId, closing_balance });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to close session.' });
  }
}

// Get active session
async function getActiveSession(req, res) {
  const userId = req.user.userId;
  try {
    const session = await query.get(
      'SELECT * FROM pos_sessions WHERE user_id = ? AND closed_at IS NULL',
      [userId]
    );
    if (!session) {
      return res.json({ session: null });
    }
    res.json({ session });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to query active session.' });
  }
}

// Get floor occupancy layout
async function getOccupancy(req, res) {
  try {
    // Get all tables
    const tables = await query.all(`
      SELECT t.*, f.name AS floor_name
      FROM tables t
      JOIN floors f ON t.floor_id = f.id
      WHERE t.is_active = 1
      ORDER BY f.id, t.table_number
    `);

    // Get all active draft orders
    const drafts = await query.all('SELECT id, table_id, order_number, total_amount FROM orders WHERE status = "Draft" AND table_id IS NOT NULL');

    // Attach the first draft order to the table if it exists
    const occupancy = tables.map(t => {
      const activeOrder = drafts.find(d => d.table_id === t.id);
      return {
        ...t,
        active_order_id: activeOrder ? activeOrder.id : null,
        active_order_number: activeOrder ? activeOrder.order_number : null,
        active_order_total: activeOrder ? activeOrder.total_amount : null
      };
    });

    res.json(occupancy);
  } catch (err) {
    console.error('[Get Occupancy Error]:', err);
    res.status(500).json({ error: 'Failed to retrieve tables occupancy.' });
  }
}

// Calculate order details using the Hierarchical Pricing Engine
async function calculatePricing(items, couponCode) {
  let subtotal = 0;
  let totalProductDiscount = 0;

  // Fetch promotions
  const activePromotions = await query.all('SELECT * FROM promotions WHERE is_active = 1');

  // Find promotion rules
  const prodPromoRule = activePromotions.find(p => p.type === 'Automated Product Promotion');
  const orderPromoRule = activePromotions.find(p => p.type === 'Automated Order Promotion');

  // Process items and apply Product-Level rules
  const processedItems = [];
  for (const item of items) {
    const product = await query.get('SELECT * FROM products WHERE id = ?', [item.productId]);
    if (!product) throw new Error(`Product with ID ${item.productId} not found.`);

    const quantity = item.quantity;
    const unitPrice = product.price;
    let lineSubtotal = unitPrice * quantity;
    let itemDiscount = 0;

    // 1. Product-Level Automated Rule
    if (prodPromoRule && quantity >= prodPromoRule.min_quantity) {
      if (prodPromoRule.discount_type === 'Fixed Amount') {
        itemDiscount = prodPromoRule.discount_value * quantity; // e.g. $1.50 off per quantity
      } else {
        itemDiscount = lineSubtotal * (prodPromoRule.discount_value / 100);
      }
    }

    const lineTotalAfterProductPromo = Math.max(0, lineSubtotal - itemDiscount);
    subtotal += lineTotalAfterProductPromo;
    totalProductDiscount += itemDiscount;

    processedItems.push({
      ...item,
      name: product.name,
      unitPrice,
      taxPercentage: product.tax_percentage,
      productDiscount: itemDiscount,
      initialLineTotal: lineTotalAfterProductPromo
    });
  }

  // 2. Order-Level Automated Rule
  let orderAutomatedDiscount = 0;
  if (orderPromoRule && subtotal >= orderPromoRule.min_order_amount) {
    if (orderPromoRule.discount_type === 'Percentage') {
      orderAutomatedDiscount = subtotal * (orderPromoRule.discount_value / 100);
    } else {
      orderAutomatedDiscount = Math.min(subtotal, orderPromoRule.discount_value);
    }
  }
  let runningSubtotal = Math.max(0, subtotal - orderAutomatedDiscount);

  // 3. Manual Coupon Code Entry
  let couponDiscount = 0;
  if (couponCode) {
    const coupon = activePromotions.find(p => p.type === 'Coupon' && p.code.toUpperCase() === couponCode.toUpperCase());
    if (coupon) {
      if (coupon.discount_type === 'Percentage') {
        couponDiscount = runningSubtotal * (coupon.discount_value / 100);
      } else {
        couponDiscount = Math.min(runningSubtotal, coupon.discount_value);
      }
    }
  }
  let finalSubtotal = Math.max(0, runningSubtotal - couponDiscount);
  const totalOrderLevelDiscount = orderAutomatedDiscount + couponDiscount;

  // Allocate order-level discounts proportionally to items for Fractional Tax Calculation
  let totalTax = 0;
  const finalizedItems = processedItems.map(item => {
    // Proportional factor of this item in the checkout subtotal
    const proportion = subtotal > 0 ? (item.initialLineTotal / subtotal) : 0;
    const itemShareOfOrderDiscount = totalOrderLevelDiscount * proportion;

    const finalLineTotal = Math.max(0, item.initialLineTotal - itemShareOfOrderDiscount);
    
    // 4. Fractional Tax Calculation over final remaining values
    const itemTax = finalLineTotal * (item.taxPercentage / 100);
    totalTax += itemTax;

    return {
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      productDiscount: item.productDiscount,
      orderLevelDiscountAllocated: itemShareOfOrderDiscount,
      lineTotal: finalLineTotal,
      taxAmount: itemTax,
      taxPercentage: item.taxPercentage
    };
  });

  const totalDiscount = totalProductDiscount + totalOrderLevelDiscount;
  const totalAmount = finalSubtotal + totalTax;

  return {
    subtotal: subtotal + totalProductDiscount, // Original raw subtotal
    discountAmount: totalDiscount,
    tax: totalTax,
    totalAmount,
    items: finalizedItems
  };
}

// Create/Draft Order
async function createOrder(req, res) {
  const { sessionId, tableId, customerId, items, couponCode } = req.body;
  if (!sessionId || !items || items.length === 0) {
    return res.status(400).json({ error: 'Session ID and items list are required.' });
  }

  try {
    // Compute pricing details
    const pricing = await calculatePricing(items, couponCode);

    // Generate unique temporary number to guarantee insert succeeds concurrently
    const tempOrderNum = `TEMP-${Date.now()}-${Math.floor(Math.random()*10000)}`;

    // Insert order in Draft mode
    const orderResult = await query.run(
      `INSERT INTO orders (order_number, session_id, table_id, customer_id, subtotal, tax, discount_amount, total_amount, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Draft')`,
      [tempOrderNum, sessionId, tableId || null, customerId || null, pricing.subtotal, pricing.tax, pricing.discountAmount, pricing.totalAmount]
    );
    const orderId = orderResult.id;

    // Mathematically guarantee unique sequential order number using native auto-increment ID
    const orderNum = `ORD-${String(orderId).padStart(4, '0')}`;
    await query.run('UPDATE orders SET order_number = ? WHERE id = ?', [orderNum, orderId]);

    // Insert items
    for (const item of pricing.items) {
      await query.run(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price, tax_amount, discount_amount, line_total, kds_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Waiting')`,
        [orderId, item.productId, item.quantity, item.unitPrice, item.taxAmount, (item.productDiscount + item.orderLevelDiscountAllocated), item.lineTotal]
      );
    }

    res.status(201).json({
      message: 'Draft order created successfully.',
      order: {
        id: orderId,
        order_number: orderNum,
        subtotal: pricing.subtotal,
        tax: pricing.tax,
        discount_amount: pricing.discountAmount,
        total_amount: pricing.totalAmount,
        status: 'Draft',
        items: pricing.items
      }
    });
  } catch (err) {
    console.error('[Create Order] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to create order.' });
  }
}

// Recalculate Checkout pricing totals preview
async function previewPricing(req, res) {
  const { items, couponCode } = req.body;
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Items list is required for pricing preview.' });
  }
  try {
    const pricing = await calculatePricing(items, couponCode);
    res.json(pricing);
  } catch (err) {
    console.error('[Preview Pricing] Error:', err);
    res.status(500).json({ error: err.message || 'Pricing evaluation failed.' });
  }
}

// Finalize/Checkout Order (Paid)
async function checkoutOrder(req, res) {
  const { id } = req.params;
  const { paymentMethodId, couponCode } = req.body;

  try {
    const order = await query.get('SELECT * FROM orders WHERE id = ?', [id]);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.status !== 'Draft') {
      return res.status(400).json({ error: `Order has already been processed (status: ${order.status}).` });
    }

    // Verify payment method
    const payment = await query.get('SELECT * FROM payment_methods WHERE id = ? AND is_enabled = 1', [paymentMethodId]);
    if (!payment) return res.status(400).json({ error: 'Invalid or disabled payment method.' });

    // Set order status to Paid
    await query.run('UPDATE orders SET status = "Paid" WHERE id = ?', [id]);

    // Send update broadcast
    if (global.broadcastEvent) {
      global.broadcastEvent('ORDER_PAID', { orderId: id, orderNumber: order.order_number });
    }

    res.json({
      message: 'Checkout completed successfully.',
      orderId: id,
      orderNumber: order.order_number,
      status: 'Paid',
      paymentMethod: payment.name
    });
  } catch (err) {
    console.error('[Checkout Order] Error:', err);
    res.status(500).json({ error: 'Failed to process checkout transaction.' });
  }
}

// Send to Kitchen (Triggers KDS tickets WebSocket mesh broadcast)
async function sendToKitchen(req, res) {
  const { id } = req.params;
  try {
    const order = await query.get('SELECT * FROM orders WHERE id = ?', [id]);
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    // Retrieve kitchen routing items (filter out items if needed, here we send all items)
    const items = await query.all(`
      SELECT oi.*, p.name, c.name as category_name
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      JOIN product_categories c ON p.category_id = c.id
      WHERE oi.order_id = ?
    `, [id]);

    if (items.length === 0) {
      return res.status(400).json({ error: 'No items in order to send to kitchen.' });
    }

    // Update KDS status
    await query.run('UPDATE order_items SET kds_status = "Waiting" WHERE order_id = ?', [id]);

    // WebSocket state broadcast
    const ticketPayload = {
      orderId: id,
      orderNumber: order.order_number,
      tableName: 'Table',
      createdAt: order.created_at,
      items: items.map(item => ({
        itemId: item.id,
        name: item.name,
        quantity: item.quantity,
        kdsStatus: 'Waiting'
      }))
    };

    // If there is table detail, grab table number
    if (order.table_id) {
      const tbl = await query.get('SELECT table_number FROM tables WHERE id = ?', [order.table_id]);
      if (tbl) ticketPayload.tableName = `T-${String(tbl.table_number).padStart(2, '0')}`;
    } else {
      ticketPayload.tableName = 'Takeaway';
    }

    if (global.broadcastEvent) {
      global.broadcastEvent('KDS_NEW_TICKET', ticketPayload);
    }

    res.json({ message: 'Order routed to Kitchen Display System.', ticket: ticketPayload });
  } catch (err) {
    console.error('[Send to Kitchen] Error:', err);
    res.status(500).json({ error: 'Failed to route order to kitchen.' });
  }
}

// Get active kitchen tickets to show on POS tracker
async function getActiveKitchenOrders(req, res) {
  try {
    // We get all orders that have items with kds_status in ('Waiting', 'Preparing', 'Cooked')
    // and where the order itself is not fully complete (could just check for the item status)
    const activeItems = await query.all(`
      SELECT oi.id, oi.order_id, oi.product_id, oi.quantity, oi.kds_status,
             o.order_number, o.table_id, t.table_number, p.name as product_name
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN products p ON oi.product_id = p.id
      LEFT JOIN tables t ON o.table_id = t.id
      WHERE oi.kds_status IN ('Waiting', 'Preparing', 'Cooked')
      ORDER BY o.created_at ASC
    `);

    // Group items by order
    const ticketsMap = {};
    activeItems.forEach(item => {
      if (!ticketsMap[item.order_id]) {
        ticketsMap[item.order_id] = {
          orderId: item.order_id,
          orderNumber: item.order_number,
          tableName: item.table_number || 'Takeaway',
          items: []
        };
      }
      ticketsMap[item.order_id].items.push({
        itemId: item.id,
        name: item.product_name,
        quantity: item.quantity,
        kdsStatus: item.kds_status
      });
    });

    const activeTickets = Object.values(ticketsMap);
    res.json(activeTickets);
  } catch (err) {
    console.error('[Get Kitchen Orders] Error:', err);
    res.status(500).json({ error: 'Failed to fetch active kitchen tickets.' });
  }
}

// Cancel an active order to clear a table
async function cancelOrder(req, res) {
  const { id } = req.params;
  try {
    const order = await query.get('SELECT * FROM orders WHERE id = ?', [id]);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.status !== 'Draft') return res.status(400).json({ error: 'Only Draft orders can be cancelled.' });

    await query.run('UPDATE orders SET status = "Cancelled" WHERE id = ?', [id]);
    res.json({ message: 'Order cancelled. Table is now available.' });
  } catch (err) {
    console.error('[Cancel Order] Error:', err);
    res.status(500).json({ error: 'Failed to cancel order.' });
  }
}

// Clear all draft orders for a table
async function clearTable(req, res) {
  const { id } = req.params;
  try {
    const result = await query.run('UPDATE orders SET status = "Cancelled" WHERE table_id = ? AND status = "Draft"', [id]);
    res.json({ message: `Table cleared successfully. Cancelled ${result.changes} orders.` });
  } catch (err) {
    console.error('[Clear Table] Error:', err);
    res.status(500).json({ error: 'Failed to clear table.' });
  }
}

module.exports = {
  openSession,
  closeSession,
  getActiveSession,
  getOccupancy,
  createOrder,
  previewPricing,
  checkoutOrder,
  sendToKitchen,
  getActiveKitchenOrders,
  cancelOrder,
  clearTable
};
