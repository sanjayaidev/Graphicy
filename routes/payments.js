// routes/payments.js
const express = require('express');
const router = express.Router();
const { callAppsScript } = require('../lib/appsScript');

// GET /api/payments — every payment across every client, with ClientID/
// ClientName attached, for the Status tab and dashboards. Aggregated the
// same way as GET /api/tasks (see routes/tasks.js for why).
// GET /api/payments — every payment across every client, with ClientName
// attached, for the Status tab and dashboards. Uses each payment's own
// stored ClientID (never overwritten) and joins in the client's Name.
router.get('/', async (req, res, next) => {
  try {
    const [clients, payments] = await Promise.all([
      callAppsScript('getClients'),
      callAppsScript('getPayments'),
    ]);

    const clientNameById = new Map(
      (Array.isArray(clients) ? clients : [])
        .filter(c => c.UniqueID !== undefined && c.UniqueID !== null && c.UniqueID !== '')
        .map(c => [String(c.UniqueID), c.Name])
    );

    const enriched = (Array.isArray(payments) ? payments : []).map(p => ({
      ...p,
      ClientName: clientNameById.get(String(p.ClientID)) || '',
    }));

    res.json(enriched);
  } catch (err) { next(err); }
});

// POST /api/payments  { clientId, amount, date, status, method, notes }
router.post('/', async (req, res, next) => {
  try {
    const data = await callAppsScript('addPayment', req.body, 'POST');
    res.status(201).json(data);
  } catch (err) { next(err); }
});

// PUT /api/payments/:id  { amount, date, status, method, notes }
router.put('/:id', async (req, res, next) => {
  try {
    const data = await callAppsScript('updatePayment', { paymentId: req.params.id, ...req.body }, 'POST');
    res.json(data);
  } catch (err) { next(err); }
});

// DELETE /api/payments/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const data = await callAppsScript('deletePayment', { paymentId: req.params.id }, 'POST');
    res.json(data);
  } catch (err) { next(err); }
});

module.exports = router;
