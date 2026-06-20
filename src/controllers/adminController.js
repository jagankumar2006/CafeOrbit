const { query } = require('../config/db');
const fileService = require('../services/fileService');
const QRCode = require('qrcode');

// --- CATEGORIES ---
async function getCategories(req, res) {
  try {
    const categories = await query.all('SELECT * FROM product_categories ORDER BY id ASC');
    res.json(categories);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch categories.' });
  }
}

async function createCategory(req, res) {
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name is required.' });
  const hexColor = color || '#6F4E37';

  try {
    const result = await query.run(
      'INSERT INTO product_categories (name, color) VALUES (?, ?)',
      [name, hexColor]
    );
    res.status(201).json({ id: result.id, name, color: hexColor });
  } catch (err) {
    console.error(err);
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Category with this name already exists.' });
    }
    res.status(500).json({ error: 'Failed to create category.' });
  }
}

async function updateCategory(req, res) {
  const { id } = req.params;
  const { name, color } = req.body;
  try {
    await query.run(
      'UPDATE product_categories SET name = ?, color = ? WHERE id = ?',
      [name, color, id]
    );
    res.json({ id, name, color });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update category.' });
  }
}

async function deleteCategory(req, res) {
  const { id } = req.params;
  try {
    await query.run('DELETE FROM product_categories WHERE id = ?', [id]);
    res.json({ message: 'Category deleted successfully.' });
  } catch (err) {
    console.error(err);
    if (err.message.includes('FOREIGN KEY')) {
      return res.status(400).json({ error: 'Cannot delete category containing active products.' });
    }
    res.status(500).json({ error: 'Failed to delete category.' });
  }
}

// --- PRODUCTS ---
async function getProducts(req, res) {
  try {
    const products = await query.all(`
      SELECT p.*, c.name AS category_name, c.color AS category_color
      FROM products p
      LEFT JOIN product_categories c ON p.category_id = c.id
      ORDER BY p.id ASC
    `);
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch products.' });
  }
}

async function createProduct(req, res) {
  const { name, category_id, price, unit_of_measure, tax_percentage, description, image_url } = req.body;
  if (!name || !category_id || price === undefined) {
    return res.status(400).json({ error: 'Name, category_id, and price are required.' });
  }

  try {
    const result = await query.run(
      `INSERT INTO products (name, category_id, price, unit_of_measure, tax_percentage, description, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, category_id, price, unit_of_measure || 'pcs', tax_percentage || 18.00, description || '', image_url || null]
    );
    res.status(201).json({ id: result.id, name, category_id, price, unit_of_measure, tax_percentage, description, image_url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create product.' });
  }
}

async function updateProduct(req, res) {
  const { id } = req.params;
  const { name, category_id, price, unit_of_measure, tax_percentage, description, image_url } = req.body;
  try {
    await query.run(
      `UPDATE products 
       SET name = ?, category_id = ?, price = ?, unit_of_measure = ?, tax_percentage = ?, description = ?, image_url = ?
       WHERE id = ?`,
      [name, category_id, price, unit_of_measure, tax_percentage, description, image_url, id]
    );
    res.json({ id, name, category_id, price, unit_of_measure, tax_percentage, description, image_url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update product.' });
  }
}

async function deleteProduct(req, res) {
  const { id } = req.params;
  try {
    await query.run('DELETE FROM products WHERE id = ?', [id]);
    res.json({ message: 'Product deleted successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete product.' });
  }
}

// Upload Product Image (Accepts JSON with Base64 payload to bypass multer config)
async function uploadProductImage(req, res) {
  const { id } = req.params;
  const { imageBase64, filename } = req.body;
  if (!imageBase64) {
    return res.status(400).json({ error: 'imageBase64 string is required.' });
  }

  try {
    const product = await query.get('SELECT id FROM products WHERE id = ?', [id]);
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    // Clean base64 header if present
    const matches = imageBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    let buffer;
    let contentType = 'image/jpeg';
    
    if (matches && matches.length === 3) {
      contentType = matches[1];
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      buffer = Buffer.from(imageBase64, 'base64');
    }

    const ext = contentType.split('/')[1] || 'jpg';
    const fileKey = `products/product_${id}_${Date.now()}.${ext}`;

    const uploadedUrl = await fileService.uploadFile(buffer, fileKey, contentType);

    // Save image url inside product database
    await query.run('UPDATE products SET image_url = ? WHERE id = ?', [uploadedUrl, id]);

    res.json({ message: 'Image uploaded successfully.', imageUrl: uploadedUrl });
  } catch (err) {
    console.error('[Upload Product Image] Error:', err);
    res.status(500).json({ error: 'Failed to upload image.' });
  }
}

// --- FLOORS & TABLES ---
async function getFloors(req, res) {
  try {
    const floors = await query.all('SELECT * FROM floors ORDER BY id ASC');
    res.json(floors);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch floors.' });
  }
}

async function createFloor(req, res) {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Floor name is required.' });
  try {
    const result = await query.run('INSERT INTO floors (name) VALUES (?)', [name]);
    res.status(201).json({ id: result.id, name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create floor.' });
  }
}

async function deleteFloor(req, res) {
  const { id } = req.params;
  try {
    await query.run('DELETE FROM floors WHERE id = ?', [id]);
    res.json({ message: 'Floor deleted successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete floor.' });
  }
}

async function getTables(req, res) {
  try {
    const tables = await query.all(`
      SELECT t.*, f.name AS floor_name 
      FROM tables t
      JOIN floors f ON t.floor_id = f.id
      ORDER BY t.id ASC
    `);
    res.json(tables);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch tables.' });
  }
}

async function createTable(req, res) {
  const { floor_id, table_number, seats_count } = req.body;
  if (!floor_id || !table_number) {
    return res.status(400).json({ error: 'Floor ID and Table Number are required.' });
  }
  try {
    const result = await query.run(
      'INSERT INTO tables (floor_id, table_number, seats_count, is_active) VALUES (?, ?, ?, 1)',
      [floor_id, table_number, seats_count || 2]
    );
    res.status(201).json({ id: result.id, floor_id, table_number, seats_count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create table.' });
  }
}

async function deleteTable(req, res) {
  const { id } = req.params;
  try {
    await query.run('DELETE FROM tables WHERE id = ?', [id]);
    res.json({ message: 'Table deleted successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete table.' });
  }
}

// Generate a real scannable QR code PNG for a table and save locally
async function generateTableQr(req, res) {
  const { id } = req.params;
  try {
    const table = await query.get(`
      SELECT t.*, f.name as floor_name 
      FROM tables t 
      JOIN floors f ON t.floor_id = f.id 
      WHERE t.id = ?
    `, [id]);
    if (!table) return res.status(404).json({ error: 'Table not found.' });

    // QR encodes the local POS URL with table pre-selected
    const qrContent = `http://localhost:${process.env.PORT || 5000}/customer.html?table_id=${id}&table=${encodeURIComponent(table.table_number)}`;

    // Generate real QR code as PNG buffer
    const qrPngBuffer = await QRCode.toBuffer(qrContent, {
      type: 'png',
      width: 400,
      margin: 2,
      color: {
        dark: '#1E293B',   // Slate dark — matches CafeOrbit brand
        light: '#FFFFFF'
      }
    });

    const fileKey = `qr/table_${id}.png`;
    const savedUrl = await fileService.uploadFile(qrPngBuffer, fileKey, 'image/png');

    // Update table record with local QR image path
    await query.run('UPDATE tables SET qr_s3_url = ? WHERE id = ?', [savedUrl, id]);

    res.json({
      message: 'QR code generated successfully.',
      tableId: id,
      tableName: table.table_number,
      floorName: table.floor_name,
      qrImageUrl: savedUrl,
      qrContent
    });
  } catch (err) {
    console.error('[Generate Table QR] Error:', err);
    res.status(500).json({ error: 'Failed to generate QR code.' });
  }
}

module.exports = {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadProductImage,
  getFloors,
  createFloor,
  deleteFloor,
  getTables,
  createTable,
  deleteTable,
  generateTableQr
};
