// routes/tasks.js
const express = require('express');
const router = express.Router();
const db = require('../lib/supabase');

// GET /api/tasks — every task across every client, with ClientName attached
// so the Tasks/Dashboard/Status tabs can display them without a second
// lookup.
router.get('/', async (req, res, next) => {
  try {
    const [clients, tasks] = await Promise.all([db.getClients(), db.getTasks()]);

    const clientNameById = new Map(
      clients
        .filter(c => c.UniqueID !== undefined && c.UniqueID !== null && c.UniqueID !== '')
        .map(c => [String(c.UniqueID), c.Name])
    );

    const enriched = tasks.map(t => ({
      ...t,
      ClientName: clientNameById.get(String(t.ClientID)) || '',
    }));

    res.json(enriched);
  } catch (err) { next(err); }
});

// POST /api/tasks  { clientId, description, dueDate, status, paymentStatus, amount }
router.post('/', async (req, res, next) => {
  try {
    res.status(201).json(await db.addTask(req.body));
  } catch (err) { next(err); }
});

// PUT /api/tasks/:id  { description, dueDate, status, paymentStatus, amount }
router.put('/:id', async (req, res, next) => {
  try {
    res.json(await db.updateTask(req.params.id, req.body));
  } catch (err) { next(err); }
});

// DELETE /api/tasks/:id
router.delete('/:id', async (req, res, next) => {
  try {
    res.json(await db.deleteTask(req.params.id));
  } catch (err) { next(err); }
});

module.exports = router;
