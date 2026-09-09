// routes/notes.js
const express = require('express');
const router = express.Router();
const db = require('../lib/supabase');

// GET /api/notes — every note, newest first, for the Notes tab.
router.get('/', async (req, res, next) => {
  try {
    res.json(await db.getNotes());
  } catch (err) { next(err); }
});

// POST /api/notes  { text, status }
router.post('/', async (req, res, next) => {
  try {
    res.status(201).json(await db.addNote(req.body));
  } catch (err) { next(err); }
});

// PUT /api/notes/:id  { text, status }
router.put('/:id', async (req, res, next) => {
  try {
    res.json(await db.updateNote(req.params.id, req.body));
  } catch (err) { next(err); }
});

// DELETE /api/notes/:id
router.delete('/:id', async (req, res, next) => {
  try {
    res.json(await db.deleteNote(req.params.id));
  } catch (err) { next(err); }
});

module.exports = router;
