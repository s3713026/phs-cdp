/**
 * Data Catalog — PHS CDP
 * Full CRUD + Block/Unblock + Validation rules (Admin only)
 */

const BFF = window.__CDP_CONFIG__?.bffUrl || 'http://localhost:3001';
const HEADERS = { 'X-PHS-Role': 'admin', 'Content-Type': 'application/json' };
const IS_ADMIN = true; // TODO: derive from auth session role

// ── State ─────────────────────────────────────────────────────────────────────
let _events = [], _attributes = [], _sources = [], _domains = [];

function refreshIcons() { if (window.lucide) window.lucide.createIcons(); }

// ── Domain / status badges ────────────────────────────────────────────────────
const DOMAIN_CLASS = {
  'Account & Identity': 'badge--primary', 'Trading & Investment': 'badge--success',
  'Product Interest': 'badge--warning',   'Engagement': 'badge--neutral',
  'Identity': 'badge--primary',           'Demographic': 'badge--neutral',
  'Lifecycle': 'badge--success',          'Behavioral': 'badge--warning',
};
function domainBadge(d) { return `<span class="badge ${DOMAIN_CLASS[d]||'badge--neutral'} badge--dest-tag">${d}</span>`; }
function platformBadge(p) { return `<span class="badge badge--neutral badge--dest-tag" style="font-size:10px;">${p}</span>`; }
function sensitivityBadge(s) {
  const m = { pii:'badge--danger', internal:'badge--warning', low:'badge--success' };
  return `<span class="badge ${m[s]||'badge--neutral'} badge--dest-tag" style="font-size:10px;">${s}</span>`;
}
function statusBadge(s) {
  if (s === 'blocked')    return `<span class="badge badge--danger badge--dest-tag"><i data-lucide="ban" style="width:11px;height:11px;"></i> Blocked</span>`;
  if (s === 'deprecated') return `<span class="badge badge--warning badge--dest-tag"><i data-lucide="alert-triangle" style="width:11px;height:11px;"></i> Deprecated</span>`;
  return `<span class="status-dot status-dot--success">Active</span>`;
}

// ── API helpers ───────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const res = await fetch(`${BFF}${path}`, {
    method, headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || res.statusText); }
  return res.json();
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:500;box-shadow:0 4px 16px rgba(0,0,0,.15);background:${type==='success'?'#22c55e':'#ef4444'};color:#fff;`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ── Confirm dialog ────────────────────────────────────────────────────────────
function showConfirm(msg) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:10000;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
      <div style="background:var(--surface-primary);border-radius:12px;padding:24px;width:380px;box-shadow:0 8px 32px rgba(0,0,0,.2);">
        <p style="margin:0 0 20px;font-size:var(--text-sm);color:var(--text-primary);">${msg}</p>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn btn--outline btn--sm" id="confirm-cancel">Cancel</button>
          <button class="btn btn--danger btn--sm" id="confirm-ok">Delete</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#confirm-cancel').onclick = () => { overlay.remove(); resolve(false); };
    overlay.querySelector('#confirm-ok').onclick    = () => { overlay.remove(); resolve(true); };
  });
}

// ── Property row helper ───────────────────────────────────────────────────────
function propertyRow(p, i) {
  return `<div class="prop-row" style="display:grid;grid-template-columns:1fr 100px 80px 32px;gap:6px;align-items:center;" data-row="${i}">
    <input class="input input--sm" placeholder="property_name" name="prop_name_${i}" value="${p.name||''}">
    <select class="input input--sm" name="prop_type_${i}">
      ${['string','number','boolean','date','datetime','array','object'].map(t =>
        `<option value="${t}" ${p.type===t?'selected':''}>${t}</option>`).join('')}
    </select>
    <label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;white-space:nowrap;">
      <input type="checkbox" name="prop_req_${i}" ${p.required?'checked':''}> Required
    </label>
    <button type="button" class="btn btn--ghost btn--xs remove-row-btn" style="padding:0;width:28px;height:28px;"><i data-lucide="x"></i></button>
  </div>`;
}

function ruleRow(r, i) {
  return `<div class="rule-row" style="display:grid;grid-template-columns:1fr 90px 1fr 80px 32px;gap:6px;align-items:center;" data-row="${i}">
    <input class="input input--sm" placeholder="field_name" name="rule_field_${i}" value="${r.field||''}">
    <select class="input input--sm" name="rule_type_${i}">
      ${['regex','enum','min','max'].map(t => `<option value="${t}" ${r.type===t?'selected':''}>${t}</option>`).join('')}
    </select>
    <input class="input input--sm" placeholder="value / pattern / values" name="rule_value_${i}" value="${r.pattern||r.values?.join(',')||r.value||''}">
    <select class="input input--sm" name="rule_level_${i}">
      <option value="error" ${r.level==='error'?'selected':''}>error</option>
      <option value="warning" ${r.level==='warning'?'selected':''}>warning</option>
    </select>
    <button type="button" class="btn btn--ghost btn--xs remove-row-btn" style="padding:0;width:28px;height:28px;"><i data-lucide="x"></i></button>
  </div>`;
}

function bindRemove(container) {
  container.querySelectorAll('.remove-row-btn').forEach(btn => {
    btn.onclick = () => btn.closest('[data-row]').remove();
  });
}

function collectProperties(overlay) {
  return [...overlay.querySelectorAll('.prop-row')].map(row => {
    const i = row.dataset.row;
    return {
      name: overlay.querySelector(`[name="prop_name_${i}"]`)?.value?.trim() || '',
      type: overlay.querySelector(`[name="prop_type_${i}"]`)?.value || 'string',
      required: !!(overlay.querySelector(`[name="prop_req_${i}"]`)?.checked),
    };
  }).filter(p => p.name);
}

function collectRules(overlay) {
  return [...overlay.querySelectorAll('.rule-row')].map(row => {
    const i = row.dataset.row;
    const field = overlay.querySelector(`[name="rule_field_${i}"]`)?.value?.trim();
    const type  = overlay.querySelector(`[name="rule_type_${i}"]`)?.value;
    const val   = overlay.querySelector(`[name="rule_value_${i}"]`)?.value?.trim();
    const level = overlay.querySelector(`[name="rule_level_${i}"]`)?.value;
    if (!field || !val) return null;
    const rule = { field, type, level };
    if (type === 'regex')     rule.pattern = val;
    else if (type === 'enum') rule.values = val.split(',').map(v => v.trim());
    else                      rule.value = Number(val);
    return rule;
  }).filter(Boolean);
}

// ── Event modal (Add / Edit) ──────────────────────────────────────────────────
function openEventModal(event = null) {
  const isEdit = !!event;
  const overlay = document.createElement('div');
  overlay.className = 'drawer-overlay is-open';
  overlay.style.cssText = 'align-items:center;justify-content:center;';

  let propCount = isEdit ? event.properties.length : 0;
  let ruleCount = isEdit ? (event.validationRules||[]).length : 0;

  overlay.innerHTML = `
    <div class="drawer" style="width:560px;max-width:95vw;border-radius:12px;max-height:90vh;overflow-y:auto;" role="dialog" aria-modal="true">
      <div class="drawer__header">
        <div>
          <div class="drawer__eyebrow">${isEdit ? 'Edit Event' : 'Add Event'}</div>
          <div class="drawer__title">${isEdit ? event.name : 'New Catalog Event'}</div>
        </div>
        <button class="btn btn--ghost btn--sm" id="modal-close" aria-label="Close"><i data-lucide="x"></i></button>
      </div>
      <div class="drawer__body">
        <form id="event-form" style="display:flex;flex-direction:column;gap:16px;">
          <div class="form-field">
            <label class="form-label">Event Name <span style="color:var(--color-danger)">*</span></label>
            <input class="input" name="name" required placeholder="e.g. Product Viewed" value="${isEdit ? event.name : ''}">
          </div>
          <div class="form-field">
            <label class="form-label">Domain <span style="color:var(--color-danger)">*</span></label>
            <select class="input" name="domain">
              ${['Account & Identity','Trading & Investment','Product Interest','Engagement'].map(d =>
                `<option value="${d}" ${isEdit && event.domain===d ? 'selected':''}>${d}</option>`).join('')}
            </select>
          </div>
          <div class="form-field">
            <label class="form-label">Description</label>
            <textarea class="input" name="description" rows="2" placeholder="What does this event represent?">${isEdit ? event.description||'' : ''}</textarea>
          </div>
          <div class="form-field">
            <label class="form-label">Platforms</label>
            <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:4px;">
              ${['web','mobile','server'].map(p => `
                <label style="display:flex;align-items:center;gap:6px;font-size:var(--text-sm);cursor:pointer;">
                  <input type="checkbox" name="platforms" value="${p}" ${isEdit && event.platforms?.includes(p) ? 'checked':''}>
                  ${p}
                </label>`).join('')}
            </div>
          </div>
          <div class="form-field">
            <label class="form-label">Lifecycle Stage</label>
            <select class="input" name="lifecycleStage">
              <option value="">— None —</option>
              ${['Prospect','Lead','eKYC','Account Opening','Funding','First Trade','Active Investor','VIP','Dormant','Churn Risk','Reactivation'].map(s =>
                `<option value="${s}" ${isEdit && event.lifecycleStage===s ? 'selected':''}>${s}</option>`).join('')}
            </select>
          </div>
          <div class="form-field">
            <label class="form-label">Status</label>
            <select class="input" name="status">
              <option value="active" ${!isEdit||event.status==='active'?'selected':''}>Active</option>
              <option value="deprecated" ${isEdit&&event.status==='deprecated'?'selected':''}>Deprecated</option>
              <option value="blocked" ${isEdit&&event.status==='blocked'?'selected':''}>Blocked</option>
            </select>
          </div>
          <div class="form-field">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
              <label class="form-label" style="margin:0;">Properties</label>
              <button type="button" class="btn btn--outline btn--xs" id="add-prop-btn"><i data-lucide="plus"></i> Add Property</button>
            </div>
            <div id="properties-list" style="display:flex;flex-direction:column;gap:8px;">
              ${(isEdit ? event.properties : []).map((p, i) => propertyRow(p, i)).join('')}
            </div>
          </div>
          <div class="form-field">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
              <label class="form-label" style="margin:0;">Validation Rules</label>
              <button type="button" class="btn btn--outline btn--xs" id="add-rule-btn"><i data-lucide="plus"></i> Add Rule</button>
            </div>
            <div id="rules-list" style="display:flex;flex-direction:column;gap:8px;">
              ${(isEdit ? event.validationRules||[] : []).map((r, i) => ruleRow(r, i)).join('')}
            </div>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end;padding-top:8px;border-top:1px solid var(--border-subtle);">
            <button type="button" class="btn btn--outline" id="modal-cancel">Cancel</button>
            <button type="submit" class="btn btn--primary">${isEdit ? 'Save Changes' : 'Create Event'}</button>
          </div>
        </form>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  refreshIcons();

  const close = () => { overlay.remove(); document.body.style.overflow = ''; };
  overlay.querySelector('#modal-close').onclick = close;
  overlay.querySelector('#modal-cancel').onclick = close;

  overlay.querySelector('#add-prop-btn').onclick = () => {
    const list = overlay.querySelector('#properties-list');
    list.insertAdjacentHTML('beforeend', propertyRow({}, propCount++));
    refreshIcons();
    bindRemove(list);
  };

  overlay.querySelector('#add-rule-btn').onclick = () => {
    const list = overlay.querySelector('#rules-list');
    list.insertAdjacentHTML('beforeend', ruleRow({}, ruleCount++));
    refreshIcons();
    bindRemove(list);
  };

  bindRemove(overlay.querySelector('#properties-list'));
  bindRemove(overlay.querySelector('#rules-list'));

  overlay.querySelector('#event-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      name: fd.get('name').trim(),
      domain: fd.get('domain'),
      description: fd.get('description').trim(),
      platforms: fd.getAll('platforms'),
      lifecycleStage: fd.get('lifecycleStage') || null,
      status: fd.get('status'),
      properties: collectProperties(overlay),
      validationRules: collectRules(overlay),
    };
    try {
      if (isEdit) {
        await api('PUT', `/api/data-catalog/events/${event.id}`, payload);
        showToast('Event updated');
      } else {
        await api('POST', '/api/data-catalog/events', payload);
        showToast('Event created');
      }
      close();
      await reloadAndRender();
    } catch (err) { showToast(err.message, 'error'); }
  };
}

// ── Drawer (read-only detail) ─────────────────────────────────────────────────
let _drawer = null;
function ensureDrawer() {
  if (_drawer) return _drawer;
  _drawer = document.createElement('div');
  _drawer.className = 'drawer-overlay';
  _drawer.innerHTML = `
    <aside class="drawer" role="dialog" aria-modal="true">
      <div class="drawer__header">
        <div>
          <div class="drawer__eyebrow" data-drawer-eyebrow></div>
          <div class="drawer__title" data-drawer-title></div>
        </div>
        <div style="display:flex;gap:6px;">
          ${IS_ADMIN ? `<button class="btn btn--outline btn--sm" id="drawer-edit-btn"><i data-lucide="pencil"></i> Edit</button>` : ''}
          <button class="btn btn--ghost btn--sm" aria-label="Close" data-drawer-close><i data-lucide="x"></i></button>
        </div>
      </div>
      <div class="drawer__body" data-drawer-body></div>
    </aside>`;
  document.body.appendChild(_drawer);
  _drawer.querySelector('[data-drawer-close]').addEventListener('click', () => {
    _drawer.classList.remove('is-open'); document.body.style.overflow = '';
  });
  _drawer.addEventListener('click', e => {
    if (e.target === _drawer) { _drawer.classList.remove('is-open'); document.body.style.overflow = ''; }
  });
  return _drawer;
}

function openEventDrawer(event) {
  const drawer = ensureDrawer();
  drawer.querySelector('[data-drawer-eyebrow]').textContent = event.domain;
  drawer.querySelector('[data-drawer-title]').textContent = event.name;
  const editBtn = drawer.querySelector('#drawer-edit-btn');
  if (editBtn) editBtn.onclick = () => {
    drawer.classList.remove('is-open'); document.body.style.overflow = '';
    openEventModal(event);
  };

  drawer.querySelector('[data-drawer-body]').innerHTML = `
    <div style="margin-bottom:var(--space-4);">
      <div style="display:flex;gap:var(--space-2);flex-wrap:wrap;margin-bottom:var(--space-3);">
        ${domainBadge(event.domain)} ${statusBadge(event.status)}
      </div>
      <p style="font-size:var(--text-sm);color:var(--text-secondary);margin:0 0 var(--space-4);">${event.description||''}</p>
    </div>
    <div class="event-config-list" style="margin-bottom:var(--space-5);">
      <div class="event-config-row"><span class="event-config-row__label">Event ID</span><span class="event-config-row__value font-mono" style="font-size:var(--text-xs);">${event.id}</span></div>
      <div class="event-config-row"><span class="event-config-row__label">Platforms</span><span class="event-config-row__value" style="display:flex;gap:4px;flex-wrap:wrap;">${(event.platforms||[]).map(platformBadge).join('')}</span></div>
      ${event.lifecycleStage ? `<div class="event-config-row"><span class="event-config-row__label">Lifecycle Stage</span><span class="event-config-row__value">${event.lifecycleStage}</span></div>` : ''}
      <div class="event-config-row"><span class="event-config-row__label">Properties</span><span class="event-config-row__value tabular-nums">${event.properties.length} total · ${event.properties.filter(p=>p.required).length} required</span></div>
      ${(event.validationRules||[]).length ? `<div class="event-config-row"><span class="event-config-row__label">Validation Rules</span><span class="event-config-row__value tabular-nums">${event.validationRules.length} rules</span></div>` : ''}
    </div>
    ${event.properties.length ? `
    <p class="subhead" style="margin-bottom:var(--space-2);">Properties</p>
    <div class="event-config-list">
      ${event.properties.map(p => `
        <div class="event-config-row">
          <span class="event-config-row__label font-mono" style="font-size:var(--text-xs);">${p.name}${p.required ? '<span style="color:var(--color-danger);font-size:10px;margin-left:4px;">req</span>' : ''}</span>
          <span class="badge badge--neutral badge--dest-tag" style="font-size:10px;">${p.type}</span>
        </div>`).join('')}
    </div>` : ''}
    ${(event.validationRules||[]).length ? `
    <p class="subhead" style="margin:var(--space-4) 0 var(--space-2);">Validation Rules</p>
    <div class="event-config-list">
      ${event.validationRules.map(r => `
        <div class="event-config-row">
          <span class="event-config-row__label font-mono" style="font-size:var(--text-xs);">${r.field} · ${r.type}</span>
          <span class="badge ${r.level==='error'?'badge--danger':'badge--warning'} badge--dest-tag" style="font-size:10px;">${r.level}</span>
        </div>`).join('')}
    </div>` : ''}`;

  drawer.classList.add('is-open');
  document.body.style.overflow = 'hidden';
  refreshIcons();
}

// ── Summary cards ─────────────────────────────────────────────────────────────
function renderSummary(data) {
  const s = data.summary;
  document.querySelector('[data-summary-total]').textContent = s.totalFields;
  document.querySelector('[data-summary-events]').textContent = s.totalEvents;
  document.querySelector('[data-summary-attributes]').textContent = s.totalAttributes;
  document.querySelector('[data-summary-sources]').textContent = s.totalSources;
  const blockedEl = document.querySelector('[data-summary-blocked]');
  if (blockedEl) blockedEl.textContent = s.blockedEvents || 0;
}

// ── Events tab ────────────────────────────────────────────────────────────────
function renderEventsTab() {
  const mount = document.querySelector('[data-tab-events]');
  mount.innerHTML = `
    <section class="section" style="margin-bottom:0;">
      <div class="section__header">
        <div>
          <h2 class="section__title">Events</h2>
          <p class="section__subtitle">Click a row to view details. Blocked events are excluded from audiences and campaigns.</p>
        </div>
        <div class="page-header__actions">
          <div class="search-field" style="width:200px;">
            <i data-lucide="search"></i>
            <input class="input" type="text" placeholder="Search…" id="catalog-event-search">
          </div>
          <select class="input" id="catalog-domain-filter" style="width:170px;">
            <option value="">All domains</option>
            ${_domains.map(d => `<option value="${d}">${d}</option>`).join('')}
          </select>
          <select class="input" id="catalog-status-filter" style="width:130px;">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="deprecated">Deprecated</option>
            <option value="blocked">Blocked</option>
          </select>
          ${IS_ADMIN ? `<button class="btn btn--primary btn--sm" id="add-event-btn"><i data-lucide="plus"></i> Add Event</button>` : ''}
        </div>
      </div>
      <div class="section__body">
        <div class="table-wrap">
          <table class="table" id="catalog-events-table">
            <thead><tr>
              <th>Event</th><th>Domain</th><th>Platforms</th><th>Lifecycle Stage</th>
              <th>Properties</th><th>Validation</th><th>Status</th>
              ${IS_ADMIN ? '<th></th>' : ''}
            </tr></thead>
            <tbody>
              ${_events.map(e => `
                <tr data-event-id="${e.id}" style="cursor:pointer;${e.status==='blocked'?'opacity:.55;':''}">
                  <td><div class="event-cell">
                    <span class="event-cell__icon" style="${e.status==='blocked'?'color:var(--color-danger);':''}"><i data-lucide="${e.status==='blocked'?'ban':'zap'}"></i></span>
                    <span class="event-cell__name">${e.name}</span>
                  </div></td>
                  <td>${domainBadge(e.domain)}</td>
                  <td style="display:flex;gap:4px;flex-wrap:wrap;padding-top:12px;">${(e.platforms||[]).map(platformBadge).join('')}</td>
                  <td class="cell-muted" style="font-size:var(--text-xs);">${e.lifecycleStage||'—'}</td>
                  <td class="tabular-nums" style="font-size:var(--text-sm);">${e.properties.length}</td>
                  <td class="tabular-nums" style="font-size:var(--text-sm);">${(e.validationRules||[]).length} rules</td>
                  <td>${statusBadge(e.status)}</td>
                  ${IS_ADMIN ? `<td onclick="event.stopPropagation()" style="white-space:nowrap;">
                    <button class="btn btn--ghost btn--xs event-block-btn" data-id="${e.id}" data-status="${e.status}" title="${e.status==='blocked'?'Unblock':'Block'}">
                      <i data-lucide="${e.status==='blocked'?'check-circle':'ban'}"></i>
                    </button>
                    <button class="btn btn--ghost btn--xs event-edit-btn" data-id="${e.id}" title="Edit"><i data-lucide="pencil"></i></button>
                    <button class="btn btn--ghost btn--xs event-delete-btn" data-id="${e.id}" title="Delete" style="color:var(--color-danger);"><i data-lucide="trash-2"></i></button>
                  </td>` : ''}
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </section>`;

  document.getElementById('add-event-btn')?.addEventListener('click', () => openEventModal());

  mount.querySelectorAll('[data-event-id]').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const ev = _events.find(x => x.id === row.dataset.eventId);
      if (ev) openEventDrawer(ev);
    });
  });

  mount.querySelectorAll('.event-block-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ev = _events.find(x => x.id === btn.dataset.id);
      if (!ev) return;
      const newStatus = ev.status === 'blocked' ? 'active' : 'blocked';
      try {
        await api('PATCH', `/api/data-catalog/events/${ev.id}/status`, { status: newStatus });
        showToast(newStatus === 'blocked' ? `"${ev.name}" blocked` : `"${ev.name}" unblocked`);
        await reloadAndRender();
      } catch(err) { showToast(err.message, 'error'); }
    });
  });

  mount.querySelectorAll('.event-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ev = _events.find(x => x.id === btn.dataset.id);
      if (ev) openEventModal(ev);
    });
  });

  mount.querySelectorAll('.event-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ev = _events.find(x => x.id === btn.dataset.id);
      if (!ev) return;
      const ok = await showConfirm(`Delete event "<strong>${ev.name}</strong>"? This cannot be undone.`);
      if (!ok) return;
      try {
        await api('DELETE', `/api/data-catalog/events/${ev.id}`);
        showToast(`"${ev.name}" deleted`);
        await reloadAndRender();
      } catch(err) { showToast(err.message, 'error'); }
    });
  });

  const search = document.getElementById('catalog-event-search');
  const domainFilter = document.getElementById('catalog-domain-filter');
  const statusFilter = document.getElementById('catalog-status-filter');
  function filterRows() {
    const q = (search?.value||'').toLowerCase();
    const d = domainFilter?.value||'';
    const s = statusFilter?.value||'';
    mount.querySelectorAll('[data-event-id]').forEach(row => {
      const ev = _events.find(x => x.id === row.dataset.eventId);
      if (!ev) return;
      const mQ = !q || ev.name.toLowerCase().includes(q) || (ev.description||'').toLowerCase().includes(q);
      const mD = !d || ev.domain === d;
      const mS = !s || ev.status === s;
      row.style.display = mQ && mD && mS ? '' : 'none';
    });
  }
  search?.addEventListener('input', filterRows);
  domainFilter?.addEventListener('change', filterRows);
  statusFilter?.addEventListener('change', filterRows);
  refreshIcons();
}

// ── Attributes tab ────────────────────────────────────────────────────────────
function renderAttributesTab() {
  const mount = document.querySelector('[data-tab-attributes]');
  const grouped = {};
  _attributes.forEach(a => { if (!grouped[a.domain]) grouped[a.domain] = []; grouped[a.domain].push(a); });

  mount.innerHTML = `
    ${IS_ADMIN ? `<div style="display:flex;justify-content:flex-end;margin-bottom:var(--space-4);">
      <button class="btn btn--primary btn--sm" id="add-attr-btn"><i data-lucide="plus"></i> Add Attribute</button>
    </div>` : ''}
    ${Object.entries(grouped).map(([domain, attrs]) => `
    <section class="section" style="margin-bottom:var(--space-6);">
      <div class="section__header"><div><h2 class="section__title">${domain}</h2></div></div>
      <div class="section__body">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Attribute</th><th>Type</th><th>Source</th><th>Sensitivity</th><th>Description</th>${IS_ADMIN?'<th></th>':''}</tr></thead>
            <tbody>
              ${attrs.map(a => `<tr>
                <td class="cell-primary">${a.name}</td>
                <td><span class="badge badge--neutral badge--dest-tag" style="font-size:10px;">${a.type}</span></td>
                <td class="cell-muted" style="font-size:var(--text-xs);">${a.source}</td>
                <td>${sensitivityBadge(a.sensitivity)}</td>
                <td class="cell-muted" style="font-size:var(--text-xs);max-width:220px;white-space:normal;">${a.description}</td>
                ${IS_ADMIN?`<td style="white-space:nowrap;">
                  <button class="btn btn--ghost btn--xs attr-edit-btn" data-id="${a.id}" title="Edit"><i data-lucide="pencil"></i></button>
                  <button class="btn btn--ghost btn--xs attr-delete-btn" data-id="${a.id}" title="Delete" style="color:var(--color-danger);"><i data-lucide="trash-2"></i></button>
                </td>`:''}
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </section>`).join('')}`;

  document.getElementById('add-attr-btn')?.addEventListener('click', () => openAttrModal());
  mount.querySelectorAll('.attr-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => { const a = _attributes.find(x=>x.id===btn.dataset.id); if(a) openAttrModal(a); });
  });
  mount.querySelectorAll('.attr-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const a = _attributes.find(x=>x.id===btn.dataset.id);
      if (!a) return;
      const ok = await showConfirm(`Delete attribute "<strong>${a.name}</strong>"?`);
      if (!ok) return;
      try { await api('DELETE', `/api/data-catalog/attributes/${a.id}`); showToast(`"${a.name}" deleted`); await reloadAndRender(); }
      catch(err) { showToast(err.message,'error'); }
    });
  });
  refreshIcons();
}

function openAttrModal(attr = null) {
  const isEdit = !!attr;
  const overlay = document.createElement('div');
  overlay.className = 'drawer-overlay is-open';
  overlay.style.cssText = 'align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div class="drawer" style="width:480px;max-width:95vw;border-radius:12px;" role="dialog">
      <div class="drawer__header">
        <div><div class="drawer__eyebrow">${isEdit?'Edit':'Add'} Attribute</div><div class="drawer__title">${isEdit?attr.name:'New Attribute'}</div></div>
        <button class="btn btn--ghost btn--sm" id="attr-modal-close"><i data-lucide="x"></i></button>
      </div>
      <div class="drawer__body">
        <form id="attr-form" style="display:flex;flex-direction:column;gap:14px;">
          <div class="form-field"><label class="form-label">Name *</label><input class="input" name="name" required value="${isEdit?attr.name:''}"></div>
          <div class="form-field"><label class="form-label">Domain *</label>
            <select class="input" name="domain">
              ${['Identity','Demographic','Lifecycle','Behavioral','Engagement'].map(d=>`<option value="${d}" ${isEdit&&attr.domain===d?'selected':''}>${d}</option>`).join('')}
            </select></div>
          <div class="form-field"><label class="form-label">Type</label>
            <select class="input" name="type">
              ${['string','number','boolean','date','datetime','enum','array'].map(t=>`<option value="${t}" ${isEdit&&attr.type===t?'selected':''}>${t}</option>`).join('')}
            </select></div>
          <div class="form-field"><label class="form-label">Source</label><input class="input" name="source" placeholder="CRM, RudderStack, Mautic…" value="${isEdit?attr.source:''}"></div>
          <div class="form-field"><label class="form-label">Sensitivity</label>
            <select class="input" name="sensitivity">
              ${['low','internal','pii'].map(s=>`<option value="${s}" ${isEdit&&attr.sensitivity===s?'selected':''}>${s}</option>`).join('')}
            </select></div>
          <div class="form-field"><label class="form-label">Description</label><textarea class="input" name="description" rows="2">${isEdit?attr.description:''}</textarea></div>
          <div style="display:flex;gap:8px;justify-content:flex-end;padding-top:8px;border-top:1px solid var(--border-subtle);">
            <button type="button" class="btn btn--outline" id="attr-cancel">Cancel</button>
            <button type="submit" class="btn btn--primary">${isEdit?'Save':'Create'}</button>
          </div>
        </form>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  refreshIcons();
  const close = () => { overlay.remove(); document.body.style.overflow = ''; };
  overlay.querySelector('#attr-modal-close').onclick = close;
  overlay.querySelector('#attr-cancel').onclick = close;
  overlay.querySelector('#attr-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      name: fd.get('name').trim(), domain: fd.get('domain'),
      type: fd.get('type'), source: fd.get('source').trim(),
      sensitivity: fd.get('sensitivity'), description: fd.get('description').trim()
    };
    try {
      if (isEdit) { await api('PUT', `/api/data-catalog/attributes/${attr.id}`, payload); showToast('Attribute updated'); }
      else { await api('POST', '/api/data-catalog/attributes', payload); showToast('Attribute created'); }
      close(); await reloadAndRender();
    } catch(err) { showToast(err.message,'error'); }
  };
}

// ── Sources tab ───────────────────────────────────────────────────────────────
function renderSourcesTab() {
  const mount = document.querySelector('[data-tab-sources]');
  mount.innerHTML = `
    <section class="section" style="margin-bottom:0;">
      <div class="section__header">
        <div><h2 class="section__title">Data Sources</h2><p class="section__subtitle">Systems that produce events into the PHS CDP.</p></div>
        ${IS_ADMIN ? `<button class="btn btn--primary btn--sm" id="add-source-btn"><i data-lucide="plus"></i> Add Source</button>` : ''}
      </div>
      <div class="section__body">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Source</th><th>Type</th><th>Platform</th><th>Status</th><th>Description</th>${IS_ADMIN?'<th></th>':''}</tr></thead>
            <tbody>
              ${_sources.map(s => `<tr>
                <td><div class="event-cell">
                  <span class="event-cell__icon"><i data-lucide="git-branch"></i></span>
                  <span class="event-cell__name">${s.name}</span>
                </div></td>
                <td><span class="badge badge--neutral badge--dest-tag" style="font-size:10px;">${s.type}</span></td>
                <td class="cell-muted" style="font-size:var(--text-xs);">${s.platform}</td>
                <td>${statusBadge(s.status)}</td>
                <td class="cell-muted" style="font-size:var(--text-xs);">${s.description}</td>
                ${IS_ADMIN?`<td style="white-space:nowrap;">
                  <button class="btn btn--ghost btn--xs src-edit-btn" data-id="${s.id}" title="Edit"><i data-lucide="pencil"></i></button>
                  <button class="btn btn--ghost btn--xs src-delete-btn" data-id="${s.id}" title="Delete" style="color:var(--color-danger);"><i data-lucide="trash-2"></i></button>
                </td>`:''}
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </section>`;

  document.getElementById('add-source-btn')?.addEventListener('click', () => openSourceModal());
  mount.querySelectorAll('.src-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => { const s = _sources.find(x=>x.id===btn.dataset.id); if(s) openSourceModal(s); });
  });
  mount.querySelectorAll('.src-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const s = _sources.find(x=>x.id===btn.dataset.id);
      if (!s) return;
      const ok = await showConfirm(`Delete source "<strong>${s.name}</strong>"?`);
      if (!ok) return;
      try { await api('DELETE', `/api/data-catalog/sources/${s.id}`); showToast(`"${s.name}" deleted`); await reloadAndRender(); }
      catch(err) { showToast(err.message,'error'); }
    });
  });
  refreshIcons();
}

function openSourceModal(src = null) {
  const isEdit = !!src;
  const overlay = document.createElement('div');
  overlay.className = 'drawer-overlay is-open';
  overlay.style.cssText = 'align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div class="drawer" style="width:420px;max-width:95vw;border-radius:12px;" role="dialog">
      <div class="drawer__header">
        <div><div class="drawer__eyebrow">${isEdit?'Edit':'Add'} Source</div><div class="drawer__title">${isEdit?src.name:'New Data Source'}</div></div>
        <button class="btn btn--ghost btn--sm" id="src-modal-close"><i data-lucide="x"></i></button>
      </div>
      <div class="drawer__body">
        <form id="src-form" style="display:flex;flex-direction:column;gap:14px;">
          <div class="form-field"><label class="form-label">Name *</label><input class="input" name="name" required value="${isEdit?src.name:''}"></div>
          <div class="form-field"><label class="form-label">Type</label>
            <select class="input" name="type">
              ${['web','mobile','server','marketing','crm'].map(t=>`<option value="${t}" ${isEdit&&src.type===t?'selected':''}>${t}</option>`).join('')}
            </select></div>
          <div class="form-field"><label class="form-label">Platform</label><input class="input" name="platform" placeholder="web, ios_android, server…" value="${isEdit?src.platform:''}"></div>
          <div class="form-field"><label class="form-label">Description</label><textarea class="input" name="description" rows="2">${isEdit?src.description:''}</textarea></div>
          <div style="display:flex;gap:8px;justify-content:flex-end;padding-top:8px;border-top:1px solid var(--border-subtle);">
            <button type="button" class="btn btn--outline" id="src-cancel">Cancel</button>
            <button type="submit" class="btn btn--primary">${isEdit?'Save':'Create'}</button>
          </div>
        </form>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  refreshIcons();
  const close = () => { overlay.remove(); document.body.style.overflow = ''; };
  overlay.querySelector('#src-modal-close').onclick = close;
  overlay.querySelector('#src-cancel').onclick = close;
  overlay.querySelector('#src-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      name: fd.get('name').trim(), type: fd.get('type'),
      platform: fd.get('platform').trim(), description: fd.get('description').trim()
    };
    try {
      if (isEdit) { await api('PUT', `/api/data-catalog/sources/${src.id}`, payload); showToast('Source updated'); }
      else { await api('POST', '/api/data-catalog/sources', payload); showToast('Source created'); }
      close(); await reloadAndRender();
    } catch(err) { showToast(err.message,'error'); }
  };
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.tabs__tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tabs__tab').forEach(t => t.setAttribute('aria-selected', 'false'));
      document.querySelectorAll('.tabs__panel').forEach(p => p.hidden = true);
      tab.setAttribute('aria-selected', 'true');
      const panelId = tab.getAttribute('aria-controls');
      if (panelId) document.getElementById(panelId).hidden = false;
    });
  });
}

// ── Reload all data and re-render tabs ────────────────────────────────────────
async function reloadAndRender() {
  const [summaryRes, eventsRes, attrsRes, sourcesRes] = await Promise.all([
    api('GET', '/api/data-catalog'),
    api('GET', '/api/data-catalog/events'),
    api('GET', '/api/data-catalog/attributes'),
    api('GET', '/api/data-catalog/sources'),
  ]);
  _events     = eventsRes.data;
  _domains    = eventsRes.domains;
  _attributes = attrsRes.data;
  _sources    = sourcesRes.data;
  renderSummary(summaryRes);
  renderEventsTab();
  renderAttributesTab();
  renderSourcesTab();
}

// ── Main entry point ──────────────────────────────────────────────────────────
export async function initDataCatalog() {
  initTabs();
  try {
    await reloadAndRender();
  } catch (err) {
    console.error('Data Catalog load error:', err);
    const mount = document.querySelector('[data-tab-events]');
    if (mount) mount.innerHTML = `
      <div style="padding:var(--space-12) 0;text-align:center;">
        <i data-lucide="alert-circle" style="width:32px;height:32px;color:var(--color-danger);"></i>
        <p style="margin-top:var(--space-3);color:var(--text-secondary);">${err.message}</p>
        <button class="btn btn--secondary" onclick="location.reload()" style="margin-top:var(--space-3);">Retry</button>
      </div>`;
    refreshIcons();
  }
}
