# Deployment Guide

## 1. PWA — Install on Any Device via Browser (Android, iOS, Desktop)

The app ships as a Progressive Web App. Users can install it from any browser:

- **Android Chrome**: tap the address bar menu → "Add to Home Screen"
- **iOS Safari**: tap Share → "Add to Home Screen"
- **Desktop Chrome/Edge**: click the install icon in the address bar

### Build & deploy the web app

```bash
cd client
npm run build          # outputs to client/dist/
```

Deploy `client/dist/` to any static host (Vercel, Netlify, Cloudflare Pages) and your
backend server separately, then set `VITE_API_URL` at build time:

```bash
VITE_API_URL=https://api.your-domain.com/api npm run build
```

---

## 2. Docker — Self-hosted (all platforms)

Runs both backend + frontend in one container.

```bash
# Copy env example and set your secrets
cp server/.env.example server/.env
# Edit server/.env with your JWT_SECRET and ALLOWED_ORIGINS

# Build and start
docker compose up -d --build

# App is now at http://localhost:3001
```

Production with a custom domain:
```bash
PORT=80 JWT_SECRET=your_secret ALLOWED_ORIGINS=https://your-domain.com docker compose up -d --build
```

---

## 3. Android (native APK/AAB via Capacitor)

Requirements: Android Studio + Android SDK

```bash
cd client

# 1. Build the web app pointing to your deployed backend
VITE_API_URL=https://api.your-domain.com/api npm run build

# 2. Add Android platform (first time only)
npx cap add android

# 3. Sync web assets to native project
npx cap sync android

# 4. Open in Android Studio to build/sign/release
npx cap open android
```

In Android Studio: Build → Generate Signed Bundle / APK

---

## 4. iOS (native IPA via Capacitor)

Requirements: macOS + Xcode 15+

```bash
cd client

# 1. Build the web app
VITE_API_URL=https://api.your-domain.com/api npm run build

# 2. Add iOS platform (first time only)
npx cap add ios

# 3. Sync
npx cap sync ios

# 4. Open in Xcode
npx cap open ios
```

In Xcode: Product → Archive → Distribute App

---

## 5. Desktop (Windows / macOS / Linux via Electron)

```bash
# Install Electron deps
cd electron
npm install

# Development (runs Vite dev server + Electron)
cd ../client && npm run dev          # terminal 1
cd ../electron && npm run dev        # terminal 2

# Build distributable
cd ../client && npm run build        # build frontend first
cd ../electron

# Windows (.exe installer)
npm run dist:win

# macOS (.dmg)
npm run dist:mac

# Linux (.AppImage)
npm run dist:linux
```

Output goes to `dist-electron/`.

---

## 6. iPad

iPads use the same iOS build from step 4. Capacitor automatically handles iPad
layout. No additional steps needed.

---

## Environment Variables

### Server (`server/.env`)
| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | `change_me_in_production...` | JWT signing key — **must change in prod** |
| `PORT` | `3001` | Server listen port |
| `NODE_ENV` | — | Set to `production` to serve built frontend |
| `ALLOWED_ORIGINS` | localhost dev origins | Comma-separated CORS origins |

### Client (build-time)
| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `/api` (proxied) | Full API URL for mobile/desktop builds |
