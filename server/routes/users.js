const express = require('express');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const auth = require('../middleware/auth');
const db = require('../db');
const { UPLOADS_DIR } = require('../paths');

const router = express.Router();

const storage = multer.diskStorage({
  destination: path.join(UPLOADS_DIR, 'avatars'),
  filename: (req, file, cb) => cb(null, `${req.user.id}-${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Images only'));
    cb(null, true);
  },
});

router.get('/me', auth, (req, res) => {
  const user = db.prepare('SELECT id, username, email, avatar, about, last_seen, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

router.put('/me', auth, (req, res) => {
  const { username, about, email } = req.body;
  if (username) {
    const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, req.user.id);
    if (existing) return res.status(409).json({ error: 'Username taken' });
    db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username.trim(), req.user.id);
  }
  if (about !== undefined) db.prepare('UPDATE users SET about = ? WHERE id = ?').run(about, req.user.id);
  if (email) {
    const taken = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, req.user.id);
    if (taken) return res.status(409).json({ error: 'Email already in use' });
    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email.trim().toLowerCase(), req.user.id);
  }
  const user = db.prepare('SELECT id, username, email, avatar, about, last_seen, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

// Change password
router.put('/me/password', auth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both fields required' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
  const row = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);
  const valid = await bcrypt.compare(currentPassword, row.password);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
  const hashed = await bcrypt.hash(newPassword, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, req.user.id);
  res.json({ success: true });
});

// ─── Two-Factor Authentication (TOTP) ───────────────────────
const TOTP_ISSUER = 'VYRE';

router.get('/me/2fa', auth, (req, res) => {
  const u = db.prepare('SELECT totp_enabled FROM users WHERE id = ?').get(req.user.id);
  res.json({ enabled: !!(u && u.totp_enabled) });
});

// Begin setup: generate a secret (not yet enabled) and return a QR to scan.
router.post('/me/2fa/setup', auth, async (req, res) => {
  try {
    const u = db.prepare('SELECT username, email FROM users WHERE id = ?').get(req.user.id);
    const secret = authenticator.generateSecret();
    db.prepare('UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?').run(secret, req.user.id);
    const otpauth = authenticator.keyuri(u.email || u.username, TOTP_ISSUER, secret);
    const qr = await QRCode.toDataURL(otpauth);
    res.json({ secret, otpauth, qr });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Confirm setup: verify a code against the pending secret, then enable.
router.post('/me/2fa/enable', auth, (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code required' });
  const u = db.prepare('SELECT totp_secret FROM users WHERE id = ?').get(req.user.id);
  if (!u || !u.totp_secret) return res.status(400).json({ error: 'Run setup first' });
  const ok = authenticator.verify({ token: String(code).replace(/\s/g, ''), secret: u.totp_secret });
  if (!ok) return res.status(400).json({ error: 'Invalid code' });
  db.prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').run(req.user.id);
  res.json({ success: true, enabled: true });
});

// Disable 2FA — requires the account password.
router.post('/me/2fa/disable', auth, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });
  const u = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);
  const valid = await bcrypt.compare(password, u.password);
  if (!valid) return res.status(401).json({ error: 'Incorrect password' });
  db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?').run(req.user.id);
  res.json({ success: true, enabled: false });
});

// Delete account
router.delete('/me', auth, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });
  const row = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);
  const valid = await bcrypt.compare(password, row.password);
  if (!valid) return res.status(401).json({ error: 'Incorrect password' });
  const uid = req.user.id;
  db.transact(() => {
    db.prepare("UPDATE messages SET type = 'deleted', content = NULL, file_url = NULL, file_name = NULL WHERE sender_id = ?").run(uid);
    db.prepare('DELETE FROM message_reactions WHERE user_id = ?').run(uid);
    db.prepare('DELETE FROM message_status WHERE user_id = ?').run(uid);
    db.prepare('DELETE FROM starred_messages WHERE user_id = ?').run(uid);
    db.prepare('DELETE FROM status_views WHERE viewer_id = ?').run(uid);
    db.prepare('DELETE FROM statuses WHERE user_id = ?').run(uid);
    db.prepare('DELETE FROM blocked_users WHERE blocker_id = ? OR blocked_id = ?').run(uid, uid);
    db.prepare('DELETE FROM user_chat_settings WHERE user_id = ?').run(uid);
    db.prepare('DELETE FROM user_settings WHERE user_id = ?').run(uid);
    db.prepare('DELETE FROM chat_members WHERE user_id = ?').run(uid);
    db.prepare('DELETE FROM users WHERE id = ?').run(uid);
  });
  res.json({ success: true });
});

// Privacy / app settings
router.get('/me/settings', auth, (req, res) => {
  let s = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.user.id);
  if (!s) {
    db.prepare('INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)').run(req.user.id);
    s = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.user.id);
  }
  res.json(s);
});

router.put('/me/settings', auth, (req, res) => {
  const { last_seen, profile_photo, about_visibility, read_receipts, groups_visibility, status_visibility, disappearing_messages } = req.body;
  db.prepare('INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)').run(req.user.id);
  const fields = [];
  const vals = [];
  if (last_seen !== undefined) { fields.push('last_seen = ?'); vals.push(last_seen); }
  if (profile_photo !== undefined) { fields.push('profile_photo = ?'); vals.push(profile_photo); }
  if (about_visibility !== undefined) { fields.push('about_visibility = ?'); vals.push(about_visibility); }
  if (read_receipts !== undefined) { fields.push('read_receipts = ?'); vals.push(read_receipts ? 1 : 0); }
  if (groups_visibility !== undefined) { fields.push('groups_visibility = ?'); vals.push(groups_visibility); }
  if (status_visibility !== undefined) { fields.push('status_visibility = ?'); vals.push(status_visibility); }
  if (disappearing_messages !== undefined) {
    fields.push('disappearing_messages = ?'); vals.push(disappearing_messages);
    // Stamp when the timer was (re)enabled so only messages sent afterwards
    // disappear — turning it on never retroactively wipes old history.
    fields.push('disappearing_set_at = ?'); vals.push(disappearing_messages > 0 ? Date.now() : null);
  }
  if (fields.length) {
    vals.push(req.user.id);
    db.prepare(`UPDATE user_settings SET ${fields.join(', ')} WHERE user_id = ?`).run(...vals);
  }
  res.json(db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.user.id));
});

router.post('/me/avatar', auth, upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const avatarUrl = `/uploads/avatars/${req.file.filename}`;
  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatarUrl, req.user.id);
  res.json({ avatar: avatarUrl });
});

router.get('/search', auth, (req, res) => {
  const { q } = req.query;
  const search = q ? `%${q}%` : '%';
  const users = db.prepare(
    'SELECT id, username, email, avatar, about, last_seen FROM users WHERE (username LIKE ? OR email LIKE ?) AND id != ? LIMIT 30'
  ).all(search, search, req.user.id);
  res.json(users);
});

// ─── Block / Unblock ─────────────────────────────────────
router.get('/blocked', auth, (req, res) => {
  const blocked = db.prepare(`
    SELECT u.id, u.username, u.avatar, u.about
    FROM users u INNER JOIN blocked_users b ON b.blocked_id = u.id
    WHERE b.blocker_id = ?
  `).all(req.user.id);
  res.json(blocked);
});

router.post('/block/:id', auth, (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot block yourself' });
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  db.prepare('INSERT OR IGNORE INTO blocked_users (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)').run(req.user.id, req.params.id, Date.now());
  res.json({ success: true, blocked: true });
});

router.delete('/block/:id', auth, (req, res) => {
  db.prepare('DELETE FROM blocked_users WHERE blocker_id = ? AND blocked_id = ?').run(req.user.id, req.params.id);
  res.json({ success: true, blocked: false });
});

// Account stats for Storage section
router.get('/me/stats', auth, (req, res) => {
  const msgs = db.prepare('SELECT COUNT(*) as c FROM messages WHERE sender_id = ?').get(req.user.id);
  const media = db.prepare("SELECT COUNT(*) as c FROM messages WHERE sender_id = ? AND type IN ('image','video','audio','file')").get(req.user.id);
  const calls = db.prepare('SELECT COUNT(*) as c FROM call_history WHERE caller_id = ? OR callee_id = ?').get(req.user.id, req.user.id);
  const statuses = db.prepare('SELECT COUNT(*) as c FROM statuses WHERE user_id = ?').get(req.user.id);
  res.json({ messages: msgs.c, media: media.c, calls: calls.c, statuses: statuses.c });
});

router.get('/:id', auth, (req, res) => {
  const user = db.prepare('SELECT id, username, email, avatar, about, last_seen FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const isBlocked = !!db.prepare('SELECT 1 FROM blocked_users WHERE blocker_id = ? AND blocked_id = ?').get(req.user.id, req.params.id);
  // Apply target user's privacy settings
  const priv = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.params.id);
  const resp = { ...user, isBlocked };
  if (priv) {
    if (priv.last_seen === 'nobody') resp.last_seen = null;
    if (priv.profile_photo === 'nobody') resp.avatar = null;
    if (priv.about_visibility === 'nobody') resp.about = null;
  }
  res.json(resp);
});

module.exports = router;
