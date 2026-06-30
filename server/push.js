const webpush = require('web-push');
const db = require('./db');

// VAPID keys: use env (recommended — stable), else reuse/generate-and-persist
// in admin_settings so push works without manual config.
function resolveVapid() {
  let pub = process.env.VAPID_PUBLIC_KEY;
  let priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    const row = db.prepare("SELECT value FROM admin_settings WHERE key = 'vapid_keys'").get();
    if (row) { const k = JSON.parse(row.value); pub = k.publicKey; priv = k.privateKey; }
    else {
      const k = webpush.generateVAPIDKeys();
      db.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('vapid_keys', ?)").run(JSON.stringify(k));
      pub = k.publicKey; priv = k.privateKey;
      console.warn('[push] generated + persisted VAPID keys. Set VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY env for keys stable across DB resets.');
    }
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@vyre.app', pub, priv);
  return pub;
}

const publicKey = resolveVapid();

// Fire-and-forget push to all of a user's subscriptions; prunes dead ones.
async function sendToUser(userId, payload) {
  const subs = db.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?').all(userId);
  if (!subs.length) return;
  const body = JSON.stringify(payload);
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
    } catch (e) {
      if (e && (e.statusCode === 404 || e.statusCode === 410)) {
        db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(s.endpoint);
      }
    }
  }));
}

module.exports = { publicKey, sendToUser };
