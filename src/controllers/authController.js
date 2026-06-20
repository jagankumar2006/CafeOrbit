const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretcafeorbitkeychangeinproduction';

async function signup(req, res) {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required fields.' });
  }

  try {
    // Check if email already exists
    const existing = await query.get('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      return res.status(400).json({ error: 'Email already registered.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userRole = role === 'User/Admin' ? 'User/Admin' : 'Employee/Cashier';

    const result = await query.run(
      'INSERT INTO users (name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?)',
      [name, email, passwordHash, userRole, 'Active']
    );

    res.status(201).json({
      message: 'User registered successfully.',
      user: { id: result.id, name, email, role: userRole, status: 'Active' }
    });
  } catch (err) {
    console.error('[Auth Controller] Signup error:', err);
    res.status(500).json({ error: 'Server error during signup.' });
  }
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const user = await query.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user || user.status === 'Archived') {
      return res.status(401).json({ error: 'Invalid credentials or account is archived.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('[Auth Controller] Login error:', err);
    res.status(500).json({ error: 'Server error during login.' });
  }
}

async function getEmployees(req, res) {
  try {
    // Select all users who are Employees/Cashiers and not Deleted
    const employees = await query.all(
      'SELECT id, name, email, role, status FROM users WHERE status != "Deleted" ORDER BY id DESC'
    );
    res.json(employees);
  } catch (err) {
    console.error('[Auth Controller] Fetch employees error:', err);
    res.status(500).json({ error: 'Server error listing employees.' });
  }
}

async function archiveEmployee(req, res) {
  const { id } = req.params;
  try {
    const employee = await query.get('SELECT id, role FROM users WHERE id = ?', [id]);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    // Toggle user status to 'Archived' (soft deactivate)
    await query.run('UPDATE users SET status = "Archived" WHERE id = ?', [id]);

    res.json({ message: 'User status successfully set to Archived.', userId: id });
  } catch (err) {
    console.error('[Auth Controller] Archive employee error:', err);
    res.status(500).json({ error: 'Server error during archive operations.' });
  }
}

async function deleteEmployee(req, res) {
  const { id } = req.params;
  try {
    const employee = await query.get('SELECT id, role FROM users WHERE id = ?', [id]);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    // Set status to Deleted to hide them from the UI but preserve financial foreign keys
    await query.run('UPDATE users SET status = "Deleted" WHERE id = ?', [id]);
    res.json({ message: 'User deleted successfully.', userId: id });
  } catch (err) {
    console.error('[Auth Controller] Delete employee error:', err);
    res.status(500).json({ error: 'Server error during delete operations.' });
  }
}

async function changePassword(req, res) {
  const { id } = req.params;
  const { newPassword } = req.body;

  if (!newPassword) {
    return res.status(400).json({ error: 'New password is required.' });
  }

  try {
    const employee = await query.get('SELECT id FROM users WHERE id = ?', [id]);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await query.run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, id]);
    
    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    console.error('[Auth Controller] Change password error:', err);
    res.status(500).json({ error: 'Server error changing password.' });
  }
}

module.exports = {
  signup,
  login,
  getEmployees,
  archiveEmployee,
  deleteEmployee,
  changePassword
};
