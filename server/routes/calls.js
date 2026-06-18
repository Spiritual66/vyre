const express = require('express');
const auth = require('../middleware/auth');
const db = require('../db');

const router = express.Router();

// Get call history for the current user
router.get('/', auth, (req, res) => {
  const calls = db.prepare(`
    SELECT ch.*,
      u1.username AS caller_username, u1.avatar AS caller_avatar,
      u2.username AS callee_username, u2.avatar AS callee_avatar
    FROM call_history ch
    JOIN users u1 ON u1.id = ch.caller_id
    JOIN users u2 ON u2.id = ch.callee_id
    WHERE ch.caller_id = ? OR ch.callee_id = ?
    ORDER BY ch.started_at DESC
    LIMIT 100
  `).all(req.user.id, req.user.id);
  res.json(calls);
});

module.exports = router;
