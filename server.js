// server.js
require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const { requireAuth } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const taskRoutes = require('./routes/tasks');
const paymentRoutes = require('./routes/payments');
const followupRoutes = require('./routes/followups');
const shareRoutes = require('./routes/share');

const app = express();

app.use(express.json());
app.use(cookieParser(process.env.SESSION_SECRET || 'dev-secret-change-me'));

// Auth routes (no auth required to reach these)
app.use('/api/auth', authRoutes);

// Public, read-only share endpoint — deliberately mounted WITHOUT
// requireAuth. See routes/share.js and lib/supabase.js#getSharedClientView.
app.use('/api/share', shareRoutes);

// Everything else under /api requires login
app.use('/api/clients', requireAuth, clientRoutes);
app.use('/api/tasks', requireAuth, taskRoutes);
app.use('/api/payments', requireAuth, paymentRoutes);
app.use('/api/followups', requireAuth, followupRoutes);

// Static frontend
app.use(express.static(path.join(__dirname, 'public')));

// Page routes: protect everything except login.html and the public share page
app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});
app.get('/client.html', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'client.html'));
});
app.get('/dashboard.html', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});
// share.html is intentionally NOT behind requireAuth — it's the page a
// client opens from their share link and authenticates via the token in
// the URL instead of a login cookie.

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

// Only listen directly when run locally; Vercel imports the app instead.
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`ClientPM running on http://localhost:${PORT}`));
}

module.exports = app;
