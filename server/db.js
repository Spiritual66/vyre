const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'messaging.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    avatar TEXT DEFAULT NULL,
    about TEXT DEFAULT 'Hey there! I am using VYRE.',
    last_seen INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    name TEXT,
    is_group INTEGER DEFAULT 0,
    group_avatar TEXT DEFAULT NULL,
    description TEXT DEFAULT NULL,
    created_by TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS chat_members (
    chat_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT DEFAULT 'member',
    joined_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    PRIMARY KEY (chat_id, user_id),
    FOREIGN KEY (chat_id) REFERENCES chats(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    content TEXT,
    type TEXT DEFAULT 'text',
    file_url TEXT DEFAULT NULL,
    file_name TEXT DEFAULT NULL,
    file_size INTEGER DEFAULT NULL,
    reply_to TEXT DEFAULT NULL,
    forwarded_from TEXT DEFAULT NULL,
    is_starred INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (chat_id) REFERENCES chats(id),
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (reply_to) REFERENCES messages(id)
  );

  CREATE TABLE IF NOT EXISTS message_status (
    message_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT DEFAULT 'delivered',
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    PRIMARY KEY (message_id, user_id),
    FOREIGN KEY (message_id) REFERENCES messages(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS message_reactions (
    message_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    emoji TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    PRIMARY KEY (message_id, user_id),
    FOREIGN KEY (message_id) REFERENCES messages(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS statuses (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content TEXT,
    type TEXT DEFAULT 'text',
    file_url TEXT DEFAULT NULL,
    background TEXT DEFAULT '#075e54',
    font_size INTEGER DEFAULT 24,
    expires_at INTEGER NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS status_views (
    status_id TEXT NOT NULL,
    viewer_id TEXT NOT NULL,
    viewed_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    PRIMARY KEY (status_id, viewer_id),
    FOREIGN KEY (status_id) REFERENCES statuses(id),
    FOREIGN KEY (viewer_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS user_chat_settings (
    user_id TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    is_pinned INTEGER DEFAULT 0,
    is_archived INTEGER DEFAULT 0,
    is_muted INTEGER DEFAULT 0,
    mute_until INTEGER DEFAULT NULL,
    wallpaper TEXT DEFAULT NULL,
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    PRIMARY KEY (user_id, chat_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (chat_id) REFERENCES chats(id)
  );

  CREATE TABLE IF NOT EXISTS starred_messages (
    user_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    starred_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    PRIMARY KEY (user_id, message_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (message_id) REFERENCES messages(id)
  );

  CREATE TABLE IF NOT EXISTS blocked_users (
    blocker_id TEXT NOT NULL,
    blocked_id TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    PRIMARY KEY (blocker_id, blocked_id),
    FOREIGN KEY (blocker_id) REFERENCES users(id),
    FOREIGN KEY (blocked_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY,
    last_seen TEXT DEFAULT 'everyone',
    profile_photo TEXT DEFAULT 'everyone',
    about_visibility TEXT DEFAULT 'everyone',
    read_receipts INTEGER DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS call_history (
    id TEXT PRIMARY KEY,
    caller_id TEXT NOT NULL,
    callee_id TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'audio',
    status TEXT NOT NULL DEFAULT 'ringing',
    duration INTEGER DEFAULT 0,
    started_at INTEGER NOT NULL,
    ended_at INTEGER DEFAULT NULL,
    FOREIGN KEY (caller_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (callee_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS admin_audit_log (
    id TEXT PRIMARY KEY,
    admin_email TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    target_name TEXT,
    details TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS admin_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS admin_broadcasts (
    id TEXT PRIMARY KEY,
    admin_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS pinned_messages (
    chat_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    pinned_by TEXT NOT NULL,
    pinned_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    PRIMARY KEY (chat_id, message_id),
    FOREIGN KEY (chat_id) REFERENCES chats(id),
    FOREIGN KEY (message_id) REFERENCES messages(id),
    FOREIGN KEY (pinned_by) REFERENCES users(id)
  );
`);

// Migration: add columns that may not exist in older DB files
const migrations = [
  { table: 'chats', column: 'description', def: 'TEXT DEFAULT NULL' },
  { table: 'messages', column: 'file_name', def: 'TEXT DEFAULT NULL' },
  { table: 'messages', column: 'file_size', def: 'INTEGER DEFAULT NULL' },
  { table: 'messages', column: 'forwarded_from', def: 'TEXT DEFAULT NULL' },
  { table: 'messages', column: 'is_starred', def: 'INTEGER DEFAULT 0' },
  { table: 'messages', column: 'edited_at', def: 'INTEGER DEFAULT NULL' },
  { table: 'users', column: 'about', def: "TEXT DEFAULT 'Hey there! I am using VYRE.'" },
  { table: 'users', column: 'last_seen', def: "INTEGER DEFAULT (strftime('%s', 'now') * 1000)" },
  { table: 'user_settings', column: 'groups_visibility', def: "TEXT DEFAULT 'everyone'" },
  { table: 'user_settings', column: 'status_visibility', def: "TEXT DEFAULT 'everyone'" },
  { table: 'user_settings', column: 'disappearing_messages', def: 'INTEGER DEFAULT 0' },
  { table: 'users', column: 'is_banned', def: 'INTEGER DEFAULT 0' },
  { table: 'users', column: 'admin_note', def: 'TEXT DEFAULT NULL' },
];

for (const { table, column, def } of migrations) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!cols.find(c => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
      console.log(`Migration: added ${table}.${column}`);
    }
  } catch (e) {
    // ignore if column already exists
  }
}

module.exports = db;
