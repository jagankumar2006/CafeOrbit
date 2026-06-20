require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { initDb, query } = require('./src/config/db');
const auth = require('./src/middleware/auth');

// Controllers
const authController = require('./src/controllers/authController');
const adminController = require('./src/controllers/adminController');
const posController = require('./src/controllers/posController');
const reportController = require('./src/controllers/reportController');
const customerController = require('./src/controllers/customerController');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

// Setup Global Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Higher limit for Base64 image uploads
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Serve Static Frontend and Uploads locally
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'frontend')));

// Initialize uploads dir if missing
const uploadsPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}

// WebSocket connection registry
const wsClients = new Set();

wss.on('connection', (ws) => {
  wsClients.add(ws);
  console.log(`[WS] Client connected. Total clients: ${wsClients.size}`);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('[WS] Received message:', data);

      if (data.type === 'ORDER_COMPLETED_KDS' && data.payload && data.payload.orderId) {
        const orderId = data.payload.orderId;
        // Update database asynchronously when kitchen completes ticket
        query.run('UPDATE orders SET status = "Completed" WHERE id = ?', [orderId]).catch(console.error);
        query.run('UPDATE order_items SET kds_status = "Cooked", completed_at = CURRENT_TIMESTAMP WHERE order_id = ?', [orderId]).catch(console.error);
      } else if (data.type === 'ORDER_RECALLED_KDS' && data.payload && data.payload.orderId) {
        const orderId = data.payload.orderId;
        // Revert ticket to active state
        query.run('UPDATE orders SET status = "Paid" WHERE id = ?', [orderId]).catch(console.error);
        query.run('UPDATE order_items SET kds_status = "Waiting", completed_at = NULL WHERE order_id = ?', [orderId]).catch(console.error);
      }
      
      // Echo / Broadcast to all other clients
      broadcast(data.type, data.payload, ws);
    } catch (err) {
      console.error('[WS] Error processing message:', err);
    }
  });

  ws.on('close', () => {
    wsClients.delete(ws);
    console.log(`[WS] Client disconnected. Total clients: ${wsClients.size}`);
  });

  // Send initial welcome message
  ws.send(JSON.stringify({ type: 'CONNECTED', payload: { message: 'Zero-latency Event Mesh Active' } }));
});

// Broadcast helper function
function broadcast(type, payload, excludeWs = null) {
  console.log(`[WS] Broadcasting event: ${type}`);
  const messageStr = JSON.stringify({ type, payload });
  wsClients.forEach((client) => {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
}

// Map to global for controller access
global.broadcastEvent = (type, payload) => {
  broadcast(type, payload);
};

// Route Upgrades to WebSocket Server
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// --- API ROUTES ---

// Auth Endpoints
app.post('/api/auth/signup', authController.signup);
app.post('/api/auth/login', authController.login);
app.get('/api/auth/employees', auth.verifyToken, authController.getEmployees);
app.put('/api/auth/employees/:id/archive', auth.verifyToken, auth.verifyAdmin, authController.archiveEmployee);
app.delete('/api/auth/employees/:id', auth.verifyToken, auth.verifyAdmin, authController.deleteEmployee);
app.put('/api/auth/employees/:id/password', auth.verifyToken, auth.verifyAdmin, authController.changePassword);

// Admin Category Endpoints
app.get('/api/admin/categories', adminController.getCategories);
app.post('/api/admin/categories', auth.verifyToken, auth.verifyAdmin, adminController.createCategory);
app.put('/api/admin/categories/:id', auth.verifyToken, auth.verifyAdmin, adminController.updateCategory);
app.delete('/api/admin/categories/:id', auth.verifyToken, auth.verifyAdmin, adminController.deleteCategory);

// Admin Product Endpoints
app.get('/api/admin/products', adminController.getProducts);
app.post('/api/admin/products', auth.verifyToken, auth.verifyAdmin, adminController.createProduct);
app.put('/api/admin/products/:id', auth.verifyToken, auth.verifyAdmin, adminController.updateProduct);
app.delete('/api/admin/products/:id', auth.verifyToken, auth.verifyAdmin, adminController.deleteProduct);
app.post('/api/admin/products/:id/upload-image', auth.verifyToken, auth.verifyAdmin, adminController.uploadProductImage);

// Admin Floor & Table Endpoints
app.get('/api/admin/floors', adminController.getFloors);
app.post('/api/admin/floors', auth.verifyToken, auth.verifyAdmin, adminController.createFloor);
app.delete('/api/admin/floors/:id', auth.verifyToken, auth.verifyAdmin, adminController.deleteFloor);
app.get('/api/admin/tables', adminController.getTables);
app.post('/api/admin/tables', auth.verifyToken, auth.verifyAdmin, adminController.createTable);
app.delete('/api/admin/tables/:id', auth.verifyToken, auth.verifyAdmin, adminController.deleteTable);
app.post('/api/admin/tables/:id/generate-qr', auth.verifyToken, auth.verifyAdmin, adminController.generateTableQr);

// POS Operations Endpoints
app.post('/api/pos/sessions/open', auth.verifyToken, posController.openSession);
app.post('/api/pos/sessions/close', auth.verifyToken, posController.closeSession);
app.get('/api/pos/sessions/active', auth.verifyToken, posController.getActiveSession);
app.get('/api/pos/occupancy', auth.verifyToken, posController.getOccupancy);
app.post('/api/pos/orders', auth.verifyToken, posController.createOrder);
app.post('/api/pos/orders/preview', auth.verifyToken, posController.previewPricing);
app.post('/api/pos/orders/:id/checkout', auth.verifyToken, posController.checkoutOrder);
app.post('/api/pos/orders/:id/send-to-kitchen', auth.verifyToken, posController.sendToKitchen);
app.get('/api/pos/kitchen-status', auth.verifyToken, posController.getActiveKitchenOrders);

// Analytical Reports Endpoints
app.get('/api/reports/analytics', auth.verifyToken, auth.verifyAdmin, reportController.getAnalytics);
app.get('/api/reports/history', auth.verifyToken, auth.verifyAdmin, reportController.getOrderHistory);
app.post('/api/reports/export', auth.verifyToken, auth.verifyAdmin, reportController.exportReport);

// Customer Public Endpoints
app.get('/api/customer/menu', customerController.getMenu);
app.post('/api/customer/orders', customerController.placeOrder);

// Sync Fallback Endpoints
app.get('/api/sync/customer-display', async (req, res) => {
  try {
    // Get active draft order count or details
    const activeOrders = await query.all("SELECT id, order_number, total_amount FROM orders WHERE status = 'Draft' ORDER BY id DESC LIMIT 5");
    res.json({ activeOrders });
  } catch (err) {
    res.status(500).json({ error: 'Sync failed.' });
  }
});

app.get('/api/sync/kds/tickets', async (req, res) => {
  try {
    // Fetch all active order items plus recently completed ones for the Recall feature
    const tickets = await query.all(`
      SELECT o.id as order_id, o.order_number, o.created_at, t.table_number, oi.id as item_id, p.name as item_name, oi.quantity, oi.kds_status, oi.completed_at
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN tables t ON o.table_id = t.id
      JOIN products p ON oi.product_id = p.id
      WHERE oi.kds_status IN ('Waiting', 'Preparing') 
         OR (oi.kds_status = 'Cooked' AND oi.completed_at >= NOW() - INTERVAL 4 HOUR)
      ORDER BY o.id ASC
    `);
    res.json({ tickets });
  } catch (err) {
    res.status(500).json({ error: 'Sync failed.' });
  }
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Global Exception Handler]', err);
  res.status(500).json({
    error: 'A backend exception occurred.',
    message: err.message || 'Internal server error.'
  });
});

// Start server
const PORT = process.env.PORT || 5000;
async function startServer() {
  await initDb();
  server.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`  CafeOrbit POS Backend Server Running           `);
    console.log(`  Local Endpoint: http://localhost:${PORT}        `);
    console.log(`  WebSocket URL:  ws://localhost:${PORT}          `);
    console.log(`=================================================`);
  });
}

startServer();
