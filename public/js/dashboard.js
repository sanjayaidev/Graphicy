let allClients = [];
let editingId = null;

async function loadClients() {
  const body = document.getElementById('ledger-body');
  let res, data;
  try {
    res = await fetch('/api/clients');
    data = await res.json();
  } catch (err) {
    body.innerHTML = `<div class="empty-state"><h3>Could not reach the server</h3><p>${escapeHtml(err.message)}</p></div>`;
    return;
  }

  if (res.status === 401) { window.location.href = '/login.html'; return; }

  if (!res.ok || !Array.isArray(data)) {
    const message = (data && data.error) ? data.error : `Unexpected response (status ${res.status})`;
    body.innerHTML = `<div class="empty-state"><h3>Couldn't load clients</h3><p>${escapeHtml(message)}</p></div>`;
    console.error('GET /api/clients failed:', data);
    return;
  }

  allClients = data;
  populatePlatformFilter();
  renderStats();
  renderList();
}

function populatePlatformFilter() {
  const sel = document.getElementById('filter-platform');
  const current = sel.value;
  const platforms = [...new Set(allClients.map(c => c.Platform).filter(Boolean))];
  sel.innerHTML = '<option value="">All platforms</option>' +
    platforms.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
  sel.value = current;
}

function renderStats() {
  const total = allClients.length;
  const warm = allClients.filter(c => (c.Type || '').toLowerCase() === 'warm').length;
  const chances = allClients.map(c => Number(c.Chance)).filter(n => !isNaN(n));
  const avgChance = chances.length ? Math.round(chances.reduce((a, b) => a + b, 0) / chances.length) : 0;
  const pending = allClients.filter(c => (c.PaymentStatus || '').toLowerCase() !== 'paid').length;

  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-warm').textContent = warm;
  document.getElementById('stat-chance').textContent = avgChance + '%';
  document.getElementById('stat-pending').textContent = pending;
  document.getElementById('count-label').textContent = total ? `— ${total} client${total !== 1 ? 's' : ''}` : '';
}

function renderList() {
  const search = document.getElementById('search-input').value.toLowerCase().trim();
  const typeFilter = document.getElementById('filter-type').value;
  const platformFilter = document.getElementById('filter-platform').value;
  const body = document.getElementById('ledger-body');

  let filtered = allClients.filter(c => {
    if (typeFilter && c.Type !== typeFilter) return false;
    if (platformFilter && c.Platform !== platformFilter) return false;
    if (search) {
      const hay = [c.Name, c.Business, c.Service, c.Number, c.Country].join(' ').toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    body.innerHTML = `<div class="empty-state">
      <h3>${allClients.length === 0 ? 'No clients yet' : 'Nothing matches'}</h3>
      <p>${allClients.length === 0 ? 'Add your first client to start the ledger.' : 'Try a different search or filter.'}</p>
    </div>`;
    return;
  }

  body.innerHTML = filtered.map(rowHtml).join('');
}

function rowHtml(c) {
  const chance = Number(c.Chance) || 0;
  const statusClass = (c.Type || '').toLowerCase();
  const paymentClass = (c.PaymentStatus || 'pending').toLowerCase();

  return `
    <div class="ledger-row">
      <div class="sn mono">${escapeHtml(c.SN)}</div>
      <div>
        <div class="name" onclick="goToClient('${c.UniqueID}')">${escapeHtml(c.Name)}</div>
        <div class="sub">${escapeHtml(c.Business || '')}${c.Service ? ' · ' + escapeHtml(c.Service) : ''}</div>
      </div>
      <div class="country-col sub">${escapeHtml(c.Platform || '')}${c.Country ? ' · ' + escapeHtml(c.Country) : ''}</div>
      <div><span class="tag ${statusClass}">${escapeHtml(c.Type || '—')}</span></div>
      <div class="chance-meter">
        <div class="bar"><span style="width:${chance}%"></span></div>
        <span class="num mono">${chance}%</span>
      </div>
      <div class="payment-col"><span class="tag ${paymentClass}">${escapeHtml(c.PaymentStatus || 'Pending')}</span></div>
      <div class="sub">${escapeHtml(c.Action || '')}</div>
      <div class="row-actions">
        <button class="ghost small" onclick="openEdit('${c.UniqueID}')">Edit</button>
        <button class="danger small" onclick="deleteClient('${c.UniqueID}')">Delete</button>
      </div>
    </div>
  `;
}

function goToClient(id) {
  window.location.href = `/client.html?id=${encodeURIComponent(id)}`;
}

// ─── Modal ───────────────────────────────────────────────────────────────

function openCreate() {
  editingId = null;
  document.getElementById('modal-title').textContent = 'New client';
  document.getElementById('modal-save').textContent = 'Save client';
  document.getElementById('client-form').reset();
  document.getElementById('client-modal').classList.add('open');
}

function openEdit(id) {
  const c = allClients.find(x => x.UniqueID === id);
  if (!c) return;
  editingId = id;
  document.getElementById('modal-title').textContent = 'Edit client';
  document.getElementById('modal-save').textContent = 'Update client';
  document.getElementById('f-name').value = c.Name || '';
  document.getElementById('f-number').value = c.Number || '';
  document.getElementById('f-country').value = c.Country || '';
  document.getElementById('f-platform').value = c.Platform || '';
  document.getElementById('f-type').value = c.Type || 'Warm';
  document.getElementById('f-chance').value = c.Chance || '';
  document.getElementById('f-service').value = c.Service || '';
  document.getElementById('f-business').value = c.Business || '';
  document.getElementById('f-action').value = c.Action || '';
  document.getElementById('client-modal').classList.add('open');
}

function closeModal() {
  document.getElementById('client-modal').classList.remove('open');
}

async function deleteClient(id) {
  if (!confirm('Delete this client? This cannot be undone.')) return;
  const res = await fetch(`/api/clients/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) { alert('Failed to delete client.'); return; }
  await loadClients();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str === undefined || str === null ? '' : str;
  return div.innerHTML;
}

// ─── Wire up events ────────────────────────────────────────────────────

document.getElementById('add-btn').addEventListener('click', openCreate);
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
  await loadClients();
});

document.getElementById('search-input').addEventListener('input', renderList);
document.getElementById('filter-type').addEventListener('change', renderList);
document.getElementById('filter-platform').addEventListener('change', renderList);

document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
});

loadClients();
