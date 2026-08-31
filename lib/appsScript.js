// lib/appsScript.js
// Thin client for calling the Apps Script Web App API.

const BASE_URL = process.env.APPS_SCRIPT_URL;
const SECRET = process.env.APPS_SCRIPT_SECRET;

if (!BASE_URL) {
  console.warn('WARNING: APPS_SCRIPT_URL is not set. API calls will fail.');
}

/**
 * Calls the Apps Script backend.
 * GET is used for reads (query string), POST for writes (JSON body).
 */
async function callAppsScript(action, params = {}, method = 'GET') {
  const payload = { ...params, action, secret: SECRET };

  let res;
  if (method === 'GET') {
    const url = new URL(BASE_URL);
    Object.entries(payload).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });
    res = await fetch(url.toString());
  } else {
    res = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids CORS preflight on Apps Script
      body: JSON.stringify(payload),
    });
  }

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error('Apps Script returned non-JSON (check deployment/URL): ' + text.slice(0, 200));
  }

  if (data && data.error) {
    const err = new Error(data.error);
    err.status = 400;
    throw err;
  }

  return data;
}

module.exports = { callAppsScript };
