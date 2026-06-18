require('dotenv').config();

// Fail fast in production if using the insecure default JWT secret
if (
  process.env.NODE_ENV === 'production' &&
  (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'vyre_dev_secret_change_in_production')
) {
  console.error('[FATAL] JWT_SECRET is not set or is the default value. Set a strong secret before deploying.');
  process.exit(1);
}

const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const cors = require('cors');
const path = require('path');
const { Server } = require('socket.io');

const app = express();

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
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res) => {
    // User-uploaded content: prevent MIME sniffing into an executable type.
    res.setHeader('X-Content-Type-Options', 'nosniff');
  },
}));

require('./uploads-init');

// Maintenance mode — checked before all non-admin routes
const db = require('./db');
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
