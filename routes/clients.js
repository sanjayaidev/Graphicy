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

module.exports = router;
