const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const { authenticator } = require('otplib');
const db = require('../db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'vyre_dev_secret_change_in_production';

// Brute-force protection: max 10 attempts per IP per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
  skip: () => process.env.NODE_ENV !== 'production', // only enforce in production
});

router.post('/register', authLimiter, async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ error: 'All fields required' });

    // Check admin setting: registrationEnabled
    const regSetting = db.prepare("SELECT value FROM admin_settings WHERE key = 'registrationEnabled'").get();
    if (regSetting && regSetting.value === 'false')
      return res.status(503).json({ error: 'New registrations are currently disabled by the administrator.' });

    const existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
    if (existing) return res.status(409).json({ error: 'User already exists' });

    const hashed = await bcrypt.hash(password, 10);
    const id = uuidv4();
    db.prepare('INSERT INTO users (id, username, email, password) VALUES (?, ?, ?, ?)').run(id, username, email, hashed);

    const token = jwt.sign({ id, username, email }, JWT_SECRET, { expiresIn: '7d' });
    const user = db.prepare('SELECT id, username, email, avatar, about, last_seen, created_at FROM users WHERE id = ?').get(id);
    res.json({ token, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin-login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Credentials required' });

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminHash  = process.env.ADMIN_PASSWORD_HASH;
    if (!adminEmail || !adminHash) return res.status(503).json({ error: 'Admin not configured' });

    if (email.toLowerCase() !== adminEmail.toLowerCase())
      return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, adminHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ role: 'admin', email }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, username, password } = req.body;
    const identifier = email || username;
    if (!identifier || !password) return res.status(400).json({ error: 'Credentials required' });
    const user = db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(identifier, identifier);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    // Two-factor: if enabled, a valid TOTP code is required before a token is issued.
    if (user.totp_enabled) {
      const { totpCode } = req.body;
      if (!totpCode) return res.json({ twoFactorRequired: true });
      const ok = authenticator.verify({ token: String(totpCode).replace(/\s/g, ''), secret: user.totp_secret });
      if (!ok) return res.status(401).json({ error: 'Invalid 2FA code' });
    }

    db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Date.now(), user.id);
    const token = jwt.sign({ id: user.id, username: user.username, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    const { password: _, totp_secret: __, ...safeUser } = user;
    res.json({ token, user: safeUser });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
