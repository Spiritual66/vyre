const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'vyre_dev_secret_change_in_production';

module.exports = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    req.admin = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};
