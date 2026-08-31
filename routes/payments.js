// routes/payments.js
const express = require('express');
const router = express.Router();
const { callAppsScript } = require('../lib/appsScript');

// GET /api/payments — every payment across every client, with ClientID/
// ClientName attached, for the Status tab and dashboards. Aggregated the
// same way as GET /api/tasks (see routes/tasks.js for why).
router.get('/', async (req, res, next) => {
  try {
    const clients = await callAppsScript('getClients');
    if (!Array.isArray(clients)) return res.json([]);

    const perClient = await Promise.all(clients.map(async (c) => {
      try {
        const payments = await callAppsScript('getPayments', { clientId: c.UniqueID });
        if (!Array.isArray(payments)) return [];
        return payments.map(p => ({ ...p, ClientID: c.UniqueID, ClientName: c.Name }));
      } catch (err) {
        return [];
      }
    }));

    res.json(perClient.flat());
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
