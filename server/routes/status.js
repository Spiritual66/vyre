const express = require('express');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const auth = require('../middleware/auth');
const db = require('../db');
const { UPLOADS_DIR } = require('../paths');

const storage = multer.diskStorage({
  destination: path.join(UPLOADS_DIR, 'statuses'),
  filename: (req, file, cb) => cb(null, `status-${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 16 * 1024 * 1024 } });

module.exports = (io) => {
  const router = express.Router();

  // Get all statuses from contacts (honoring the poster's privacy + my reaction)
  router.get('/', auth, (req, res) => {
    const now = Date.now();
    const uid = req.user.id;
    const statuses = db.prepare(`
      SELECT s.*, u.username, u.avatar,
        (SELECT COUNT(*) FROM status_views sv WHERE sv.status_id = s.id AND sv.viewer_id = ?) as viewed,
        (SELECT COUNT(*) FROM status_views sv2 WHERE sv2.status_id = s.id) as view_count,
        (SELECT emoji FROM status_reactions sr WHERE sr.status_id = s.id AND sr.user_id = ?) as my_reaction,
        (SELECT COUNT(*) FROM status_reactions sr2 WHERE sr2.status_id = s.id) as reaction_count
      FROM statuses s
      JOIN users u ON u.id = s.user_id
      WHERE s.expires_at > ? AND (
        s.user_id = ? OR (
          s.user_id IN (
            SELECT DISTINCT cm2.user_id FROM chat_members cm1
            JOIN chat_members cm2 ON cm2.chat_id = cm1.chat_id
            WHERE cm1.user_id = ? AND cm2.user_id != ?
          )
          -- poster hasn't excluded me, and isn't hiding their status entirely
          AND NOT EXISTS (SELECT 1 FROM status_excludes se WHERE se.user_id = s.user_id AND se.excluded_id = ?)
          AND COALESCE((SELECT status_visibility FROM user_settings WHERE user_id = s.user_id), 'everyone') != 'nobody'
        )
      )
      ORDER BY s.user_id, s.created_at ASC
    `).all(uid, uid, now, uid, uid, uid, uid);

    // Which of these posters have I muted? (kept visible but flagged/sorted)
    const muted = new Set(db.prepare('SELECT muted_id FROM status_mutes WHERE muter_id = ?').all(uid).map(r => r.muted_id));

    const grouped = {};
    for (const s of statuses) {
      if (!grouped[s.user_id]) grouped[s.user_id] = { user_id: s.user_id, username: s.username, avatar: s.avatar, muted: muted.has(s.user_id), statuses: [] };
      const { username, avatar, ...rest } = s;
      grouped[s.user_id].statuses.push(rest);
    }
    res.json(Object.values(grouped));
  });

  // Post a new status
  router.post('/', auth, upload.single('file'), (req, res) => {
    const { content, type = 'text', background = '#075e54', font_size = 24, font_family = 'sans', align = 'center', caption } = req.body;
    const id = uuidv4();
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

    const fileUrl = req.file ? `/uploads/statuses/${req.file.filename}` : null;
    const fileType = req.file
      ? (req.file.mimetype.startsWith('image/') ? 'image' : req.file.mimetype.startsWith('video/') ? 'video' : 'file')
      : type;

    db.prepare(`
      INSERT INTO statuses (id, user_id, content, type, file_url, background, font_size, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.user.id, caption || content || null, fileType, fileUrl, background, parseInt(font_size), expiresAt);

    const status = db.prepare('SELECT * FROM statuses WHERE id = ?').get(id);
    const poster = db.prepare('SELECT username, avatar FROM users WHERE id = ?').get(req.user.id);

    // Notify all contacts via their user rooms
    const contacts = db.prepare(`
      SELECT DISTINCT cm2.user_id FROM chat_members cm1
      JOIN chat_members cm2 ON cm2.chat_id = cm1.chat_id
      WHERE cm1.user_id = ? AND cm2.user_id != ?
    `).all(req.user.id, req.user.id);

    const payload = { userId: req.user.id, username: poster.username, avatar: poster.avatar };
    contacts.forEach(({ user_id }) => io.to(`user:${user_id}`).emit('status:new', payload));

    res.json(status);
  });

  // Delete own status
  router.delete('/:id', auth, (req, res) => {
    const s = db.prepare('SELECT * FROM statuses WHERE id = ?').get(req.params.id);
    if (!s) return res.status(404).json({ error: 'Not found' });
    if (s.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    db.prepare('DELETE FROM status_views WHERE status_id = ?').run(req.params.id);
    db.prepare('DELETE FROM status_reactions WHERE status_id = ?').run(req.params.id);
    db.prepare('DELETE FROM statuses WHERE id = ?').run(req.params.id);

    // Notify contacts of deletion
    const contacts = db.prepare(`
      SELECT DISTINCT cm2.user_id FROM chat_members cm1
      JOIN chat_members cm2 ON cm2.chat_id = cm1.chat_id
      WHERE cm1.user_id = ? AND cm2.user_id != ?
    `).all(req.user.id, req.user.id);
    contacts.forEach(({ user_id }) => io.to(`user:${user_id}`).emit('status:deleted', { userId: req.user.id, statusId: req.params.id }));

    res.json({ success: true });
  });

  // Mark status as viewed
  router.post('/:id/view', auth, (req, res) => {
    const s = db.prepare('SELECT user_id FROM statuses WHERE id = ?').get(req.params.id);
    if (!s) return res.status(404).json({ error: 'Not found' });
    // Don't record owner viewing own status
    if (s.user_id === req.user.id) return res.json({ success: true });

    const existing = db.prepare('SELECT 1 FROM status_views WHERE status_id = ? AND viewer_id = ?').get(req.params.id, req.user.id);
    if (!existing) {
      db.prepare('INSERT INTO status_views (status_id, viewer_id, viewed_at) VALUES (?, ?, ?)').run(req.params.id, req.user.id, Date.now());
      // Count total views
      const { count } = db.prepare('SELECT COUNT(*) as count FROM status_views WHERE status_id = ?').get(req.params.id);
      // Notify the status owner in real-time
      io.to(`user:${s.user_id}`).emit('status:viewed', { statusId: req.params.id, viewCount: count });
    }
    res.json({ success: true });
  });

  // Get viewers of own status
  router.get('/:id/views', auth, (req, res) => {
    const s = db.prepare('SELECT * FROM statuses WHERE id = ?').get(req.params.id);
    if (!s || s.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    const viewers = db.prepare(`
      SELECT u.id, u.username, u.avatar, sv.viewed_at, sr.emoji as reaction
      FROM status_views sv JOIN users u ON u.id = sv.viewer_id
      LEFT JOIN status_reactions sr ON sr.status_id = sv.status_id AND sr.user_id = sv.viewer_id
      WHERE sv.status_id = ? ORDER BY sv.viewed_at DESC
    `).all(req.params.id);
    res.json(viewers);
  });

  // React to a status (one emoji per user; empty emoji clears it)
  router.post('/:id/react', auth, (req, res) => {
    const { emoji } = req.body;
    const s = db.prepare('SELECT user_id FROM statuses WHERE id = ?').get(req.params.id);
    if (!s) return res.status(404).json({ error: 'Not found' });
    if (!emoji) {
      db.prepare('DELETE FROM status_reactions WHERE status_id = ? AND user_id = ?').run(req.params.id, req.user.id);
    } else {
      db.prepare('INSERT OR REPLACE INTO status_reactions (status_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)')
        .run(req.params.id, req.user.id, String(emoji).slice(0, 16), Date.now());
    }
    if (s.user_id !== req.user.id) {
      const reactor = db.prepare('SELECT username, avatar FROM users WHERE id = ?').get(req.user.id);
      io.to(`user:${s.user_id}`).emit('status:reaction', {
        statusId: req.params.id, userId: req.user.id, username: reactor.username, emoji: emoji || null,
      });
    }
    res.json({ success: true, emoji: emoji || null });
  });

  // ─── Mute someone's status updates ───────────────────────
  router.post('/mute/:userId', auth, (req, res) => {
    if (req.params.userId === req.user.id) return res.status(400).json({ error: 'Cannot mute yourself' });
    db.prepare('INSERT OR IGNORE INTO status_mutes (muter_id, muted_id) VALUES (?, ?)').run(req.user.id, req.params.userId);
    res.json({ success: true, muted: true });
  });
  router.delete('/mute/:userId', auth, (req, res) => {
    db.prepare('DELETE FROM status_mutes WHERE muter_id = ? AND muted_id = ?').run(req.user.id, req.params.userId);
    res.json({ success: true, muted: false });
  });

  // ─── Privacy: hide my status from specific contacts ──────
  router.get('/privacy/excludes', auth, (req, res) => {
    const rows = db.prepare(`
      SELECT u.id, u.username, u.avatar FROM status_excludes se
      JOIN users u ON u.id = se.excluded_id WHERE se.user_id = ?
    `).all(req.user.id);
    res.json(rows);
  });
  router.post('/privacy/exclude/:userId', auth, (req, res) => {
    if (req.params.userId === req.user.id) return res.status(400).json({ error: 'Invalid' });
    db.prepare('INSERT OR IGNORE INTO status_excludes (user_id, excluded_id) VALUES (?, ?)').run(req.user.id, req.params.userId);
    res.json({ success: true });
  });
  router.delete('/privacy/exclude/:userId', auth, (req, res) => {
    db.prepare('DELETE FROM status_excludes WHERE user_id = ? AND excluded_id = ?').run(req.user.id, req.params.userId);
    res.json({ success: true });
  });

  // Reply to a status — sends a direct message to the status owner
  router.post('/:id/reply', auth, (req, res) => {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Content required' });

    const s = db.prepare('SELECT * FROM statuses WHERE id = ?').get(req.params.id);
    if (!s) return res.status(404).json({ error: 'Not found' });
    if (s.user_id === req.user.id) return res.status(400).json({ error: 'Cannot reply to own status' });

    // Get or create a DM chat with the status owner
    let chat = db.prepare(`
      SELECT c.id FROM chats c
      JOIN chat_members m1 ON m1.chat_id = c.id AND m1.user_id = ?
      JOIN chat_members m2 ON m2.chat_id = c.id AND m2.user_id = ?
      WHERE c.is_group = 0 LIMIT 1
    `).get(req.user.id, s.user_id);

    if (!chat) {
      const chatId = uuidv4();
      db.prepare('INSERT INTO chats (id, is_group) VALUES (?, 0)').run(chatId, false);
      db.prepare('INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?)').run(chatId, req.user.id);
      db.prepare('INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?)').run(chatId, s.user_id);
      chat = { id: chatId };
    }

    const msgId = uuidv4();
    const now = Date.now();
    const sender = db.prepare('SELECT username, avatar FROM users WHERE id = ?').get(req.user.id);

    db.prepare('INSERT INTO messages (id, chat_id, sender_id, content, type, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(msgId, chat.id, req.user.id, content.trim(), 'text', now);

    // Insert delivery statuses
    const otherMembers = db.prepare('SELECT user_id FROM chat_members WHERE chat_id = ? AND user_id != ?').all(chat.id, req.user.id);
    const insertStatus = db.prepare('INSERT OR IGNORE INTO message_status (message_id, user_id, status) VALUES (?, ?, ?)');
    otherMembers.forEach(({ user_id }) => insertStatus.run(msgId, user_id, 'delivered'));

    io.to(`chat:${chat.id}`).emit('message:new', {
      id: msgId, chat_id: chat.id, sender_id: req.user.id, content: content.trim(),
      type: 'text', created_at: now, sender_name: sender.username, sender_avatar: sender.avatar,
      statuses: otherMembers.map(({ user_id }) => ({ user_id, status: 'delivered' })),
      reactions: [], is_starred: false, reply_to: null, reply_to_message: null,
      forwarded_from: null, edited_at: null,
    });

    res.json({ success: true, chatId: chat.id });
  });

  return router;
};
