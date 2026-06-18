# VYRE — Real-time Messaging App

A WhatsApp-style messaging application: 1:1 and group chat, voice/video calls
(WebRTC), status/stories, file sharing, reactions, replies, read receipts,
typing indicators, and AI writing tools.

- **Server** — Node.js, Express, Socket.io, better-sqlite3 (SQLite)
- **Client** — React + Vite + TypeScript + Tailwind (PWA)
- **Shells** — Electron (desktop) and Capacitor (iOS/Android)

## Prerequisites

- **Node.js 24.x** — the server's `better-sqlite3` native module is built against
  the Node 24 ABI. Other Node versions will fail to load the database.

## Setup

```bash
# Server
cd server
npm install
cp .env.example .env      # then fill in JWT_SECRET and (optionally) an AI key

# Client
cd ../client
npm install
```

## Running (development)

```bash
# Terminal 1 — backend (default port 3001)
cd server && npm run dev

# Terminal 2 — client (default port 5173, proxies /api → 3001)
cd client && npm run dev
```

Open http://localhost:5173.

### HTTPS (required for camera/mic across devices)

Browsers only expose camera/microphone (`getUserMedia`) in a secure context —
HTTPS or `localhost`. To make voice/video calls work from a phone or another
machine on your LAN, run both servers over TLS:

```bash
# generate a self-signed dev cert (once)
openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
  -keyout certs/dev-key.pem -out certs/dev-cert.pem \
  -subj "/CN=vyre-dev" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:<your-LAN-IP>"

# backend over HTTPS
cd server && PORT=4001 SSL_KEY=../certs/dev-key.pem SSL_CERT=../certs/dev-cert.pem \
  ALLOWED_ORIGINS=https://<your-LAN-IP>:5173 npm run dev

# client over HTTPS (set VITE_API_URL=https://<your-LAN-IP>:4001/api in client/.env.local)
cd client && VITE_HTTPS=1 VITE_PROXY_TARGET=https://<your-LAN-IP>:4001 npm run dev
```

## Configuration

Server environment variables (see [`server/.env.example`](server/.env.example)):

| Var | Purpose |
|-----|---------|
| `JWT_SECRET` | JWT signing secret (use a long random string) |
| `PORT` | Server port (default 3001) |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins (defaults to localhost dev) |
| `NODE_ENV` | `production` enables rate limiting and serves the built client |
| `SSL_KEY` / `SSL_CERT` | Paths to TLS PEM files to serve over HTTPS |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` / … | AI writing tools (any one provider; falls back automatically) |

## Deployment

See [`DEPLOY.md`](DEPLOY.md) and [`docker-compose.yml`](docker-compose.yml).

## Tests

```bash
node test-socket.js   # end-to-end socket/messaging smoke test (server must be running)
```
