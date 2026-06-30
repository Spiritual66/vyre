const fs = require('fs');
const path = require('path');
const db = require('../db');
const { UPLOADS_DIR } = require('../paths');

const MESSAGE_SWEEP_MS = 60 * 1000;       // disappearing messages — every minute
const STATUS_SWEEP_MS = 5 * 60 * 1000;    // expired statuses — every 5 minutes

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
    db.transaction(() => { for (const m of msgs) del.run(m.id); })();
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
  db.transaction(() => {
    for (const s of expired) { delViews.run(s.id); delReactions.run(s.id); delStatus.run(s.id); }
  })();
  for (const s of expired) unlinkUpload(s.file_url);
  return expired.length;
}

function start(io) {
  const safe = (fn) => { try { return fn(); } catch (e) { console.warn('[cleanup]', e.message); } };
  // Stagger initial runs shortly after boot, then on a fixed cadence.
  setTimeout(() => safe(() => sweepDisappearingMessages(io)), 5000);
  setTimeout(() => safe(() => sweepExpiredStatuses()), 8000);
  setInterval(() => safe(() => sweepDisappearingMessages(io)), MESSAGE_SWEEP_MS).unref?.();
  setInterval(() => safe(() => sweepExpiredStatuses()), STATUS_SWEEP_MS).unref?.();
}

module.exports = start;
module.exports.sweepDisappearingMessages = sweepDisappearingMessages;
module.exports.sweepExpiredStatuses = sweepExpiredStatuses;
