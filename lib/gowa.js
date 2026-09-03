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
// against ga_clients.number.
function jidToPhone(jid) {
  if (!jid) return '';
  return String(jid).split('@')[0];
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
async function getChats() {
  let data;
  try {
    data = await gowaFetch('/chats');
  } catch (err) {
    // Some v7.x builds expose this under /chat/ instead of /chats — try
    // the older path once before giving up.
    data = await gowaFetch('/chat/list');
  }
  const rows = [data?.results?.data, data?.results, data?.data, data?.chats, data].find(Array.isArray) || [];
  return rows.map((r) => ({
    jid: r.jid || r.chat_jid || r.id,
    name: r.name || r.push_name || jidToPhone(r.jid || r.chat_jid || r.id),
    lastMessage: r.last_message || r.last_message_text || '',
    lastMessageTime: r.last_message_time || r.timestamp || null,
    unread: r.unread_count || 0,
  }));
}

// Encodes a JID for use as a path segment WITHOUT escaping '@'. GoWA's
// router does not URL-decode path params, so encodeURIComponent(jid) turns
// '@' into '%40' and GoWA then looks up the literal '...%40...' string,
// which never matches anything and always 404s/500s as "chat not found" —
// even for perfectly valid, existing chats.
function encodeJidPath(jid) {
  return String(jid).split('@').map(encodeURIComponent).join('@');
}

// GET /chat/:jid/messages?limit=N — message history for one chat.
async function getChatMessages(jid, limit = 50) {
  const data = await gowaFetch(`/chat/${encodeJidPath(jid)}/messages?limit=${limit}`);
  const rows = [data?.results?.data, data?.results, data?.data, data?.messages, data].find(Array.isArray) || [];
  return rows.map((m) => ({
    id: m.id || m.message_id,
    fromMe: !!(m.from_me ?? m.is_from_me ?? m.fromMe),
    text: m.text || m.message || m.body || '',
    timestamp: m.timestamp || m.time || m.created_at || null,
  }));
}

module.exports = {
  toJid,
  jidToPhone,
  getStatus,
  sendMessage,
  getChats,
  getChatMessages,
};
