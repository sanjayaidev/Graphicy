// lib/imgbb.js
// Uploads a base64 image to ImgBB (https://api.imgbb.com/) and returns the
// hosted URL. Used for client photos — Supabase's free tier has no storage
// bucket set up here, and ImgBB is a simple hosted-image alternative.

const IMGBB_API_KEY = process.env.IMGBB_API_KEY || '';

function assertConfigured() {
  if (!IMGBB_API_KEY) {
    const e = new Error('IMGBB_API_KEY is not configured (see .env.example)');
    e.status = 500;
    throw e;
  }
}

// Accepts either a raw base64 string or a data URL ("data:image/png;base64,...")
// and returns { url, thumbUrl, deleteUrl }.
async function uploadImage(imageData) {
  assertConfigured();
  if (!imageData) {
    const e = new Error('No image data provided');
    e.status = 400;
    throw e;
  }
  const base64 = imageData.includes(',') ? imageData.split(',')[1] : imageData;

  const body = new URLSearchParams();
  body.set('key', IMGBB_API_KEY);
  body.set('image', base64);

  const res = await fetch('https://api.imgbb.com/1/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text }; }

  if (!res.ok || !data.success) {
    const msg = data?.error?.message || `ImgBB upload failed (HTTP ${res.status})`;
    const e = new Error(msg);
    e.status = res.status >= 400 ? res.status : 502;
    throw e;
  }

  return {
    url: data.data.url,
    thumbUrl: data.data.thumb?.url || data.data.url,
    deleteUrl: data.data.delete_url,
  };
}

module.exports = { uploadImage };
