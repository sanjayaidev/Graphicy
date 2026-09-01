// lib/supabase.js
// Data access layer backed by Supabase (Postgres). Tables are prefixed
// ga_ — see supabase/schema.sql. This module returns/accepts the same
// PascalCase JSON shape the old Apps Script backend did (UniqueID,
// ClientID, PaymentStatus, DueDate, ...) so routes/*.js and public/js
// don't need to change.

const { createClient } = require('@supabase/supabase-js');

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
    PaymentStatus: row.payment_status,
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
      payment_status: p.PaymentStatus || 'Pending',
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
    PaymentStatus: 'payment_status', Notes: 'notes',
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

  const { data, error } = await supabase
    .from('ga_tasks')
    .update(patch)
    .eq('id', taskId)
    .select()
    .single();
  if (error) fail(error, 'Task not found: ' + taskId);

  await logHistory(data.client_id, 'Task updated', p.status ? ('status -> ' + p.status) : '');
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

  await supabase.from('ga_clients')
    .update({ payment_status: p.status || 'Paid', updated_at: new Date().toISOString() })
    .eq('id', p.clientId);

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

  if (p.status) {
    await supabase.from('ga_clients')
      .update({ payment_status: p.status, updated_at: new Date().toISOString() })
      .eq('id', data.client_id);
  }
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

module.exports = {
  getClients, getClient, addClient, updateClient, deleteClient,
  getTasks, addTask, updateTask, deleteTask,
  getPayments, addPayment, updatePayment, deletePayment,
  getHistory,
};
