const fs = require('fs');
const path = require('path');
const db = require('../db');
const { UPLOADS_DIR } = require('../paths');
const { sendToUser } = require('../push');

const MESSAGE_SWEEP_MS = 60 * 1000;       // disappearing messages — every minute
const STATUS_SWEEP_MS = 5 * 60 * 1000;    // expired statuses — every 5 minutes
const SCHEDULED_SWEEP_MS = 30 * 1000;     // scheduled messages — every 30 seconds

function unlinkUpload(fileUrl) {
  if (!fileUrl || !fileUrl.startsWith('/uploads/')) return;
  const p = path.join(UPLOADS_DIR, fileUrl.replace(/^\/uploads\//, ''));
  fs.promises.unlink(p).catch(() => {});
}

// Soft-delete messages whose sender has a disappearing-messages timer, once the
// message is older than the timer. Only messages sent AFTER the timer was set
// are affected (disappearing_set_at), so enabling it never wipes old history.
function sweepDisappearingMessages(io) {
  const now = Date.now();
  const users = db.prepare(
    'SELECT user_id, disappearing_messages AS secs, disappearing_set_at AS setAt FROM user_settings WHERE disappearing_messages > 0'
  ).all();

  const findMsgs = db.prepare(
    "SELECT id, chat_id, file_url FROM messages WHERE sender_id = ? AND type != 'deleted' AND created_at >= ? AND created_at < ?"
  );
  const del = db.prepare(
    "UPDATE messages SET content = NULL, type = 'deleted', file_url = NULL, file_name = NULL, edited_at = NULL WHERE id = ?"
  );

  let total = 0;
  for (const { user_id, secs, setAt } of users) {
    const cutoff = now - secs * 1000;
    const since = setAt || 0;
    const msgs = findMsgs.all(user_id, since, cutoff);
    if (!msgs.length) continue;
    db.transact(() => { for (const m of msgs) del.run(m.id); });
    for (const m of msgs) {
      unlinkUpload(m.file_url);
      if (io) io.to(`chat:${m.chat_id}`).emit('message:deleted', { messageId: m.id, chatId: m.chat_id });
    }
    total += msgs.length;
  }
  return total;
}

// Remove statuses past their 24h expiry (rows, view records, and uploaded files).
function sweepExpiredStatuses() {
  const now = Date.now();
  const expired = db.prepare('SELECT id, file_url FROM statuses WHERE expires_at < ?').all(now);
  if (!expired.length) return 0;
  const delViews = db.prepare('DELETE FROM status_views WHERE status_id = ?');
  const delReactions = db.prepare('DELETE FROM status_reactions WHERE status_id = ?');
  const delStatus = db.prepare('DELETE FROM statuses WHERE id = ?');
  db.transact(() => {
    for (const s of expired) { delViews.run(s.id); delReactions.run(s.id); delStatus.run(s.id); }
  });
  for (const s of expired) unlinkUpload(s.file_url);
  return expired.length;
}

// Deliver due scheduled messages: insert as real messages, emit, push offline.
function sweepScheduledMessages(io) {
  const due = db.prepare('SELECT * FROM scheduled_messages WHERE send_at <= ?').all(Date.now());
  if (!due.length) return 0;
  let isOnline = () => false;
  try { isOnline = require('../socket/handlers').isOnline || isOnline; } catch { /* not loaded yet */ }
  const insMsg = db.prepare(`INSERT INTO messages (id, chat_id, sender_id, content, type, file_url, file_name, file_size, reply_to, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insStatus = db.prepare('INSERT OR IGNORE INTO message_status (message_id, user_id, status) VALUES (?, ?, ?)');
  const delSched = db.prepare('DELETE FROM scheduled_messages WHERE id = ?');
  let sent = 0;
  for (const s of due) {
    if (!db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(s.chat_id, s.sender_id)) { delSched.run(s.id); continue; }
    const ts = Date.now();
    const members = db.prepare('SELECT user_id FROM chat_members WHERE chat_id = ?').all(s.chat_id);
    const sender = db.prepare('SELECT username, avatar FROM users WHERE id = ?').get(s.sender_id);
    db.transact(() => {
      insMsg.run(s.id, s.chat_id, s.sender_id, s.content, s.type, s.file_url, s.file_name, s.file_size, s.reply_to, ts);
      for (const m of members) if (m.user_id !== s.sender_id) insStatus.run(s.id, m.user_id, 'delivered');
      delSched.run(s.id);
    });
    const statuses = db.prepare('SELECT user_id, status FROM message_status WHERE message_id = ?').all(s.id);
    const message = {
      id: s.id, chat_id: s.chat_id, sender_id: s.sender_id, content: s.content, type: s.type,
      file_url: s.file_url, file_name: s.file_name, file_size: s.file_size, reply_to: s.reply_to, reply_to_message: null,
      forwarded_from: null, created_at: ts, sender_name: sender ? sender.username : '', sender_avatar: sender ? sender.avatar : null,
      statuses, reactions: [], is_starred: false, edited_at: null,
    };
    if (io) io.to(`chat:${s.chat_id}`).emit('message:new', message);
    const snippet = s.type === 'text' ? (s.content || '').slice(0, 140) : '📎 Attachment';
    for (const m of members) {
      if (m.user_id !== s.sender_id && !isOnline(m.user_id)) {
        sendToUser(m.user_id, { title: sender ? sender.username : 'VYRE', body: snippet, tag: `chat:${s.chat_id}`, data: { url: '/' } }).catch(() => {});
      }
    }
    sent++;
  }
  return sent;
}

function start(io) {
  const safe = (fn) => { try { return fn(); } catch (e) { console.warn('[cleanup]', e.message); } };
  // Stagger initial runs shortly after boot, then on a fixed cadence.
  setTimeout(() => safe(() => sweepDisappearingMessages(io)), 5000);
  setTimeout(() => safe(() => sweepExpiredStatuses()), 8000);
  setTimeout(() => safe(() => sweepScheduledMessages(io)), 6000);
  setInterval(() => safe(() => sweepDisappearingMessages(io)), MESSAGE_SWEEP_MS).unref?.();
  setInterval(() => safe(() => sweepExpiredStatuses()), STATUS_SWEEP_MS).unref?.();
  setInterval(() => safe(() => sweepScheduledMessages(io)), SCHEDULED_SWEEP_MS).unref?.();
}

module.exports = start;
module.exports.sweepDisappearingMessages = sweepDisappearingMessages;
module.exports.sweepExpiredStatuses = sweepExpiredStatuses;
module.exports.sweepScheduledMessages = sweepScheduledMessages;
