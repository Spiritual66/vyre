const express = require('express');
const auth = require('../middleware/auth');
const db = require('../db');
const { publicKey } = require('../push');

const router = express.Router();

// Public key the browser needs to create a subscription.
router.get('/vapid-public-key', (req, res) => res.json({ key: publicKey }));

router.post('/subscribe', auth, (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys || !keys.p256dh || !keys.auth) return res.status(400).json({ error: 'Invalid subscription' });
  db.prepare('INSERT OR REPLACE INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(endpoint, req.user.id, keys.p256dh, keys.auth, Date.now());
  res.json({ success: true });
});

router.post('/unsubscribe', auth, (req, res) => {
  const { endpoint } = req.body || {};
  if (endpoint) db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
  res.json({ success: true });
});

module.exports = router;
