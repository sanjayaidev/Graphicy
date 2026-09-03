// public/js/whatsapp.js
// Mobile-app-style WhatsApp UI. Talks to /api/whatsapp/* (see routes/whatsapp.js).

const POLL_MS = 4000;

let chats = [];
let languages = [];
let activeChat = null; // { jid, name, phone }
let pollTimer = null;
let lastRenderedMessageIds = new Set();
let draftOriginalText = null; // set when the compose box currently holds a translation

const screenList = document.getElementById('screen-list');
const screenThread = document.getElementById('screen-thread');
const chatListEl = document.getElementById('chat-list');
const chatSearchEl = document.getElementById('chat-search');
const messagesEl = document.getElementById('wa-messages');
const threadNameEl = document.getElementById('thread-name');
const threadPhoneEl = document.getElementById('thread-phone');
const threadAvatarEl = document.getElementById('thread-avatar');
const composeInput = document.getElementById('compose-input');
const sendBtn = document.getElementById('send-btn');
const translateBtn = document.getElementById('translate-btn');
const targetLangSelect = document.getElementById('target-lang-select');
const translateStrip = document.getElementById('translate-strip');
const translateStripLang = document.getElementById('translate-strip-lang');
const translateStripOriginal = document.getElementById('translate-strip-original');
const myLangBadge = document.getElementById('my-lang-badge');

function getMyLang() {
  return localStorage.getItem('wa_my_lang') || 'en';
}
function setMyLang(code) {
  localStorage.setItem('wa_my_lang', code);
  myLangBadge.textContent = code.toUpperCase();
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

async function api(path, options) {
  const res = await fetch(`/api/whatsapp${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ─── Languages ──────────────────────────────────────────────────────────

async function loadLanguages() {
  languages = await api('/languages');
  targetLangSelect.innerHTML = languages
    .map((l) => `<option value="${l.code}">${l.code.toUpperCase()}</option>`)
    .join('');
  // Default target = first non-English language, since the common flow is
  // "I type in English, translate to the client's language".
  const nonEn = languages.find((l) => l.code !== 'en');
  targetLangSelect.value = (nonEn || languages[0])?.code || 'en';
  setMyLang(getMyLang());
}

document.getElementById('lang-settings-btn').addEventListener('click', () => {
  const codes = languages.map((l) => `${l.code} = ${l.name}`).join('\n');
  const choice = window.prompt(`Your language (used to translate incoming messages).\n\n${codes}`, getMyLang());
  if (choice && languages.some((l) => l.code === choice)) setMyLang(choice);
});

// ─── Chat list ──────────────────────────────────────────────────────────

async function loadChats() {
  try {
    chats = await api('/chats');
    renderChatList(chats);
  } catch (err) {
    chatListEl.innerHTML = `<div class="wa-empty">${escapeHtml(err.message)}</div>`;
  }
}

function renderChatList(list) {
  if (!list.length) {
    chatListEl.innerHTML = '<div class="wa-empty">No chats yet.</div>';
    return;
  }
  chatListEl.innerHTML = list.map((c) => {
    const displayName = c.clientName || c.name || c.phone;
    return `
      <div class="wa-chat-row" data-jid="${escapeHtml(c.jid)}">
        <div class="wa-avatar">${initials(displayName)}</div>
        <div class="wa-chat-row-text">
          <div class="wa-chat-row-top">
            <div class="wa-chat-row-name">${escapeHtml(displayName)}</div>
            <div class="wa-chat-row-time">${formatTime(c.lastMessageTime)}</div>
          </div>
          <div class="wa-chat-row-preview">${escapeHtml(c.lastMessage || '')}</div>
        </div>
        ${c.unread ? `<div class="wa-chat-row-unread">${c.unread}</div>` : ''}
      </div>
    `;
  }).join('');

  chatListEl.querySelectorAll('.wa-chat-row').forEach((row) => {
    row.addEventListener('click', () => {
      const jid = row.dataset.jid;
      const chat = list.find((c) => c.jid === jid);
      openThread(chat);
    });
  });
}

chatSearchEl.addEventListener('input', () => {
  const q = chatSearchEl.value.trim().toLowerCase();
  if (!q) return renderChatList(chats);
  renderChatList(chats.filter((c) =>
    (c.clientName || c.name || '').toLowerCase().includes(q) ||
    (c.phone || '').includes(q)
  ));
});

// ─── Thread ─────────────────────────────────────────────────────────────

function openThread(chat) {
  activeChat = chat;
  threadNameEl.textContent = chat.clientName || chat.name || chat.phone;
  threadPhoneEl.textContent = chat.phone;
  threadAvatarEl.textContent = initials(chat.clientName || chat.name || chat.phone);
  screenList.classList.add('wa-hidden');
  screenThread.classList.remove('wa-hidden');
  lastRenderedMessageIds = new Set();
  messagesEl.innerHTML = '<div class="wa-empty">Loading messages…</div>';
  clearDraftTranslation();
  loadMessages();
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(loadMessages, POLL_MS);
}

document.getElementById('back-btn').addEventListener('click', () => {
  if (pollTimer) clearInterval(pollTimer);
  screenThread.classList.add('wa-hidden');
  screenList.classList.remove('wa-hidden');
  activeChat = null;
  loadChats(); // refresh previews/unread counts
});

async function loadMessages() {
  if (!activeChat) return;
  try {
    const msgs = await api(`/chats/${encodeURIComponent(activeChat.jid)}/messages?limit=50`);
    renderMessages(msgs);
  } catch (err) {
    if (!lastRenderedMessageIds.size) {
      messagesEl.innerHTML = `<div class="wa-empty">${escapeHtml(err.message)}</div>`;
    }
  }
}

function renderMessages(msgs) {
  const ids = msgs.map((m) => m.id).join(',');
  const wasAtBottom = messagesEl.scrollTop + messagesEl.clientHeight >= messagesEl.scrollHeight - 40;

  messagesEl.innerHTML = msgs.map((m) => bubbleHtml(m)).join('') || '<div class="wa-empty">No messages yet — say hello 👋</div>';

  messagesEl.querySelectorAll('.wa-bubble-translate-btn').forEach((btn) => {
    btn.addEventListener('click', () => showLangChips(btn));
  });

  lastRenderedMessageIds = new Set(msgs.map((m) => m.id));
  if (wasAtBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
}

function bubbleHtml(m) {
  const dir = m.fromMe ? 'out' : 'in';
  const safeText = escapeHtml(m.text);
  return `
    <div class="wa-bubble-row ${dir}" data-msg-id="${escapeHtml(m.id || '')}">
      <div class="wa-bubble">
        <div class="wa-bubble-text">${safeText}</div>
        <div class="wa-bubble-time">${formatTime(m.timestamp)}</div>
        ${!m.fromMe ? `<button class="wa-bubble-translate-btn" data-text="${escapeHtml(m.text)}">🌐 Translate</button>` : ''}
        <div class="wa-bubble-translation-slot"></div>
      </div>
    </div>
  `;
}

function showLangChips(btn) {
  const bubble = btn.closest('.wa-bubble');
  const slot = bubble.querySelector('.wa-bubble-translation-slot');
  const existingChips = bubble.querySelector('.wa-lang-chips');
  if (existingChips) { existingChips.remove(); return; }

  const chips = document.createElement('div');
  chips.className = 'wa-lang-chips';
  const preferred = [getMyLang(), 'en', 'es', 'hi', 'fr', 'ar'].filter((v, i, a) => a.indexOf(v) === i);
  chips.innerHTML = preferred.map((code) => {
    const lang = languages.find((l) => l.code === code);
    return lang ? `<button class="wa-lang-chip" data-code="${code}">${lang.name}</button>` : '';
  }).join('');
  btn.insertAdjacentElement('afterend', chips);

  chips.querySelectorAll('.wa-lang-chip').forEach((chip) => {
    chip.addEventListener('click', async () => {
      chip.textContent = 'Translating…';
      try {
        const { translated } = await api('/translate', {
          method: 'POST',
          body: JSON.stringify({ text: btn.dataset.text, target_lang: chip.dataset.code }),
        });
        slot.innerHTML = `
          <div class="wa-bubble-translation">
            <span class="wa-tr-label">Translated (${chip.dataset.code.toUpperCase()})</span>
            ${escapeHtml(translated)}
          </div>
        `;
        chips.remove();
      } catch (err) {
        chip.textContent = 'Failed — retry';
      }
    });
  });
}

// ─── Compose / send ─────────────────────────────────────────────────────

composeInput.addEventListener('input', () => {
  composeInput.style.height = 'auto';
  composeInput.style.height = Math.min(composeInput.scrollHeight, 100) + 'px';
});

function clearDraftTranslation() {
  draftOriginalText = null;
  translateStrip.classList.add('wa-hidden');
}

translateBtn.addEventListener('click', async () => {
  const text = composeInput.value.trim();
  if (!text) return;
  const targetLang = targetLangSelect.value;
  translateBtn.disabled = true;
  translateBtn.textContent = '…';
  try {
    const { translated } = await api('/translate', {
      method: 'POST',
      body: JSON.stringify({ text, target_lang: targetLang, source_lang: 'en' }),
    });
    draftOriginalText = text;
    composeInput.value = translated;
    translateStripLang.textContent = targetLang.toUpperCase();
    translateStripOriginal.textContent = text;
    translateStrip.classList.remove('wa-hidden');
  } catch (err) {
    alert('Translation failed: ' + err.message);
  } finally {
    translateBtn.disabled = false;
    translateBtn.textContent = '🌐';
  }
});

document.getElementById('translate-revert-btn').addEventListener('click', () => {
  if (draftOriginalText !== null) composeInput.value = draftOriginalText;
  clearDraftTranslation();
});

async function sendMessage() {
  const text = composeInput.value.trim();
  if (!text || !activeChat) return;
  sendBtn.disabled = true;
  try {
    await api('/send', {
      method: 'POST',
      body: JSON.stringify({ phone: activeChat.jid, message: text }),
    });
    composeInput.value = '';
    composeInput.style.height = 'auto';
    clearDraftTranslation();
    await loadMessages();
    messagesEl.scrollTop = messagesEl.scrollHeight;
  } catch (err) {
    alert('Send failed: ' + err.message);
  } finally {
    sendBtn.disabled = false;
  }
}

sendBtn.addEventListener('click', sendMessage);
composeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// ─── Boot ───────────────────────────────────────────────────────────────

(async function init() {
  await loadLanguages();
  await loadChats();
})();
