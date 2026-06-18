const express = require('express');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const auth = require('../middleware/auth');
const db = require('../db');
const { UPLOADS_DIR } = require('../paths');

const router = express.Router();

const storage = multer.diskStorage({
  destination: path.join(UPLOADS_DIR, 'avatars'),
  filename: (req, file, cb) => cb(null, `group-${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

function enrichChat(chat, userId) {
  const settings = db.prepare('SELECT * FROM user_chat_settings WHERE user_id = ? AND chat_id = ?').get(userId, chat.id) || {};
  const base = {
    ...chat,
    is_pinned: chat.is_pinned ?? (settings.is_pinned || 0),
    is_archived: chat.is_archived ?? (settings.is_archived || 0),
    is_muted: chat.is_muted ?? (settings.is_muted || 0),
    mute_until: chat.mute_until ?? settings.mute_until ?? null,
    settings,
  };
  if (!chat.is_group) {
    const other = db.prepare(`
      SELECT u.id, u.username, u.avatar, u.about, u.last_seen
      FROM users u INNER JOIN chat_members cm ON cm.user_id = u.id AND cm.chat_id = ?
      WHERE u.id != ?
    `).get(chat.id, userId);
    return { ...base, other_user: other };
  }
  const members = db.prepare(`
    SELECT u.id, u.username, u.avatar, u.about, u.last_seen, cm.role
    FROM users u INNER JOIN chat_members cm ON cm.user_id = u.id
    WHERE cm.chat_id = ?
  `).all(chat.id);
  return { ...base, members };
}

router.get('/', auth, (req, res) => {
  const { archived } = req.query;
  const chats = db.prepare(`
    SELECT c.id, c.name, c.is_group, c.group_avatar, c.description, c.created_by, c.created_at,
      (SELECT content FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
      (SELECT type FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_type,
      (SELECT created_at FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_at,
      (SELECT sender_id FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_sender,
      (SELECT file_name FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_file_name,
      (SELECT COUNT(*) FROM messages m WHERE m.chat_id = c.id AND m.sender_id != ? AND NOT EXISTS (
        SELECT 1 FROM message_status ms WHERE ms.message_id = m.id AND ms.user_id = ? AND ms.status = 'read'
      )) as unread_count,
      COALESCE(ucs.is_pinned, 0) as is_pinned,
      COALESCE(ucs.is_archived, 0) as is_archived,
      COALESCE(ucs.is_muted, 0) as is_muted,
      ucs.mute_until
    FROM chats c
    INNER JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = ?
    LEFT JOIN user_chat_settings ucs ON ucs.chat_id = c.id AND ucs.user_id = ?
    WHERE COALESCE(ucs.is_archived, 0) = ?
    ORDER BY COALESCE(ucs.is_pinned, 0) DESC, last_message_at DESC NULLS LAST
  `).all(req.user.id, req.user.id, req.user.id, req.user.id, archived === '1' ? 1 : 0);

  const enriched = chats.map(chat => enrichChat(chat, req.user.id));
  res.json(enriched);
});

router.post('/direct', auth, (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!target) return res.status(404).json({ error: 'User not found' });

  const existing = db.prepare(`
    SELECT c.id FROM chats c
    INNER JOIN chat_members cm1 ON cm1.chat_id = c.id AND cm1.user_id = ?
    INNER JOIN chat_members cm2 ON cm2.chat_id = c.id AND cm2.user_id = ?
    WHERE c.is_group = 0
  `).get(req.user.id, userId);

  if (existing) return res.json({ id: existing.id, existing: true });

  const chatId = uuidv4();
  db.prepare('INSERT INTO chats (id, is_group, created_by) VALUES (?, 0, ?)').run(chatId, req.user.id);
  db.prepare('INSERT INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?), (?, ?, ?)').run(chatId, req.user.id, 'member', chatId, userId, 'member');
  res.json({ id: chatId, existing: false });
});

router.post('/group', auth, (req, res) => {
  const { name, memberIds, description } = req.body;
  if (!name || !memberIds?.length) return res.status(400).json({ error: 'name and memberIds required' });

  const chatId = uuidv4();
  db.prepare('INSERT INTO chats (id, name, is_group, created_by, description) VALUES (?, ?, 1, ?, ?)').run(chatId, name, req.user.id, description || null);

  const allMembers = [...new Set([req.user.id, ...memberIds])];
  const insertMember = db.prepare('INSERT INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?)');
  for (const uid of allMembers) {
    insertMember.run(chatId, uid, uid === req.user.id ? 'admin' : 'member');
  }
  res.json({ id: chatId });
});

// Get starred messages (must be before /:id to avoid route collision)
router.get('/starred', auth, (req, res) => {
  const msgs = db.prepare(`
    SELECT m.*, u.username as sender_name, u.avatar as sender_avatar, c.name as chat_name, c.is_group
    FROM starred_messages sm
    JOIN messages m ON m.id = sm.message_id
    JOIN users u ON u.id = m.sender_id
    JOIN chats c ON c.id = m.chat_id
    JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = ?
    ORDER BY sm.starred_at DESC
  `).all(req.user.id);
  res.json(msgs);
});

router.get('/:id', auth, (req, res) => {
  const member = db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!member) return res.status(403).json({ error: 'Not a member' });
  const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(req.params.id);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  res.json(enrichChat(chat, req.user.id));
});

// Update group (name, description, avatar)
router.put('/:id', auth, upload.single('avatar'), (req, res) => {
  const member = db.prepare('SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!member || member.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  const { name, description } = req.body;
  if (name) db.prepare('UPDATE chats SET name = ? WHERE id = ?').run(name, req.params.id);
  if (description !== undefined) db.prepare('UPDATE chats SET description = ? WHERE id = ?').run(description, req.params.id);
  if (req.file) {
    const url = `/uploads/avatars/${req.file.filename}`;
    db.prepare('UPDATE chats SET group_avatar = ? WHERE id = ?').run(url, req.params.id);
  }

  const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(req.params.id);
  res.json(enrichChat(chat, req.user.id));
});

// Add member to group
router.post('/:id/members', auth, (req, res) => {
  const member = db.prepare('SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!member || member.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  const { userId } = req.body;
  const existing = db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(req.params.id, userId);
  if (existing) return res.status(409).json({ error: 'Already a member' });

  db.prepare('INSERT INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?)').run(req.params.id, userId, 'member');
  const user = db.prepare('SELECT id, username, avatar, about, last_seen FROM users WHERE id = ?').get(userId);
  res.json({ member: { ...user, role: 'member' } });
});

// Remove member from group
router.delete('/:id/members/:userId', auth, (req, res) => {
  const myRole = db.prepare('SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?').get(req.params.id, req.user.id);
  const isAdmin = myRole?.role === 'admin';
  const isSelf = req.params.userId === req.user.id;
  if (!isAdmin && !isSelf) return res.status(403).json({ error: 'Admin only' });

  db.prepare('DELETE FROM chat_members WHERE chat_id = ? AND user_id = ?').run(req.params.id, req.params.userId);
  res.json({ success: true });
});

// Promote/demote member
router.put('/:id/members/:userId/role', auth, (req, res) => {
  const member = db.prepare('SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!member || member.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  const { role } = req.body;
  if (!['admin', 'member'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  db.prepare('UPDATE chat_members SET role = ? WHERE chat_id = ? AND user_id = ?').run(role, req.params.id, req.params.userId);
  res.json({ success: true });
});

// Update chat settings (pin/archive/mute)
router.put('/:id/settings', auth, (req, res) => {
  const { is_pinned, is_archived, is_muted, mute_until, wallpaper } = req.body;
  const existing = db.prepare('SELECT 1 FROM user_chat_settings WHERE user_id = ? AND chat_id = ?').get(req.user.id, req.params.id);

  if (existing) {
    const updates = [];
    const params = [];
    if (is_pinned !== undefined) { updates.push('is_pinned = ?'); params.push(is_pinned ? 1 : 0); }
    if (is_archived !== undefined) { updates.push('is_archived = ?'); params.push(is_archived ? 1 : 0); }
    if (is_muted !== undefined) { updates.push('is_muted = ?'); params.push(is_muted ? 1 : 0); }
    if (mute_until !== undefined) { updates.push('mute_until = ?'); params.push(mute_until); }
    if (wallpaper !== undefined) { updates.push('wallpaper = ?'); params.push(wallpaper); }
    updates.push('updated_at = ?'); params.push(Date.now());
    params.push(req.user.id, req.params.id);
    db.prepare(`UPDATE user_chat_settings SET ${updates.join(', ')} WHERE user_id = ? AND chat_id = ?`).run(...params);
  } else {
    db.prepare(`INSERT INTO user_chat_settings (user_id, chat_id, is_pinned, is_archived, is_muted, mute_until, wallpaper)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      req.user.id, req.params.id,
      is_pinned ? 1 : 0, is_archived ? 1 : 0, is_muted ? 1 : 0, mute_until || null, wallpaper || null
    );
  }
  res.json({ success: true });
});

// Get messages
router.get('/:id/messages', auth, (req, res) => {
  const member = db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!member) return res.status(403).json({ error: 'Not a member' });

  const { before, limit = 50 } = req.query;
  const query = before
    ? `SELECT m.*, u.username as sender_name, u.avatar as sender_avatar
       FROM messages m INNER JOIN users u ON u.id = m.sender_id
       WHERE m.chat_id = ? AND m.created_at < ?
       ORDER BY m.created_at DESC LIMIT ?`
    : `SELECT m.*, u.username as sender_name, u.avatar as sender_avatar
       FROM messages m INNER JOIN users u ON u.id = m.sender_id
       WHERE m.chat_id = ?
       ORDER BY m.created_at DESC LIMIT ?`;

  const messages = before
    ? db.prepare(query).all(req.params.id, before, parseInt(limit))
    : db.prepare(query).all(req.params.id, parseInt(limit));

  const withDetails = messages.reverse().map(msg => {
    const statuses = db.prepare('SELECT user_id, status FROM message_status WHERE message_id = ?').all(msg.id);
    const reactions = db.prepare(`
      SELECT mr.emoji, mr.user_id, u.username
      FROM message_reactions mr JOIN users u ON u.id = mr.user_id
      WHERE mr.message_id = ?
    `).all(msg.id);
    const replyMsg = msg.reply_to
      ? db.prepare('SELECT id, content, type, sender_id, file_name FROM messages WHERE id = ?').get(msg.reply_to)
      : null;
    const isStarred = !!db.prepare('SELECT 1 FROM starred_messages WHERE user_id = ? AND message_id = ?').get(req.user.id, msg.id);
    return { ...msg, statuses, reactions, reply_to_message: replyMsg, is_starred: isStarred };
  });

  // Mark messages as read
  db.prepare(`
    UPDATE message_status SET status = 'read', updated_at = ?
    WHERE user_id = ? AND message_id IN (SELECT id FROM messages WHERE chat_id = ?) AND status != 'read'
  `).run(Date.now(), req.user.id, req.params.id);

  res.json(withDetails);
});

// Star / unstar a message
router.post('/:id/messages/:msgId/star', auth, (req, res) => {
  const existing = db.prepare('SELECT 1 FROM starred_messages WHERE user_id = ? AND message_id = ?').get(req.user.id, req.params.msgId);
  if (existing) {
    db.prepare('DELETE FROM starred_messages WHERE user_id = ? AND message_id = ?').run(req.user.id, req.params.msgId);
    res.json({ starred: false });
  } else {
    db.prepare('INSERT INTO starred_messages (user_id, message_id) VALUES (?, ?)').run(req.user.id, req.params.msgId);
    res.json({ starred: true });
  }
});

// Message info — per-member read receipts
router.get('/:id/messages/:msgId/info', auth, (req, res) => {
  const member = db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!member) return res.status(403).json({ error: 'Not a member' });

  const statuses = db.prepare(`
    SELECT ms.user_id, ms.status, ms.updated_at, u.username, u.avatar
    FROM message_status ms JOIN users u ON u.id = ms.user_id
    WHERE ms.message_id = ?
  `).all(req.params.msgId);
  res.json(statuses);
});

// Get shared media in a chat
router.get('/:id/media', auth, (req, res) => {
  const member = db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!member) return res.status(403).json({ error: 'Not a member' });

  const media = db.prepare(`
    SELECT m.id, m.type, m.file_url, m.file_name, m.file_size, m.created_at, u.username as sender_name
    FROM messages m JOIN users u ON u.id = m.sender_id
    WHERE m.chat_id = ? AND m.type IN ('image','video','audio','file') AND m.type != 'deleted'
    ORDER BY m.created_at DESC LIMIT 100
  `).all(req.params.id);
  res.json(media);
});

// Get pinned messages for a chat
router.get('/:id/pinned', auth, (req, res) => {
  const member = db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!member) return res.status(403).json({ error: 'Not a member' });
  const msgs = db.prepare(`
    SELECT m.*, u.username as sender_name, u.avatar as sender_avatar,
           pm.pinned_at, pm.pinned_by
    FROM pinned_messages pm
    JOIN messages m ON m.id = pm.message_id
    JOIN users u ON u.id = m.sender_id
    WHERE pm.chat_id = ? AND m.type != 'deleted'
    ORDER BY pm.pinned_at DESC
  `).all(req.params.id);
  res.json(msgs);
});

// Pin a message
router.post('/:id/messages/:msgId/pin', auth, (req, res) => {
  const member = db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!member) return res.status(403).json({ error: 'Not a member' });
  const msg = db.prepare('SELECT id FROM messages WHERE id = ? AND chat_id = ?').get(req.params.msgId, req.params.id);
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  db.prepare('INSERT OR IGNORE INTO pinned_messages (chat_id, message_id, pinned_by, pinned_at) VALUES (?, ?, ?, ?)')
    .run(req.params.id, req.params.msgId, req.user.id, Date.now());
  res.json({ success: true });
});

// Unpin a message
router.delete('/:id/messages/:msgId/pin', auth, (req, res) => {
  const member = db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!member) return res.status(403).json({ error: 'Not a member' });
  db.prepare('DELETE FROM pinned_messages WHERE chat_id = ? AND message_id = ?').run(req.params.id, req.params.msgId);
  res.json({ success: true });
});

// Leave a group chat
router.post('/:id/leave', auth, (req, res) => {
  const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(req.params.id);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  if (!chat.is_group) return res.status(400).json({ error: 'Cannot leave a direct chat' });

  const member = db.prepare('SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!member) return res.status(403).json({ error: 'Not a member' });

  // If last admin, promote another member first (or dissolve if nobody left)
  if (member.role === 'admin') {
    const admins = db.prepare("SELECT user_id FROM chat_members WHERE chat_id = ? AND role = 'admin'").all(req.params.id);
    if (admins.length === 1) {
      // Promote first non-admin member
      const nextAdmin = db.prepare("SELECT user_id FROM chat_members WHERE chat_id = ? AND user_id != ? AND role = 'member' LIMIT 1").get(req.params.id, req.user.id);
      if (nextAdmin) {
        db.prepare("UPDATE chat_members SET role = 'admin' WHERE chat_id = ? AND user_id = ?").run(req.params.id, nextAdmin.user_id);
      } else {
        // No one left — delete the group
        db.prepare('DELETE FROM chat_members WHERE chat_id = ?').run(req.params.id);
        db.prepare('DELETE FROM chats WHERE id = ?').run(req.params.id);
        return res.json({ success: true, dissolved: true });
      }
    }
  }

  db.prepare('DELETE FROM chat_members WHERE chat_id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

module.exports = router;
