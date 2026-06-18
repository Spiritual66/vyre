const fs = require('fs');
const path = require('path');
const { UPLOADS_DIR } = require('./paths');
['avatars', 'media', 'statuses'].forEach(sub => {
  const full = path.join(UPLOADS_DIR, sub);
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
});
