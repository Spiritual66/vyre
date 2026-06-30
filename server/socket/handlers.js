const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { sendToUser: pushSendToUser } = require('../push');

const activeCalls = new Map(); // callId -> { callerId, calleeId, type, status }

const JWT_SECRET = process.env.JWT_SECRET || 'vyre_dev_secret_change_in_production';
const onlineUsers = new Map(); // userId -> Set<socketId>

// ─── Per-user message flood protection ───────────────────
const MSG_RATE_LIMIT = 20;          // max messages
const MSG_RATE_WINDOW = 10 * 1000;  // per 10 seconds
const messageRate = new Map();      // userId -> number[] (recent send timestamps)

function allowMessage(userId) {
  const now = Date.now();
  const recent = (messageRate.get(userId) || []).filter(t => now - t < MSG_RATE_WINDOW);
  if (recent.length >= MSG_RATE_LIMIT) {
    messageRate.set(userId, recent);
    return false;
  }
  recent.push(now);
  messageRate.set(userId, recent);
  return true;
}

function getAdminSetting(key, fallback) {
  try {
    const row = db.prepare('SELECT value FROM admin_settings WHERE key = ?').get(key);
    if (!row) return fallback;
    try { return JSON.parse(row.value); } catch { return row.value; }
  } catch { return fallback; }
}

module.exports = (io) => {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('No token'));
    try {
      socket.user = jwt.verify(token, JWT_SECRET);
      const row = db.prepare('SELECT is_banned FROM users WHERE id = ?').get(socket.user.id);
      if (row?.is_banned) return next(new Error('Account suspended'));
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.id;

    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
    onlineUsers.get(userId).add(socket.id);

    db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Date.now(), userId);

    // Join all user's chat rooms + personal user room (for status broadcasts)
    const userChats = db.prepare('SELECT chat_id FROM chat_members WHERE user_id = ?').all(userId);
    userChats.forEach(({ chat_id }) => socket.join(`chat:${chat_id}`));
    socket.join(`user:${userId}`);

    // Broadcast online status
    io.emit('user:online', { userId, online: true });

    // ─── Message Send (transactional) ────────────────────
    socket.on('message:send', (data, callback) => {
      try {
        if (!allowMessage(userId)) return callback?.({ error: 'You are sending messages too fast. Please slow down.' });
        const { chatId, content, type = 'text', fileUrl, fileName, fileSize, replyTo } = data;
        const member = db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(chatId, userId);
        if (!member) return callback?.({ error: 'Not a member' });

        // Feature flag enforcement
        if (type === 'sticker' && !getAdminSetting('allowStickers', true)) return callback?.({ error: 'Stickers are currently disabled.' });
        if (type === 'location' && !getAdminSetting('allowLocation', true)) return callback?.({ error: 'Location sharing is currently disabled.' });
        if (type === 'audio' && !getAdminSetting('allowVoiceMessages', true)) return callback?.({ error: 'Voice messages are currently disabled.' });
        if (['image','video','file'].includes(type) && !getAdminSetting('allowFileUploads', true)) return callback?.({ error: 'File uploads are currently disabled.' });

        // Message length enforcement
        if (type === 'text' && content) {
          const maxLen = getAdminSetting('maxMessageLength', 4096);
          if (content.length > maxLen) return callback?.({ error: `Message exceeds the ${maxLen} character limit.` });
        }

        // Block enforcement for direct chats
        const chatInfo = db.prepare('SELECT is_group FROM chats WHERE id = ?').get(chatId);
        if (chatInfo && !chatInfo.is_group) {
          const other = db.prepare('SELECT user_id FROM chat_members WHERE chat_id = ? AND user_id != ?').get(chatId, userId);
          if (other) {
            const blocked = db.prepare(
              'SELECT 1 FROM blocked_users WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)'
            ).get(userId, other.user_id, other.user_id, userId);
            if (blocked) return callback?.({ error: 'Cannot send message: user is blocked' });
          }
        }

        const msgId = uuidv4();
        const now = Date.now();

        // Atomic: insert message + all statuses together
        db.transact(() => {
          db.prepare(`INSERT INTO messages (id, chat_id, sender_id, content, type, file_url, file_name, file_size, reply_to, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(msgId, chatId, userId, content || null, type, fileUrl || null, fileName || null, fileSize || null, replyTo || null, now);

          const members = db.prepare('SELECT user_id FROM chat_members WHERE chat_id = ? AND user_id != ?').all(chatId, userId);
          const insertStatus = db.prepare('INSERT INTO message_status (message_id, user_id, status) VALUES (?, ?, ?)');
          members.forEach(({ user_id }) => {
            insertStatus.run(msgId, user_id, onlineUsers.has(user_id) ? 'delivered' : 'sent');
          });
        });

        const sender = db.prepare('SELECT username, avatar FROM users WHERE id = ?').get(userId);
        const replyMsg = replyTo ? db.prepare('SELECT id, content, type, sender_id, file_name FROM messages WHERE id = ?').get(replyTo) : null;
        const statuses = db.prepare('SELECT user_id, status FROM message_status WHERE message_id = ?').all(msgId);

        const message = {
          id: msgId, chat_id: chatId, sender_id: userId, content, type,
          file_url: fileUrl || null, file_name: fileName || null, file_size: fileSize || null,
          reply_to: replyTo || null, reply_to_message: replyMsg, forwarded_from: null,
          created_at: now, sender_name: sender.username, sender_avatar: sender.avatar,
          statuses, reactions: [], is_starred: false, edited_at: null,
        };

        // Ensure all online members are in the socket room (handles newly created chats)
        socket.join(`chat:${chatId}`);
        const allMembers = db.prepare('SELECT user_id FROM chat_members WHERE chat_id = ?').all(chatId);
        for (const { user_id } of allMembers) {
          const sids = onlineUsers.get(user_id);
          if (sids) sids.forEach(sid => {
            const s = io.sockets.sockets.get(sid);
            if (s) s.join(`chat:${chatId}`);
          });
        }

        io.to(`chat:${chatId}`).emit('message:new', message);

        // Push-notify members who aren't currently connected.
        const snippet = type === 'text' ? (content || '').slice(0, 140)
          : type === 'image' ? '📷 Photo' : type === 'video' ? '🎥 Video'
          : type === 'audio' ? '🎤 Voice message' : type === 'sticker' ? 'Sticker'
          : type === 'location' ? '📍 Location' : '📎 Attachment';
        for (const { user_id } of allMembers) {
          if (user_id !== userId && !onlineUsers.has(user_id)) {
            pushSendToUser(user_id, { title: sender.username, body: snippet, tag: `chat:${chatId}`, data: { url: '/' } }).catch(() => {});
          }
        }

        callback?.({ success: true, message });
      } catch (err) {
        callback?.({ error: err.message });
      }
    });

    // ─── Message Edit ─────────────────────────────────────
    socket.on('message:edit', ({ messageId, content }, callback) => {
      try {
        if (!content?.trim()) return callback?.({ error: 'Content required' });
        const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
        if (!msg) return callback?.({ error: 'Not found' });
        if (msg.sender_id !== userId) return callback?.({ error: 'Forbidden' });
        if (msg.type === 'deleted') return callback?.({ error: 'Cannot edit deleted message' });
        if (msg.type !== 'text') return callback?.({ error: 'Can only edit text messages' });

        const editedAt = Date.now();
        db.prepare('UPDATE messages SET content = ?, edited_at = ? WHERE id = ?').run(content.trim(), editedAt, messageId);
        io.to(`chat:${msg.chat_id}`).emit('message:edited', {
          messageId, chatId: msg.chat_id, content: content.trim(), editedAt,
        });
        callback?.({ success: true });
      } catch (err) {
        callback?.({ error: err.message });
      }
    });

    // ─── Read Receipts ───────────────────────────────────
    socket.on('message:read', ({ chatId }) => {
      // Respect the user's read_receipts privacy setting
      const privSettings = db.prepare('SELECT read_receipts FROM user_settings WHERE user_id = ?').get(userId);
      if (privSettings && !privSettings.read_receipts) return; // user opted out

      socket.join(`chat:${chatId}`); // ensure in room
      const now = Date.now();
      db.prepare(`
        UPDATE message_status SET status = 'read', updated_at = ?
        WHERE user_id = ? AND message_id IN (SELECT id FROM messages WHERE chat_id = ?) AND status != 'read'
      `).run(now, userId, chatId);

      const updated = db.prepare('SELECT id FROM messages WHERE chat_id = ? AND sender_id != ?').all(chatId, userId);
      if (updated.length) {
        io.to(`chat:${chatId}`).emit('message:status_update', {
          chatId, userId, messageIds: updated.map(m => m.id), status: 'read',
        });
      }
    });

    // ─── Reactions ───────────────────────────────────────
    socket.on('reaction:toggle', ({ messageId, emoji }, callback) => {
      try {
        const msg = db.prepare('SELECT chat_id FROM messages WHERE id = ?').get(messageId);
        if (!msg) return callback?.({ error: 'Message not found' });

        const member = db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(msg.chat_id, userId);
        if (!member) return callback?.({ error: 'Not a member' });

        const existing = db.prepare('SELECT emoji FROM message_reactions WHERE message_id = ? AND user_id = ?').get(messageId, userId);

        if (existing && existing.emoji === emoji) {
          db.prepare('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ?').run(messageId, userId);
        } else {
          db.prepare('INSERT OR REPLACE INTO message_reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)')
            .run(messageId, userId, emoji, Date.now());
        }

        const reactions = db.prepare(`
          SELECT mr.emoji, mr.user_id, u.username
          FROM message_reactions mr JOIN users u ON u.id = mr.user_id
          WHERE mr.message_id = ?
        `).all(messageId);

        const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
        io.to(`chat:${msg.chat_id}`).emit('reaction:updated', { messageId, chatId: msg.chat_id, reactions, userId, username: user.username });
        callback?.({ success: true, reactions });
      } catch (err) {
        callback?.({ error: err.message });
      }
    });

    // ─── Typing Indicators ───────────────────────────────
    socket.on('typing:start', ({ chatId }) => {
      socket.to(`chat:${chatId}`).emit('typing:start', { chatId, userId });
    });
    socket.on('typing:stop', ({ chatId }) => {
      socket.to(`chat:${chatId}`).emit('typing:stop', { chatId, userId });
    });

    // ─── Group Management ────────────────────────────────
    socket.on('group:updated', ({ chatId, update }) => {
      io.to(`chat:${chatId}`).emit('group:updated', { chatId, update });
    });

    socket.on('group:member_added', ({ chatId, member }) => {
      const memberSockets = onlineUsers.get(member.id);
      if (memberSockets) {
        memberSockets.forEach(sid => {
          const s = io.sockets.sockets.get(sid);
          if (s) s.join(`chat:${chatId}`);
        });
      }
      io.to(`chat:${chatId}`).emit('group:member_added', { chatId, member });
    });

    socket.on('group:member_removed', ({ chatId, userId: removedId }) => {
      // Remove the user from the socket room
      const removedSockets = onlineUsers.get(removedId);
      if (removedSockets) {
        removedSockets.forEach(sid => {
          const s = io.sockets.sockets.get(sid);
          if (s) s.leave(`chat:${chatId}`);
        });
      }
      io.to(`chat:${chatId}`).emit('group:member_removed', { chatId, userId: removedId });
    });

    socket.on('chat:join', ({ chatId }) => {
      socket.join(`chat:${chatId}`);
    });

    // ─── WebRTC Call Signaling ───────────────────────────
    socket.on('call:invite', ({ to, type, offer }, callback) => {
      const calleeSockets = onlineUsers.get(to);
      if (!calleeSockets || calleeSockets.size === 0) {
        return callback?.({ error: 'User offline' });
      }

      const targetUser = db.prepare('SELECT id FROM users WHERE id = ?').get(to);
      if (!targetUser) return callback?.({ error: 'User not found' });

      const callerBusy = [...activeCalls.values()].some(c =>
        (c.calleeId === userId || c.callerId === userId) && c.status === 'active'
      );
      if (callerBusy) return callback?.({ error: 'You are already in a call' });

      const calleeBusy = [...activeCalls.values()].some(c =>
        (c.calleeId === to || c.callerId === to) && c.status === 'active'
      );
      if (calleeBusy) return callback?.({ error: 'User is busy' });

      const callId = uuidv4();
      const startedAt = Date.now();
      activeCalls.set(callId, { callerId: userId, calleeId: to, type, status: 'ringing', startedAt });

      // Record in call history
      try {
        db.prepare('INSERT INTO call_history (id, caller_id, callee_id, type, status, started_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(callId, userId, to, type, 'ringing', startedAt);
      } catch {}

      const caller = db.prepare('SELECT id, username, avatar FROM users WHERE id = ?').get(userId);
      calleeSockets.forEach(sid => {
        io.to(sid).emit('call:incoming', { callId, caller, type, offer });
      });
      callback?.({ callId });
    });

    socket.on('call:answer', ({ callId, answer }) => {
      const call = activeCalls.get(callId);
      if (!call) return;
      call.status = 'active';
      try { db.prepare("UPDATE call_history SET status = 'answered' WHERE id = ?").run(callId); } catch {}
      const callerSockets = onlineUsers.get(call.callerId);
      callerSockets?.forEach(sid => io.to(sid).emit('call:answered', { callId, answer }));
    });

    socket.on('call:ice-candidate', ({ callId, candidate, to }) => {
      if (!candidate) return;
      const targetSockets = onlineUsers.get(to);
      targetSockets?.forEach(sid => io.to(sid).emit('call:ice-candidate', { callId, candidate }));
    });

    socket.on('call:reject', ({ callId }) => {
      const call = activeCalls.get(callId);
      if (!call) return;
      activeCalls.delete(callId);
      const now = Date.now();
      try { db.prepare("UPDATE call_history SET status = 'declined', ended_at = ? WHERE id = ?").run(now, callId); } catch {}
      const callerSockets = onlineUsers.get(call.callerId);
      callerSockets?.forEach(sid => io.to(sid).emit('call:rejected', { callId }));
    });

    // ─── Cancel outgoing call before it's answered ─────────────
    socket.on('call:cancel', ({ callId }) => {
      const call = activeCalls.get(callId);
      if (!call || call.callerId !== userId) return;
      activeCalls.delete(callId);
      const now = Date.now();
      try { db.prepare("UPDATE call_history SET status = 'missed', ended_at = ? WHERE id = ?").run(now, callId); } catch {}
      const calleeSockets = onlineUsers.get(call.calleeId);
      calleeSockets?.forEach(sid => io.to(sid).emit('call:ended', { callId }));
    });

    socket.on('call:end', ({ callId }) => {
      const call = activeCalls.get(callId);
      if (!call) return;
      activeCalls.delete(callId);
      const now = Date.now();
      const duration = call.startedAt ? Math.floor((now - call.startedAt) / 1000) : 0;
      try {
        db.prepare(`UPDATE call_history SET
          status = CASE WHEN status = 'answered' THEN 'answered' ELSE 'missed' END,
          ended_at = ?, duration = ? WHERE id = ?`
        ).run(now, duration, callId);
      } catch {}
      const otherUserId = call.callerId === userId ? call.calleeId : call.callerId;
      const otherSockets = onlineUsers.get(otherUserId);
      otherSockets?.forEach(sid => io.to(sid).emit('call:ended', { callId }));
    });

    // ─── Message Pin / Unpin ─────────────────────────────
    socket.on('message:pin', ({ chatId, messageId }, callback) => {
      try {
        const member = db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(chatId, userId);
        if (!member) return callback?.({ error: 'Not a member' });
        const msg = db.prepare('SELECT id, content, type, file_name FROM messages WHERE id = ? AND chat_id = ?').get(messageId, chatId);
        if (!msg) return callback?.({ error: 'Message not found' });
        db.prepare('INSERT OR IGNORE INTO pinned_messages (chat_id, message_id, pinned_by, pinned_at) VALUES (?, ?, ?, ?)')
          .run(chatId, messageId, userId, Date.now());
        io.to(`chat:${chatId}`).emit('message:pinned', { chatId, messageId, pinnedBy: userId, msg });
        callback?.({ success: true });
      } catch (err) {
        callback?.({ error: err.message });
      }
    });

    socket.on('message:unpin', ({ chatId, messageId }, callback) => {
      try {
        const member = db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(chatId, userId);
        if (!member) return callback?.({ error: 'Not a member' });
        db.prepare('DELETE FROM pinned_messages WHERE chat_id = ? AND message_id = ?').run(chatId, messageId);
        io.to(`chat:${chatId}`).emit('message:unpinned', { chatId, messageId });
        callback?.({ success: true });
      } catch (err) {
        callback?.({ error: err.message });
      }
    });

    // ─── Disconnect ──────────────────────────────────────
    socket.on('disconnect', () => {
      // End any active calls when user disconnects
      for (const [callId, call] of activeCalls) {
        if (call.callerId === userId || call.calleeId === userId) {
          activeCalls.delete(callId);
          const now = Date.now();
          const duration = call.startedAt ? Math.floor((now - call.startedAt) / 1000) : 0;
          try {
            db.prepare(`UPDATE call_history SET
              status = CASE WHEN status = 'answered' THEN 'answered' ELSE 'missed' END,
              ended_at = ?, duration = ? WHERE id = ?`
            ).run(now, duration, callId);
          } catch {}
          const otherUserId = call.callerId === userId ? call.calleeId : call.callerId;
          const otherSockets = onlineUsers.get(otherUserId);
          otherSockets?.forEach(sid => io.to(sid).emit('call:ended', { callId }));
        }
      }

      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(userId);
          messageRate.delete(userId);
          const lastSeen = Date.now();
          db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(lastSeen, userId);
          io.emit('user:offline', { userId, lastSeen });
        }
      }
    });
  });

  return { onlineUsers };
};

// Used by the scheduled-message cron to push only to offline recipients.
module.exports.isOnline = (userId) => onlineUsers.has(userId);
