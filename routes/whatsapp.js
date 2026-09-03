// routes/whatsapp.js
const express = require('express');
const router = express.Router();
const gowa = require('../lib/gowa');
const ai = require('../lib/alibaba');
const db = require('../lib/supabase');

// GET /api/whatsapp/status
router.get('/status', async (req, res, next) => {
  try {
    res.json(await gowa.getStatus());
  } catch (err) { next(err); }
});

// GET /api/whatsapp/chats
// Merges GoWA's chat list with client names/ids from ga_clients (matched
// by phone number), so the UI can show "Jane Doe" instead of a raw number
// for anyone already in the ledger.
router.get('/chats', async (req, res, next) => {
  try {
    const [chats, clients] = await Promise.all([gowa.getChats(), db.getClients()]);
    const byPhone = new Map(
      clients
        .filter((c) => c.Number)
        .map((c) => [String(c.Number).replace(/[^\d]/g, ''), c])
    );
    const merged = chats.map((c) => {
      const phone = gowa.jidToPhone(c.jid);
      const client = byPhone.get(phone);
      return {
        ...c,
        phone,
        clientId: client ? client.UniqueID : null,
        clientName: client ? client.Name : null,
      };
    });
    res.json(merged);
  } catch (err) { next(err); }
});

// GET /api/whatsapp/chats/:jid/messages?limit=50
router.get('/chats/:jid/messages', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    res.json(await gowa.getChatMessages(req.params.jid, limit));
  } catch (err) { next(err); }
});

// POST /api/whatsapp/send  { phone, message }
router.post('/send', async (req, res, next) => {
  try {
    const { phone, message } = req.body || {};
    if (!phone || !message || !message.trim()) {
      const e = new Error('phone and message are required');
      e.status = 400;
      throw e;
    }
    res.json(await gowa.sendMessage(phone, message));
  } catch (err) { next(err); }
});

// POST /api/whatsapp/translate  { text, target_lang, source_lang? }
// target_lang / source_lang are ISO codes (see LANGUAGE_NAMES in
// lib/alibaba.js) — omit source_lang to auto-detect.
router.post('/translate', async (req, res, next) => {
  try {
    const { text, target_lang, source_lang } = req.body || {};
    if (!text || !text.trim() || !target_lang) {
      const e = new Error('text and target_lang are required');
      e.status = 400;
      throw e;
    }
    const translated = await ai.translateText(text, target_lang, source_lang);
    res.json({ translated, target_lang, source_lang: source_lang || null });
  } catch (err) { next(err); }
});

// GET /api/whatsapp/languages — list of supported languages for the UI's
// language picker.
router.get('/languages', (req, res) => {
  res.json(
    Object.entries(ai.LANGUAGE_NAMES).map(([code, name]) => ({ code, name }))
  );
});

module.exports = router;
