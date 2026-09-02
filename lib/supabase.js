// lib/supabase.js
// Data access layer backed by Supabase (Postgres). Tables are prefixed
// ga_ — see supabase/schema.sql. This module returns/accepts the same
// PascalCase JSON shape the old Apps Script backend did (UniqueID,
// ClientID, DueDate, ...) so routes/*.js and public/js don't need to
// change. PaymentStatus lives on tasks (one payment state per task), not
// on clients — a client's overall payment picture is the union of its
// tasks' statuses.

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('WARNING: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set. API calls will fail.');
}

// Service-role key only — this file only ever runs server-side, and RLS is
// enabled with no policies (see schema.sql), so the service role is
// required to read/write at all.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function fail(err, fallbackMsg) {
  const e = new Error((err && err.message) || fallbackMsg);
  e.status = 400;
  throw e;
}

// ─── Shape mapping ─────────────────────────────────────────────────────

function toClientJSON(row) {
  if (!row) return null;
  return {
    UniqueID: row.id,
    Name: row.name,
    Number: row.number,
    Country: row.country,
    Platform: row.platform,
    Type: row.type,
    Service: row.service,
    Business: row.business,
    Action: row.action,
    Chance: row.chance,
    BulkBilling: !!row.bulk_billing,
    Notes: row.notes,
    CreatedAt: row.created_at,
    UpdatedAt: row.updated_at,
  };
}

function toTaskJSON(row) {
  if (!row) return null;
  return {
    TaskID: row.id,
    ClientID: row.client_id,
    Description: row.description,
    DueDate: row.due_date,
    Status: row.status,
    PaymentStatus: row.payment_status,
    Amount: row.amount,
    CreatedAt: row.created_at,
  };
}

function toPaymentJSON(row) {
  if (!row) return null;
  return {
    PaymentID: row.id,
    ClientID: row.client_id,
    Amount: row.amount,
    Date: row.date,
    Status: row.status,
    Method: row.method,
    Notes: row.notes,
    CreatedAt: row.created_at,
  };
}

function toHistoryJSON(row) {
  if (!row) return null;
  return {
    LogID: row.id,
    ClientID: row.client_id,
    Action: row.action,
    Timestamp: row.timestamp,
    Details: row.details,
  };
}

function toFollowupJSON(row) {
  if (!row) return null;
  return {
    FollowupID: row.id,
    ClientID: row.client_id,
    ScheduledAt: row.scheduled_at,
    Purpose: row.purpose,
    Status: row.status,
    CreatedAt: row.created_at,
  };
}

async function logHistory(clientId, action, details) {
  await supabase.from('ga_history').insert({
    client_id: clientId,
    action,
    details: details || '',
  });
}

// ─── Clients ────────────────────────────────────────────────────────────

async function getClients() {
  const { data, error } = await supabase
    .from('ga_clients')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) fail(error, 'Failed to load clients');
  return data.map(toClientJSON);
}

async function getClient(id) {
  const { data, error } = await supabase
    .from('ga_clients')
    .select('*')
    .eq('id', id)
    .single();
  if (error) fail(error, 'Client not found: ' + id);
  return toClientJSON(data);
}

async function addClient(p) {
  const { data, error } = await supabase
    .from('ga_clients')
    .insert({
      name: p.Name || '',
      number: p.Number || '',
      country: p.Country || '',
      platform: p.Platform || '',
      type: p.Type || '',
      service: p.Service || '',
      business: p.Business || '',
      action: p.Action || '',
      chance: p.Chance === '' || p.Chance === undefined ? null : Number(p.Chance),
      bulk_billing: !!p.BulkBilling,
      notes: p.Notes || '',
    })
    .select()
    .single();
  if (error) fail(error, 'Failed to create client');

  await logHistory(data.id, 'Client created', p.Name || '');
  return toClientJSON(data);
}

async function updateClient(id, p) {
  const patch = { updated_at: new Date().toISOString() };
  const fieldMap = {
    Name: 'name', Number: 'number', Country: 'country', Platform: 'platform',
    Type: 'type', Service: 'service', Business: 'business', Action: 'action',
    Notes: 'notes', BulkBilling: 'bulk_billing',
  };
  Object.entries(fieldMap).forEach(([jsonKey, col]) => {
    if (p[jsonKey] !== undefined) patch[col] = p[jsonKey];
  });
  if (p.Chance !== undefined) {
    patch.chance = p.Chance === '' ? null : Number(p.Chance);
  }

  const { error } = await supabase.from('ga_clients').update(patch).eq('id', id);
  if (error) fail(error, 'Client not found: ' + id);

  await logHistory(id, 'Client updated', Object.keys(p).filter(k => k !== 'id').join(', '));
  return getClient(id);
}

async function deleteClient(id) {
  // ga_tasks / ga_payments / ga_history all cascade on delete (see schema.sql)
  const { error } = await supabase.from('ga_clients').delete().eq('id', id);
  if (error) fail(error, 'Client not found: ' + id);
  return { success: true, id };
}

// ─── Tasks ───────────────────────────────────────────────────────────────

async function getTasks(clientId) {
  let query = supabase.from('ga_tasks').select('*').order('due_date', { ascending: true });
  if (clientId) query = query.eq('client_id', clientId);
  const { data, error } = await query;
  if (error) fail(error, 'Failed to load tasks');
  return data.map(toTaskJSON);
}

async function addTask(p) {
  const { data, error } = await supabase
    .from('ga_tasks')
    .insert({
      client_id: p.clientId,
      description: p.description || '',
      due_date: p.dueDate || null,
      status: p.status || 'Pending',
      payment_status: p.paymentStatus || 'Pending',
      amount: p.amount === '' || p.amount === undefined ? 0 : Number(p.amount),
    })
    .select()
    .single();
  if (error) fail(error, 'Failed to create task');

  await logHistory(p.clientId, 'Task added', p.description || '');
  return toTaskJSON(data);
}

async function updateTask(taskId, p) {
  const patch = {};
  if (p.description !== undefined) patch.description = p.description;
  if (p.dueDate !== undefined) patch.due_date = p.dueDate || null;
  if (p.status !== undefined) patch.status = p.status;
  if (p.paymentStatus !== undefined) patch.payment_status = p.paymentStatus;
  if (p.amount !== undefined) patch.amount = p.amount === '' ? 0 : Number(p.amount);

  const { data, error } = await supabase
    .from('ga_tasks')
    .update(patch)
    .eq('id', taskId)
    .select()
    .single();
  if (error) fail(error, 'Task not found: ' + taskId);

  const changeNotes = [
    p.status ? ('status -> ' + p.status) : '',
    p.paymentStatus ? ('payment -> ' + p.paymentStatus) : '',
  ].filter(Boolean).join(', ');
  await logHistory(data.client_id, 'Task updated', changeNotes);
  return { success: true, taskId };
}

async function deleteTask(taskId) {
  const { data: existing } = await supabase.from('ga_tasks').select('client_id').eq('id', taskId).single();
  const { error } = await supabase.from('ga_tasks').delete().eq('id', taskId);
  if (error) fail(error, 'Task not found: ' + taskId);
  if (existing) await logHistory(existing.client_id, 'Task deleted', taskId);
  return { success: true, taskId };
}

// ─── Payments ────────────────────────────────────────────────────────────

async function getPayments(clientId) {
  let query = supabase.from('ga_payments').select('*').order('date', { ascending: false });
  if (clientId) query = query.eq('client_id', clientId);
  const { data, error } = await query;
  if (error) fail(error, 'Failed to load payments');
  return data.map(toPaymentJSON);
}

async function addPayment(p) {
  const { data, error } = await supabase
    .from('ga_payments')
    .insert({
      client_id: p.clientId,
      amount: p.amount || 0,
      date: p.date || new Date().toISOString(),
      status: p.status || 'Paid',
      method: p.method || '',
      notes: p.notes || '',
    })
    .select()
    .single();
  if (error) fail(error, 'Failed to log payment');

  await logHistory(p.clientId, 'Payment logged', `${p.amount || 0} — ${p.status || 'Paid'}`);
  return toPaymentJSON(data);
}

async function updatePayment(paymentId, p) {
  const patch = {};
  if (p.amount !== undefined) patch.amount = p.amount;
  if (p.date !== undefined) patch.date = p.date;
  if (p.status !== undefined) patch.status = p.status;
  if (p.method !== undefined) patch.method = p.method;
  if (p.notes !== undefined) patch.notes = p.notes;

  const { data, error } = await supabase
    .from('ga_payments')
    .update(patch)
    .eq('id', paymentId)
    .select()
    .single();
  if (error) fail(error, 'Payment not found: ' + paymentId);

  await logHistory(data.client_id, 'Payment updated', paymentId);
  return { success: true, paymentId };
}

async function deletePayment(paymentId) {
  const { data: existing } = await supabase.from('ga_payments').select('client_id').eq('id', paymentId).single();
  const { error } = await supabase.from('ga_payments').delete().eq('id', paymentId);
  if (error) fail(error, 'Payment not found: ' + paymentId);
  if (existing) await logHistory(existing.client_id, 'Payment deleted', paymentId);
  return { success: true, paymentId };
}

// ─── History ─────────────────────────────────────────────────────────────

async function getHistory(clientId) {
  let query = supabase.from('ga_history').select('*').order('timestamp', { ascending: false });
  if (clientId) query = query.eq('client_id', clientId);
  const { data, error } = await query;
  if (error) fail(error, 'Failed to load history');
  return data.map(toHistoryJSON);
}

// ─── Follow-ups (Calendar tab) ────────────────────────────────────────────
// A follow-up is always scheduled for now-or-later at creation time — past
// dates are rejected here so the calendar can never be seeded with a
// followup that was already due the moment it was created. Editing the
// time later is allowed to move it, but not required to stay in the
// future (e.g. rescheduling something that slipped shouldn't be blocked).

async function getFollowups(clientId) {
  let query = supabase.from('ga_followups').select('*').order('scheduled_at', { ascending: true });
  if (clientId) query = query.eq('client_id', clientId);
  const { data, error } = await query;
  if (error) fail(error, 'Failed to load follow-ups');
  return data.map(toFollowupJSON);
}

async function addFollowup(p) {
  if (!p.clientId) fail(null, 'A client is required');
  if (!p.scheduledAt) fail(null, 'A date and time is required');
  const when = new Date(p.scheduledAt);
  if (isNaN(when)) fail(null, 'Invalid date/time');
  // Small grace window so "now" (the exact minute picked in a <input
  // type=datetime-local>) doesn't get rejected by network/render lag.
  if (when.getTime() < Date.now() - 60 * 1000) {
    fail(null, 'Follow-ups can only be scheduled for the current or a future date/time');
  }

  const { data, error } = await supabase
    .from('ga_followups')
    .insert({
      client_id: p.clientId,
      scheduled_at: when.toISOString(),
      purpose: p.purpose || '',
      status: 'Scheduled',
    })
    .select()
    .single();
  if (error) fail(error, 'Failed to schedule follow-up');

  await logHistory(p.clientId, 'Follow-up scheduled', `${p.purpose || ''} — ${when.toLocaleString()}`);
  return toFollowupJSON(data);
}

async function updateFollowup(followupId, p) {
  const patch = { updated_at: new Date().toISOString() };
  if (p.scheduledAt !== undefined) {
    const when = new Date(p.scheduledAt);
    if (isNaN(when)) fail(null, 'Invalid date/time');
    patch.scheduled_at = when.toISOString();
  }
  if (p.purpose !== undefined) patch.purpose = p.purpose;
  if (p.status !== undefined) patch.status = p.status;

  const { data, error } = await supabase
    .from('ga_followups')
    .update(patch)
    .eq('id', followupId)
    .select()
    .single();
  if (error) fail(error, 'Follow-up not found: ' + followupId);

  await logHistory(data.client_id, 'Follow-up updated', p.status ? `status -> ${p.status}` : (p.purpose || ''));
  return toFollowupJSON(data);
}

async function deleteFollowup(followupId) {
  const { data: existing } = await supabase.from('ga_followups').select('client_id').eq('id', followupId).single();
  const { error } = await supabase.from('ga_followups').delete().eq('id', followupId);
  if (error) fail(error, 'Follow-up not found: ' + followupId);
  if (existing) await logHistory(existing.client_id, 'Follow-up deleted', followupId);
  return { success: true, followupId };
}

// ─── Share links ─────────────────────────────────────────────────────────

const SHARE_TOKEN_BYTES = 32;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function toShareLinkJSON(row) {
  if (!row) return null;
  return {
    LinkID: row.id,
    ClientID: row.client_id,
    TokenPrefix: row.token_prefix,
    Label: row.label,
    ExpiresAt: row.expires_at,
    RevokedAt: row.revoked_at,
    LastAccessedAt: row.last_accessed_at,
    AccessCount: row.access_count,
    CreatedAt: row.created_at,
  };
}

// Creates a new share link for a client. Returns the raw token (only ever
// available here, at creation time) alongside the stored record.
async function createShareLink(clientId, { label, expiresInDays } = {}) {
  const token = crypto.randomBytes(SHARE_TOKEN_BYTES).toString('hex'); // 64 hex chars
  const tokenHash = hashToken(token);
  const tokenPrefix = token.slice(0, 8);

  let expiresAt = null;
  if (expiresInDays) {
    const d = new Date();
    d.setDate(d.getDate() + Number(expiresInDays));
    expiresAt = d.toISOString();
  }

  const { data, error } = await supabase
    .from('ga_share_links')
    .insert({
      client_id: clientId,
      token_hash: tokenHash,
      token_prefix: tokenPrefix,
      label: label || null,
      expires_at: expiresAt,
    })
    .select()
    .single();
  if (error) fail(error, 'Failed to create share link');

  await logHistory(clientId, 'Share link created', label || '');
  return { token, link: toShareLinkJSON(data) };
}

async function listShareLinks(clientId) {
  const { data, error } = await supabase
    .from('ga_share_links')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  if (error) fail(error, 'Failed to load share links');
  return data.map(toShareLinkJSON);
}

async function revokeShareLink(linkId) {
  const { data, error } = await supabase
    .from('ga_share_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', linkId)
    .select()
    .single();
  if (error) fail(error, 'Share link not found: ' + linkId);

  await logHistory(data.client_id, 'Share link revoked', data.token_prefix);
  return { success: true, linkId };
}

// Public, read-only lookup used by the unauthenticated share page. Returns
// null (never throws) for any invalid/expired/revoked token so the caller
// can respond with a generic "link not available" rather than leaking
// which failure mode occurred.
async function getSharedClientView(token) {
  if (!token || typeof token !== 'string') return null;
  const tokenHash = hashToken(token);

  const { data: link, error } = await supabase
    .from('ga_share_links')
    .select('*')
    .eq('token_hash', tokenHash)
    .single();
  if (error || !link) return null;
  if (link.revoked_at) return null;
  if (link.expires_at && new Date(link.expires_at) < new Date()) return null;

  // Fire-and-forget access tracking — never let a logging failure block
  // the actual response.
  supabase.from('ga_share_links')
    .update({
      last_accessed_at: new Date().toISOString(),
      access_count: (link.access_count || 0) + 1,
    })
    .eq('id', link.id)
    .then(() => {}, () => {});

  const [{ data: clientRow }, { data: taskRows }, { data: paymentRows }] = await Promise.all([
    supabase.from('ga_clients').select('*').eq('id', link.client_id).single(),
    supabase.from('ga_tasks').select('*').eq('client_id', link.client_id).order('due_date', { ascending: true }),
    supabase.from('ga_payments').select('*').eq('client_id', link.client_id).order('date', { ascending: false }),
  ]);
  if (!clientRow) return null;

  // Deliberately curated subset — internal CRM fields (Type/Chance/Action/
  // Notes are sales-pipeline notes about the client, not for the client)
  // never leave the server via this endpoint.
  return {
    Client: {
      Name: clientRow.name,
      Business: clientRow.business,
    },
    Tasks: (taskRows || []).map(t => ({
      Description: t.description,
      DueDate: t.due_date,
      Status: t.status,
      PaymentStatus: t.payment_status,
      Amount: t.amount,
    })),
    Payments: (paymentRows || []).map(p => ({
      Amount: p.amount,
      Date: p.date,
      Status: p.status,
    })),
  };
}

module.exports = {
  getClients, getClient, addClient, updateClient, deleteClient,
  getTasks, addTask, updateTask, deleteTask,
  getPayments, addPayment, updatePayment, deletePayment,
  getHistory,
  getFollowups, addFollowup, updateFollowup, deleteFollowup,
  createShareLink, listShareLinks, revokeShareLink, getSharedClientView,
};
