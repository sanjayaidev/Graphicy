// routes/followups.js
const express = require('express');
const router = express.Router();
const db = require('../lib/supabase');

// GET /api/followups — every follow-up across every client, with
// ClientName attached, for the Calendar tab.
router.get('/', async (req, res, next) => {
  try {
    const [clients, followups] = await Promise.all([db.getClients(), db.getFollowups()]);

    const clientNameById = new Map(
      clients
        .filter(c => c.UniqueID !== undefined && c.UniqueID !== null && c.UniqueID !== '')
        .map(c => [String(c.UniqueID), c.Name])
    );

    const enriched = followups.map(f => ({
      ...f,
      ClientName: clientNameById.get(String(f.ClientID)) || '',
    }));

    res.json(enriched);
  } catch (err) { next(err); }
});

// POST /api/followups  { clientId, scheduledAt, purpose }
// scheduledAt must be the current time or later — enforced in lib/supabase.js.
router.post('/', async (req, res, next) => {
  try {
    res.status(201).json(await db.addFollowup(req.body));
  } catch (err) { next(err); }
});

// PUT /api/followups/:id  { scheduledAt, purpose, status }
router.put('/:id', async (req, res, next) => {
  try {
    res.json(await db.updateFollowup(req.params.id, req.body));
  } catch (err) { next(err); }
});

// DELETE /api/followups/:id
router.delete('/:id', async (req, res, next) => {
  try {
    res.json(await db.deleteFollowup(req.params.id));
  } catch (err) { next(err); }
});

module.exports = router;
