const params = new URLSearchParams(window.location.search);
const clientId = params.get('id');
let client = null;

if (!clientId) {
  window.location.href = '/';
}

async function loadAll() {
  await Promise.all([loadClient(), loadTasks(), loadPayments(), loadHistory()]);
}

async function loadClient() {
  const res = await fetch(`/api/clients/${encodeURIComponent(clientId)}`);
  if (res.status === 401) { window.location.href = '/login.html'; return; }
  if (!res.ok) {
    document.getElementById('info-body').innerHTML = '<p>Client not found.</p>';
    return;
  }
  client = await res.json();
  renderClient();
}

function renderClient() {
  document.getElementById('client-name').textContent = client.Name;
  document.title = `Ledger — ${client.Name}`;

  const rows = [
    ['Number', client.Number],
    ['Country', client.Country],
    ['Platform', client.Platform],
    ['Status', client.Type],
    ['Chance', (client.Chance || 0) + '%'],
    ['Service', client.Service],
    ['Business', client.Business],
    ['Next action', client.Action],
    ['Billing', client.BulkBilling ? 'Bulk (lump sum / flat fee)' : ''],
    ['Notes', client.Notes],
  ];
  document.getElementById('info-body').innerHTML = rows
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `<div class="info-row"><div class="k">${k}</div><div class="v">${escapeHtml(v)}</div></div>`)
    .join('');
}

async function loadTasks() {
  const res = await fetch(`/api/clients/${encodeURIComponent(clientId)}/tasks`);
  const tasks = await res.json();
  const body = document.getElementById('tasks-body');
  if (!res.ok || !Array.isArray(tasks)) {
    body.innerHTML = `<p style="color:var(--danger); font-size:13.5px;">${escapeHtml((tasks && tasks.error) || 'Could not load tasks.')}</p>`;
    return;
  }
  if (!tasks.length) {
    body.innerHTML = '<p style="color:var(--ink-faint); font-size:13.5px;">No tasks yet.</p>';
    return;
  }
  body.innerHTML = tasks.map(t => `
    <div class="task-row">
      <input type="checkbox" ${t.Status === 'Done' ? 'checked' : ''} onchange="toggleTask('${t.TaskID}', this.checked)">
      <div class="desc ${t.Status === 'Done' ? 'done' : ''}">${escapeHtml(t.Description)}</div>
      ${t.DueDate ? `<div class="due mono">${escapeHtml(formatDate(t.DueDate))}</div>` : ''}
      <select class="tag-select ${(t.PaymentStatus || 'pending').toLowerCase()}" onchange="setTaskPaymentStatus('${t.TaskID}', this.value)">
        ${['Pending', 'Paid', 'Overdue'].map(s => `<option value="${s}" ${s === (t.PaymentStatus || 'Pending') ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      <input type="number" min="0" class="mini-amount" value="${Number(t.Amount) || 0}" onchange="setTaskAmount('${t.TaskID}', this.value)">
      <button class="ghost small" onclick="deleteTask('${t.TaskID}')">&times;</button>
    </div>
  `).join('');
}

async function toggleTask(taskId, done) {
  await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: done ? 'Done' : 'Pending' }),
  });
  await loadTasks();
  await loadHistory();
}

async function setTaskPaymentStatus(taskId, paymentStatus) {
  await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentStatus }),
  });
  await loadTasks();
  await loadHistory();
}

async function setTaskAmount(taskId, amount) {
  await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount }),
  });
  await loadTasks();
  await loadHistory();
}

async function deleteTask(taskId) {
  if (!confirm('Delete this task?')) return;
  await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
  await loadTasks();
  await loadHistory();
}

async function loadPayments() {
  const res = await fetch(`/api/clients/${encodeURIComponent(clientId)}/payments`);
  const payments = await res.json();
  const body = document.getElementById('payments-body');
  if (!res.ok || !Array.isArray(payments)) {
    body.innerHTML = `<p style="color:var(--danger); font-size:13.5px;">${escapeHtml((payments && payments.error) || 'Could not load payments.')}</p>`;
    return;
  }
  if (!payments.length) {
    body.innerHTML = '<p style="color:var(--ink-faint); font-size:13.5px;">No payments logged yet.</p>';
    return;
  }
  body.innerHTML = payments.map(p => `
    <div class="payment-row">
      <div class="amount mono">₹${escapeHtml(p.Amount)}</div>
      <div class="meta">${escapeHtml(p.Notes || '')} ${p.Date ? '· ' + escapeHtml(formatDate(p.Date)) : ''}</div>
      <span class="tag ${(p.Status || '').toLowerCase()}">${escapeHtml(p.Status)}</span>
      <button class="ghost small" onclick="deletePayment('${p.PaymentID}')">&times;</button>
    </div>
  `).join('');
}

async function deletePayment(paymentId) {
  if (!confirm('Delete this payment record?')) return;
  await fetch(`/api/payments/${encodeURIComponent(paymentId)}`, { method: 'DELETE' });
  await loadPayments();
  await loadClient();
  await loadHistory();
}

async function loadHistory() {
  const res = await fetch(`/api/clients/${encodeURIComponent(clientId)}/history`);
  const history = await res.json();
  const body = document.getElementById('history-body');
  if (!res.ok || !Array.isArray(history)) {
    body.innerHTML = `<p style="color:var(--danger); font-size:13.5px;">${escapeHtml((history && history.error) || 'Could not load history.')}</p>`;
    return;
  }
  if (!history.length) {
    body.innerHTML = '<p style="color:var(--ink-faint); font-size:13.5px;">No activity yet.</p>';
    return;
  }
  body.innerHTML = history.map(h => `
    <div class="timeline-item">
      <div class="action">${escapeHtml(h.Action)}${h.Details ? ' — ' + escapeHtml(h.Details) : ''}</div>
      <div class="when">${escapeHtml(formatDate(h.Timestamp, true))}</div>
    </div>
  `).join('');
}

function formatDate(str, withTime) {
  const d = new Date(str);
  if (isNaN(d)) return str;
  const opts = withTime
    ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' };
  return d.toLocaleDateString('en-IN', opts);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str === undefined || str === null ? '' : str;
  return div.innerHTML;
}

// ─── Add task / payment ────────────────────────────────────────────────

document.getElementById('add-task-btn').addEventListener('click', async () => {
  const description = document.getElementById('new-task-desc').value.trim();
  if (!description) return;
  const dueDate = document.getElementById('new-task-due').value;
  const paymentStatus = document.getElementById('new-task-payment-status').value;
  const amount = document.getElementById('new-task-amount').value;
  await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, description, dueDate, status: 'Pending', paymentStatus, amount }),
  });
  document.getElementById('new-task-desc').value = '';
  document.getElementById('new-task-due').value = '';
  document.getElementById('new-task-amount').value = '';
  await loadTasks();
  await loadHistory();
});

document.getElementById('add-payment-btn').addEventListener('click', async () => {
  const amount = document.getElementById('new-payment-amount').value;
  if (!amount) return;
  const status = document.getElementById('new-payment-status').value;
  const notes = document.getElementById('new-payment-notes').value.trim();
  await fetch('/api/payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, amount, status, notes, date: new Date().toISOString() }),
  });
  document.getElementById('new-payment-amount').value = '';
  document.getElementById('new-payment-notes').value = '';
  await loadPayments();
  await loadClient();
  await loadHistory();
});

// ─── Edit modal ─────────────────────────────────────────────────────────

document.getElementById('edit-client-btn').addEventListener('click', () => {
  document.getElementById('f-name').value = client.Name || '';
  document.getElementById('f-number').value = client.Number || '';
  document.getElementById('f-country').value = client.Country || '';
  document.getElementById('f-platform').value = client.Platform || '';
  document.getElementById('f-type').value = client.Type || 'Warm';
  document.getElementById('f-chance').value = client.Chance || '';
  document.getElementById('f-service').value = client.Service || '';
  document.getElementById('f-business').value = client.Business || '';
  document.getElementById('f-bulk-billing').checked = !!client.BulkBilling;
  document.getElementById('f-action').value = client.Action || '';
  document.getElementById('f-notes').value = client.Notes || '';
  document.getElementById('client-modal').classList.add('open');
});

document.getElementById('modal-cancel').addEventListener('click', () => {
  document.getElementById('client-modal').classList.remove('open');
});
document.getElementById('client-modal').addEventListener('click', (e) => {
  if (e.target.id === 'client-modal') document.getElementById('client-modal').classList.remove('open');
});

document.getElementById('client-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    Name: document.getElementById('f-name').value.trim(),
    Number: document.getElementById('f-number').value.trim(),
    Country: document.getElementById('f-country').value.trim(),
    Platform: document.getElementById('f-platform').value.trim(),
    Type: document.getElementById('f-type').value,
    Chance: document.getElementById('f-chance').value,
    Service: document.getElementById('f-service').value.trim(),
    Business: document.getElementById('f-business').value.trim(),
    BulkBilling: document.getElementById('f-bulk-billing').checked,
    Action: document.getElementById('f-action').value.trim(),
    Notes: document.getElementById('f-notes').value.trim(),
  };
  await fetch(`/api/clients/${encodeURIComponent(clientId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  document.getElementById('client-modal').classList.remove('open');
  await loadClient();
  await loadHistory();
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
});

loadAll();
