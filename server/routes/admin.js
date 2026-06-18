const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const adminAuth = require('../middleware/adminAuth');
const db = require('../db');

let _io = null;

module.exports = function(io) {
  _io = io;
  return router;
};

const router = express.Router();
router.use(adminAuth);

// ── Helpers ────────────────────────────────────────────────
function logAudit(adminEmail, action, targetType, targetId, targetName, details) {
  try {
    db.prepare('INSERT INTO admin_audit_log (id,admin_email,action,target_type,target_id,target_name,details,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(uuidv4(), adminEmail, action, targetType || null, targetId || null, targetName || null, details || null, Date.now());
  } catch {}
}

const DEFAULT_SETTINGS = {
  registrationEnabled: true,
  maintenanceMode: false,
  maxFileSizeMB: 10,
  maxMessageLength: 4096,
  allowStickers: true,
  allowLocation: true,
  allowVoiceMessages: true,
  allowFileUploads: true,
};

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM admin_settings').all();
  const stored = {};
  for (const row of rows) {
    try { stored[row.key] = JSON.parse(row.value); } catch { stored[row.key] = row.value; }
  }
  return { ...DEFAULT_SETTINGS, ...stored };
}

// ── Dashboard stats ────────────────────────────────────────
router.get('/stats', (req, res) => {
  const now = Date.now();
  const day  = 86400000;
  const week = 7 * day;
  const online5m = now - 5 * 60 * 1000;

  const totalUsers    = db.prepare('SELECT COUNT(*) as n FROM users').get().n;
  const totalMessages = db.prepare("SELECT COUNT(*) as n FROM messages WHERE type != 'deleted'").get().n;
  const totalChats    = db.prepare('SELECT COUNT(*) as n FROM chats').get().n;
  const groupChats    = db.prepare('SELECT COUNT(*) as n FROM chats WHERE is_group = 1').get().n;
  const activeToday   = db.prepare('SELECT COUNT(*) as n FROM users WHERE last_seen > ?').get(now - day).n;
  const onlineNow     = db.prepare('SELECT COUNT(*) as n FROM users WHERE last_seen > ?').get(online5m).n;
  const newThisWeek   = db.prepare('SELECT COUNT(*) as n FROM users WHERE created_at > ?').get(now - week).n;
  const msgsToday     = db.prepare("SELECT COUNT(*) as n FROM messages WHERE created_at > ? AND type != 'deleted'").get(now - day).n;
  const bannedUsers   = db.prepare('SELECT COUNT(*) as n FROM users WHERE is_banned = 1').get().n;
  const totalMedia    = db.prepare("SELECT COUNT(*) as n FROM messages WHERE type IN ('image','video','audio','file')").get().n;

  res.json({ totalUsers, totalMessages, totalChats, groupChats, activeToday, onlineNow, newThisWeek, msgsToday, bannedUsers, totalMedia });
});

// ── Analytics ──────────────────────────────────────────────
router.get('/analytics', (req, res) => {
  const now = Date.now();
  const DAY = 86400000;
  const msgsByDay = [], usersByDay = [];
  for (let i = 6; i >= 0; i--) {
    const start = now - (i + 1) * DAY, end = now - i * DAY;
    const label = new Date(end).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
    msgsByDay.push({ label, count: db.prepare("SELECT COUNT(*) as n FROM messages WHERE created_at>? AND created_at<=? AND type!='deleted'").get(start, end).n });
    usersByDay.push({ label, count: db.prepare('SELECT COUNT(*) as n FROM users WHERE created_at>? AND created_at<=?').get(start, end).n });
  }
  const topUsers = db.prepare(`SELECT u.id,u.username,u.avatar,(SELECT COUNT(*) FROM messages WHERE sender_id=u.id AND type!='deleted') as msg_count FROM users u ORDER BY msg_count DESC LIMIT 5`).all();
  const recentActivity = db.prepare(`SELECT m.content,m.type,m.created_at,u.username,c.name as chat_name,c.is_group FROM messages m JOIN users u ON u.id=m.sender_id JOIN chats c ON c.id=m.chat_id WHERE m.type!='deleted' ORDER BY m.created_at DESC LIMIT 8`).all();
  const msgTypeDist = db.prepare("SELECT type, COUNT(*) as count FROM messages WHERE type!='deleted' GROUP BY type ORDER BY count DESC").all();
  res.json({ msgsByDay, usersByDay, topUsers, recentActivity, msgTypeDist });
});

// ── Settings ───────────────────────────────────────────────
router.get('/settings', (req, res) => res.json(getSettings()));

router.patch('/settings', (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'key required' });
  db.prepare('INSERT OR REPLACE INTO admin_settings (key,value,updated_at) VALUES (?,?,?)').run(key, JSON.stringify(value), Date.now());
  logAudit(req.admin.email, 'UPDATE_SETTING', 'setting', key, key, `→ ${JSON.stringify(value)}`);
  res.json({ ok: true, settings: getSettings() });
});

// ── Audit log ──────────────────────────────────────────────
router.get('/audit-log', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const offset = parseInt(req.query.offset) || 0;
  const logs = db.prepare('SELECT * FROM admin_audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
  const total = db.prepare('SELECT COUNT(*) as n FROM admin_audit_log').get().n;
  res.json({ logs, total });
});

// ── Users ──────────────────────────────────────────────────
router.get('/users', (req, res) => {
  const now = Date.now();
  const online5m = now - 5 * 60 * 1000;
  const users = db.prepare(`
    SELECT u.id, u.username, u.email, u.avatar, u.about, u.last_seen, u.created_at,
           COALESCE(u.is_banned, 0) as is_banned,
           u.admin_note,
           CASE WHEN u.last_seen > ${online5m} THEN 1 ELSE 0 END as is_online,
           (SELECT COUNT(*) FROM messages WHERE sender_id=u.id AND type!='deleted') as message_count,
           (SELECT COUNT(*) FROM chat_members WHERE user_id=u.id) as chat_count
    FROM users u ORDER BY u.created_at DESC
  `).all();
  res.json(users);
});

router.patch('/users/:id/ban', (req, res) => {
  const user = db.prepare('SELECT id, username, is_banned FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const newState = user.is_banned ? 0 : 1;
  db.prepare('UPDATE users SET is_banned = ? WHERE id = ?').run(newState, req.params.id);
  logAudit(req.admin.email, newState ? 'BAN_USER' : 'UNBAN_USER', 'user', req.params.id, user.username, null);
  res.json({ banned: !!newState });
});

router.patch('/users/:id/note', (req, res) => {
  const { note } = req.body;
  const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE users SET admin_note = ? WHERE id = ?').run(note || null, req.params.id);
  logAudit(req.admin.email, 'ADD_NOTE', 'user', req.params.id, user.username, note?.slice(0, 60));
  res.json({ ok: true });
});

router.delete('/users/:id', (req, res) => {
  const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const id = req.params.id;
  try {
    db.prepare('UPDATE messages SET reply_to = NULL WHERE reply_to IN (SELECT id FROM messages WHERE sender_id = ?)').run(id);
    db.prepare('DELETE FROM message_reactions WHERE message_id IN (SELECT id FROM messages WHERE sender_id = ?)').run(id);
    db.prepare('DELETE FROM message_status WHERE message_id IN (SELECT id FROM messages WHERE sender_id = ?)').run(id);
    db.prepare('DELETE FROM starred_messages WHERE message_id IN (SELECT id FROM messages WHERE sender_id = ?)').run(id);
    db.prepare('DELETE FROM pinned_messages WHERE message_id IN (SELECT id FROM messages WHERE sender_id = ?)').run(id);
    db.prepare('DELETE FROM messages WHERE sender_id = ?').run(id);
    db.prepare('UPDATE chats SET created_by = NULL WHERE created_by = ?').run(id);
    db.prepare('DELETE FROM message_reactions WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM message_status WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM starred_messages WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM pinned_messages WHERE pinned_by = ?').run(id);
    db.prepare('DELETE FROM chat_members WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM status_views WHERE viewer_id = ?').run(id);
    db.prepare('DELETE FROM status_views WHERE status_id IN (SELECT id FROM statuses WHERE user_id = ?)').run(id);
    db.prepare('DELETE FROM statuses WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM blocked_users WHERE blocker_id = ? OR blocked_id = ?').run(id, id);
    db.prepare('DELETE FROM user_chat_settings WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM user_settings WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    logAudit(req.admin.email, 'DELETE_USER', 'user', id, user.username, null);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Bulk ban/unban
router.post('/users/bulk-ban', (req, res) => {
  const { ids, ban } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });
  const stmt = db.prepare('UPDATE users SET is_banned = ? WHERE id = ?');
  for (const id of ids) stmt.run(ban ? 1 : 0, id);
  logAudit(req.admin.email, ban ? 'BULK_BAN' : 'BULK_UNBAN', 'users', null, `${ids.length} users`, ids.join(',').slice(0, 200));
  res.json({ ok: true, count: ids.length });
});

// Bulk delete
router.post('/users/bulk-delete', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });
  let deleted = 0;
  for (const id of ids) {
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
    if (!user) continue;
    try {
      db.prepare('UPDATE messages SET reply_to = NULL WHERE reply_to IN (SELECT id FROM messages WHERE sender_id = ?)').run(id);
      db.prepare('DELETE FROM message_reactions WHERE message_id IN (SELECT id FROM messages WHERE sender_id = ?)').run(id);
      db.prepare('DELETE FROM message_status WHERE message_id IN (SELECT id FROM messages WHERE sender_id = ?)').run(id);
      db.prepare('DELETE FROM starred_messages WHERE message_id IN (SELECT id FROM messages WHERE sender_id = ?)').run(id);
      db.prepare('DELETE FROM pinned_messages WHERE message_id IN (SELECT id FROM messages WHERE sender_id = ?)').run(id);
      db.prepare('DELETE FROM messages WHERE sender_id = ?').run(id);
      db.prepare('UPDATE chats SET created_by = NULL WHERE created_by = ?').run(id);
      db.prepare('DELETE FROM message_reactions WHERE user_id = ?').run(id);
      db.prepare('DELETE FROM message_status WHERE user_id = ?').run(id);
      db.prepare('DELETE FROM starred_messages WHERE user_id = ?').run(id);
      db.prepare('DELETE FROM pinned_messages WHERE pinned_by = ?').run(id);
      db.prepare('DELETE FROM chat_members WHERE user_id = ?').run(id);
      db.prepare('DELETE FROM status_views WHERE viewer_id = ?').run(id);
      db.prepare('DELETE FROM status_views WHERE status_id IN (SELECT id FROM statuses WHERE user_id = ?)').run(id);
      db.prepare('DELETE FROM statuses WHERE user_id = ?').run(id);
      db.prepare('DELETE FROM blocked_users WHERE blocker_id = ? OR blocked_id = ?').run(id, id);
      db.prepare('DELETE FROM user_chat_settings WHERE user_id = ?').run(id);
      db.prepare('DELETE FROM user_settings WHERE user_id = ?').run(id);
      db.prepare('DELETE FROM users WHERE id = ?').run(id);
      deleted++;
    } catch {}
  }
  logAudit(req.admin.email, 'BULK_DELETE_USERS', 'users', null, `${deleted} deleted`, null);
  res.json({ ok: true, deleted });
});

// ── User details ───────────────────────────────────────────
router.get('/users/:id/details', (req, res) => {
  const user = db.prepare('SELECT id,username,email,avatar,about,last_seen,created_at,COALESCE(is_banned,0) as is_banned,admin_note FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  const id = req.params.id;
  const chats = db.prepare(`SELECT c.id,c.name,c.is_group,cm.role,cm.joined_at,(SELECT COUNT(*) FROM messages WHERE chat_id=c.id AND sender_id=? AND type!='deleted') as sent_in_chat FROM chats c JOIN chat_members cm ON cm.chat_id=c.id AND cm.user_id=? ORDER BY sent_in_chat DESC LIMIT 8`).all(id, id);
  const recentMessages = db.prepare(`SELECT m.content,m.type,m.file_name,m.created_at,c.name as chat_name,c.is_group FROM messages m JOIN chats c ON c.id=m.chat_id WHERE m.sender_id=? AND m.type!='deleted' ORDER BY m.created_at DESC LIMIT 10`).all(id);
  const msgTypeBreakdown = db.prepare(`SELECT type,COUNT(*) as count FROM messages WHERE sender_id=? AND type!='deleted' GROUP BY type ORDER BY count DESC`).all(id);
  res.json({ user, chats, recentMessages, msgTypeBreakdown });
});

// ── Messages ───────────────────────────────────────────────
router.get('/messages', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 500);
  const offset = parseInt(req.query.offset) || 0;
  const from   = req.query.from ? parseInt(req.query.from) : null;
  const to     = req.query.to   ? parseInt(req.query.to)   : null;
  const chatId = req.query.chatId || null;
  const type   = req.query.type || null;

  let where = "m.type != 'deleted'";
  const params = [];
  if (from)   { where += ' AND m.created_at >= ?'; params.push(from); }
  if (to)     { where += ' AND m.created_at <= ?'; params.push(to); }
  if (chatId) { where += ' AND m.chat_id = ?'; params.push(chatId); }
  if (type)   { where += ' AND m.type = ?'; params.push(type); }

  const messages = db.prepare(`
    SELECT m.id,m.content,m.type,m.created_at,m.file_url,m.file_name,m.chat_id,
           u.username as sender_name,u.avatar as sender_avatar,
           c.name as chat_name,c.is_group
    FROM messages m JOIN users u ON u.id=m.sender_id JOIN chats c ON c.id=m.chat_id
    WHERE ${where} ORDER BY m.created_at DESC LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  const total = db.prepare(`SELECT COUNT(*) as n FROM messages m WHERE ${where}`).get(...params).n;
  res.json({ messages, total });
});

router.delete('/messages/:id', (req, res) => {
  const msg = db.prepare('SELECT id, content, type FROM messages WHERE id = ?').get(req.params.id);
  db.prepare("UPDATE messages SET type='deleted', content=NULL WHERE id=?").run(req.params.id);
  logAudit(req.admin.email, 'DELETE_MESSAGE', 'message', req.params.id, (msg?.content || '').slice(0, 40), null);
  res.json({ ok: true });
});

router.patch('/messages/:id', (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'content required' });
  db.prepare('UPDATE messages SET content=?, edited_at=? WHERE id=?').run(content, Date.now(), req.params.id);
  logAudit(req.admin.email, 'EDIT_MESSAGE', 'message', req.params.id, content.slice(0, 40), null);
  res.json({ ok: true });
});

// ── Chats ──────────────────────────────────────────────────
router.get('/chats', (req, res) => {
  const chats = db.prepare(`
    SELECT c.id,c.name,c.is_group,c.created_at,c.description,
           (SELECT COUNT(*) FROM chat_members WHERE chat_id=c.id) as member_count,
           (SELECT COUNT(*) FROM messages WHERE chat_id=c.id AND type!='deleted') as message_count,
           u.username as created_by_name
    FROM chats c LEFT JOIN users u ON u.id=c.created_by
    ORDER BY c.created_at DESC
  `).all();
  res.json(chats);
});

router.get('/chats/:id/messages', (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  const msgs = db.prepare(`
    SELECT m.id,m.content,m.type,m.file_url,m.file_name,m.created_at,
           u.username as sender_name,u.avatar as sender_avatar,u.id as sender_id
    FROM messages m JOIN users u ON u.id=m.sender_id
    WHERE m.chat_id=? AND m.type!='deleted'
    ORDER BY m.created_at DESC LIMIT ? OFFSET ?
  `).all(req.params.id, limit, offset);
  const total = db.prepare("SELECT COUNT(*) as n FROM messages WHERE chat_id=? AND type!='deleted'").get(req.params.id).n;
  res.json({ messages: msgs, total });
});

router.get('/chats/:id/members', (req, res) => {
  const members = db.prepare(`
    SELECT u.id,u.username,u.email,u.avatar,u.last_seen,COALESCE(u.is_banned,0) as is_banned,
           cm.role,cm.joined_at,
           (SELECT COUNT(*) FROM messages WHERE chat_id=? AND sender_id=u.id AND type!='deleted') as msg_count
    FROM chat_members cm JOIN users u ON u.id=cm.user_id WHERE cm.chat_id=?
    ORDER BY cm.role DESC,u.username ASC
  `).all(req.params.id, req.params.id);
  res.json(members);
});

router.delete('/chats/:id', (req, res) => {
  const chat = db.prepare('SELECT id, name FROM chats WHERE id = ?').get(req.params.id);
  if (!chat) return res.status(404).json({ error: 'Not found' });
  const id = req.params.id;
  try {
    db.prepare('DELETE FROM message_reactions WHERE message_id IN (SELECT id FROM messages WHERE chat_id=?)').run(id);
    db.prepare('DELETE FROM message_status WHERE message_id IN (SELECT id FROM messages WHERE chat_id=?)').run(id);
    db.prepare('DELETE FROM starred_messages WHERE message_id IN (SELECT id FROM messages WHERE chat_id=?)').run(id);
    db.prepare('DELETE FROM pinned_messages WHERE chat_id=?').run(id);
    db.prepare('DELETE FROM messages WHERE chat_id=?').run(id);
    db.prepare('DELETE FROM chat_members WHERE chat_id=?').run(id);
    db.prepare('DELETE FROM user_chat_settings WHERE chat_id=?').run(id);
    db.prepare('DELETE FROM chats WHERE id=?').run(id);
    logAudit(req.admin.email, 'DELETE_CHAT', 'chat', id, chat.name || 'Direct', null);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Media ──────────────────────────────────────────────────
router.get('/media', (req, res) => {
  const media = db.prepare(`
    SELECT m.id,m.file_url,m.file_name,m.file_size,m.type,m.created_at,
           u.username as sender_name,u.avatar as sender_avatar,
           c.name as chat_name,c.is_group
    FROM messages m JOIN users u ON u.id=m.sender_id JOIN chats c ON c.id=m.chat_id
    WHERE m.type IN ('image','video','audio','file') AND m.file_url IS NOT NULL
    ORDER BY m.created_at DESC LIMIT 300
  `).all();
  res.json(media);
});

// ── Broadcast ──────────────────────────────────────────────
router.post('/broadcast', (req, res) => {
  const { subject, message } = req.body;
  if (!subject || !message) return res.status(400).json({ error: 'subject and message required' });
  const id = uuidv4();
  const now = Date.now();
  db.prepare('INSERT INTO admin_broadcasts (id,admin_email,subject,message,created_at) VALUES (?,?,?,?,?)').run(id, req.admin.email, subject, message, now);
  logAudit(req.admin.email, 'BROADCAST', 'system', id, subject, message.slice(0, 100));
  // Push to all connected clients via Socket.io
  if (_io) _io.emit('admin:broadcast', { id, subject, message, created_at: now });
  res.json({ ok: true, id });
});

router.get('/broadcasts', (req, res) => {
  const broadcasts = db.prepare('SELECT * FROM admin_broadcasts ORDER BY created_at DESC LIMIT 50').all();
  res.json(broadcasts);
});

// ── System ─────────────────────────────────────────────────
router.get('/system', (req, res) => {
  try {
    const dbPath = path.join(__dirname, '../messaging.db');
    const dbSize = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;

    // Count files in uploads
    const uploadsPath = path.join(__dirname, '../uploads');
    let uploadCount = 0, uploadSize = 0;
    if (fs.existsSync(uploadsPath)) {
      const walk = (dir) => {
        try {
          for (const f of fs.readdirSync(dir)) {
            const full = path.join(dir, f);
            const stat = fs.statSync(full);
            if (stat.isDirectory()) walk(full);
            else { uploadCount++; uploadSize += stat.size; }
          }
        } catch {}
      };
      walk(uploadsPath);
    }

    const mem = process.memoryUsage();
    res.json({
      dbSizeBytes: dbSize,
      uploadCount, uploadSizeBytes: uploadSize,
      uptime: process.uptime(),
      nodeVersion: process.version,
      platform: process.platform,
      memRss: mem.rss,
      memHeap: mem.heapUsed,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Danger zone: delete old messages
router.delete('/cleanup/old-messages', (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const cutoff = Date.now() - days * 86400000;
  try {
    const msgs = db.prepare("SELECT id FROM messages WHERE created_at < ? AND type != 'deleted'").all(cutoff);
    const ids = msgs.map(m => m.id);
    if (ids.length > 0) {
      const ph = ids.map(() => '?').join(',');
      db.prepare(`DELETE FROM message_reactions WHERE message_id IN (${ph})`).run(...ids);
      db.prepare(`DELETE FROM message_status WHERE message_id IN (${ph})`).run(...ids);
      db.prepare(`DELETE FROM starred_messages WHERE message_id IN (${ph})`).run(...ids);
      db.prepare(`UPDATE messages SET type='deleted',content=NULL WHERE id IN (${ph})`).run(...ids);
    }
    logAudit(req.admin.email, 'CLEANUP_OLD_MESSAGES', 'system', null, `>${days} days`, `${ids.length} messages`);
    res.json({ ok: true, deleted: ids.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Danger zone: delete inactive users (no activity in N days)
router.delete('/cleanup/inactive-users', (req, res) => {
  const days = parseInt(req.query.days) || 90;
  const cutoff = Date.now() - days * 86400000;
  try {
    const inactiveUsers = db.prepare('SELECT id FROM users WHERE last_seen < ? AND COALESCE(is_banned,0) = 0').all(cutoff);
    let deleted = 0;
    for (const { id } of inactiveUsers) {
      try {
        db.prepare('UPDATE messages SET reply_to=NULL WHERE reply_to IN (SELECT id FROM messages WHERE sender_id=?)').run(id);
        db.prepare('DELETE FROM message_reactions WHERE message_id IN (SELECT id FROM messages WHERE sender_id=?)').run(id);
        db.prepare('DELETE FROM message_status WHERE message_id IN (SELECT id FROM messages WHERE sender_id=?)').run(id);
        db.prepare('DELETE FROM starred_messages WHERE message_id IN (SELECT id FROM messages WHERE sender_id=?)').run(id);
        db.prepare('DELETE FROM pinned_messages WHERE message_id IN (SELECT id FROM messages WHERE sender_id=?)').run(id);
        db.prepare('DELETE FROM messages WHERE sender_id=?').run(id);
        db.prepare('UPDATE chats SET created_by=NULL WHERE created_by=?').run(id);
        db.prepare('DELETE FROM message_reactions WHERE user_id=?').run(id);
        db.prepare('DELETE FROM message_status WHERE user_id=?').run(id);
        db.prepare('DELETE FROM starred_messages WHERE user_id=?').run(id);
        db.prepare('DELETE FROM pinned_messages WHERE pinned_by=?').run(id);
        db.prepare('DELETE FROM chat_members WHERE user_id=?').run(id);
        db.prepare('DELETE FROM status_views WHERE viewer_id=?').run(id);
        db.prepare('DELETE FROM status_views WHERE status_id IN (SELECT id FROM statuses WHERE user_id=?)').run(id);
        db.prepare('DELETE FROM statuses WHERE user_id=?').run(id);
        db.prepare('DELETE FROM blocked_users WHERE blocker_id=? OR blocked_id=?').run(id, id);
        db.prepare('DELETE FROM user_chat_settings WHERE user_id=?').run(id);
        db.prepare('DELETE FROM user_settings WHERE user_id=?').run(id);
        db.prepare('DELETE FROM users WHERE id=?').run(id);
        deleted++;
      } catch {}
    }
    logAudit(req.admin.email, 'CLEANUP_INACTIVE_USERS', 'system', null, `inactive >${days} days`, `${deleted} deleted`);
    res.json({ ok: true, deleted });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── AI Config ──────────────────────────────────────────────

function getAdminSetting(key, fallback) {
  try {
    const row = db.prepare('SELECT value FROM admin_settings WHERE key = ?').get(key);
    if (!row) return fallback;
    try { return JSON.parse(row.value); } catch { return row.value; }
  } catch { return fallback; }
}

function setAdminSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO admin_settings (key,value,updated_at) VALUES (?,?,?)').run(key, JSON.stringify(value), Date.now());
}

const AI_PROVIDERS = [
  { id: 'openai',    envKey: 'OPENAI_API_KEY',    settingKey: 'ai_openai_key',    defaultModel: 'gpt-4o-mini',                                    modelKey: 'ai_openai_model' },
  { id: 'gemini',    envKey: 'GEMINI_API_KEY',     settingKey: 'ai_gemini_key',    defaultModel: 'gemini-1.5-flash',                               modelKey: 'ai_gemini_model' },
  { id: 'groq',      envKey: 'GROQ_API_KEY',       settingKey: 'ai_groq_key',      defaultModel: 'llama-3.1-8b-instant',                           modelKey: 'ai_groq_model' },
  { id: 'anthropic', envKey: 'ANTHROPIC_API_KEY',  settingKey: 'ai_anthropic_key', defaultModel: 'claude-haiku-4-5-20251001',                       modelKey: 'ai_anthropic_model' },
  { id: 'mistral',   envKey: 'MISTRAL_API_KEY',    settingKey: 'ai_mistral_key',   defaultModel: 'mistral-small-latest',                           modelKey: 'ai_mistral_model' },
  { id: 'together',  envKey: 'TOGETHER_API_KEY',   settingKey: 'ai_together_key',  defaultModel: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',   modelKey: 'ai_together_model' },
];

const mask = k => k ? k.slice(0, 6) + '•'.repeat(Math.max(4, k.length - 10)) + k.slice(-4) : null;

router.get('/ai-config', (req, res) => {
  const provider = getAdminSetting('ai_provider', 'auto');
  const result = { provider };
  for (const p of AI_PROVIDERS) {
    const key = getAdminSetting(p.settingKey, null) || process.env[p.envKey] || null;
    const model = getAdminSetting(p.modelKey, p.defaultModel);
    result[`${p.id}Key`]       = mask(key);
    result[`has${p.id.charAt(0).toUpperCase()}${p.id.slice(1)}`] = !!key;
    result[`${p.id}Model`]     = model;
    result[`${p.id}DefaultModel`] = p.defaultModel;
  }
  res.json(result);
});

router.patch('/ai-config', (req, res) => {
  const { provider, openaiKey, geminiKey, groqKey, anthropicKey, mistralKey, togetherKey,
          openaiModel, geminiModel, groqModel, anthropicModel, mistralModel, togetherModel } = req.body;

  const keyMap = { openaiKey: 'ai_openai_key', geminiKey: 'ai_gemini_key', groqKey: 'ai_groq_key', anthropicKey: 'ai_anthropic_key', mistralKey: 'ai_mistral_key', togetherKey: 'ai_together_key' };
  const modelMap = { openaiModel: 'ai_openai_model', geminiModel: 'ai_gemini_model', groqModel: 'ai_groq_model', anthropicModel: 'ai_anthropic_model', mistralModel: 'ai_mistral_model', togetherModel: 'ai_together_model' };

  if (provider !== undefined) { setAdminSetting('ai_provider', provider); logAudit(req.admin.email, 'UPDATE_AI_PROVIDER', 'setting', 'ai_provider', 'ai_provider', provider); }

  for (const [field, settingKey] of Object.entries(keyMap)) {
    const val = req.body[field];
    if (val !== undefined) {
      setAdminSetting(settingKey, val || null);
      const name = field.replace('Key', '');
      logAudit(req.admin.email, 'UPDATE_AI_KEY', 'setting', settingKey, name, val ? 'set' : 'cleared');
    }
  }
  for (const [field, settingKey] of Object.entries(modelMap)) {
    const val = req.body[field];
    if (val !== undefined) setAdminSetting(settingKey, val || null);
  }

  res.json({ ok: true });
});

router.post('/ai-config/test', async (req, res) => {
  const { provider: testProvider } = req.body;
  const TEST_MSG = 'Reply with the single word: OK';

  const { callOpenAI, callGemini, callGroq, callAnthropic, callMistral, callTogether } = require('./ai');
  const callers = { openai: callOpenAI, gemini: callGemini, groq: callGroq, anthropic: callAnthropic, mistral: callMistral, together: callTogether };

  const AUTO_ORDER = ['openai', 'gemini', 'groq', 'anthropic', 'mistral', 'together'];

  const getKey = (p) => getAdminSetting(`ai_${p}_key`, null) || process.env[AI_PROVIDERS.find(x => x.id === p)?.envKey || ''] || null;
  const getModel = (p) => getAdminSetting(`ai_${p}_model`, AI_PROVIDERS.find(x => x.id === p)?.defaultModel);

  try {
    const targets = testProvider ? [testProvider] : AUTO_ORDER.filter(p => getKey(p));
    if (!targets.length) return res.status(400).json({ error: 'No AI provider configured. Add at least one API key.' });

    const p = targets[0];
    const key = getKey(p);
    if (!key) return res.json({ ok: false, provider: p, error: `No ${p} key configured` });

    const testPrompt = 'You are a test assistant.';
    const result = await callers[p](key, testPrompt, TEST_MSG, getModel(p));
    res.json({ ok: true, provider: p, model: getModel(p), response: result?.slice(0, 60) });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// module.exports is at the top (factory function)
