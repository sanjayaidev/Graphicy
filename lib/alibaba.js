// lib/alibaba.js
// Minimal Alibaba Cloud Model Studio (DashScope) chat wrapper, used here
// only for translation. OpenAI-compatible endpoint, scoped to the
// workspace's region:
//   https://{workspace_id}.{region}.maas.aliyuncs.com/compatible-mode/v1/chat/completions

const ALIBABA_API_KEY = process.env.ALIBABA_API_KEY || '';
const ALIBABA_WORKSPACE_ID = process.env.ALIBABA_WORKSPACE_ID || '';
const ALIBABA_REGION = process.env.ALIBABA_REGION || 'ap-southeast-1'; // Singapore
const ALIBABA_MODEL = process.env.ALIBABA_MODEL || 'qwen-plus';

function assertConfigured() {
  if (!ALIBABA_API_KEY || !ALIBABA_WORKSPACE_ID) {
    const e = new Error('ALIBABA_API_KEY / ALIBABA_WORKSPACE_ID not configured (see .env.example)');
    e.status = 500;
    throw e;
  }
}

async function chatCompletion(messages, options = {}) {
  assertConfigured();
  const { model = ALIBABA_MODEL, temperature = 0.3, max_tokens = 512 } = options;
  const baseUrl = `https://${ALIBABA_WORKSPACE_ID}.${ALIBABA_REGION}.maas.aliyuncs.com/compatible-mode/v1`;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ALIBABA_API_KEY}`,
    },
    // enable_thinking: false — translation needs a direct, immediately
    // parseable answer; without this, hybrid-reasoning qwen3.x models can
    // burn the whole max_tokens budget on their reasoning trace before
    // ever emitting the translation itself.
    body: JSON.stringify({ model, messages, temperature, max_tokens, enable_thinking: false }),
  });

  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text }; }

  if (!res.ok) {
    const msg = data?.error?.message || data?.message || `Alibaba API error (HTTP ${res.status})`;
    const e = new Error(msg);
    e.status = res.status;
    throw e;
  }
  return data;
}

const LANGUAGE_NAMES = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
  pt: 'Portuguese', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', ar: 'Arabic',
  hi: 'Hindi', bn: 'Bengali', ta: 'Tamil', te: 'Telugu', mr: 'Marathi',
  gu: 'Gujarati', kn: 'Kannada', ml: 'Malayalam', ur: 'Urdu', id: 'Indonesian',
  th: 'Thai', vi: 'Vietnamese', ru: 'Russian', nl: 'Dutch', tr: 'Turkish',
};

// Translates `text` into the language named by `targetLang` (an ISO code
// from LANGUAGE_NAMES, or any language name if not in the map). Returns
// just the translated string — no commentary, no quotes.
async function translateText(text, targetLang, sourceLang) {
  if (!text || !text.trim()) return '';
  const targetName = LANGUAGE_NAMES[targetLang] || targetLang;
  const sourceName = sourceLang ? (LANGUAGE_NAMES[sourceLang] || sourceLang) : null;

  const systemPrompt = [
    `You are a translation engine for WhatsApp business messages.`,
    sourceName
      ? `Translate the user's message from ${sourceName} into ${targetName}.`
      : `Detect the language of the user's message and translate it into ${targetName}.`,
    `Preserve the tone and meaning. Keep emoji as-is.`,
    `Respond with ONLY the translated text — no quotes, no explanation, no language labels.`,
  ].join(' ');

  const data = await chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text },
    ],
    { temperature: 0.2, max_tokens: 1024 }
  );

  return (data?.choices?.[0]?.message?.content || '').trim();
}

module.exports = { chatCompletion, translateText, LANGUAGE_NAMES };
