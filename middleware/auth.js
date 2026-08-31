// middleware/auth.js
// Single-password auth via a signed cookie. No DB, no user table — solo use only.

function requireAuth(req, res, next) {
  if (req.signedCookies && req.signedCookies.session === 'authed') {
    return next();
  }
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  return res.redirect('/login.html');
}

module.exports = { requireAuth };
