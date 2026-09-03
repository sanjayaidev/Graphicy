// lib/gowa.js
// Thin wrapper around a self-hosted GoWA instance (aldinokemal/go-whatsapp-
// web-multidevice), currently running v7.8.2 at graphicywa.onrender.com.
//
// v7.8.2 is pre-multi-device: there is exactly one linked WhatsApp number
// per GoWA instance, so none of the v8 `X-Device-Id` / `/devices/:id`
// scoping applies here — every call just hits the plain endpoint.
//
// Auth: GoWA's Basic Auth (`--basic-auth=user:pass`), if the instance was
// started with one configured. Set GOWA_BASIC_AUTH="user:pass" to enable
// it; leave unset if the instance has no Basic Auth configured.

const GOWA_BASE_URL = (process.env.GOWA_BASE_URL || '').replace(/\/+$/, '');
const GOWA_BASIC_AUTH = process.env.GOWA_BASIC_AUTH || ''; // "user:pass"

function assertConfigured() {
  if (!GOWA_BASE_URL) {
    const e = new Error('GOWA_BASE_URL is not configured (see .env.example)');
    e.status = 500;
    throw e;
  }
}

function authHeader() {
  if (!GOWA_BASIC_AUTH) return {};
  const token = Buffer.from(GOWA_BASIC_AUTH).toString('base64');
  return { Authorization: `Basic ${token}` };
}

// Accepts a bare number ("14155551234"), a number with symbols
// ("+1 (415) 555-1234"), or an already-JID'd number ("14155551234@s.whatsapp.net")
// and always returns the JID form GoWA expects.
function toJid(phone) {
  if (!phone) return phone;
  const s = String(phone).trim();
  if (s.includes('@')) return s;
  const digits = s.replace(/[^\d]/g, '');
  return `${digits}@s.whatsapp.net`;
}

// Strips the JID suffix back down to a bare number, for display / matching
// against ga_clients.number. Only meaningful for @s.whatsapp.net JIDs —
// see jidKind() below for why @g.us and @lid JIDs are NOT phone numbers.
function jidToPhone(jid) {
  if (!jid) return '';
  return String(jid).split('@')[0];
}

// WhatsApp JIDs come in a few shapes, and only one of them is an actual
// phone number:
//   - "<digits>@s.whatsapp.net"  — a normal 1:1 chat; the digits ARE the phone number.
//   - "<digits>@g.us"            — a group chat; the digits are a group id, not anyone's number.
//   - "<digits>@lid"             — a "linked ID": WhatsApp's number-privacy
//     feature swaps the real phone number out for an opaque id in some 1:1
//     chats. The digits are NOT the contact's phone number and there is no
//     API call that reverses this — WhatsApp does that on purpose. The chat
//     is still real and still messageable via its jid, it just can't be
//     matched against a phone number (for client-matching or the numbers
//     filter) until the contact is resolved some other way (e.g. it's in
//     GoWA's synced contacts, or you already have it saved as a client).
function jidKind(jid) {
  const s = String(jid || '');
  if (s.endsWith('@g.us')) return 'group';
  if (s.endsWith('@lid')) return 'lid';
  if (s.endsWith('@s.whatsapp.net')) return 'user';
  return 'other';
}

// GET /user/my/contacts — GoWA's synced address book. Chats often come
// back from /chats with an empty name (WhatsApp only sends a push_name
// once, and GoWA doesn't always have it cached for older chats), but the
// contact list usually has the saved name for anyone who's ever messaged
// you. Used as a name fallback in getChats().
async function getContacts() {
  let data;
  try {
    data = await gowaFetch('/user/my/contacts');
  } catch (err) {
    return []; // best-effort — a missing/failed contacts call shouldn't break the chat list
  }
  const rows = [data?.results?.data, data?.results, data?.data, data?.contacts, data].find(Array.isArray) || [];
  return rows.map((r) => ({
    phone: jidToPhone(r.jid || r.phone || r.id).replace(/[^\d]/g, ''),
    name: r.name || r.full_name || r.push_name || r.notify || '',
  })).filter((c) => c.phone && c.name);
}

async function gowaFetch(path, options = {}) {
  assertConfigured();
  const res = await fetch(`${GOWA_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(),
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.message || data?.error || `GoWA request failed (HTTP ${res.status})`;
    const e = new Error(msg);
    e.status = res.status;
    throw e;
  }
  return data;
}

// GET /app/devices — whether a WhatsApp session is linked and connected.
async function getStatus() {
  const data = await gowaFetch('/app/devices');
  return data;
}

// POST /send/message  { phone, message }
async function sendMessage(phone, message) {
  const data = await gowaFetch('/send/message', {
    method: 'POST',
    body: JSON.stringify({ phone: toJid(phone), message }),
  });
  return data?.results || data?.data || data;
}

// GET /chats — list of chats known to this device (v7.x shape: an array
// of { jid/chat_jid, name, last_message_time, ... }). Field names have
// shifted across GoWA releases, so this normalizes a few likely shapes.
//
// GoWA pages this endpoint (25-ish chats per page on most builds), so a
// single request silently truncates the list. This walks `limit`/`offset`
// pages and concatenates them until a page comes back short (the usual
// "last page" signal) or empty, so the UI gets every chat in one call.
const CHATS_PAGE_SIZE = 100;
const CHATS_MAX_PAGES = 50; // safety cap (~5000 chats) in case a build ignores offset and would otherwise loop forever

async function fetchChatsPage(offset) {
  let data;
  try {
    data = await gowaFetch(`/chats?limit=${CHATS_PAGE_SIZE}&offset=${offset}`);
  } catch (err) {
    // Some v7.x builds expose this under /chat/ instead of /chats — try
    // the older path once before giving up.
    data = await gowaFetch(`/chat/list?limit=${CHATS_PAGE_SIZE}&offset=${offset}`);
  }
  return [data?.results?.data, data?.results, data?.data, data?.chats, data].find(Array.isArray) || [];
}

async function getChats() {
  const all = [];
  const seenJids = new Set();
  for (let page = 0; page < CHATS_MAX_PAGES; page++) {
    const rows = await fetchChatsPage(page * CHATS_PAGE_SIZE);
    if (!rows.length) break;

    let newCount = 0;
    for (const r of rows) {
      const jid = r.jid || r.chat_jid || r.id;
      if (seenJids.has(jid)) continue; // dedupe, in case a build ignores offset and re-sends page 1
      seenJids.add(jid);
      newCount++;
      const kind = jidKind(jid);
      all.push({
        jid,
        kind, // 'user' | 'group' | 'lid' | 'other'
        // Only a 'user' jid's local part is an actual phone number — group
        // ids and @lid ids are opaque and must not be treated as one.
        phone: kind === 'user' ? jidToPhone(jid) : null,
        name: r.name || r.push_name || '', // filled in from contacts / left blank in routes/whatsapp.js — see there for why
        lastMessage: r.last_message || r.last_message_text || '',
        lastMessageTime: r.last_message_time || r.timestamp || null,
        unread: r.unread_count || 0,
      });
    }

    // Page was smaller than what we asked for -> that was the last page.
    // Also stop if a page brought nothing new (build ignoring pagination).
    if (rows.length < CHATS_PAGE_SIZE || newCount === 0) break;
  }
  return all;
}

// Encodes a JID for use as a path segment WITHOUT escaping '@'. GoWA's
// router does not URL-decode path params, so encodeURIComponent(jid) turns
// '@' into '%40' and GoWA then looks up the literal '...%40...' string,
// which never matches anything and always 404s/500s as "chat not found" —
// even for perfectly valid, existing chats.
function encodeJidPath(jid) {
  return String(jid).split('@').map(encodeURIComponent).join('@');
}

// GET /chat/:jid/messages?limit=N&offset=N — message history for one chat.
// `offset` pages further back in history (offset=limit is "the next
// `limit` messages before what was already loaded"), so the thread view
// can page in older messages ("load more") instead of being capped at
// whatever the first request returned.
async function getChatMessages(jid, limit = 50, offset = 0) {
  const data = await gowaFetch(`/chat/${encodeJidPath(jid)}/messages?limit=${limit}&offset=${offset}`);
  const rows = [data?.results?.data, data?.results, data?.data, data?.messages, data].find(Array.isArray) || [];
  return rows.map((m) => ({
    id: m.id || m.message_id,
    fromMe: !!(m.from_me ?? m.is_from_me ?? m.fromMe),
    text: m.content || m.text || m.message || m.body || '',
    timestamp: m.timestamp || m.time || m.created_at || null,
    senderJid: m.sender_jid || m.sender || null,
  }));
}

module.exports = {
  toJid,
  jidToPhone,
  jidKind,
  getStatus,
  sendMessage,
  getChats,
  getContacts,
  getChatMessages,
};
