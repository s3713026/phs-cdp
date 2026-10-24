/**
 * dest-wizard.js  — BFF-driven Add Destination wizard
 * 3 steps: Select Type → Configure → Link Sources
 */

import { getDestConfig } from "./dest-configs.js";
const BFF = (window.PHSAPI?.BASE) || 'http://localhost:3001/api';

let _onClose = null;
let _onCreated = null;
let _step = 1;
let _catalog = null;
let _selectedItem = null;
let _allSources = [];
let _createdDest = null;

function refreshIcons() { if (window.lucide) window.lucide.createIcons(); }
function n(str) { return (str||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,''); }
function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function avatarColor(label) {
  const palette = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#84cc16'];
  let h = 0;
  for (let i = 0; i < (label||'').length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
function logoImg(item, size = 32) {
  const bg = avatarColor(item.name), ini = (item.name||'?').slice(0,2).toUpperCase();
  const fallback = `<span class="dir-avatar" style="width:${size}px;height:${size}px;border-radius:8px;background:${bg};color:#fff;font-size:${Math.max(10,Math.floor(size*.4))}px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;">${ini}</span>`;
  if (item.logoUrl) return `<img src="${item.logoUrl}" alt="" style="width:${size}px;height:${size}px;object-fit:contain;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><span class="dir-avatar" style="width:${size}px;height:${size}px;border-radius:8px;background:${bg};color:#fff;font-size:${Math.max(10,Math.floor(size*.4))}px;font-weight:700;display:none;align-items:center;justify-content:center;">${ini}</span>`;
  return fallback;
}

function stepsHTML() {
  const labels = ['Select Type', 'Configure', 'Link Sources'];
  return `<div class="dest-wizard-steps">${labels.map((label,i) => {
    const num=i+1, active=_step===num, done=_step>num;
    return `<div class="dest-wizard-step${active?' is-active':''}${done?' is-done':''}"><span class="dest-wizard-step__dot">${done?'✓':num}</span> ${label}</div>${i<labels.length-1?'<div class="dest-wizard-step__sep"></div>':''}`;
  }).join('')}</div>`;
}

async function fetchCatalog() {
  if (_catalog) return _catalog;
  const res = await fetch(`${BFF}/directory/destinations`);
  if (!res.ok) throw new Error('Failed to load catalog');
  const json = await res.json();
  // BFF returns { data: [flat], grouped: [{ category, items }] }
  // Use grouped for category navigation, fall back to flat grouping
  if (json.grouped && json.grouped.length) {
    _catalog = json.grouped;
  } else {
    // Group flat list by category
    const catMap = {};
    (json.data || []).forEach(it => {
      const cat = it.category || 'Other';
      (catMap[cat] = catMap[cat]||[]).push(it);
    });
    _catalog = Object.entries(catMap).map(([category, items]) => ({ category, items }));
  }
  return _catalog;
}

async function fetchSources() {
  try {
    const res = await fetch(`${BFF}/sources`, { headers: { 'X-PHS-Role': 'viewer' } });
    const json = await res.json();
    _allSources = json.data || [];
  } catch { _allSources = []; }
}

// ── Step 1: Browse ───────────────────────────────────────────────────────────
async function renderStep1(activeCategory = 'All') {
  const body = document.querySelector('[data-setup-body]');
  body.innerHTML = `${stepsHTML()}
    <div style="display:flex;gap:0;height:calc(100vh - 160px);overflow:hidden;">
      <div id="dw-sidebar" style="width:210px;flex-shrink:0;border-right:1px solid var(--border-subtle);overflow-y:auto;padding:var(--space-3) 0;"></div>
      <div style="flex:1;overflow-y:auto;padding:var(--space-5);">
        <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-5);">
          <div class="search-field" style="flex:1;max-width:400px;"><i data-lucide="search"></i><input class="input" type="text" placeholder="Search destinations…" id="dw-search" /></div>
        </div>
        <div id="dw-main-content"><div style="padding:var(--space-8);color:var(--text-secondary);display:flex;align-items:center;gap:var(--space-2);"><i data-lucide="loader-2" style="animation:spin 1s linear infinite;"></i>Loading destinations…</div></div>
      </div>
    </div>`;
  refreshIcons();

  let catalog;
  try { catalog = await fetchCatalog(); }
  catch(e) {
    document.getElementById('dw-main-content').innerHTML = `<div style="padding:var(--space-8);text-align:center;color:var(--text-secondary);"><i data-lucide="wifi-off" style="width:32px;height:32px;display:block;margin:0 auto var(--space-3);"></i><p>Could not load catalog — BFF unreachable.</p><button class="btn btn--outline" id="dw-retry">Retry</button></div>`;
    refreshIcons();
    document.getElementById('dw-retry')?.addEventListener('click', () => renderStep1());
    return;
  }

  const allItems = [], catMap = {};
  catalog.forEach(group => {
    const cat = group.category || group.name || 'Other';
    (group.items || []).forEach(item => {
      const it = { ...item, _cat: cat };
      allItems.push(it);
      (catMap[cat] = catMap[cat]||[]).push(it);
    });
  });

  const cats = ['All', ...Object.keys(catMap)];
  const sidebar = document.getElementById('dw-sidebar');
  sidebar.innerHTML = cats.map(c => {
    const count = c==='All' ? allItems.length : (catMap[c]||[]).length;
    return `<button class="dest-directory-nav__item${c===activeCategory?' is-active':''}" data-dw-cat="${c}" style="width:100%;text-align:left;padding:6px 16px;border:none;background:none;cursor:pointer;font-size:13px;display:flex;justify-content:space-between;align-items:center;"><span>${c}</span><span style="font-size:11px;opacity:.6;">${count}</span></button>`;
  }).join('');
  sidebar.querySelectorAll('[data-dw-cat]').forEach(btn => btn.addEventListener('click', () => {
    sidebar.querySelectorAll('[data-dw-cat]').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    renderCards(btn.dataset.dwCat);
  }));

  function cardHTML(it) {
    return `<button type="button" class="dest-directory-card" data-dw-pick="${it.id}" style="gap:var(--space-3);align-items:flex-start;"><span class="dest-directory-card__icon" style="flex-shrink:0;">${logoImg(it,28)}</span><div style="min-width:0;"><div class="dest-directory-card__name" style="font-size:13px;">${it.name}</div><div class="dest-directory-card__desc" style="font-size:11px;">${it.category||''}</div></div></button>`;
  }
  function wireCards() {
    document.querySelectorAll('[data-dw-pick]').forEach(btn => btn.addEventListener('click', () => {
      _selectedItem = allItems.find(it => it.id === btn.dataset.dwPick) || null;
      if (_selectedItem) { _step=2; renderStep2(); }
    }));
  }
  function renderCards(cat, query='') {
    let items = cat==='All' ? allItems : (catMap[cat]||[]);
    if (query) items = allItems.filter(it => n(it.name).includes(n(query)));
    const main = document.getElementById('dw-main-content');
    if (!items.length) { main.innerHTML = `<p style="color:var(--text-secondary);padding:var(--space-5);">No matches.</p>`; return; }
    const byGroup = {};
    if (query||cat==='All') { items.forEach(it => { (byGroup[it._cat]=byGroup[it._cat]||[]).push(it); }); }
    else { byGroup[cat]=items; }
    main.innerHTML = Object.entries(byGroup).map(([g,its]) =>
      `<div class="dest-directory-section" style="margin-bottom:var(--space-6);"><div class="dest-directory-section__title" style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-tertiary);margin-bottom:var(--space-3);">${g}</div><div class="dest-directory-grid">${its.map(cardHTML).join('')}</div></div>`
    ).join('');
    wireCards(); refreshIcons();
  }
  renderCards(activeCategory);
  document.getElementById('dw-search')?.addEventListener('input', e => renderCards('All', e.target.value.trim()));
}

// ── Step 2: Configure per destination type ───────────────────────────────────

// ── Render field from DEST_CONFIGS field definition ──────────────────────────
function renderDestField(f) {
  if (f.type === 'section') {
    return `<div class="dest-form-section__sub-heading" style="grid-column:1/-1;font-weight:600;font-size:var(--font-sm);color:var(--color-text-secondary);margin-top:var(--space-4);padding-bottom:var(--space-2);border-bottom:1px solid var(--color-border)">${f.label}</div>`;
  }
  const req = f.required ? `<span style="color:var(--color-error)">*</span>` : '';
  const hint = f.hint ? `<p class="form-hint">${f.hint}</p>` : '';
  const fid = `dc-${f.key}`;

  if (f.type === 'toggle') {
    return `<div class="form-group" style="display:flex;align-items:center;gap:var(--space-3);">
      <label class="toggle"><input type="checkbox" id="${fid}" ${f.defaultValue ? 'checked' : ''}><span class="toggle__track"></span></label>
      <div><label class="label" for="${fid}" style="margin:0">${f.label}</label>${hint}</div>
    </div>`;
  }
  if (f.type === 'select') {
    const opts = (f.options||[]).map(o => `<option value="${o}" ${o===f.defaultValue?'selected':''}>${o||'— Select —'}</option>`).join('');
    return `<div class="form-group"><label class="label" for="${fid}">${f.label} ${req}</label>
      <div class="select"><select id="${fid}">${opts}</select><i class="select__chevron" data-lucide="chevron-down"></i></div>${hint}</div>`;
  }
  if (f.type === 'taglist') {
    return `<div class="form-group" style="grid-column:1/-1">
      <label class="label">${f.label}</label>${hint}
      <div id="${fid}-list" style="display:flex;flex-direction:column;gap:var(--space-2);margin-top:var(--space-2)">
        <div class="taglist-row" style="display:flex;gap:var(--space-2)"><input class="input" type="text" placeholder="Add value…" style="flex:1"><button type="button" class="btn btn--ghost btn--sm taglist-add" data-list="${fid}-list" style="white-space:nowrap">+ Add</button></div>
      </div>
    </div>`;
  }
  if (f.type === 'textarea') {
    return `<div class="form-group" style="grid-column:1/-1"><label class="label" for="${fid}">${f.label} ${req}</label>
      <textarea id="${fid}" class="input" rows="5" placeholder="${f.placeholder||''}" style="font-family:monospace;font-size:12px;resize:vertical">${f.defaultValue||''}</textarea>${hint}</div>`;
  }
  // text | password | url | number
  const type = f.type === 'password' ? 'password' : f.type === 'url' ? 'url' : f.type === 'number' ? 'number' : 'text';
  return `<div class="form-group"><label class="label" for="${fid}">${f.label} ${req}</label>
    <input class="input" type="${type}" id="${fid}" placeholder="${f.placeholder||''}" value="${f.defaultValue||''}" />${hint}</div>`;
}

// ── Step 2: Configure per destination type ───────────────────────────────────
export function configFieldsForType(item) {
  const fields = getDestConfig(item);
  if (!fields) {
    return `<div class="empty-state" style="grid-column:1/-1;padding:var(--space-4);text-align:center;color:var(--color-text-secondary);font-size:var(--font-sm)">No additional configuration required for this destination.</div>`;
  }
  return fields.map(renderDestField).join('\n');
}

// ── Collect form values back into a config object ─────────────────────────────
export function collectConfigFromForm(item) {
  const fields = getDestConfig(item);
  if (!fields) return {};
  const result = {};
  for (const f of fields) {
    if (f.type === 'section') continue;
    const fid = `dc-${f.key}`;
    const el = document.getElementById(fid);
    if (!el) continue;
    if (f.type === 'toggle') {
      result[f.key] = el.checked;
    } else if (f.type === 'taglist') {
      const list = document.getElementById(`${fid}-list`);
      if (list) {
        result[f.key] = Array.from(list.querySelectorAll('input:not(.taglist-row input[placeholder])'))
          .map(i => i.value.trim()).filter(Boolean);
      }
    } else {
      result[f.key] = el.value.trim();
    }
  }
  return result;
}



function renderStep2() {
  const body = document.querySelector('[data-setup-body]');
  const item = _selectedItem;
  body.innerHTML = `${stepsHTML()}
    <div style="max-width:560px;margin:0 auto;">
      <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-6);">
        <div style="flex-shrink:0;">${logoImg(item,36)}</div>
        <div><div style="font-weight:600;font-size:var(--text-md);">${item.name}</div><div style="font-size:var(--text-sm);color:var(--text-secondary);">${item.category||item._cat||''}</div></div>
      </div>
      <div class="stack gap-4">
        <div class="form-group"><label class="label" for="dw-name">Destination name <span style="color:var(--color-error)">*</span></label><input class="input" type="text" id="dw-name" value="PHS ${item.name}" /><p class="form-hint">A friendly name — only visible in PHS CDP.</p></div>
        ${configFieldsForType(item)}
      </div>
      <div class="cluster gap-3" style="justify-content:flex-end;margin-top:var(--space-8);border-top:1px solid var(--border-subtle);padding-top:var(--space-5);">
        <button type="button" class="btn btn--ghost" id="dw-back"><i data-lucide="arrow-left"></i> Back</button>
        <button type="button" class="btn btn--primary" id="dw-next">Continue</button>
      </div>
    </div>`;
  refreshIcons();

  // Wire taglist "+ Add" buttons in wizard step 2
  body.querySelectorAll('.taglist-add').forEach(btn => {
    btn.addEventListener('click', () => {
      const list = document.getElementById(btn.dataset.list);
      if (!list) return;
      const row = document.createElement('div');
      row.className = 'taglist-row';
      row.style.cssText = 'display:flex;gap:var(--space-2)';
      row.innerHTML = '<input class="input" type="text" style="flex:1"><button type="button" class="btn btn--ghost btn--sm" style="color:var(--color-error)" onclick="this.closest(&quot;.taglist-row&quot;).remove()">✕</button>';
      list.insertBefore(row, btn.closest('.taglist-row'));
    });
  });

  document.getElementById('dw-back')?.addEventListener('click', () => { _step=1; renderStep1(); });
  document.getElementById('dw-next')?.addEventListener('click', () => {
    const nameEl = document.getElementById('dw-name');
    if (!nameEl?.value?.trim()) { nameEl?.focus(); nameEl?.classList.add('input--error'); return; }
    _step=3; renderStep3();
  });
}

// ── Step 3: Link Sources + Create ────────────────────────────────────────────
async function renderStep3() {
  const body = document.querySelector('[data-setup-body]');
  body.innerHTML = `${stepsHTML()}<div style="max-width:560px;margin:0 auto;"><div style="padding:var(--space-8);color:var(--text-secondary);display:flex;align-items:center;gap:var(--space-2);"><i data-lucide="loader-2" style="animation:spin 1s linear infinite;"></i>Loading sources…</div></div>`;
  refreshIcons();
  await fetchSources();

  const item = _selectedItem;
  body.innerHTML = `${stepsHTML()}
    <div style="max-width:560px;margin:0 auto;">
      <div style="margin-bottom:var(--space-5);">
        <div style="font-weight:600;font-size:var(--text-md);margin-bottom:var(--space-1);">Link sources to this destination</div>
        <p style="font-size:var(--text-sm);color:var(--text-secondary);">Events from the selected sources will be forwarded to <strong>${item.name}</strong>.</p>
      </div>

      ${_allSources.length ? `
      <div class="stack gap-2" id="dw-sources-list">
        ${_allSources.map(src => `
          <label class="cluster gap-3" style="padding:12px;border:1px solid var(--border-subtle);border-radius:8px;cursor:pointer;align-items:center;">
            <input type="checkbox" data-dw-src="${src.id}" style="width:16px;height:16px;flex-shrink:0;" />
            <div style="min-width:0;flex:1;">
              <div style="font-size:var(--text-sm);font-weight:500;">${src.name||src.id}</div>
              <div style="font-size:11px;color:var(--text-secondary);">${src.type||src.typeId||''}</div>
            </div>
            <span class="badge ${src.status==='connected'?'badge--success':'badge--neutral'}">${src.status||''}</span>
          </label>`).join('')}
      </div>` : `<div class="dataflow-note"><i data-lucide="info"></i><span>No sources configured yet. You can link sources later from the destination settings.</span></div>`}

      <div class="cluster gap-3" style="justify-content:flex-end;margin-top:var(--space-8);border-top:1px solid var(--border-subtle);padding-top:var(--space-5);">
        <button type="button" class="btn btn--ghost" id="dw-back"><i data-lucide="arrow-left"></i> Back</button>
        <button type="button" class="btn btn--ghost" id="dw-skip">Skip for now</button>
        <button type="button" class="btn btn--primary" id="dw-create">Create Destination</button>
      </div>
    </div>`;
  refreshIcons();

  document.getElementById('dw-back')?.addEventListener('click', () => { _step=2; renderStep2(); });

  async function doCreate(selectedSourceIds) {
    const btn = document.getElementById('dw-create') || document.getElementById('dw-skip');
    if (btn) { btn.disabled=true; btn.innerHTML='<i data-lucide="loader-2" style="animation:spin 1s linear infinite;"></i> Creating…'; refreshIcons(); }
    try {
      const name = document.getElementById('dw-name')?.value?.trim() || `PHS ${item.name}`;
      const config = collectConfigFromForm(item);
      const payload = {
        name,
        destinationDefinitionId: item.id,
        config,
        sourceIds: selectedSourceIds,
        enabled: true,
      };
      const res = await fetch(`${BFF}/destinations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-PHS-Role': 'operator' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err?.error?.message || `HTTP ${res.status}`); }
      _createdDest = await res.json();
      renderStep3Success();
    } catch(e) {
      if (btn) { btn.disabled=false; btn.textContent='Create Destination'; }
      const errEl = document.createElement('div');
      errEl.className = 'dataflow-note dataflow-note--error';
      errEl.style.marginTop = 'var(--space-3)';
      errEl.innerHTML = `<i data-lucide="alert-circle"></i><span>${e.message}</span>`;
      document.getElementById('dw-back')?.parentElement?.before(errEl);
      refreshIcons();
    }
  }

  document.getElementById('dw-skip')?.addEventListener('click', () => doCreate([]));
  document.getElementById('dw-create')?.addEventListener('click', () => {
    const selected = [...document.querySelectorAll('[data-dw-src]:checked')].map(cb => cb.dataset.dwSrc);
    doCreate(selected);
  });
}

function renderStep3Success() {
  const body = document.querySelector('[data-setup-body]');
  const dest = _createdDest;
  body.innerHTML = `${stepsHTML()}
    <div style="max-width:560px;margin:0 auto;">
      <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-5);">
        <span style="width:40px;height:40px;border-radius:50%;background:var(--color-success-bg,#dcfce7);display:inline-flex;align-items:center;justify-content:center;">
          <i data-lucide="check-circle-2" style="color:var(--color-success,#16a34a);width:22px;height:22px;"></i>
        </span>
        <div>
          <div style="font-weight:600;font-size:var(--text-md);">Destination created — ${dest?.name || _selectedItem?.name || ''}</div>
          <div style="font-size:var(--text-sm);color:var(--text-secondary);">The destination is active and ready to receive events.</div>
        </div>
      </div>
      <div class="cluster gap-3" style="justify-content:flex-end;margin-top:var(--space-8);border-top:1px solid var(--border-subtle);padding-top:var(--space-5);">
        <button type="button" class="btn btn--ghost" id="dw-add-another">Add another destination</button>
        <button type="button" class="btn btn--primary" id="dw-done">View destination</button>
      </div>
    </div>`;
  refreshIcons();
  document.getElementById('dw-done')?.addEventListener('click', () => { closeDestWizard(); if (_onCreated) _onCreated(_createdDest); });
  document.getElementById('dw-add-another')?.addEventListener('click', () => { _step=1; _selectedItem=null; _createdDest=null; renderStep1(); });
}

// ── Public API ────────────────────────────────────────────────────────────────
export function openDestWizard({ onClose, onCreated, presetProvider } = {}) {
  _onClose = onClose||null; _onCreated = onCreated||null;
  _step=1; _selectedItem=_createdDest=null;
  document.querySelector('[data-setup-title]').textContent = 'Add Destination';
  document.querySelector('[data-setup-back-label]').textContent = 'Back to Destinations';
  document.querySelector('[data-view-setup]').hidden = false;
  document.body.style.overflow = 'hidden';

  if (presetProvider) {
    fetchCatalog().then(grouped => {
      let found = null;
      for (const g of (grouped || [])) {
        found = g.items.find(it =>
          (it.id || '').toLowerCase() === presetProvider.toLowerCase() ||
          (it.name || '').toLowerCase() === presetProvider.toLowerCase()
        );
        if (found) break;
      }
      _selectedItem = found || { id: presetProvider, name: presetProvider, category: 'Warehouse' };
      _step = 2;
      renderStep2();
    }).catch(() => {
      _selectedItem = { id: presetProvider, name: presetProvider, category: 'Warehouse' };
      _step = 2;
      renderStep2();
    });
  } else {
    renderStep1();
  }
}

export function closeDestWizard() {
  document.querySelector('[data-view-setup]').hidden = true;
  document.body.style.overflow = '';
  const url = new URL(location.href);
  if (url.searchParams.has('setup')) { url.searchParams.delete('setup'); history.replaceState({},  '', url); }
  if (_onClose) _onClose();
}
