// routes/tasks.js
const express = require('express');
const router = express.Router();
const { callAppsScript } = require('../lib/appsScript');

// GET /api/tasks — every task across every client, with ClientID/ClientName
// attached so the Tasks/Dashboard/Status tabs can filter and display them
// without needing a client-scoped page. The Apps Script backend only exposes
// tasks per-client (getTasks?clientId=...), so this aggregates that here
// rather than requiring changes to the Apps Script (Code.gs) side.
router.get('/', async (req, res, next) => {
  try {
    const clients = await callAppsScript('getClients');
    if (!Array.isArray(clients)) return res.json([]);

    const perClient = await Promise.all(clients.map(async (c) => {
      try {
        const tasks = await callAppsScript('getTasks', { clientId: c.UniqueID });
        if (!Array.isArray(tasks)) return [];
        return tasks.map(t => ({ ...t, ClientID: c.UniqueID, ClientName: c.Name }));
      } catch (err) {
        return []; // don't let one bad client blow up the whole list
      }
    }));

    res.json(perClient.flat());
  } catch (err) { next(err); }
});

// POST /api/tasks  { clientId, description, dueDate, status }
router.post('/', async (req, res, next) => {
  try {
    const data = await callAppsScript('addTask', req.body, 'POST');
    res.status(201).json(data);
  } catch (err) { next(err); }
});

// PUT /api/tasks/:id  { description, dueDate, status }
router.put('/:id', async (req, res, next) => {
  try {
    const data = await callAppsScript('updateTask', { taskId: req.params.id, ...req.body }, 'POST');
    res.json(data);
  } catch (err) { next(err); }
});

// DELETE /api/tasks/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const data = await callAppsScript('deleteTask', { taskId: req.params.id }, 'POST');
    res.json(data);
  } catch (err) { next(err); }
});

module.exports = router;
