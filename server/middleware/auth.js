const jwt = require('jsonwebtoken');
const db = require('../db');
const JWT_SECRET = process.env.JWT_SECRET || 'vyre_dev_secret_change_in_production';

module.exports = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    const row = db.prepare('SELECT is_banned FROM users WHERE id = ?').get(req.user.id);
    if (row?.is_banned) return res.status(403).json({ error: 'Your account has been suspended. Contact an administrator.' });
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};
