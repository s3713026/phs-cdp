/**
 * transformations.js — BFF-driven Transformations page
 * Reads/writes via /api/transformations backed by workspaceConfig.json
 */

const BFF = (window.PHSAPI?.BASE) || 'http://localhost:3001/api';

let _trfs = [];        // transformed data from BFF
let _query = '';
let _statusFilter = 'all';

function refreshIcons() { if (window.lucide) window.lucide.createIcons(); }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function norm(s) { return (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,''); }

function statusBadge(status) {
  const cls = status === 'Published' ? 'badge--success' : 'badge--neutral';
  return `<span class="badge ${cls}">${esc(status)}</span>`;
}

/* ─── BFF data loading ───────────────────────────────────────────── */
async function loadFromBFF() {
  try {
    const res = await fetch(`${BFF}/transformations`, {
      headers: { 'X-PHS-Role': 'viewer' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    _trfs = json.data || [];
  } catch (e) {
    console.warn('[Transformations] BFF unavailable, using empty:', e.message);
    _trfs = [];
  }
}

/* ─── Summary metrics ───────────────────────────────────────────── */
function renderSummary() {
  const mount = document.querySelector('[data-trf-summary]');
  if (!mount) return;
  const total = _trfs.length;
  const published = _trfs.filter(t => t.status === 'Published').length;
  const draft = total - published;
  const langs = [...new Set(_trfs.map(t => t.language || 'JavaScript'))].length;
  mount.innerHTML = `
    <div class="metric-row">
      <div class="metric metric--primary">
        <span class="metric__label">Transformations</span>
        <div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size:var(--text-xl);">${total}</span></div>
      </div>
      <div class="metric metric--success">
        <span class="metric__label">Published</span>
        <div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size:var(--text-xl);">${published}</span></div>
      </div>
      <div class="metric">
        <span class="metric__label">Draft</span>
        <div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size:var(--text-xl);">${draft}</span></div>
      </div>
      <div class="metric">
        <span class="metric__label">Languages Used</span>
        <div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size:var(--text-xl);">${langs}</span></div>
      </div>
    </div>`;
}

/* ─── Table ────────────────────────────────────────────────────────── */
function filtered() {
  const q = norm(_query);
  return _trfs.filter(t => {
    const matchQ = !q || norm(t.name).includes(q) || (t.destinations||[]).some(d => norm(d).includes(q));
    const matchS = _statusFilter === 'all' || t.status === _statusFilter;
    return matchQ && matchS;
  });
}

function renderTable() {
  const tbody = document.querySelector('[data-trf-table] tbody');
  if (!tbody) return;
  const rows = filtered();
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="table__empty">No transformations match your search${_statusFilter !== 'all' ? ' and filters' : ''}.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(t => `
    <tr data-detail-row data-trf-row="${esc(t.id)}" tabindex="0" role="button" aria-label="View ${esc(t.name)}">
      <td class="cell-primary">${esc(t.name)}</td>
      <td class="cell-muted">${(t.destinations||[]).map(d=>esc(d)).join(', ')||'—'}</td>
      <td><span class="badge badge--neutral">${esc(t.language||'JavaScript')}</span></td>
      <td class="cell-muted tabular-nums">${esc(t.lastModified||'—')}</td>
      <td>${statusBadge(t.status||'Draft')} <span class="font-mono cell-muted" style="font-size:11px;">${esc(t.version||'v1')}</span></td>
      <td><i class="row-affordance" data-lucide="chevron-right"></i></td>
    </tr>`).join('');

  tbody.querySelectorAll('[data-trf-row]').forEach(row => {
    const handler = () => openDetail(row.dataset.trfRow);
    row.addEventListener('click', handler);
    row.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' ') { e.preventDefault(); handler(); } });
  });
  refreshIcons();
}

function initFilters() {
  document.querySelector('[data-trf-search]')?.addEventListener('input', e => {
    _query = e.target.value; renderTable();
  });
  const sel = document.querySelector('[data-trf-status-filter]');
  if (sel) {
    sel.innerHTML = `<option value="all">All statuses</option><option value="Published">Published</option><option value="Draft">Draft</option>`;
    sel.addEventListener('change', e => { _statusFilter = e.target.value; renderTable(); });
  }
}

/* ─── Detail drawer ─────────────────────────────────────────────── */
function fieldRow(label, value) {
  return `<div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">${label}</span><span style="font-size:var(--text-sm);color:var(--text-primary);">${value}</span></div></div>`;
}

function openDetail(id) {
  const t = _trfs.find(x => x.id === id);
  if (!t) return;
  const overlay = document.getElementById('transformation-drawer');
  if (!overlay) return;
  overlay.querySelector('[data-drawer-eyebrow]').textContent = 'Transformation';
  overlay.querySelector('[data-drawer-title]').textContent = t.name;
  overlay.querySelector('[data-drawer-body]').innerHTML = `
    <p style="font-size:var(--text-sm);color:var(--text-secondary);margin-bottom:var(--space-5);">${esc(t.description||'')}</p>
    <div class="stack gap-1">
      ${fieldRow('Destinations', (t.destinations||[]).map(d=>esc(d)).join(', ')||'—')}
      ${fieldRow('Language', esc(t.language||'JavaScript'))}
      ${fieldRow('Version', `<span class="font-mono">${esc(t.version||'v1')}</span>`)}
      ${fieldRow('Status', statusBadge(t.status||'Draft'))}
      ${fieldRow('Last Modified', esc(t.lastModified||'—'))}
      ${fieldRow('Owner', esc(t.owner||'System'))}
    </div>
    <div style="margin-top:var(--space-6);">
      <div class="code-block" style="background:var(--surface-2,#f9fafb);border:1px solid var(--border-subtle);border-radius:8px;padding:var(--space-4);overflow:auto;max-height:260px;">
        <pre style="margin:0;font-family:var(--font-mono,'IBM Plex Mono',monospace);font-size:12px;color:var(--text-primary);">${esc(t.code||'// No code available')}</pre>
      </div>
    </div>
    <div class="cluster gap-3" style="margin-top:var(--space-5);">
      <button type="button" class="btn btn--outline" data-trf-edit="${esc(t.id)}">
        <i data-lucide="pencil"></i> Edit
      </button>
      <button type="button" class="btn btn--outline" data-trf-duplicate="${esc(t.id)}">
        <i data-lucide="copy"></i> Duplicate
      </button>
      <button type="button" class="btn btn--danger btn--sm" data-trf-delete="${esc(t.id)}" style="margin-left:auto;">
        <i data-lucide="trash-2"></i> Delete
      </button>
    </div>`;
  overlay.querySelector('[data-trf-edit]')?.addEventListener('click', () => { closeDrawer(); openEditor(t); });
  overlay.querySelector('[data-trf-duplicate]')?.addEventListener('click', () => duplicateTransformation(t.id));
  overlay.querySelector('[data-trf-delete]')?.addEventListener('click', () => deleteTransformation(t.id));
  refreshIcons();
  overlay.classList.add('is-open');
  document.body.style.overflow = 'hidden';
}

function closeDrawer() {
  document.getElementById('transformation-drawer')?.classList.remove('is-open');
  document.body.style.overflow = '';
}

function initDrawer() {
  const overlay = document.getElementById('transformation-drawer');
  if (!overlay) return;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeDrawer(); });
  overlay.querySelectorAll('[data-drawer-close]').forEach(btn => btn.addEventListener('click', closeDrawer));
}

/* ─── Delete transformation ─────────────────────────────────────── */
async function deleteTransformation(id) {
  if (!confirm('Delete this transformation? This cannot be undone.')) return;
  try {
    const res = await fetch(`${BFF}/transformations/${id}`, {
      method: 'DELETE',
      headers: { 'X-PHS-Role': 'operator' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    closeDrawer();
    await loadFromBFF();
    renderSummary();
    renderTable();
  } catch (e) {
    alert(`Could not delete transformation: ${e.message}`);
  }
}

/* ─── Duplicate transformation ────────────────────────────────────── */
async function duplicateTransformation(id) {
  const t = _trfs.find(x => x.id === id);
  if (!t) return;
  try {
    const res = await fetch(`${BFF}/transformations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-PHS-Role': 'operator' },
      body: JSON.stringify({ name: `${t.name} (Copy)`, code: t.code, description: t.description })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    closeDrawer();
    await loadFromBFF();
    renderSummary();
    renderTable();
  } catch (e) {
    alert(`Could not duplicate: ${e.message}`);
  }
}

/* ─── Code editor (create / edit) ────────────────────────────────── */
function openEditor(existing = null) {
  const modal = document.getElementById('trf-create-modal');
  if (!modal) return;
  const isEdit = !!existing;
  modal.querySelector('[data-trf-modal-title]')?.setAttribute('id','trf-modal-heading');
  // Build editor UI inside modal body
  const body = modal.querySelector('.modal__body');
  if (body) {
    body.innerHTML = `
      <div class="form-group">
        <label class="label" for="trf-name">Name <span style="color:var(--color-error)">*</span></label>
        <input class="input" id="trf-name" type="text" value="${esc(existing?.name||'')}" placeholder="e.g. PII Masking" />
      </div>
      <div class="form-group">
        <label class="label" for="trf-desc">Description</label>
        <input class="input" id="trf-desc" type="text" value="${esc(existing?.description||'')}" placeholder="What does this transformation do?" />
      </div>
      <div class="form-group">
        <label class="label" for="trf-code">JavaScript Code <span style="color:var(--color-error)">*</span></label>
        <textarea class="input" id="trf-code" rows="10" style="font-family:var(--font-mono,'IBM Plex Mono',monospace);font-size:12px;">${esc(existing?.code || 'export default function transform(event, metadata) {\n  // Modify event here\n  return event;\n}')}</textarea>
        <p class="form-hint">RudderStack codeVersion 2 format. Return the modified event object.</p>
      </div>`;
  }
  const footer = modal.querySelector('.modal__footer');
  if (footer) {
    footer.innerHTML = `
      <button type="button" class="btn btn--ghost" data-modal-close>Cancel</button>
      <button type="button" class="btn btn--primary" id="trf-save-btn">${isEdit ? 'Save changes' : 'Create transformation'}</button>`;
    footer.querySelector('#trf-save-btn')?.addEventListener('click', () => saveTransformation(existing?.id));
  }
  modal.classList.add('is-open');
}

async function saveTransformation(id = null) {
  const name = document.getElementById('trf-name')?.value?.trim();
  const code = document.getElementById('trf-code')?.value?.trim();
  const description = document.getElementById('trf-desc')?.value?.trim();
  if (!name) { document.getElementById('trf-name')?.focus(); return; }

  const btn = document.getElementById('trf-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  try {
    const url = id ? `${BFF}/transformations/${id}` : `${BFF}/transformations`;
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-PHS-Role': 'operator' },
      body: JSON.stringify({ name, code, description })
    });
    if (!res.ok) { const err = await res.json().catch(()=>{}); throw new Error(err?.error?.message || `HTTP ${res.status}`); }
    document.getElementById('trf-create-modal')?.classList.remove('is-open');
    await loadFromBFF();
    renderSummary();
    renderTable();
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Save changes'; }
    alert(`Could not save: ${e.message}`);
  }
}

/* ─── Create button ──────────────────────────────────────────────── */
function initCreateButton() {
  document.querySelector('[data-trf-create]')?.addEventListener('click', () => openEditor(null));
  // Modal close handler
  document.getElementById('trf-create-modal')?.querySelectorAll('[data-modal-close]').forEach(btn => {
    btn.addEventListener('click', () => document.getElementById('trf-create-modal')?.classList.remove('is-open'));
  });
}

/* ─── Tabs ──────────────────────────────────────────────────────── */
function initTabs() {
  const tabs = Array.from(document.querySelectorAll('[data-trf-tabs] .tabs__tab'));
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.setAttribute('aria-selected', String(t === tab)));
      document.querySelector('[data-trf-panel-transformations]').hidden = tab.dataset.trfTab !== 'transformations';
      document.querySelector('[data-trf-panel-libraries]').hidden = tab.dataset.trfTab !== 'libraries';
    });
  });
}

/* ─── Entry point ────────────────────────────────────────────────── */
export async function initTransformations() {
  renderSummary(); // show zeros immediately
  renderTable();   // empty state
  initFilters();
  initDrawer();
  initCreateButton();
  initTabs();

  await loadFromBFF();
  renderSummary();
  renderTable();
}
