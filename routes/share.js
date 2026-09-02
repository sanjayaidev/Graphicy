// routes/share.js
// PUBLIC routes — mounted in server.js WITHOUT requireAuth. Every response
// here must be safe to show to the client the token belongs to and to no
// one else. See lib/supabase.js#getSharedClientView for what's excluded.
const express = require('express');
const router = express.Router();
const db = require('../lib/supabase');

// GET /api/share/:token
router.get('/:token', async (req, res, next) => {
  try {
    const view = await db.getSharedClientView(req.params.token);
    if (!view) {
      return res.status(404).json({ error: 'This link is invalid, expired, or has been revoked.' });
    }
    res.json(view);
  } catch (err) { next(err); }
});

module.exports = router;
