const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const auth = require('../middleware/auth');
const db = require('../db');
const { UPLOADS_DIR } = require('../paths');

function getAdminSetting(key, fallback) {
  try {
    const row = db.prepare('SELECT value FROM admin_settings WHERE key = ?').get(key);
    if (!row) return fallback;
    try { return JSON.parse(row.value); } catch { return row.value; }
  } catch { return fallback; }
}

// Document MIME types we accept (in addition to images/video/audio).
const ALLOWED_DOC_MIMES = new Set([
  'application/pdf', 'text/plain', 'application/zip', 'application/x-zip-compressed',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

// Reject anything that could execute in the browser when served from our origin.
// SVG is image/* but can carry inline scripts, so it is explicitly disallowed.
function mediaFileFilter(req, file, cb) {
  const mime = (file.mimetype || '').toLowerCase();
  const isImage = mime.startsWith('image/') && mime !== 'image/svg+xml';
  const isAV = mime.startsWith('video/') || mime.startsWith('audio/');
  if (isImage || isAV || ALLOWED_DOC_MIMES.has(mime)) return cb(null, true);
  cb(new Error('Unsupported file type'));
}

const storage = multer.diskStorage({
  destination: path.join(UPLOADS_DIR, 'media'),
  // Never derive the stored path from client-supplied originalname (path-traversal risk).
  // The original name is preserved separately in messages.file_name for display.
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname || '').match(/^\.[A-Za-z0-9]{1,12}$/) || [''])[0].toLowerCase();
    cb(null, `${Date.now()}-${uuidv4().slice(0, 8)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 256 * 1024 * 1024 }, fileFilter: mediaFileFilter }); // raw cap at 256MB; admin setting enforced below

// Wrap multer so fileFilter/size errors return clean JSON instead of an HTML stack trace.
const uploadSingle = (req, res, next) => upload.single('file')(req, res, (err) => {
  if (err) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large.' : (err.message || 'Upload failed');
    return res.status(400).json({ error: msg });
  }
  next();
});

// Per-user upload throttle (cost/abuse protection).
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || 'anonymous', // route is always authed (auth runs first)
  message: { error: 'Too many uploads. Please slow down and try again shortly.' },
});

module.exports = (io) => {
  const router = express.Router();

  // Upload file
  router.post('/upload', auth, uploadLimiter, uploadSingle, (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });

    const type = req.file.mimetype.startsWith('image/') ? 'image'
      : req.file.mimetype.startsWith('video/') ? 'video'
      : req.file.mimetype.startsWith('audio/') ? 'audio' : 'file';

    const cleanup = () => { try { fs.unlinkSync(req.file.path); } catch {} };

    // Feature flag checks
    if (type === 'file' && !getAdminSetting('allowFileUploads', true)) {
      cleanup(); return res.status(403).json({ error: 'File uploads are currently disabled by the administrator.' });
    }
    if (type === 'audio' && !getAdminSetting('allowVoiceMessages', true)) {
      cleanup(); return res.status(403).json({ error: 'Voice messages are currently disabled by the administrator.' });
    }

    // File size limit from admin settings
    const maxMB = getAdminSetting('maxFileSizeMB', 10);
    if (req.file.size > maxMB * 1024 * 1024) {
      cleanup(); return res.status(413).json({ error: `File exceeds the ${maxMB}MB limit set by the administrator.` });
    }

    res.json({
      url: `/uploads/media/${req.file.filename}`,
      type,
      name: req.file.originalname,
      size: req.file.size,
    });
  });

  // Edit a message (text only)
  router.patch('/:id', auth, (req, res) => {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Content required' });

    const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id);
    if (!msg) return res.status(404).json({ error: 'Not found' });
    if (msg.sender_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    if (msg.type === 'deleted') return res.status(400).json({ error: 'Cannot edit deleted message' });
    if (msg.type !== 'text') return res.status(400).json({ error: 'Can only edit text messages' });

    const editedAt = Date.now();
    db.prepare('UPDATE messages SET content = ?, edited_at = ? WHERE id = ?').run(content.trim(), editedAt, req.params.id);

    io.to(`chat:${msg.chat_id}`).emit('message:edited', {
      messageId: req.params.id,
      chatId: msg.chat_id,
      content: content.trim(),
      editedAt,
    });

    res.json({ success: true, editedAt });
  });

  // Delete a message (soft delete)
  router.delete('/:id', auth, (req, res) => {
    const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id);
    if (!msg) return res.status(404).json({ error: 'Not found' });
    if (msg.sender_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    db.prepare("UPDATE messages SET content = NULL, type = 'deleted', file_url = NULL, file_name = NULL, edited_at = NULL WHERE id = ?").run(req.params.id);

    io.to(`chat:${msg.chat_id}`).emit('message:deleted', {
      messageId: req.params.id,
      chatId: msg.chat_id,
    });

    res.json({ success: true });
  });

  // Search messages — within a chat (chatId provided) or globally (no chatId)
  router.get('/search', auth, (req, res) => {
    const { q, chatId } = req.query;
    if (!q) return res.json([]);

    if (chatId) {
      const member = db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(chatId, req.user.id);
      if (!member) return res.status(403).json({ error: 'Not a member' });
      const results = db.prepare(`
        SELECT m.*, u.username as sender_name, u.avatar as sender_avatar
        FROM messages m JOIN users u ON u.id = m.sender_id
        WHERE m.chat_id = ? AND m.content LIKE ? AND m.type != 'deleted'
        ORDER BY m.created_at DESC LIMIT 30
      `).all(chatId, `%${q}%`);
      return res.json(results);
    }

    // Global search across all the user's chats
    const results = db.prepare(`
      SELECT m.id, m.chat_id, m.sender_id, m.content, m.type, m.created_at,
             u.username AS sender_name, u.avatar AS sender_avatar,
             c.name AS chat_name, c.is_group,
             ou.username AS other_username
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      JOIN chats c ON c.id = m.chat_id
      JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = ?
      LEFT JOIN chat_members ocm ON ocm.chat_id = c.id AND c.is_group = 0 AND ocm.user_id != ?
      LEFT JOIN users ou ON ou.id = ocm.user_id
      WHERE m.content LIKE ? AND m.type NOT IN ('deleted','audio','location','contact')
      ORDER BY m.created_at DESC
      LIMIT 50
    `).all(req.user.id, req.user.id, `%${q}%`);

    res.json(results);
  });

  // Forward a message to other chats
  router.post('/:id/forward', auth, (req, res) => {
    const { chatIds } = req.body;
    if (!chatIds?.length) return res.status(400).json({ error: 'chatIds required' });

    const orig = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id);
    if (!orig) return res.status(404).json({ error: 'Message not found' });
    if (orig.type === 'deleted') return res.status(400).json({ error: 'Cannot forward a deleted message' });

    // Authorization: the requester must belong to the chat the message came from.
    // Without this, any authenticated user could forward (and thus read) the
    // contents of arbitrary messages by ID. (IDOR)
    const canAccessSource = db.prepare(
      'SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?'
    ).get(orig.chat_id, req.user.id);
    if (!canAccessSource) return res.status(403).json({ error: 'Forbidden' });

    const sender = db.prepare('SELECT username, avatar FROM users WHERE id = ?').get(req.user.id);
    const results = [];

    const forwardTx = db.transaction(() => {
      for (const chatId of chatIds) {
        const member = db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(chatId, req.user.id);
        if (!member) continue;

        const newId = uuidv4();
        const now = Date.now();
        db.prepare(`INSERT INTO messages (id, chat_id, sender_id, content, type, file_url, file_name, file_size, forwarded_from, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(newId, chatId, req.user.id, orig.content, orig.type, orig.file_url, orig.file_name, orig.file_size, orig.id, now);

        const chatMembers = db.prepare('SELECT user_id FROM chat_members WHERE chat_id = ? AND user_id != ?').all(chatId, req.user.id);
        const insertStatus = db.prepare('INSERT INTO message_status (message_id, user_id, status) VALUES (?, ?, ?)');
        chatMembers.forEach(({ user_id }) => insertStatus.run(newId, user_id, 'delivered'));

        results.push({ chatId, messageId: newId, now });
      }
    });
    forwardTx();

    // Emit real-time events for each forwarded message
    for (const { chatId, messageId, now } of results) {
      const statuses = db.prepare('SELECT user_id, status FROM message_status WHERE message_id = ?').all(messageId);
      io.to(`chat:${chatId}`).emit('message:new', {
        id: messageId,
        chat_id: chatId,
        sender_id: req.user.id,
        content: orig.content,
        type: orig.type,
        file_url: orig.file_url,
        file_name: orig.file_name,
        file_size: orig.file_size,
        reply_to: null,
        reply_to_message: null,
        forwarded_from: orig.id,
        created_at: now,
        sender_name: sender.username,
        sender_avatar: sender.avatar,
        statuses,
        reactions: [],
        is_starred: false,
        edited_at: null,
      });
    }

    res.json({ forwarded: results });
  });

  // ─── Polls ───────────────────────────────────────────────
  // Poll question/options live in messages.content (JSON, type='poll').
  function getPoll(messageId) {
    const m = db.prepare('SELECT id, chat_id, type, content FROM messages WHERE id = ?').get(messageId);
    if (!m || m.type !== 'poll') return null;
    let poll; try { poll = JSON.parse(m.content || '{}'); } catch { poll = {}; }
    return { m, optionCount: Array.isArray(poll.options) ? poll.options.length : 0 };
  }
  function tally(messageId, userId, optionCount) {
    const rows = db.prepare('SELECT option_index AS i, COUNT(*) AS c FROM poll_votes WHERE message_id = ? GROUP BY option_index').all(messageId);
    const counts = new Array(optionCount).fill(0);
    let total = 0;
    for (const r of rows) { if (r.i >= 0 && r.i < optionCount) counts[r.i] = r.c; total += r.c; }
    const mine = db.prepare('SELECT option_index AS i FROM poll_votes WHERE message_id = ? AND user_id = ?').get(messageId, userId);
    return { counts, total, myVote: mine ? mine.i : null };
  }

  router.get('/:id/poll', auth, (req, res) => {
    const p = getPoll(req.params.id);
    if (!p) return res.status(404).json({ error: 'Not a poll' });
    if (!db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(p.m.chat_id, req.user.id))
      return res.status(403).json({ error: 'Forbidden' });
    res.json(tally(req.params.id, req.user.id, p.optionCount));
  });

  router.post('/:id/vote', auth, (req, res) => {
    const p = getPoll(req.params.id);
    if (!p) return res.status(404).json({ error: 'Not a poll' });
    if (!db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(p.m.chat_id, req.user.id))
      return res.status(403).json({ error: 'Forbidden' });
    const idx = Number(req.body.option);
    if (!Number.isInteger(idx) || idx < 0 || idx >= p.optionCount) return res.status(400).json({ error: 'Invalid option' });

    const existing = db.prepare('SELECT option_index AS i FROM poll_votes WHERE message_id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (existing && existing.i === idx) {
      db.prepare('DELETE FROM poll_votes WHERE message_id = ? AND user_id = ?').run(req.params.id, req.user.id); // toggle off
    } else {
      db.prepare('INSERT OR REPLACE INTO poll_votes (message_id, user_id, option_index, created_at) VALUES (?, ?, ?, ?)')
        .run(req.params.id, req.user.id, idx, Date.now());
    }
    const state = tally(req.params.id, req.user.id, p.optionCount);
    io.to(`chat:${p.m.chat_id}`).emit('poll:updated', { messageId: req.params.id, chatId: p.m.chat_id, counts: state.counts, total: state.total });
    res.json(state);
  });

  return router;
};
