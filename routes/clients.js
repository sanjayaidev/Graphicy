// routes/clients.js
const express = require('express');
const router = express.Router();
const db = require('../lib/supabase');

// GET /api/clients
router.get('/', async (req, res, next) => {
  try {
    res.json(await db.getClients());
  } catch (err) { next(err); }
});

// GET /api/clients/:id
router.get('/:id', async (req, res, next) => {
  try {
    res.json(await db.getClient(req.params.id));
  } catch (err) { next(err); }
});

// POST /api/clients
router.post('/', async (req, res, next) => {
  try {
    res.status(201).json(await db.addClient(req.body));
  } catch (err) { next(err); }
});

// PUT /api/clients/:id
router.put('/:id', async (req, res, next) => {
  try {
    res.json(await db.updateClient(req.params.id, req.body));
  } catch (err) { next(err); }
});

// DELETE /api/clients/:id
router.delete('/:id', async (req, res, next) => {
  try {
    res.json(await db.deleteClient(req.params.id));
  } catch (err) { next(err); }
});

// GET /api/clients/:id/tasks
router.get('/:id/tasks', async (req, res, next) => {
  try {
    res.json(await db.getTasks(req.params.id));
  } catch (err) { next(err); }
});

// GET /api/clients/:id/payments
router.get('/:id/payments', async (req, res, next) => {
  try {
    res.json(await db.getPayments(req.params.id));
  } catch (err) { next(err); }
});

// GET /api/clients/:id/history
router.get('/:id/history', async (req, res, next) => {
  try {
    res.json(await db.getHistory(req.params.id));
  } catch (err) { next(err); }
});

// GET /api/clients/:id/share-links
router.get('/:id/share-links', async (req, res, next) => {
  try {
    res.json(await db.listShareLinks(req.params.id));
  } catch (err) { next(err); }
});

// POST /api/clients/:id/share-links  { label?, expiresInDays? }
// Returns the raw token ONCE — the caller must copy it now, it is never
// retrievable again after this response.
router.post('/:id/share-links', async (req, res, next) => {
  try {
    const { token, link } = await db.createShareLink(req.params.id, req.body || {});
    res.status(201).json({ token, link });
  } catch (err) { next(err); }
});

// DELETE /api/clients/:id/share-links/:linkId
router.delete('/:id/share-links/:linkId', async (req, res, next) => {
  try {
    res.json(await db.revokeShareLink(req.params.linkId));
  } catch (err) { next(err); }
});

module.exports = router;
