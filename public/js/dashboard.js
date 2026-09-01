// ─── State ───────────────────────────────────────────────────────────────

let allClients = [];
let allTasks = [];
let allPayments = [];
let editingId = null;        // client being edited in the client modal
let currentDetailId = null;  // client currently open in the detail modal

// ─── Helpers ─────────────────────────────────────────────────────────────

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str === undefined || str === null ? '' : str;
  return div.innerHTML;
}

function formatDate(str, withTime) {
  const d = new Date(str);
  if (isNaN(d)) return str;
  const opts = withTime
    ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' };
  return d.toLocaleDateString('en-IN', opts);
}

function toInputDate(d) {
  return d.toISOString().slice(0, 10);
}

function inRange(dateStr, from, to) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d)) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function clientName(id) {
  const c = allClients.find(x => x.UniqueID === id);
  return c ? c.Name : '';
}

// ─── Load data ───────────────────────────────────────────────────────────

async function loadClients() {
  const res = await fetch('/api/clients');
  if (res.status === 401) { window.location.href = '/login.html'; return; }
  const data = await res.json();
  allClients = Array.isArray(data) ? data : [];
}

async function loadTasks() {
  const res = await fetch('/api/tasks');
  if (res.status === 401) { window.location.href = '/login.html'; return; }
  const data = await res.json();
  allTasks = Array.isArray(data) ? data : [];
}

async function loadPayments() {
  const res = await fetch('/api/payments');
  if (res.status === 401) { window.location.href = '/login.html'; return; }
  const data = await res.json();
  allPayments = Array.isArray(data) ? data : [];
}

async function loadAll() {
  try {
    await Promise.all([loadClients(), loadTasks(), loadPayments()]);
  } catch (err) {
    console.error('Failed to load data:', err);
  }
  populateClientSelects();
  renderDashboard();
  renderClients();
  renderTasks();
  renderStatus();
}

async function refreshAfterChange() {
  await Promise.all([loadClients(), loadTasks(), loadPayments()]);
  populateClientSelects();
  renderDashboard();
  renderClients();
  renderTasks();
  renderStatus();
  if (currentDetailId) {
    const c = allClients.find(x => x.UniqueID === currentDetailId);
    if (c) renderDetailInfo(c);
    renderDetailTasks();
    renderDetailPayments();
    await loadDetailHistory(currentDetailId);
  }
}

// ─── Tabs ────────────────────────────────────────────────────────────────

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => { p.hidden = p.id !== `tab-${tab}`; });
}

document.getElementById('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;
  switchTab(btn.dataset.tab);
});

// ─── Dashboard tab ───────────────────────────────────────────────────────

function getDashRange() {
  const fromVal = document.getElementById('dash-from').value;
  const toVal = document.getElementById('dash-to').value;
  return {
    from: fromVal ? new Date(fromVal) : null,
    to: toVal ? new Date(toVal + 'T23:59:59') : null,
  };
}

function setQuickRange(range) {
  const today = new Date();
  let from = null, to = null;
  if (range === '7') { to = today; from = new Date(today); from.setDate(from.getDate() - 6); }
  else if (range === '30') { to = today; from = new Date(today); from.setDate(from.getDate() - 29); }
  else if (range === 'month') { from = new Date(today.getFullYear(), today.getMonth(), 1); to = today; }
  // 'all' -> leave from/to empty

  document.getElementById('dash-from').value = from ? toInputDate(from) : '';
  document.getElementById('dash-to').value = to ? toInputDate(to) : '';
  renderDashboard();
}

document.getElementById('dash-quick-range').addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  document.querySelectorAll('#dash-quick-range .chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  setQuickRange(btn.dataset.range);
});
document.getElementById('dash-from').addEventListener('change', () => {
  document.querySelectorAll('#dash-quick-range .chip').forEach(c => c.classList.remove('active'));
  renderDashboard();
});
document.getElementById('dash-to').addEventListener('change', () => {
  document.querySelectorAll('#dash-quick-range .chip').forEach(c => c.classList.remove('active'));
  renderDashboard();
});

function renderDashboard() {
  const { from, to } = getDashRange();
  const hasRange = from || to;
  const workTasks = hasRange ? allTasks.filter(t => inRange(t.DueDate, from, to)) : allTasks.slice();

  const today = new Date();
  const pending = workTasks.filter(t => (t.Status || '').toLowerCase() !== 'done');
  const done = workTasks.filter(t => (t.Status || '').toLowerCase() === 'done');
  const overdue = pending.filter(t => t.DueDate && new Date(t.DueDate) < today);

  document.getElementById('dstat-clients').textContent = allClients.length;
  document.getElementById('dstat-work').textContent = workTasks.length;
  document.getElementById('dstat-pending').textContent = pending.length;
  document.getElementById('dstat-done').textContent = done.length;
  document.getElementById('dstat-overdue').textContent = overdue.length;

  document.getElementById('dash-work-count').textContent =
    workTasks.length ? `— ${workTasks.length} task${workTasks.length !== 1 ? 's' : ''}` : '';

  const body = document.getElementById('dash-work-body');
  if (!workTasks.length) {
    body.innerHTML = `<div class="empty-state"><h3>No work in range</h3><p>Try widening the date range.</p></div>`;
    return;
  }

  const sorted = workTasks.slice().sort((a, b) => new Date(a.DueDate || 0) - new Date(b.DueDate || 0));
  body.innerHTML = sorted.map(t => {
    const isDone = (t.Status || '').toLowerCase() === 'done';
    const isOverdue = !isDone && t.DueDate && new Date(t.DueDate) < today;
    const tagClass = isOverdue ? 'overdue' : (isDone ? 'paid' : 'pending');
    const label = isOverdue ? 'Overdue' : (isDone ? 'Done' : 'Pending');
    return `
      <div class="ledger-row task-grid">
        <div class="name" onclick="openDetail('${t.ClientID}')">${escapeHtml(t.ClientName || clientName(t.ClientID))}</div>
        <div>${escapeHtml(t.Description || '')}</div>
        <div class="mono">${t.DueDate ? escapeHtml(formatDate(t.DueDate)) : '—'}</div>
        <div><span class="tag ${tagClass}">${label}</span></div>
      </div>`;
  }).join('');
}

// ─── Clients tab ─────────────────────────────────────────────────────────

function getFilteredClients() {
  const search = document.getElementById('c-search').value.toLowerCase().trim();
  const typeFilter = document.getElementById('c-filter-type').value;
  return allClients.filter(c => {
    if (typeFilter && c.Type !== typeFilter) return false;
    if (search) {
      const hay = [c.Name, c.Business, c.Service, c.Number, c.Country].join(' ').toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

function clientCardHtml(c) {
  const chance = Number(c.Chance) || 0;
  const statusClass = (c.Type || '').toLowerCase();
  const paymentClass = (c.PaymentStatus || 'pending').toLowerCase();
  return `
    <div class="panel" style="cursor:pointer;" onclick="openDetail('${c.UniqueID}')">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
        <div>
          <div class="name">${escapeHtml(c.Name)}</div>
          <div class="sub">${escapeHtml(c.Business || '')}${c.Service ? ' · ' + escapeHtml(c.Service) : ''}${c.Platform ? ' · ' + escapeHtml(c.Platform) : ''}</div>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <span class="tag ${statusClass}">${escapeHtml(c.Type || '—')}</span>
          <span class="tag ${paymentClass}">${escapeHtml(c.PaymentStatus || 'Pending')}</span>
        </div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
        <div class="chance-meter">
          <div class="bar"><span style="width:${chance}%"></span></div>
          <span class="num mono">${chance}%</span>
        </div>
        <div class="row-actions" onclick="event.stopPropagation()">
          <button class="ghost small" onclick="openEdit('${c.UniqueID}')">Edit</button>
          <button class="danger small" onclick="deleteClient('${c.UniqueID}')">Delete</button>
        </div>
      </div>
    </div>
  `;
}

function renderClients() {
  const list = getFilteredClients();
  const body = document.getElementById('clients-list');
  if (!list.length) {
    body.innerHTML = `<div class="empty-state">
      <h3>${allClients.length === 0 ? 'No clients yet' : 'Nothing matches'}</h3>
      <p>${allClients.length === 0 ? 'Add your first client to start the ledger.' : 'Try a different search or filter.'}</p>
    </div>`;
    return;
  }
  body.innerHTML = list.map(clientCardHtml).join('');
}

document.getElementById('c-search').addEventListener('input', renderClients);
document.getElementById('c-filter-type').addEventListener('change', renderClients);
document.getElementById('c-add-btn').addEventListener('click', openCreate);

// ─── Client add/edit modal ──────────────────────────────────────────────

function openCreate() {
  editingId = null;
  document.getElementById('modal-title').textContent = 'New client';
  document.getElementById('modal-save').textContent = 'Save client';
  document.getElementById('client-form').reset();
  document.getElementById('f-id').value = '';
  document.getElementById('client-modal').classList.add('open');
}

function openEdit(id) {
  const c = allClients.find(x => x.UniqueID === id);
  if (!c) return;
  editingId = id;
  document.getElementById('modal-title').textContent = 'Edit client';
  document.getElementById('modal-save').textContent = 'Update client';
  document.getElementById('f-id').value = id;
  document.getElementById('f-name').value = c.Name || '';
  document.getElementById('f-number').value = c.Number || '';
  document.getElementById('f-country').value = c.Country || '';
  document.getElementById('f-platform').value = c.Platform || '';
  document.getElementById('f-type').value = c.Type || 'Warm';
  document.getElementById('f-chance').value = c.Chance || '';
  document.getElementById('f-service').value = c.Service || '';
  document.getElementById('f-business').value = c.Business || '';
  document.getElementById('f-payment-status').value = c.PaymentStatus || 'Pending';
  document.getElementById('f-action').value = c.Action || '';
  document.getElementById('f-notes').value = c.Notes || '';
  document.getElementById('client-modal').classList.add('open');
}

function closeModal() {
  document.getElementById('client-modal').classList.remove('open');
}

async function deleteClient(id) {
  if (!confirm('Delete this client? This cannot be undone.')) return;
  const res = await fetch(`/api/clients/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) { alert('Failed to delete client.'); return; }
  if (currentDetailId === id) closeDetailModal();
  await refreshAfterChange();
}

document.getElementById('modal-cancel').addEventListener('click', closeModal);
document.getElementById('client-modal').addEventListener('click', (e) => {
  if (e.target.id === 'client-modal') closeModal();
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
    PaymentStatus: document.getElementById('f-payment-status').value,
    Action: document.getElementById('f-action').value.trim(),
    Notes: document.getElementById('f-notes').value.trim(),
  };

  const url = editingId ? `/api/clients/${encodeURIComponent(editingId)}` : '/api/clients';
  const method = editingId ? 'PUT' : 'POST';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.error || 'Failed to save client.');
    return;
  }

  closeModal();
  await refreshAfterChange();
});

// ─── Tasks tab ───────────────────────────────────────────────────────────

function populateClientSelects() {
  const sorted = allClients.slice().sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));
  ['t-filter-client', 's-filter-client'].forEach(id => {
    const sel = document.getElementById(id);
    const current = sel.value;
    sel.innerHTML = '<option value="">All clients</option>' +
      sorted.map(c => `<option value="${c.UniqueID}">${escapeHtml(c.Name)}</option>`).join('');
    if ([...sel.options].some(o => o.value === current)) sel.value = current;
  });

  const tfSel = document.getElementById('tf-client');
  const tfCurrent = tfSel.value;
  tfSel.innerHTML = '<option value="">Select client…</option>' +
    sorted.map(c => `<option value="${c.UniqueID}">${escapeHtml(c.Name)}</option>`).join('');
  if ([...tfSel.options].some(o => o.value === tfCurrent)) tfSel.value = tfCurrent;
}

function getFilteredTasks() {
  const clientFilter = document.getElementById('t-filter-client').value;
  const statusFilter = document.getElementById('t-filter-status').value;
  const fromVal = document.getElementById('t-from').value;
  const toVal = document.getElementById('t-to').value;
  const from = fromVal ? new Date(fromVal) : null;
  const to = toVal ? new Date(toVal + 'T23:59:59') : null;

  return allTasks.filter(t => {
    if (clientFilter && t.ClientID !== clientFilter) return false;
    if (statusFilter && (t.Status || 'Pending') !== statusFilter) return false;
    if ((from || to) && !inRange(t.DueDate, from, to)) return false;
    return true;
  });
}

function renderTasks() {
  const list = getFilteredTasks().slice().sort((a, b) => new Date(a.DueDate || 0) - new Date(b.DueDate || 0));
  const body = document.getElementById('tasks-body');
  if (!list.length) {
    body.innerHTML = `<div class="empty-state"><h3>No tasks</h3><p>Try a different filter, or add a task.</p></div>`;
    return;
  }

  const today = new Date();
  body.innerHTML = list.map(t => {
    const isDone = (t.Status || '').toLowerCase() === 'done';
    const isOverdue = !isDone && t.DueDate && new Date(t.DueDate) < today;
    const tagClass = isOverdue ? 'overdue' : (isDone ? 'paid' : 'pending');
    const label = isOverdue ? 'Overdue' : (isDone ? 'Done' : 'Pending');
    return `
      <div class="ledger-row task-grid">
        <div class="name" onclick="openDetail('${t.ClientID}')">${escapeHtml(t.ClientName || clientName(t.ClientID))}</div>
        <div>${escapeHtml(t.Description || '')}</div>
        <div class="mono">${t.DueDate ? escapeHtml(formatDate(t.DueDate)) : '—'}</div>
        <div><span class="tag ${tagClass}">${label}</span></div>
        <div class="row-actions">
          <button class="ghost small" onclick="toggleTaskStatus('${t.TaskID}', ${!isDone})">${isDone ? 'Reopen' : 'Done'}</button>
          <button class="danger small" onclick="deleteTaskGlobal('${t.TaskID}')">&times;</button>
        </div>
      </div>`;
  }).join('');
}

document.getElementById('t-filter-client').addEventListener('change', renderTasks);
document.getElementById('t-filter-status').addEventListener('change', renderTasks);
document.getElementById('t-from').addEventListener('change', renderTasks);
document.getElementById('t-to').addEventListener('change', renderTasks);

document.getElementById('t-add-btn').addEventListener('click', () => {
  document.getElementById('task-form').reset();
  document.getElementById('task-modal').classList.add('open');
});
document.getElementById('task-modal-cancel').addEventListener('click', () => {
  document.getElementById('task-modal').classList.remove('open');
});
document.getElementById('task-modal').addEventListener('click', (e) => {
  if (e.target.id === 'task-modal') document.getElementById('task-modal').classList.remove('open');
});

document.getElementById('task-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const clientId = document.getElementById('tf-client').value;
  const description = document.getElementById('tf-desc').value.trim();
  if (!clientId || !description) return;
  const dueDate = document.getElementById('tf-due').value;
  const status = document.getElementById('tf-status').value;

  const res = await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, description, dueDate, status }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.error || 'Failed to add task.');
    return;
  }

  document.getElementById('task-modal').classList.remove('open');
  await refreshAfterChange();
});

async function toggleTaskStatus(taskId, makeDone) {
  await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: makeDone ? 'Done' : 'Pending' }),
  });
  await refreshAfterChange();
}

async function deleteTaskGlobal(taskId) {
  if (!confirm('Delete this task?')) return;
  await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
  await refreshAfterChange();
}

// ─── Status tab ──────────────────────────────────────────────────────────

function computeClientWorkStatus(clientId) {
  const tasks = allTasks.filter(t => t.ClientID === clientId);
  if (!tasks.length) return 'clear';
  const today = new Date();
  const hasOverdue = tasks.some(t => (t.Status || '').toLowerCase() !== 'done' && t.DueDate && new Date(t.DueDate) < today);
  if (hasOverdue) return 'overdue';
  const hasOpen = tasks.some(t => (t.Status || '').toLowerCase() !== 'done');
  return hasOpen ? 'ontrack' : 'clear';
}

function getFilteredStatusRows() {
  const clientFilter = document.getElementById('s-filter-client').value;
  const workFilter = document.getElementById('s-filter-work').value;
  const paymentFilter = document.getElementById('s-filter-payment').value;

  return allClients.filter(c => {
    if (clientFilter && c.UniqueID !== clientFilter) return false;
    if (workFilter && computeClientWorkStatus(c.UniqueID) !== workFilter) return false;
    if (paymentFilter && (c.PaymentStatus || 'Pending') !== paymentFilter) return false;
    return true;
  });
}

function renderStatus() {
  const list = getFilteredStatusRows();
  const body = document.getElementById('status-body');
  if (!list.length) {
    body.innerHTML = `<div class="empty-state"><h3>No clients match</h3><p>Try a different filter.</p></div>`;
    return;
  }

  const workLabels = { ontrack: 'On track', overdue: 'Overdue', clear: 'Clear' };
  const workClass = { ontrack: 'pending', overdue: 'overdue', clear: 'paid' };

  body.innerHTML = list.map(c => {
    const work = computeClientWorkStatus(c.UniqueID);
    const paymentClass = (c.PaymentStatus || 'pending').toLowerCase();
    return `
      <div class="ledger-row status-grid">
        <div class="name" onclick="openDetail('${c.UniqueID}')">${escapeHtml(c.Name)}</div>
        <div><span class="tag ${workClass[work]}">${workLabels[work]}</span></div>
        <div><span class="tag ${paymentClass}">${escapeHtml(c.PaymentStatus || 'Pending')}</span></div>
        <div class="sub">${escapeHtml(c.Action || '')}</div>
        <div class="row-actions">
          <button class="ghost small" onclick="openDetail('${c.UniqueID}')">View</button>
        </div>
      </div>`;
  }).join('');
}

document.getElementById('s-filter-client').addEventListener('change', renderStatus);
document.getElementById('s-filter-work').addEventListener('change', renderStatus);
document.getElementById('s-filter-payment').addEventListener('change', renderStatus);

// ─── Client detail modal ─────────────────────────────────────────────────

function closeDetailModal() {
  document.getElementById('detail-modal').classList.remove('open');
  currentDetailId = null;
}

async function openDetail(id) {
  currentDetailId = id;
  document.getElementById('detail-modal').classList.add('open');

  const c = allClients.find(x => x.UniqueID === id);
  if (c) renderDetailInfo(c);

  document.getElementById('detail-t-from').value = '';
  document.getElementById('detail-t-to').value = '';

  renderDetailTasks();
  renderDetailPayments();
  await loadDetailHistory(id);
}

function renderDetailInfo(c) {
  document.getElementById('detail-name').textContent = c.Name;
  const rows = [
    ['Number', c.Number],
    ['Country', c.Country],
    ['Platform', c.Platform],
    ['Status', c.Type],
    ['Chance', (c.Chance || 0) + '%'],
    ['Service', c.Service],
    ['Business', c.Business],
    ['Next action', c.Action],
    ['Payment status', c.PaymentStatus],
    ['Notes', c.Notes],
  ];
  document.getElementById('detail-info-body').innerHTML = rows
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `<div class="info-row"><div class="k">${k}</div><div class="v">${escapeHtml(v)}</div></div>`)
    .join('');
}

function renderDetailTasks() {
  if (!currentDetailId) return;
  const fromVal = document.getElementById('detail-t-from').value;
  const toVal = document.getElementById('detail-t-to').value;
  const from = fromVal ? new Date(fromVal) : null;
  const to = toVal ? new Date(toVal + 'T23:59:59') : null;

  let tasks = allTasks.filter(t => t.ClientID === currentDetailId);
  if (from || to) tasks = tasks.filter(t => inRange(t.DueDate, from, to));
  tasks = tasks.slice().sort((a, b) => new Date(a.DueDate || 0) - new Date(b.DueDate || 0));

  const body = document.getElementById('detail-tasks-body');
  if (!tasks.length) {
    body.innerHTML = '<p style="color:var(--ink-faint); font-size:13.5px;">No tasks.</p>';
    return;
  }
  body.innerHTML = tasks.map(t => `
    <div class="task-row">
      <input type="checkbox" ${t.Status === 'Done' ? 'checked' : ''} onchange="toggleDetailTask('${t.TaskID}', this.checked)">
      <div class="desc ${t.Status === 'Done' ? 'done' : ''}">${escapeHtml(t.Description)}</div>
      ${t.DueDate ? `<div class="due mono">${escapeHtml(formatDate(t.DueDate))}</div>` : ''}
      <button class="ghost small" onclick="deleteDetailTask('${t.TaskID}')">&times;</button>
    </div>
  `).join('');
}

document.getElementById('detail-t-from').addEventListener('change', renderDetailTasks);
document.getElementById('detail-t-to').addEventListener('change', renderDetailTasks);

async function toggleDetailTask(taskId, done) {
  await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: done ? 'Done' : 'Pending' }),
  });
  await refreshAfterChange();
}

async function deleteDetailTask(taskId) {
  if (!confirm('Delete this task?')) return;
  await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
  await refreshAfterChange();
}

document.getElementById('detail-add-task-btn').addEventListener('click', async () => {
  if (!currentDetailId) return;
  const description = document.getElementById('detail-new-task-desc').value.trim();
  if (!description) return;
  const dueDate = document.getElementById('detail-new-task-due').value;

  await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: currentDetailId, description, dueDate, status: 'Pending' }),
  });

  document.getElementById('detail-new-task-desc').value = '';
  document.getElementById('detail-new-task-due').value = '';
  await refreshAfterChange();
});

function renderDetailPayments() {
  if (!currentDetailId) return;
  const payments = allPayments.filter(p => p.ClientID === currentDetailId);
  const body = document.getElementById('detail-payments-body');
  if (!payments.length) {
    body.innerHTML = '<p style="color:var(--ink-faint); font-size:13.5px;">No payments logged yet.</p>';
    return;
  }
  body.innerHTML = payments.map(p => `
    <div class="payment-row">
      <div class="amount mono">₹${escapeHtml(p.Amount)}</div>
      <div class="meta">${escapeHtml(p.Notes || '')} ${p.Date ? '· ' + escapeHtml(formatDate(p.Date)) : ''}</div>
      <span class="tag ${(p.Status || '').toLowerCase()}">${escapeHtml(p.Status)}</span>
      <button class="ghost small" onclick="deleteDetailPayment('${p.PaymentID}')">&times;</button>
    </div>
  `).join('');
}

async function deleteDetailPayment(paymentId) {
  if (!confirm('Delete this payment record?')) return;
  await fetch(`/api/payments/${encodeURIComponent(paymentId)}`, { method: 'DELETE' });
  await refreshAfterChange();
}

document.getElementById('detail-add-payment-btn').addEventListener('click', async () => {
  if (!currentDetailId) return;
  const amount = document.getElementById('detail-new-payment-amount').value;
  if (!amount) return;
  const status = document.getElementById('detail-new-payment-status').value;
  const notes = document.getElementById('detail-new-payment-notes').value.trim();

  await fetch('/api/payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: currentDetailId, amount, status, notes, date: new Date().toISOString() }),
  });

  document.getElementById('detail-new-payment-amount').value = '';
  document.getElementById('detail-new-payment-notes').value = '';
  await refreshAfterChange();
});

async function loadDetailHistory(id) {
  const body = document.getElementById('detail-history-body');
  body.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const res = await fetch(`/api/clients/${encodeURIComponent(id)}/history`);
    const history = await res.json();
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
  } catch (err) {
    body.innerHTML = `<p style="color:var(--danger); font-size:13.5px;">${escapeHtml(err.message)}</p>`;
  }
}

document.getElementById('detail-close-btn').addEventListener('click', closeDetailModal);
document.getElementById('detail-modal').addEventListener('click', (e) => {
  if (e.target.id === 'detail-modal') closeDetailModal();
});
document.getElementById('detail-edit-btn').addEventListener('click', () => {
  if (currentDetailId) openEdit(currentDetailId);
});
document.getElementById('detail-delete-btn').addEventListener('click', () => {
  if (currentDetailId) deleteClient(currentDetailId);
});

// ─── Logout ──────────────────────────────────────────────────────────────

document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
});

// ─── Init ────────────────────────────────────────────────────────────────

loadAll();
