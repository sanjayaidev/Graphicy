// routes/payments.js
const express = require('express');
const router = express.Router();
const db = require('../lib/supabase');

// GET /api/payments — every payment across every client, with ClientName
// attached, for the Status tab and dashboards.
router.get('/', async (req, res, next) => {
  try {
    const [clients, payments] = await Promise.all([db.getClients(), db.getPayments()]);

    const clientNameById = new Map(
      clients
        .filter(c => c.UniqueID !== undefined && c.UniqueID !== null && c.UniqueID !== '')
        .map(c => [String(c.UniqueID), c.Name])
    );

    const enriched = payments.map(p => ({
      ...p,
      ClientName: clientNameById.get(String(p.ClientID)) || '',
    }));

    res.json(enriched);
  } catch (err) { next(err); }
});

// POST /api/payments  { clientId, amount, date, status, method, notes }
router.post('/', async (req, res, next) => {
  try {
    res.status(201).json(await db.addPayment(req.body));
  } catch (err) { next(err); }
});

// PUT /api/payments/:id  { amount, date, status, method, notes }
router.put('/:id', async (req, res, next) => {
  try {
    res.json(await db.updatePayment(req.params.id, req.body));
  } catch (err) { next(err); }
});

// DELETE /api/payments/:id
router.delete('/:id', async (req, res, next) => {
  try {
    res.json(await db.deletePayment(req.params.id));
  } catch (err) { next(err); }
});

module.exports = router;
