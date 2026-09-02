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
  const c = allClients.find(x => String(x.UniqueID) === String(id));
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
  renderEarnings();
}

async function refreshAfterChange() {
  await Promise.all([loadClients(), loadTasks(), loadPayments()]);
  populateClientSelects();
  renderDashboard();
  renderClients();
  renderTasks();
  renderStatus();
  renderEarnings();
  if (currentDetailId) {
    const c = allClients.find(x => String(x.UniqueID) === String(currentDetailId));
    if (c) renderDetailInfo(c);
    renderDetailTasks();
    renderDetailPayments();
    await loadDetailHistory(currentDetailId);
    await loadDetailShareLinks(currentDetailId);
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

  // Priority order for "what to complete first":
  //   1. Pending tasks with a due date, soonest (most overdue) first
  //   2. Pending tasks with no due date — still need doing, just not
  //      "when", so they come after anything with an actual deadline
  //   3. Done tasks last — nothing left to complete here
  function taskTier(t) {
    const isDone = (t.Status || '').toLowerCase() === 'done';
    if (isDone) return 2;
    return t.DueDate ? 0 : 1;
  }

  const sorted = workTasks.slice().sort((a, b) => {
    const ta = taskTier(a), tb = taskTier(b);
    if (ta !== tb) return ta - tb;
    if (ta === 0) return new Date(a.DueDate) - new Date(b.DueDate);
    if (ta === 2) return new Date(b.DueDate || 0) - new Date(a.DueDate || 0); // most recently done first
    return (a.Description || '').localeCompare(b.Description || '');
  });

  const groupLabels = {
    0: null, // no header needed — this is the default "top of the list" group
    1: 'No due date',
    2: 'Done',
  };

  let lastTier = null;
  const rowsHtml = sorted.map(t => {
    const tier = taskTier(t);
    const isDone = tier === 2;
    const isOverdue = tier === 0 && new Date(t.DueDate) < today;
    const tagClass = isOverdue ? 'overdue' : (isDone ? 'paid' : 'pending');
    const label = isOverdue ? 'Overdue' : (isDone ? 'Done' : 'Pending');

    let groupHeader = '';
    if (tier !== lastTier && groupLabels[tier]) {
      groupHeader = `<div class="sub" style="grid-column: 1 / -1; font-weight:600; padding-top:10px;">${groupLabels[tier]}</div>`;
    }
    lastTier = tier;

    return groupHeader + `
      <div class="ledger-row task-grid">
        <div class="name" onclick="openDetail('${t.ClientID}')">${escapeHtml(t.ClientName || clientName(t.ClientID))}</div>
        <div>${escapeHtml(t.Description || '')}</div>
        <div class="mono">${t.DueDate ? escapeHtml(formatDate(t.DueDate)) : '—'}</div>
        <div><span class="tag ${tagClass}">${label}</span></div>
        <div><span class="tag ${(t.PaymentStatus || 'pending').toLowerCase()}">${escapeHtml(t.PaymentStatus || 'Pending')}</span></div>
      </div>`;
  }).join('');
  body.innerHTML = rowsHtml;
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
  return `
    <div class="panel" style="cursor:pointer;" onclick="openDetail('${c.UniqueID}')">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
        <div>
          <div class="name">${escapeHtml(c.Name)}</div>
          <div class="sub">${escapeHtml(c.Business || '')}${c.Service ? ' · ' + escapeHtml(c.Service) : ''}${c.Platform ? ' · ' + escapeHtml(c.Platform) : ''}</div>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <span class="tag ${statusClass}">${escapeHtml(c.Type || '—')}</span>
        </div>
      </div>
      ${c.Action ? `<div class="sub" style="margin-top:10px;"><strong>Next action:</strong> ${escapeHtml(c.Action)}</div>` : ''}
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
  const c = allClients.find(x => String(x.UniqueID) === String(id));
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
  const usable = allClients.filter(c => c.UniqueID !== undefined && c.UniqueID !== null && c.UniqueID !== '');
  if (usable.length !== allClients.length) {
    console.warn(`${allClients.length - usable.length} client(s) have no UniqueID and were left out of the client dropdowns — check the "UniqueID" header cell in your Clients sheet.`);
  }
  const sorted = usable.slice().sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));
  ['t-filter-client', 's-filter-client', 'e-filter-client'].forEach(id => {
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
    if (clientFilter && String(t.ClientID) !== String(clientFilter)) return false;
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
        <div>${paymentSelectHtml(t)}</div>
        <div class="row-actions">
          <button class="ghost small" onclick="toggleTaskStatus('${t.TaskID}', ${!isDone})">${isDone ? 'Reopen' : 'Done'}</button>
          <button class="danger small" onclick="deleteTaskGlobal('${t.TaskID}')">&times;</button>
        </div>
      </div>`;
  }).join('');
}

// Renders a small pill-styled <select> for a task's payment status, so it
// can be viewed and changed inline without opening the task.
function paymentSelectHtml(t) {
  const current = t.PaymentStatus || 'Pending';
  return `<select class="tag-select ${current.toLowerCase()}" onchange="setTaskPaymentStatus('${t.TaskID}', this.value)">
    ${['Pending', 'Paid', 'Overdue'].map(s => `<option value="${s}" ${s === current ? 'selected' : ''}>${s}</option>`).join('')}
  </select>`;
}

async function setTaskPaymentStatus(taskId, paymentStatus) {
  await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentStatus }),
  });
  await refreshAfterChange();
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
  const paymentStatus = document.getElementById('tf-payment-status').value;

  const res = await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, description, dueDate, status, paymentStatus }),
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

// Payment status now lives per task, so a client's "payment status" is a
// summary across its tasks rather than a single value.
function clientPaymentTasks(clientId) {
  return allTasks.filter(t => String(t.ClientID) === String(clientId));
}

function computeClientPaymentSummary(clientId) {
  const tasks = clientPaymentTasks(clientId);
  if (!tasks.length) return { label: 'No tasks', dominant: null, counts: {} };
  const counts = { Paid: 0, Pending: 0, Overdue: 0 };
  tasks.forEach(t => { counts[t.PaymentStatus || 'Pending'] = (counts[t.PaymentStatus || 'Pending'] || 0) + 1; });
  // Worst-first: if anything is overdue or pending, lead with that so the
  // summary surfaces what still needs attention.
  const dominant = counts.Overdue ? 'Overdue' : (counts.Pending ? 'Pending' : 'Paid');
  const label = ['Overdue', 'Pending', 'Paid']
    .filter(k => counts[k])
    .map(k => `${counts[k]} ${k}`)
    .join(' · ');
  return { label, dominant, counts };
}

function getFilteredStatusRows() {
  const search = document.getElementById('s-search').value.toLowerCase().trim();
  const clientFilter = document.getElementById('s-filter-client').value;
  const workFilter = document.getElementById('s-filter-work').value;
  const paymentFilter = document.getElementById('s-filter-payment').value;

  return allClients.filter(c => {
    if (clientFilter && String(c.UniqueID) !== String(clientFilter)) return false;
    if (workFilter && computeClientWorkStatus(c.UniqueID) !== workFilter) return false;
    if (paymentFilter && !clientPaymentTasks(c.UniqueID).some(t => (t.PaymentStatus || 'Pending') === paymentFilter)) return false;
    if (search) {
      const hay = [c.Name, c.Business, c.Service, c.Number, c.Country].join(' ').toLowerCase();
      if (!hay.includes(search)) return false;
    }
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
    const payment = computeClientPaymentSummary(c.UniqueID);
    const paymentClass = payment.dominant ? payment.dominant.toLowerCase() : '';
    const nameText = (c.Name && String(c.Name).trim()) || '(no name)';
    if (nameText === '(no name)') {
      console.warn('Client is missing a Name value — check the "Name" header cell in your Clients sheet:', c);
    }
    return `
      <div class="ledger-row status-grid">
        <div class="name" onclick="openDetail('${c.UniqueID}')">${escapeHtml(nameText)}</div>
        <div><span class="tag ${workClass[work]}">${workLabels[work]}</span></div>
        <div>${payment.dominant ? `<span class="tag ${paymentClass}">${escapeHtml(payment.label)}</span>` : `<span class="sub">${payment.label}</span>`}</div>
        <div class="sub">${escapeHtml(c.Action || '')}</div>
        <div class="row-actions">
          <button class="ghost small" onclick="openDetail('${c.UniqueID}')">View</button>
        </div>
      </div>`;
  }).join('');
}

document.getElementById('s-search').addEventListener('input', renderStatus);
document.getElementById('s-filter-client').addEventListener('change', renderStatus);
document.getElementById('s-filter-work').addEventListener('change', renderStatus);
document.getElementById('s-filter-payment').addEventListener('change', renderStatus);

// ─── Earnings tab ────────────────────────────────────────────────────────

function formatMoney(n) {
  const num = Number(n) || 0;
  return '₹' + num.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function getEarningsRange() {
  const fromVal = document.getElementById('e-from').value;
  const toVal = document.getElementById('e-to').value;
  return {
    from: fromVal ? new Date(fromVal) : null,
    to: toVal ? new Date(toVal + 'T23:59:59') : null,
  };
}

function setEarningsQuickRange(range) {
  const today = new Date();
  let from = null, to = null;
  if (range === '7') { to = today; from = new Date(today); from.setDate(from.getDate() - 6); }
  else if (range === '30') { to = today; from = new Date(today); from.setDate(from.getDate() - 29); }
  else if (range === 'month') { from = new Date(today.getFullYear(), today.getMonth(), 1); to = today; }
  // 'all' -> leave from/to empty

  document.getElementById('e-from').value = from ? toInputDate(from) : '';
  document.getElementById('e-to').value = to ? toInputDate(to) : '';
  renderEarnings();
}

document.getElementById('e-quick-range').addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  document.querySelectorAll('#e-quick-range .chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  setEarningsQuickRange(btn.dataset.range);
});
document.getElementById('e-from').addEventListener('change', () => {
  document.querySelectorAll('#e-quick-range .chip').forEach(c => c.classList.remove('active'));
  renderEarnings();
});
document.getElementById('e-to').addEventListener('change', () => {
  document.querySelectorAll('#e-quick-range .chip').forEach(c => c.classList.remove('active'));
  renderEarnings();
});
document.getElementById('e-filter-client').addEventListener('change', renderEarnings);
document.getElementById('e-filter-status').addEventListener('change', renderEarnings);

function getFilteredEarnings() {
  const { from, to } = getEarningsRange();
  const clientFilter = document.getElementById('e-filter-client').value;
  const statusFilter = document.getElementById('e-filter-status').value;

  return allPayments.filter(p => {
    if ((from || to) && !inRange(p.Date, from, to)) return false;
    if (clientFilter && String(p.ClientID) !== String(clientFilter)) return false;
    if (statusFilter && (p.Status || 'Pending') !== statusFilter) return false;
    return true;
  });
}

function renderEarnings() {
  const list = getFilteredEarnings();

  const paid = list.filter(p => (p.Status || '').toLowerCase() === 'paid');
  const pending = list.filter(p => (p.Status || '').toLowerCase() === 'pending');
  const overdue = list.filter(p => (p.Status || '').toLowerCase() === 'overdue');

  const sum = arr => arr.reduce((total, p) => total + (Number(p.Amount) || 0), 0);
  const totalPaid = sum(paid);
  const totalPending = sum(pending);
  const totalOverdue = sum(overdue);

  document.getElementById('estat-total').textContent = formatMoney(totalPaid);
  document.getElementById('estat-pending').textContent = formatMoney(totalPending);
  document.getElementById('estat-overdue').textContent = formatMoney(totalOverdue);
  document.getElementById('estat-count').textContent = list.length;

  // ── Earnings by client (Paid only, so this reads as "who has actually paid") ──
  const byClientBody = document.getElementById('earnings-by-client-body');
  const byClient = new Map();
  paid.forEach(p => {
    const key = String(p.ClientID);
    byClient.set(key, (byClient.get(key) || 0) + (Number(p.Amount) || 0));
  });
  const breakdown = [...byClient.entries()]
    .map(([id, amount]) => ({ id, amount, name: clientName(id) || '(unknown client)' }))
    .sort((a, b) => b.amount - a.amount);

  if (!breakdown.length) {
    byClientBody.innerHTML = '<p style="color:var(--ink-faint); font-size:13.5px;">No paid earnings in range.</p>';
  } else {
    const max = breakdown[0].amount || 1;
    byClientBody.innerHTML = breakdown.map(b => `
      <div class="breakdown-row">
        <div class="name" onclick="openDetail('${b.id}')">${escapeHtml(b.name)}</div>
        <div class="bar"><span style="width:${Math.max(4, (b.amount / max) * 100)}%"></span></div>
        <div class="amount">${formatMoney(b.amount)}</div>
      </div>`).join('');
  }

  // ── Ledger of individual payments ──
  const body = document.getElementById('earnings-body');
  if (!list.length) {
    body.innerHTML = `<div class="empty-state"><h3>No payments in range</h3><p>Try widening the date range or clearing a filter.</p></div>`;
    return;
  }
  const sorted = list.slice().sort((a, b) => new Date(b.Date || 0) - new Date(a.Date || 0));
  body.innerHTML = sorted.map(p => `
    <div class="ledger-row earnings-grid">
      <div class="name" onclick="openDetail('${p.ClientID}')">${escapeHtml(p.ClientName || clientName(p.ClientID))}</div>
      <div class="mono">${formatMoney(p.Amount)}</div>
      <div class="mono">${p.Date ? escapeHtml(formatDate(p.Date)) : '—'}</div>
      <div><span class="tag ${(p.Status || '').toLowerCase()}">${escapeHtml(p.Status || 'Pending')}</span></div>
      <div class="sub">${escapeHtml(p.Notes || '')}</div>
      <div class="row-actions">
        <button class="danger small" onclick="deleteEarningsPayment('${p.PaymentID}')">&times;</button>
      </div>
    </div>`).join('');
}

async function deleteEarningsPayment(paymentId) {
  if (!confirm('Delete this payment record?')) return;
  await fetch(`/api/payments/${encodeURIComponent(paymentId)}`, { method: 'DELETE' });
  await refreshAfterChange();
}

// ─── Client detail modal ─────────────────────────────────────────────────

function closeDetailModal() {
  document.getElementById('detail-modal').classList.remove('open');
  currentDetailId = null;
}

async function openDetail(id) {
  currentDetailId = id;
  document.getElementById('detail-modal').classList.add('open');

  const c = allClients.find(x => String(x.UniqueID) === String(id));
  if (c) {
    renderDetailInfo(c);
  } else {
    document.getElementById('detail-info-body').innerHTML =
      '<p style="color:var(--danger); font-size:13.5px;">Could not find this client in the loaded list. Try closing and reopening.</p>';
  }

  document.getElementById('detail-t-from').value = '';
  document.getElementById('detail-t-to').value = '';

  renderDetailTasks();
  renderDetailPayments();
  await loadDetailHistory(id);
  await loadDetailShareLinks(id);
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

  let tasks = allTasks.filter(t => String(t.ClientID) === String(currentDetailId));
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
      ${paymentSelectHtml(t)}
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
  const paymentStatus = document.getElementById('detail-new-task-payment-status').value;

  await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: currentDetailId, description, dueDate, status: 'Pending', paymentStatus }),
  });

  document.getElementById('detail-new-task-desc').value = '';
  document.getElementById('detail-new-task-due').value = '';
  await refreshAfterChange();
});

function renderDetailPayments() {
  if (!currentDetailId) return;
  const payments = allPayments.filter(p => String(p.ClientID) === String(currentDetailId));
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

// ─── Share links ─────────────────────────────────────────────────────────

async function loadDetailShareLinks(clientId) {
  const body = document.getElementById('detail-share-links-body');
  body.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const res = await fetch(`/api/clients/${encodeURIComponent(clientId)}/share-links`);
    const links = await res.json();
    if (!res.ok || !Array.isArray(links)) {
      body.innerHTML = `<p style="color:var(--danger); font-size:13.5px;">${escapeHtml((links && links.error) || 'Could not load share links.')}</p>`;
      return;
    }
    renderDetailShareLinks(links);
  } catch (err) {
    body.innerHTML = `<p style="color:var(--danger); font-size:13.5px;">${escapeHtml(err.message)}</p>`;
  }
}

function renderDetailShareLinks(links) {
  const body = document.getElementById('detail-share-links-body');
  if (!links.length) {
    body.innerHTML = '<p style="color:var(--ink-faint); font-size:13.5px;">No share links yet.</p>';
    return;
  }
  const now = new Date();
  body.innerHTML = links.map(l => {
    const revoked = !!l.RevokedAt;
    const expired = l.ExpiresAt && new Date(l.ExpiresAt) < now;
    const inactive = revoked || expired;
    const statusLabel = revoked ? 'Revoked' : (expired ? 'Expired' : 'Active');
    const statusClass = revoked ? 'overdue' : (expired ? 'cold' : 'paid');
    return `
      <div class="task-row">
        <div class="desc ${inactive ? 'done' : ''}">
          <span class="mono">${escapeHtml(l.TokenPrefix)}…</span>
          ${l.Label ? ' — ' + escapeHtml(l.Label) : ''}
          <div class="sub" style="font-size:12px;">${l.AccessCount || 0} view${l.AccessCount === 1 ? '' : 's'}${l.LastAccessedAt ? ' · last ' + formatDate(l.LastAccessedAt) : ''}</div>
        </div>
        <span class="tag ${statusClass}">${statusLabel}</span>
        ${!inactive ? `<button class="ghost small" onclick="revokeDetailShareLink('${l.LinkID}')">Revoke</button>` : ''}
      </div>`;
  }).join('');
}

document.getElementById('detail-add-share-btn').addEventListener('click', async () => {
  if (!currentDetailId) return;
  const label = document.getElementById('detail-new-share-label').value.trim();

  const res = await fetch(`/api/clients/${encodeURIComponent(currentDetailId)}/share-links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(data.error || 'Failed to create share link.');
    return;
  }

  const url = `${window.location.origin}/share.html?token=${data.token}`;
  document.getElementById('detail-new-share-label').value = '';

  // Copy to clipboard if available, and always show it so it can be
  // copied manually — this is the only time the raw token is ever visible.
  try {
    await navigator.clipboard.writeText(url);
    alert(`Link copied to clipboard:\n\n${url}\n\nThis is the only time this link will be shown — save it now.`);
  } catch {
    prompt('Copy this link now — it will not be shown again:', url);
  }

  await loadDetailShareLinks(currentDetailId);
});

async function revokeDetailShareLink(linkId) {
  if (!currentDetailId) return;
  if (!confirm('Revoke this link? Anyone using it will immediately lose access.')) return;
  await fetch(`/api/clients/${encodeURIComponent(currentDetailId)}/share-links/${encodeURIComponent(linkId)}`, {
    method: 'DELETE',
  });
  await loadDetailShareLinks(currentDetailId);
}

// ─── Logout ──────────────────────────────────────────────────────────────

document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
});

// ─── Init ────────────────────────────────────────────────────────────────

loadAll();
