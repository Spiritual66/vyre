import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'node:fs'

// Opt-in HTTPS for the dev server. Set VITE_HTTPS=1 (and optionally
// VITE_SSL_KEY / VITE_SSL_CERT) to serve over TLS + expose on the LAN, so
// camera/mic work when the app is opened from a phone or another machine.
// getUserMedia is blocked by browsers on non-localhost http:// origins.
const httpsEnabled = !!process.env.VITE_HTTPS
const httpsConfig = httpsEnabled
  ? {
      key: fs.readFileSync(process.env.VITE_SSL_KEY || '../certs/dev-key.pem'),
      cert: fs.readFileSync(process.env.VITE_SSL_CERT || '../certs/dev-cert.pem'),
    }
  : undefined

export default defineConfig({
  // Base path for asset URLs. Defaults to '/' (custom domain or local).
  // GitHub Pages project sites (https://<user>.github.io/vyre/) need '/vyre/'
  // — the Pages workflow sets VITE_BASE accordingly.
  base: process.env.VITE_BASE || '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['whatsapp.svg', 'apple-touch-icon.png', 'icon-*.png'],
      manifest: false, // use public/manifest.json directly
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 365, maxEntries: 30 },
            },
          },
          {
            urlPattern: /\/uploads\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'uploads-cache',
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 30, maxEntries: 200 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    host: httpsEnabled,        // expose on LAN (0.0.0.0) when running HTTPS
    https: httpsConfig,
    proxy: {
      // Override with VITE_PROXY_TARGET when the backend isn't on 3001
      // (e.g. that port is taken by the Db2 IDE extension).
      '/api': process.env.VITE_PROXY_TARGET || 'http://localhost:3001',
      '/uploads': process.env.VITE_PROXY_TARGET || 'http://localhost:3001',
    },
  },
})
