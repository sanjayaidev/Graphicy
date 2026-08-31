// routes/auth.js
const express = require('express');
const router = express.Router();

router.post('/login', (req, res) => {
  const { password } = req.body;
  if (!password || password !== process.env.APP_PASSWORD) {
    return res.status(401).json({ error: 'Wrong password' });
  }
  res.cookie('session', 'authed', {
    httpOnly: true,
    signed: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
  res.json({ success: true });
});

router.post('/logout', (req, res) => {
  res.clearCookie('session');
  res.json({ success: true });
});

router.get('/session', (req, res) => {
  res.json({ authed: req.signedCookies && req.signedCookies.session === 'authed' });
});

module.exports = router;
