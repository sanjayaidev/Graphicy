// routes/clients.js
const express = require('express');
const router = express.Router();
const { callAppsScript } = require('../lib/appsScript');

// GET /api/clients
router.get('/', async (req, res, next) => {
  try {
    const data = await callAppsScript('getClients');
    res.json(data);
  } catch (err) { next(err); }
});

// GET /api/clients/:id
router.get('/:id', async (req, res, next) => {
  try {
    const data = await callAppsScript('getClient', { id: req.params.id });
    res.json(data);
  } catch (err) { next(err); }
});

// POST /api/clients
router.post('/', async (req, res, next) => {
  try {
    const data = await callAppsScript('addClient', req.body, 'POST');
    res.status(201).json(data);
  } catch (err) { next(err); }
});

// PUT /api/clients/:id
router.put('/:id', async (req, res, next) => {
  try {
    const data = await callAppsScript('updateClient', { id: req.params.id, ...req.body }, 'POST');
    res.json(data);
  } catch (err) { next(err); }
});

// DELETE /api/clients/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const data = await callAppsScript('deleteClient', { id: req.params.id }, 'POST');
    res.json(data);
  } catch (err) { next(err); }
});

// GET /api/clients/:id/tasks
router.get('/:id/tasks', async (req, res, next) => {
  try {
    const data = await callAppsScript('getTasks', { clientId: req.params.id });
    res.json(data);
  } catch (err) { next(err); }
});

// GET /api/clients/:id/payments
router.get('/:id/payments', async (req, res, next) => {
  try {
    const data = await callAppsScript('getPayments', { clientId: req.params.id });
    res.json(data);
  } catch (err) { next(err); }
});

// GET /api/clients/:id/history
router.get('/:id/history', async (req, res, next) => {
  try {
    const data = await callAppsScript('getHistory', { clientId: req.params.id });
    res.json(data);
  } catch (err) { next(err); }
});

module.exports = router;
