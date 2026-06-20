const { query } = require('../config/db');
const fileService = require('../services/fileService');
const PDFDocument = require('pdfkit');

async function getAnalytics(req, res) {
  try {
    // 1. Core KPIs
    const kpiRow = await query.get(`
      SELECT 
        COUNT(id) as total_orders,
        COALESCE(SUM(CASE WHEN status IN ('Paid', 'Completed') THEN total_amount ELSE 0 END), 0) as total_revenue,
        COALESCE(AVG(CASE WHEN status IN ('Paid', 'Completed') THEN total_amount ELSE NULL END), 0) as avg_order_value
      FROM orders
    `);

    // 2. Sales by Category
    const categorySales = await query.all(`
      SELECT 
        c.name as category_name,
        c.color as category_color,
        COUNT(CASE WHEN o.id IS NOT NULL THEN oi.id ELSE NULL END) as item_count,
        COALESCE(SUM(CASE WHEN o.id IS NOT NULL THEN oi.line_total ELSE 0 END), 0) as category_revenue
      FROM product_categories c
      LEFT JOIN products p ON p.category_id = c.id
      LEFT JOIN order_items oi ON oi.product_id = p.id
      LEFT JOIN orders o ON oi.order_id = o.id AND o.status IN ('Paid', 'Completed')
      GROUP BY c.id
    `);

    // 3. Sales Curve Timeline grouped by date
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

    res.json({
      kpis: {
        totalOrders: kpiRow.total_orders,
        totalRevenue: parseFloat(kpiRow.total_revenue || 0),
        averageOrderValue: parseFloat(kpiRow.avg_order_value || 0)
      },
      categorySales,
      timelineSales
    });
  } catch (err) {
    console.error('[Analytics] Error:', err);
    res.status(500).json({ error: 'Failed to aggregate analytics reporting.' });
  }
}

async function exportReport(req, res) {
  const { format } = req.body; // 'csv' or 'xls' or 'pdf'
  const fileFormat = format || 'csv';

  try {
    const kpiRow = await query.get(`
      SELECT 
        COUNT(id) as total_orders,
        COALESCE(SUM(CASE WHEN status IN ('Paid', 'Completed') THEN total_amount ELSE 0 END), 0) as total_revenue,
        COALESCE(AVG(CASE WHEN status IN ('Paid', 'Completed') THEN total_amount ELSE NULL END), 0) as avg_order_value
      FROM orders
    `);

    const productsSales = await query.all(`
      SELECT p.name, c.name as category_name, 
        COUNT(CASE WHEN o.id IS NOT NULL THEN oi.id ELSE NULL END) as units_sold, 
        COALESCE(SUM(CASE WHEN o.id IS NOT NULL THEN oi.line_total ELSE 0 END), 0) as total_sales
      FROM products p
      JOIN product_categories c ON p.category_id = c.id
      LEFT JOIN order_items oi ON oi.product_id = p.id
      LEFT JOIN orders o ON oi.order_id = o.id AND o.status IN ('Paid', 'Completed')
      GROUP BY p.id
      ORDER BY total_sales DESC
    `);

    const timelineSales = await query.all(`
      SELECT DATE(created_at) as order_date, COUNT(id) as order_count, SUM(total_amount) as revenue
      FROM orders
      WHERE status IN ('Paid', 'Completed')
      GROUP BY DATE(created_at)
      ORDER BY order_date ASC
    `);

    let buffer;
    let fileKey;
    let contentType;

    if (fileFormat === 'csv' || fileFormat === 'xls') {
      let csvContent = `CafeOrbit POS Analytics Export Report\n`;
      csvContent += `Generated: ${new Date().toISOString()}\n\n`;
      csvContent += `KPI,Value\n`;
      csvContent += `Total Orders,${kpiRow.total_orders}\n`;
      csvContent += `Total Revenue,${kpiRow.total_revenue}\n`;
      csvContent += `Average Order Value,${kpiRow.avg_order_value}\n\n`;
      
      csvContent += `Product Sales Summary\n`;
      csvContent += `Product Name,Category,Units Sold,Total Sales Revenue\n`;
      productsSales.forEach(item => {
        csvContent += `"${item.name}","${item.category_name}",${item.units_sold},${item.total_sales || 0}\n`;
      });
      csvContent += `\n`;

      csvContent += `Sales Flow Statement\n`;
      csvContent += `Date,Order Count,Daily Revenue\n`;
      timelineSales.forEach(day => {
        csvContent += `${day.order_date},${day.order_count},${day.revenue || 0}\n`;
      });

      buffer = Buffer.from(csvContent, 'utf-8');
      fileKey = `reports/sales_report_${Date.now()}.csv`;
      contentType = 'text/csv';
    } else {
      // Generate real PDF using pdfkit
      buffer = await new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Header
        doc.fontSize(20).text('CafeOrbit POS Analytics Report', { align: 'center' });
        doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
        doc.moveDown(2);

        // KPIs
        doc.fontSize(14).text('Key Performance Indicators', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(12).text(`Total Orders: ${kpiRow.total_orders}`);
        doc.text(`Total Revenue: ₹${parseFloat(kpiRow.total_revenue).toFixed(2)}`);
        doc.text(`Average Order Value: ₹${parseFloat(kpiRow.avg_order_value).toFixed(2)}`);
        doc.moveDown(2);

        // Product Summary
        doc.fontSize(14).text('Product Sales Summary', { underline: true });
        doc.moveDown(0.5);
        productsSales.forEach(p => {
          if (p.units_sold > 0) {
            doc.fontSize(10).text(`- ${p.name} (${p.category_name}): ${p.units_sold} units sold (₹${parseFloat(p.total_sales).toFixed(2)})`);
          }
        });
        doc.moveDown(2);

        // Sales Flow
        doc.fontSize(14).text('Sales Flow Statement', { underline: true });
        doc.moveDown(0.5);
        timelineSales.forEach(day => {
          doc.fontSize(10).text(`- ${day.order_date}: ${day.order_count} orders (₹${parseFloat(day.revenue).toFixed(2)})`);
        });

        doc.end();
      });
      
      fileKey = `reports/sales_report_${Date.now()}.pdf`;
      contentType = 'application/pdf';
    }

    const fileUrl = await fileService.uploadFile(buffer, fileKey, contentType);
    const downloadUrl = fileService.getDownloadUrl(fileKey);

    res.json({
      message: 'Report exported successfully.',
      fileUrl,
      downloadUrl,
      fileName: fileKey.split('/')[1]
    });
  } catch (err) {
    console.error('[Export Report] Error:', err);
    res.status(500).json({ error: 'Failed to export analytics report.' });
  }
}

async function getOrderHistory(req, res) {
  try {
    const orders = await query.all(`
      SELECT o.id, o.order_number, o.total_amount, o.status, o.created_at, t.table_number 
      FROM orders o
      LEFT JOIN tables t ON o.table_id = t.id
      ORDER BY o.created_at DESC
      LIMIT 100
    `);
    res.json({ orders });
  } catch (err) {
    console.error('[Order History] Error:', err);
    res.status(500).json({ error: 'Failed to fetch order history.' });
  }
}

module.exports = {
  getAnalytics,
  exportReport,
  getOrderHistory
};
