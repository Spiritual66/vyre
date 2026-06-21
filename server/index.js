require('dotenv').config();
const crypto = require('crypto');
const db = require('./db');

// Resolve a JWT secret without a hard fail or the insecure default:
//   1) use JWT_SECRET from the environment (recommended — stable & shared), else
//   2) reuse a random secret persisted in the DB (survives restarts), else
//   3) generate one on first boot and persist it.
// This never runs on the known default secret, so it's secure either way.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'vyre_dev_secret_change_in_production') {
  try {
    let row = db.prepare("SELECT value FROM admin_settings WHERE key = 'jwt_secret'").get();
    if (!row) {
      const generated = crypto.randomBytes(48).toString('base64url');
      db.prepare("INSERT INTO admin_settings (key, value) VALUES ('jwt_secret', ?)").run(generated);
      row = { value: generated };
      console.warn('[auth] JWT_SECRET not set — generated and persisted a strong random secret. Set JWT_SECRET in the environment for a stable, shared secret across instances.');
    }
    process.env.JWT_SECRET = row.value;
  } catch (e) {
    console.error('[FATAL] Could not resolve a JWT secret:', e.message);
    process.exit(1);
  }
}

const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const cors = require('cors');
const path = require('path');
const { Server } = require('socket.io');

const app = express();

// Trust the first proxy hop (Render/Heroku/etc. load balancer) so req.ip is the
// real client IP from X-Forwarded-For. Without this, rate limiting keys every
// request to the proxy's IP — i.e. one shared global limit for all users.
app.set('trust proxy', 1);

// Opt-in HTTPS: set SSL_KEY and SSL_CERT (paths to PEM files) to serve over TLS.
// Needed so camera/mic (getUserMedia) work when the app is opened from another
// device on the LAN — browsers only expose media APIs in a secure context.
// When unset, behaviour is unchanged (plain HTTP).
let server;
if (process.env.SSL_KEY && process.env.SSL_CERT) {
  server = https.createServer(
    { key: fs.readFileSync(process.env.SSL_KEY), cert: fs.readFileSync(process.env.SSL_CERT) },
    app
  );
  console.log('[TLS] HTTPS enabled');
} else {
  server = http.createServer(app);
}

const DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
];

// ALLOWED_ORIGINS env var: comma-separated list of origins
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : DEV_ORIGINS;

// Render injects the public URL — auto-allow it so the same-origin client
// and Socket.io handshake aren't rejected by CORS on a fresh deploy.
if (process.env.RENDER_EXTERNAL_URL && !allowedOrigins.includes(process.env.RENDER_EXTERNAL_URL)) {
  allowedOrigins.push(process.env.RENDER_EXTERNAL_URL);
}

const corsOptions = {
  origin(origin, cb) {
    // Allow requests with no origin (mobile apps, Electron file://, Postman)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: ${origin} not allowed`));
  },
  credentials: true,
};

const io = new Server(server, { cors: corsOptions });

app.use(cors(corsOptions));
app.use(express.json());
const { UPLOADS_DIR } = require('./paths');
app.use('/uploads', express.static(UPLOADS_DIR, {
  setHeaders: (res) => {
    // User-uploaded content: prevent MIME sniffing into an executable type.
    res.setHeader('X-Content-Type-Options', 'nosniff');
  },
}));

require('./uploads-init');

// Health check — used by Render / Docker to verify the service is up.
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// Maintenance mode — checked before all non-admin routes
app.use((req, res, next) => {
  if (req.path.startsWith('/api/admin') || req.path.startsWith('/api/auth/admin-login')) return next();
  try {
    const row = db.prepare("SELECT value FROM admin_settings WHERE key = 'maintenanceMode'").get();
    if (row && row.value === 'true') return res.status(503).json({ error: 'Server is under maintenance. Please try again later.' });
  } catch {}
  next();
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/chats', require('./routes/chats'));
app.use('/api/messages', require('./routes/messages')(io));
app.use('/api/statuses', require('./routes/status')(io));
app.use('/api/calls', require('./routes/calls'));
app.use('/api/ai', require('./routes/ai').router);
app.use('/api/admin', require('./routes/admin')(io));

require('./socket/handlers')(io);

// Background data-lifecycle sweeps: disappearing messages + expired statuses.
require('./jobs/cleanup')(io);

// Serve built frontend in production (used by Docker, Electron)
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;
const PROTO = process.env.SSL_KEY && process.env.SSL_CERT ? 'https' : 'http';
server.listen(PORT, () => console.log(`Server running on ${PROTO}://localhost:${PORT}`));
