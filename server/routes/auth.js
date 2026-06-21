const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const { authenticator } = require('otplib');
const crypto = require('crypto');
const { sendMail, isConfigured: mailConfigured } = require('../mailer');
const db = require('../db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'vyre_dev_secret_change_in_production';

// Brute-force protection: max 10 attempts per IP per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
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

// ─── Password reset ─────────────────────────────────────────
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

function appUrl(req) {
  return process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || req.headers.origin || 'http://localhost:5173';
}

// Request a reset link. Always returns a generic response (no account enumeration).
router.post('/forgot-password', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const user = db.prepare('SELECT id, username, email FROM users WHERE email = ?')
      .get(String(email).trim().toLowerCase());

    const generic = { success: true, message: 'If an account exists for that email, a reset link has been sent.' };
    if (!user) return res.json(generic);

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id); // one active token
    db.prepare('INSERT INTO password_resets (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
      .run(tokenHash, user.id, Date.now() + RESET_TTL_MS, Date.now());

    const link = `${appUrl(req)}/?reset=${token}`;
    const html = `<p>Hi ${user.username},</p>
      <p>Reset your VYRE password with the link below (valid for 1 hour):</p>
      <p><a href="${link}">${link}</a></p>
      <p>If you didn't request this, you can safely ignore this email.</p>`;
    try { await sendMail({ to: user.email, subject: 'Reset your VYRE password', html, text: link }); }
    catch (e) { console.warn('[forgot-password] email send failed:', e.message); }

    // Dev convenience: when SMTP isn't configured (and not in prod), return the link so it's usable.
    const devResetLink = (!mailConfigured && process.env.NODE_ENV !== 'production') ? link : undefined;
    res.json(devResetLink ? { ...generic, devResetLink } : generic);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Complete the reset with a valid token.
router.post('/reset-password', authLimiter, async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
    const row = db.prepare('SELECT user_id, expires_at FROM password_resets WHERE token_hash = ?').get(tokenHash);
    if (!row || row.expires_at < Date.now()) {
      if (row) db.prepare('DELETE FROM password_resets WHERE token_hash = ?').run(tokenHash);
      return res.status(400).json({ error: 'Invalid or expired reset link. Request a new one.' });
    }
    const hashed = await bcrypt.hash(newPassword, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, row.user_id);
    db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(row.user_id); // invalidate all
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
