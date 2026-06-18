const fs = require('fs');
const path = require('path');
['uploads/avatars', 'uploads/media', 'uploads/statuses'].forEach(dir => {
  const full = path.join(__dirname, dir);
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
});
