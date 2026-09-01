// routes/tasks.js
const express = require('express');
const router = express.Router();
const { callAppsScript } = require('../lib/appsScript');

// GET /api/tasks — every task across every client, with ClientName attached
// so the Tasks/Dashboard/Status tabs can display them without a second
// lookup. Uses each task's own stored ClientID (never overwritten) and
// just joins in the client's Name for display.
router.get('/', async (req, res, next) => {
  try {
    const [clients, tasks] = await Promise.all([
      callAppsScript('getClients'),
      callAppsScript('getTasks'),
    ]);

    const clientNameById = new Map(
      (Array.isArray(clients) ? clients : [])
        .filter(c => c.UniqueID !== undefined && c.UniqueID !== null && c.UniqueID !== '')
        .map(c => [String(c.UniqueID), c.Name])
    );

    const enriched = (Array.isArray(tasks) ? tasks : []).map(t => ({
      ...t,
      ClientName: clientNameById.get(String(t.ClientID)) || '',
    }));

    res.json(enriched);
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
