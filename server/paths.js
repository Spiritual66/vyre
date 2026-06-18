const path = require('path');

// Centralized data locations so the SQLite DB and uploaded files can live on a
// persistent disk in production (e.g. a Render disk mounted at /data) while
// defaulting to the server folder for local development.
//
//   DATA_DIR     – base dir for persistent data (default: this server folder)
//   UPLOADS_DIR  – where uploaded media/avatars/statuses are stored
//   DB_PATH      – SQLite database file path
const DATA_DIR = process.env.DATA_DIR || __dirname;
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(DATA_DIR, 'uploads');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'messaging.db');

module.exports = { DATA_DIR, UPLOADS_DIR, DB_PATH };
