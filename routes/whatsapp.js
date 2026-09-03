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
// Merges GoWA's (fully paginated) chat list with client names/ids from
// ga_clients (matched by phone number), so the UI can show "Jane Doe"
// instead of a raw number for anyone already in the ledger. If numbers
// have been added on the Numbers tab (ga_whatsapp_numbers), the result is
// filtered down to just those numbers; an empty filter list means "show
// everything", so this is a no-op until the user opts in.
//
// Name resolution order per chat: ga_clients match > GoWA's own
// name/push_name > GoWA's synced contacts > a readable fallback (never a
// raw jid) — see lib/gowa.js#jidKind for why group/@lid chats don't have
// a phone number to key off of in the first place.
router.get('/chats', async (req, res, next) => {
  try {
    const [chats, clients, allowed, contacts] = await Promise.all([
      gowa.getChats(),
      db.getClients(),
      db.getWhatsappNumbers(),
      gowa.getContacts(),
    ]);
    const clientByPhone = new Map(
      clients
        .filter((c) => c.Number)
        .map((c) => [String(c.Number).replace(/[^\d]/g, ''), c])
    );
    const contactNameByPhone = new Map(contacts.map((c) => [c.phone, c.name]));
    const allowedSet = new Set(allowed.map((n) => n.Number));

    let merged = chats.map((c) => {
      const client = c.phone ? clientByPhone.get(c.phone) : null;
      const contactName = c.phone ? contactNameByPhone.get(c.phone) : null;
      let fallbackName;
      if (c.kind === 'group') fallbackName = 'Group chat';
      else if (c.kind === 'lid') fallbackName = 'Unknown number (privacy-protected)';
      else fallbackName = c.phone || 'Unknown';

      return {
        ...c,
        clientId: client ? client.UniqueID : null,
        clientName: client ? client.Name : null,
        name: c.name || contactName || fallbackName,
      };
    });

    if (allowedSet.size) {
      // Group/@lid chats never have a matchable phone number, so they're
      // excluded once a filter is set — there's no "number" to add them by.
      merged = merged.filter((c) => c.phone && allowedSet.has(c.phone));
    }

    res.json(merged);
  } catch (err) { next(err); }
});

// GET /api/whatsapp/chats/:jid/messages?limit=50&offset=0
// offset lets the thread view page further back into history ("load
// earlier messages") instead of being capped at the newest `limit`.
router.get('/chats/:jid/messages', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    res.json(await gowa.getChatMessages(req.params.jid, limit, offset));
  } catch (err) { next(err); }
});

// ─── Number filter (Numbers tab) ───────────────────────────────────────

// GET /api/whatsapp/numbers
router.get('/numbers', async (req, res, next) => {
  try {
    res.json(await db.getWhatsappNumbers());
  } catch (err) { next(err); }
});

// POST /api/whatsapp/numbers  { number, label? }
router.post('/numbers', async (req, res, next) => {
  try {
    res.status(201).json(await db.addWhatsappNumber(req.body || {}));
  } catch (err) { next(err); }
});

// DELETE /api/whatsapp/numbers/:id
router.delete('/numbers/:id', async (req, res, next) => {
  try {
    res.json(await db.deleteWhatsappNumber(req.params.id));
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
