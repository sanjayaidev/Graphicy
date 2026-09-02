// public/js/share.js — powers the public, unauthenticated share.html page.

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str === undefined || str === null ? '' : str;
  return div.innerHTML;
}

function formatDate(str) {
  const d = new Date(str);
  if (isNaN(d)) return str;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatMoney(n) {
  const num = Number(n) || 0;
  return '₹' + num.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

async function loadShare() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const content = document.getElementById('share-content');

  if (!token) {
    document.getElementById('share-name').textContent = 'Missing link';
    content.innerHTML = '<div class="empty-state"><h3>No token provided</h3><p>Check the link you were given.</p></div>';
    return;
  }

  let res, data;
  try {
    res = await fetch(`/api/share/${encodeURIComponent(token)}`);
    data = await res.json();
  } catch (err) {
    document.getElementById('share-name').textContent = 'Something went wrong';
    content.innerHTML = '<div class="empty-state"><h3>Could not load this page</h3><p>Please try again shortly.</p></div>';
    return;
  }

  if (!res.ok) {
    document.getElementById('share-name').textContent = 'Link not available';
    content.innerHTML = `<div class="empty-state"><h3>${escapeHtml(data.error || 'This link is invalid, expired, or has been revoked.')}</h3></div>`;
    return;
  }

  document.getElementById('share-name').textContent = data.Client.Name;

  const today = new Date();
  const tasksHtml = (data.Tasks || []).length
    ? data.Tasks.map(t => {
        const isDone = (t.Status || '').toLowerCase() === 'done';
        const isOverdue = !isDone && t.DueDate && new Date(t.DueDate) < today;
        const tagClass = isOverdue ? 'overdue' : (isDone ? 'paid' : 'pending');
        const label = isOverdue ? 'Overdue' : (isDone ? 'Done' : 'Pending');
        return `
          <div class="task-row">
            <div class="desc ${isDone ? 'done' : ''}">${escapeHtml(t.Description || '')}</div>
            ${t.DueDate ? `<div class="due mono">${escapeHtml(formatDate(t.DueDate))}</div>` : ''}
            <span class="tag ${tagClass}">${label}</span>
          </div>`;
      }).join('')
    : '<p style="color:var(--ink-faint); font-size:13.5px;">No tasks yet.</p>';

  const paymentsHtml = (data.Payments || []).length
    ? data.Payments.map(p => `
        <div class="payment-row">
          <div class="amount mono">${formatMoney(p.Amount)}</div>
          <div class="meta">${p.Date ? escapeHtml(formatDate(p.Date)) : ''}</div>
          <span class="tag ${(p.Status || '').toLowerCase()}">${escapeHtml(p.Status || '')}</span>
        </div>`).join('')
    : '<p style="color:var(--ink-faint); font-size:13.5px;">No payments logged yet.</p>';

  content.innerHTML = `
    ${data.Client.Business ? `<p class="ink-faint" style="margin-bottom:24px;">${escapeHtml(data.Client.Business)}</p>` : ''}
    <div class="panel">
      <h3>Work status</h3>
      ${tasksHtml}
    </div>
    <div class="panel">
      <h3>Payments</h3>
      ${paymentsHtml}
    </div>
  `;
}

loadShare();
