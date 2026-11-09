/**
 * Data Catalog — PHS CDP
 * Full CRUD + Block/Unblock + Validation rules + Source-level Rules (Admin only)
 */

const BFF = window.__CDP_CONFIG__?.bffUrl || 'http://localhost:3001';
const HEADERS = { 'X-PHS-Role': 'admin', 'Content-Type': 'application/json' };
const IS_ADMIN = true; // TODO: derive from auth session role

// ── State ─────────────────────────────────────────────────────────────────────
let _events = [], _attributes = [], _sources = [], _domains = [];

function refreshIcons() { if (window.lucide) window.lucide.createIcons(); }

// ── Badges ────────────────────────────────────────────────────────────────────
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
function sourceActionBadge(action) {
  if (action === 'block')    return `<span class="badge badge--danger badge--dest-tag" style="font-size:10px;">block</span>`;
  if (action === 'require')  return `<span class="badge badge--primary badge--dest-tag" style="font-size:10px;">require</span>`;
  if (action === 'readonly') return `<span class="badge badge--warning badge--dest-tag" style="font-size:10px;">readonly</span>`;
  return `<span class="badge badge--success badge--dest-tag" style="font-size:10px;">allow</span>`;
}
function sourceRulesSummary(rules) {
  if (!rules || rules.length === 0) return '<span class="cell-muted" style="font-size:11px;">—</span>';
  const blocked = rules.filter(r => r.action === 'block').length;
  if (blocked > 0) return `<span style="font-size:11px;color:var(--color-danger);font-weight:500;"><i data-lucide="ban" style="width:10px;height:10px;"></i> ${blocked} blocked</span>`;
  return `<span style="font-size:11px;color:var(--text-secondary);">${rules.length} rule${rules.length>1?'s':''}</span>`;
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

// ── Source rule mini-table ────────────────────────────────────────────────────
// Renders an inline source-rules editor used inside both event modal and attribute modal.
// mode: 'event' (allow|block|deprecated), 'param' (allow|block|require), 'attr' (allow|block|readonly)
function buildSourceRulesEditor(containerId, existingRules, mode) {
  const actions = {
    event: ['allow','block','deprecated'],
    param: ['allow','block','require'],
    attr:  ['allow','block','readonly'],
  }[mode] || ['allow','block'];

  const rows = (existingRules || []).map((r, i) => srcRuleRowHtml(r, i, actions)).join('');
  return `
    <div class="src-rules-editor" id="${containerId}" data-mode="${mode}" data-count="${(existingRules||[]).length}">
      <div class="src-rules-editor__rows" style="display:flex;flex-direction:column;gap:6px;">
        ${rows}
      </div>
      <button type="button" class="btn btn--ghost btn--xs" style="margin-top:6px;color:var(--text-secondary);" data-add-rule>
        <i data-lucide="plus" style="width:12px;height:12px;"></i> Add source rule
      </button>
    </div>`;
}

function srcRuleRowHtml(r, i, actions) {
  return `<div class="src-rule-row" data-row="${i}" style="display:grid;grid-template-columns:160px 100px 1fr auto;gap:6px;align-items:center;background:var(--surface-secondary);border-radius:6px;padding:6px 8px;">
    <select class="input input--sm" data-field="sourceId">
      <option value="">— Source —</option>
      ${_sources.map(s => `<option value="${s.id}" ${r.sourceId===s.id?'selected':''}>${s.name}</option>`).join('')}
    </select>
    <select class="input input--sm" data-field="action">
      ${actions.map(a => `<option value="${a}" ${r.action===a?'selected':''}>${a}</option>`).join('')}
    </select>
    <input class="input input--sm" placeholder="Reason (optional)" data-field="reason" value="${r.reason||''}">
    <button type="button" class="btn btn--ghost btn--xs" data-remove-rule style="padding:0;width:24px;height:24px;color:var(--text-tertiary);">
      <i data-lucide="x" style="width:12px;height:12px;"></i>
    </button>
  </div>`;
}

function bindSourceRulesEditor(container) {
  container.querySelectorAll('[data-add-rule]').forEach(btn => {
    btn.addEventListener('click', () => {
      const editor   = btn.closest('.src-rules-editor');
      const rows     = editor.querySelector('.src-rules-editor__rows');
      const count    = parseInt(editor.dataset.count || 0);
      const mode     = editor.dataset.mode;
      const actions  = { event:['allow','block','deprecated'], param:['allow','block','require'], attr:['allow','block','readonly'] }[mode] || ['allow','block'];
      rows.insertAdjacentHTML('beforeend', srcRuleRowHtml({}, count, actions));
      editor.dataset.count = count + 1;
      refreshIcons();
      bindRemoveRuleRows(rows);
    });
  });
  bindRemoveRuleRows(container);
}

function bindRemoveRuleRows(container) {
  container.querySelectorAll('[data-remove-rule]').forEach(btn => {
    btn.onclick = () => btn.closest('.src-rule-row').remove();
  });
}

function collectSourceRulesFrom(editor) {
  if (!editor) return [];
  return [...editor.querySelectorAll('.src-rule-row')].map(row => {
    const sourceId = row.querySelector('[data-field="sourceId"]')?.value;
    const action   = row.querySelector('[data-field="action"]')?.value;
    const reason   = row.querySelector('[data-field="reason"]')?.value?.trim();
    if (!sourceId || !action) return null;
    return { sourceId, action, ...(reason ? { reason } : {}) };
  }).filter(Boolean);
}

// ── Validation rule rows ──────────────────────────────────────────────────────
function ruleRow(r, i) {
  return `<div class="rule-row" data-row="${i}" style="display:grid;grid-template-columns:1fr 90px 1fr 80px 32px;gap:6px;align-items:center;">
    <input class="input input--sm" placeholder="field_name" name="rule_field_${i}" value="${r.field||''}">
    <select class="input input--sm" name="rule_type_${i}">
      ${['regex','enum','min','max'].map(t => `<option value="${t}" ${r.type===t?'selected':''}>${t}</option>`).join('')}
    </select>
    <input class="input input--sm" placeholder="value / pattern / values" name="rule_value_${i}" value="${r.pattern||r.values?.join(',')||r.value||''}">
    <select class="input input--sm" name="rule_level_${i}">
      <option value="error"   ${r.level==='error'  ?'selected':''}>error</option>
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
    else if (type === 'enum') rule.values  = val.split(',').map(v => v.trim());
    else                      rule.value   = Number(val);
    return rule;
  }).filter(Boolean);
}

// ── Property rows (expandable with source rules) ──────────────────────────────
function propertyRow(p, i) {
  const srcRulesHtml = buildSourceRulesEditor(`prop-src-${i}`, p.sourceRules||[], 'param');
  const hasSrcRules  = (p.sourceRules||[]).length > 0;
  return `<div class="prop-block" data-prop-idx="${i}" style="border:1px solid var(--border-subtle);border-radius:8px;overflow:hidden;">
    <div style="display:grid;grid-template-columns:1fr 100px 90px auto;gap:6px;align-items:center;padding:8px 10px;background:var(--surface-secondary);">
      <input class="input input--sm" placeholder="property_name" name="prop_name_${i}" value="${p.name||''}">
      <select class="input input--sm" name="prop_type_${i}">
        ${['string','number','boolean','date','datetime','array','object'].map(t =>
          `<option value="${t}" ${p.type===t?'selected':''}>${t}</option>`).join('')}
      </select>
      <label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;white-space:nowrap;">
        <input type="checkbox" name="prop_req_${i}" ${p.required?'checked':''}> Required
      </label>
      <div style="display:flex;gap:4px;">
        <button type="button" class="btn btn--ghost btn--xs prop-toggle-src" data-idx="${i}" title="Source rules${hasSrcRules?' ('+p.sourceRules.length+')':''}" style="${hasSrcRules?'color:var(--color-danger);':'color:var(--text-tertiary);'}">
          <i data-lucide="shield${hasSrcRules?'-alert':'-check'}" style="width:14px;height:14px;"></i>
        </button>
        <button type="button" class="btn btn--ghost btn--xs remove-prop-btn" style="padding:0;width:28px;height:28px;color:var(--text-tertiary);"><i data-lucide="x"></i></button>
      </div>
    </div>
    <div class="prop-src-panel" id="prop-src-panel-${i}" style="display:${hasSrcRules?'block':'none'};padding:8px 10px;border-top:1px solid var(--border-subtle);">
      <p style="font-size:11px;color:var(--text-secondary);margin:0 0 6px;">Source rules for <strong>${p.name||'this property'}</strong> — overrides global required</p>
      ${srcRulesHtml}
    </div>
  </div>`;
}

function bindPropertyRows(container) {
  // Remove button
  container.querySelectorAll('.remove-prop-btn').forEach(btn => {
    btn.onclick = () => btn.closest('.prop-block').remove();
  });
  // Toggle source rules panel
  container.querySelectorAll('.prop-toggle-src').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = container.querySelector(`#prop-src-panel-${btn.dataset.idx}`);
      if (!panel) return;
      const isOpen = panel.style.display !== 'none';
      panel.style.display = isOpen ? 'none' : 'block';
      if (!isOpen) {
        // Update label in panel
        const propName = container.querySelector(`[name="prop_name_${btn.dataset.idx}"]`)?.value || 'this property';
        const p = panel.querySelector('p strong');
        if (p) p.textContent = propName;
      }
      refreshIcons();
    });
  });
  // Source rules editors inside panels
  container.querySelectorAll('.src-rules-editor').forEach(editor => {
    bindSourceRulesEditor(editor);
  });
}

function collectProperties(overlay) {
  return [...overlay.querySelectorAll('.prop-block')].map(block => {
    const i     = block.dataset.propIdx;
    const name  = overlay.querySelector(`[name="prop_name_${i}"]`)?.value?.trim() || '';
    const type  = overlay.querySelector(`[name="prop_type_${i}"]`)?.value || 'string';
    const req   = !!(overlay.querySelector(`[name="prop_req_${i}"]`)?.checked);
    const panel = overlay.querySelector(`#prop-src-panel-${i}`);
    const srcEditor = panel?.querySelector('.src-rules-editor');
    return { name, type, required: req, sourceRules: collectSourceRulesFrom(srcEditor) };
  }).filter(p => p.name);
}

// ── Event modal (Add / Edit) — tabbed ────────────────────────────────────────
function openEventModal(event = null) {
  const isEdit = !!event;
  const overlay = document.createElement('div');
  overlay.className = 'drawer-overlay is-open';
  overlay.style.cssText = 'align-items:center;justify-content:center;';

  let propCount = isEdit ? event.properties.length : 0;
  let ruleCount = isEdit ? (event.validationRules||[]).length : 0;

  // Source rules for entire event
  const evtSrcRulesHtml = buildSourceRulesEditor('event-src-rules', isEdit ? event.sourceRules||[] : [], 'event');

  overlay.innerHTML = `
    <div class="drawer" style="width:640px;max-width:97vw;border-radius:12px;max-height:92vh;display:flex;flex-direction:column;" role="dialog" aria-modal="true">
      <div class="drawer__header" style="flex-shrink:0;">
        <div>
          <div class="drawer__eyebrow">${isEdit ? 'Edit Event' : 'Add Event'}</div>
          <div class="drawer__title">${isEdit ? event.name : 'New Catalog Event'}</div>
        </div>
        <button class="btn btn--ghost btn--sm" id="evtmodal-close" aria-label="Close"><i data-lucide="x"></i></button>
      </div>

      <!-- Modal tabs -->
      <div style="display:flex;gap:0;border-bottom:1px solid var(--border-subtle);flex-shrink:0;padding:0 var(--space-5);">
        ${['Basic','Properties','Validation','Source Rules'].map((tab,i) => `
          <button type="button" class="evtmodal-tab" data-tab="${i}" style="padding:10px 16px;border:none;background:none;cursor:pointer;font-size:var(--text-sm);border-bottom:2px solid ${i===0?'var(--color-primary)':'transparent'};color:${i===0?'var(--text-primary)':'var(--text-secondary)'};font-weight:${i===0?'600':'400'};">${tab}</button>
        `).join('')}
      </div>

      <div class="drawer__body" style="overflow-y:auto;flex:1;">
        <form id="event-form">

          <!-- Tab 0: Basic -->
          <div class="evtmodal-panel" data-panel="0" style="display:flex;flex-direction:column;gap:14px;">
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
              <label class="form-label">Global Status</label>
              <select class="input" name="status">
                <option value="active"     ${!isEdit||event.status==='active'    ?'selected':''}>Active</option>
                <option value="deprecated" ${isEdit&&event.status==='deprecated' ?'selected':''}>Deprecated</option>
                <option value="blocked"    ${isEdit&&event.status==='blocked'    ?'selected':''}>Blocked (all sources)</option>
              </select>
              <p style="font-size:11px;color:var(--text-secondary);margin-top:4px;">Global status applies when no Source Rule overrides it.</p>
            </div>
          </div>

          <!-- Tab 1: Properties -->
          <div class="evtmodal-panel" data-panel="1" style="display:none;flex-direction:column;gap:10px;">
            <p style="font-size:var(--text-sm);color:var(--text-secondary);margin:0 0 var(--space-2);">
              Click the <i data-lucide="shield-check" style="width:12px;height:12px;display:inline;"></i> icon on a property to add per-source rules (block / require).
            </p>
            <div id="properties-list" style="display:flex;flex-direction:column;gap:8px;">
              ${(isEdit ? event.properties : []).map((p, i) => propertyRow(p, i)).join('')}
            </div>
            <button type="button" class="btn btn--outline btn--sm" id="add-prop-btn" style="align-self:flex-start;">
              <i data-lucide="plus"></i> Add Property
            </button>
          </div>

          <!-- Tab 2: Validation Rules -->
          <div class="evtmodal-panel" data-panel="2" style="display:none;flex-direction:column;gap:8px;">
            <p style="font-size:var(--text-sm);color:var(--text-secondary);margin:0 0 var(--space-2);">
              Global validation rules applied to all sources. Use Source Rules (Tab 4) for per-source differences.
            </p>
            <div style="display:grid;grid-template-columns:1fr 90px 1fr 80px 32px;gap:6px;padding:4px 0;border-bottom:1px solid var(--border-subtle);">
              <span style="font-size:11px;color:var(--text-secondary);font-weight:600;">Field</span>
              <span style="font-size:11px;color:var(--text-secondary);font-weight:600;">Rule</span>
              <span style="font-size:11px;color:var(--text-secondary);font-weight:600;">Value</span>
              <span style="font-size:11px;color:var(--text-secondary);font-weight:600;">Level</span>
              <span></span>
            </div>
            <div id="rules-list" style="display:flex;flex-direction:column;gap:6px;">
              ${(isEdit ? event.validationRules||[] : []).map((r, i) => ruleRow(r, i)).join('')}
            </div>
            <button type="button" class="btn btn--outline btn--sm" id="add-rule-btn" style="align-self:flex-start;">
              <i data-lucide="plus"></i> Add Rule
            </button>
          </div>

          <!-- Tab 3: Source Rules -->
          <div class="evtmodal-panel" data-panel="3" style="display:none;flex-direction:column;gap:14px;">
            <div style="background:var(--surface-secondary);border-radius:8px;padding:12px 14px;font-size:var(--text-sm);color:var(--text-secondary);">
              <strong style="color:var(--text-primary);display:block;margin-bottom:4px;">How source rules work</strong>
              Source rules override the global status for a specific data source.<br>
              <span style="color:var(--color-success);font-weight:600;">allow</span> — accept even if globally blocked ·
              <span style="color:var(--color-danger);font-weight:600;">block</span> — reject even if globally active ·
              <span style="color:var(--text-secondary);font-weight:600;">deprecated</span> — accept with warning
            </div>

            <div class="form-field">
              <label class="form-label" style="margin-bottom:8px;">Event-level source rules</label>
              <div id="event-src-rules">
                ${evtSrcRulesHtml}
              </div>
            </div>

            ${isEdit && event.properties.length > 0 ? `
            <div class="form-field">
              <label class="form-label" style="margin-bottom:4px;">Parameter source rules</label>
              <p style="font-size:11px;color:var(--text-secondary);margin:0 0 10px;">These are set per-property on the Properties tab (shield icon).</p>
              ${event.properties.some(p => (p.sourceRules||[]).length > 0) ? `
                <div style="border:1px solid var(--border-subtle);border-radius:8px;overflow:hidden;">
                  ${event.properties.filter(p => (p.sourceRules||[]).length > 0).map(p => `
                    <div style="padding:8px 12px;border-bottom:1px solid var(--border-subtle);last-child:border-bottom:none;">
                      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                        <span style="font-size:var(--text-sm);font-weight:600;font-family:monospace;">${p.name}</span>
                        <span class="badge badge--neutral badge--dest-tag" style="font-size:10px;">${p.type}</span>
                      </div>
                      ${p.sourceRules.map(r => {
                        const src = _sources.find(s => s.id === r.sourceId);
                        return `<div style="display:flex;align-items:center;gap:8px;font-size:11px;color:var(--text-secondary);margin-top:3px;">
                          <span>${src ? src.name : r.sourceId}</span>
                          → ${sourceActionBadge(r.action)}
                          ${r.reason ? `<span style="color:var(--text-tertiary);">${r.reason}</span>` : ''}
                        </div>`;
                      }).join('')}
                    </div>`).join('')}
                </div>` : `<p style="font-size:var(--text-sm);color:var(--text-tertiary);">No parameter source rules set yet. Go to Properties tab and click the shield icon.</p>`}
            </div>` : ''}
          </div>

          <div style="display:flex;gap:8px;justify-content:flex-end;padding-top:var(--space-5);margin-top:var(--space-4);border-top:1px solid var(--border-subtle);">
            <button type="button" class="btn btn--outline" id="evtmodal-cancel">Cancel</button>
            <button type="submit" class="btn btn--primary">${isEdit ? 'Save Changes' : 'Create Event'}</button>
          </div>
        </form>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  refreshIcons();

  // ── Tab switching ─────────────────────────────────────────────────────────
  overlay.querySelectorAll('.evtmodal-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      overlay.querySelectorAll('.evtmodal-tab').forEach(t => {
        t.style.borderBottomColor = 'transparent';
        t.style.color = 'var(--text-secondary)';
        t.style.fontWeight = '400';
      });
      overlay.querySelectorAll('.evtmodal-panel').forEach(p => p.style.display = 'none');
      tab.style.borderBottomColor = 'var(--color-primary)';
      tab.style.color = 'var(--text-primary)';
      tab.style.fontWeight = '600';
      overlay.querySelector(`.evtmodal-panel[data-panel="${tab.dataset.tab}"]`).style.display = 'flex';
      refreshIcons();
    });
  });

  // ── Property rows ─────────────────────────────────────────────────────────
  bindPropertyRows(overlay.querySelector('#properties-list'));
  overlay.querySelector('#add-prop-btn').onclick = () => {
    const list = overlay.querySelector('#properties-list');
    list.insertAdjacentHTML('beforeend', propertyRow({}, propCount++));
    refreshIcons();
    bindPropertyRows(list);
  };

  // ── Validation rule rows ──────────────────────────────────────────────────
  bindRemove(overlay.querySelector('#rules-list'));
  overlay.querySelector('#add-rule-btn').onclick = () => {
    const list = overlay.querySelector('#rules-list');
    list.insertAdjacentHTML('beforeend', ruleRow({}, ruleCount++));
    refreshIcons();
    bindRemove(list);
  };

  // ── Event source rules editor ─────────────────────────────────────────────
  const evtSrcEditor = overlay.querySelector('#event-src-rules .src-rules-editor');
  if (evtSrcEditor) bindSourceRulesEditor(evtSrcEditor);

  // ── Close ─────────────────────────────────────────────────────────────────
  const close = () => { overlay.remove(); document.body.style.overflow = ''; };
  overlay.querySelector('#evtmodal-close').onclick  = close;
  overlay.querySelector('#evtmodal-cancel').onclick = close;

  // ── Submit ────────────────────────────────────────────────────────────────
  overlay.querySelector('#event-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      name:            fd.get('name').trim(),
      domain:          fd.get('domain'),
      description:     fd.get('description').trim(),
      platforms:       fd.getAll('platforms'),
      lifecycleStage:  fd.get('lifecycleStage') || null,
      status:          fd.get('status'),
      properties:      collectProperties(overlay),
      validationRules: collectRules(overlay),
      sourceRules:     collectSourceRulesFrom(overlay.querySelector('#event-src-rules .src-rules-editor')),
    };
    try {
      if (isEdit) { await api('PUT', `/api/data-catalog/events/${event.id}`, payload); showToast('Event updated'); }
      else        { await api('POST', '/api/data-catalog/events', payload);             showToast('Event created'); }
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
  drawer.querySelector('[data-drawer-title]').textContent   = event.name;
  const editBtn = drawer.querySelector('#drawer-edit-btn');
  if (editBtn) editBtn.onclick = () => {
    drawer.classList.remove('is-open'); document.body.style.overflow = '';
    openEventModal(event);
  };

  const srcRulesSection = (event.sourceRules||[]).length ? `
    <p class="subhead" style="margin:var(--space-4) 0 var(--space-2);">Event Source Rules</p>
    <div class="event-config-list">
      ${event.sourceRules.map(r => {
        const src = _sources.find(s => s.id === r.sourceId);
        return `<div class="event-config-row" style="flex-direction:column;align-items:flex-start;gap:2px;">
          <div style="display:flex;justify-content:space-between;width:100%;align-items:center;">
            <span class="event-config-row__label">${src ? src.name : r.sourceId}</span>
            ${sourceActionBadge(r.action)}
          </div>
          ${r.reason ? `<span style="font-size:11px;color:var(--text-secondary);">${r.reason}</span>` : ''}
        </div>`;
      }).join('')}
    </div>` : '';

  const paramSrcSection = event.properties.some(p => (p.sourceRules||[]).length > 0) ? `
    <p class="subhead" style="margin:var(--space-4) 0 var(--space-2);">Parameter Source Rules</p>
    <div class="event-config-list">
      ${event.properties.filter(p => (p.sourceRules||[]).length > 0).map(p =>
        p.sourceRules.map(r => {
          const src = _sources.find(s => s.id === r.sourceId);
          return `<div class="event-config-row">
            <span class="event-config-row__label font-mono" style="font-size:var(--text-xs);">${p.name} → ${src ? src.name : r.sourceId}</span>
            ${sourceActionBadge(r.action)}
          </div>`;
        }).join('')
      ).join('')}
    </div>` : '';

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
      ${event.lifecycleStage ? `<div class="event-config-row"><span class="event-config-row__label">Lifecycle</span><span class="event-config-row__value">${event.lifecycleStage}</span></div>` : ''}
      <div class="event-config-row"><span class="event-config-row__label">Properties</span><span class="event-config-row__value tabular-nums">${event.properties.length} total · ${event.properties.filter(p=>p.required).length} required</span></div>
      ${(event.sourceRules||[]).length ? `<div class="event-config-row"><span class="event-config-row__label">Source Rules</span><span class="event-config-row__value">${sourceRulesSummary(event.sourceRules)}</span></div>` : ''}
    </div>
    ${event.properties.length ? `
    <p class="subhead" style="margin-bottom:var(--space-2);">Properties</p>
    <div class="event-config-list">
      ${event.properties.map(p => `
        <div class="event-config-row" style="flex-wrap:wrap;gap:4px;">
          <span class="event-config-row__label font-mono" style="font-size:var(--text-xs);">${p.name}${p.required ? '<span style="color:var(--color-danger);margin-left:4px;font-size:10px;">req</span>' : ''}</span>
          <div style="display:flex;gap:4px;align-items:center;">
            <span class="badge badge--neutral badge--dest-tag" style="font-size:10px;">${p.type}</span>
            ${(p.sourceRules||[]).length ? `<span style="font-size:10px;color:var(--color-danger);">${p.sourceRules.filter(r=>r.action==='block').length} blocked src</span>` : ''}
          </div>
        </div>`).join('')}
    </div>` : ''}
    ${srcRulesSection}
    ${paramSrcSection}`;

  drawer.classList.add('is-open');
  document.body.style.overflow = 'hidden';
  refreshIcons();
}

// ── Summary cards ─────────────────────────────────────────────────────────────
function renderSummary(data) {
  const s = data.summary;
  document.querySelector('[data-summary-total]').textContent      = s.totalFields;
  document.querySelector('[data-summary-events]').textContent     = s.totalEvents;
  document.querySelector('[data-summary-attributes]').textContent = s.totalAttributes;
  document.querySelector('[data-summary-sources]').textContent    = s.totalSources;
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
          <p class="section__subtitle">Click a row to view details. Use Edit to manage source rules per event and per parameter.</p>
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
              <th>Event</th><th>Domain</th><th>Platforms</th><th>Props</th>
              <th>Source Rules</th><th>Status</th>
              ${IS_ADMIN ? '<th></th>' : ''}
            </tr></thead>
            <tbody>
              ${_events.map(e => `
                <tr data-event-id="${e.id}" style="cursor:pointer;${e.status==='blocked'?'opacity:.55;':''}">
                  <td><div class="event-cell">
                    <span class="event-cell__icon" style="${e.status==='blocked'?'color:var(--color-danger);':''}"><i data-lucide="${e.status==='blocked'?'ban':'zap'}"></i></span>
                    <div>
                      <span class="event-cell__name">${e.name}</span>
                      ${e.lifecycleStage ? `<span style="font-size:10px;color:var(--text-tertiary);display:block;">${e.lifecycleStage}</span>` : ''}
                    </div>
                  </div></td>
                  <td>${domainBadge(e.domain)}</td>
                  <td style="display:flex;gap:3px;flex-wrap:wrap;padding-top:12px;">${(e.platforms||[]).map(platformBadge).join('')}</td>
                  <td class="tabular-nums" style="font-size:var(--text-sm);">
                    ${e.properties.length}
                    ${e.properties.some(p=>(p.sourceRules||[]).length>0) ? `<span style="font-size:10px;color:var(--color-danger);margin-left:4px;" title="Has parameter source rules">+param rules</span>` : ''}
                  </td>
                  <td>${sourceRulesSummary(e.sourceRules)}</td>
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
            <thead><tr><th>Attribute</th><th>Type</th><th>Source</th><th>Sensitivity</th><th>Source Rules</th><th>Description</th>${IS_ADMIN?'<th></th>':''}</tr></thead>
            <tbody>
              ${attrs.map(a => `<tr>
                <td class="cell-primary">${a.name}</td>
                <td><span class="badge badge--neutral badge--dest-tag" style="font-size:10px;">${a.type}</span></td>
                <td class="cell-muted" style="font-size:var(--text-xs);">${a.source}</td>
                <td>${sensitivityBadge(a.sensitivity)}</td>
                <td>${sourceRulesSummary(a.sourceRules)}</td>
                <td class="cell-muted" style="font-size:var(--text-xs);max-width:200px;white-space:normal;">${a.description}</td>
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
  const srcRulesHtml = buildSourceRulesEditor('attr-src-rules', isEdit ? attr.sourceRules||[] : [], 'attr');
  const overlay = document.createElement('div');
  overlay.className = 'drawer-overlay is-open';
  overlay.style.cssText = 'align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div class="drawer" style="width:520px;max-width:95vw;border-radius:12px;max-height:90vh;overflow-y:auto;" role="dialog">
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
          <div class="form-field"><label class="form-label">Source</label>
            <input class="input" name="source" placeholder="CRM, RudderStack, Mautic…" value="${isEdit?attr.source:''}"></div>
          <div class="form-field"><label class="form-label">Sensitivity</label>
            <select class="input" name="sensitivity">
              ${['low','internal','pii'].map(s=>`<option value="${s}" ${isEdit&&attr.sensitivity===s?'selected':''}>${s}</option>`).join('')}
            </select></div>
          <div class="form-field"><label class="form-label">Description</label>
            <textarea class="input" name="description" rows="2">${isEdit?attr.description:''}</textarea></div>

          <div class="form-field" style="border-top:1px solid var(--border-subtle);padding-top:14px;">
            <label class="form-label" style="margin-bottom:4px;">Source Rules</label>
            <p style="font-size:11px;color:var(--text-secondary);margin:0 0 8px;">
              <strong>allow</strong> — source can read this attribute ·
              <strong>readonly</strong> — read but cannot write ·
              <strong>block</strong> — source cannot access this attribute
            </p>
            <div id="attr-src-rules">${srcRulesHtml}</div>
          </div>

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
  const attrSrcEditor = overlay.querySelector('#attr-src-rules .src-rules-editor');
  if (attrSrcEditor) bindSourceRulesEditor(attrSrcEditor);
  overlay.querySelector('#attr-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      name: fd.get('name').trim(), domain: fd.get('domain'),
      type: fd.get('type'), source: fd.get('source').trim(),
      sensitivity: fd.get('sensitivity'), description: fd.get('description').trim(),
      sourceRules: collectSourceRulesFrom(overlay.querySelector('#attr-src-rules .src-rules-editor')),
    };
    try {
      if (isEdit) { await api('PUT', `/api/data-catalog/attributes/${attr.id}`, payload); showToast('Attribute updated'); }
      else        { await api('POST', '/api/data-catalog/attributes', payload);             showToast('Attribute created'); }
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
          <div class="form-field"><label class="form-label">Platform</label>
            <input class="input" name="platform" placeholder="web, ios_android, server…" value="${isEdit?src.platform:''}"></div>
          <div class="form-field"><label class="form-label">Description</label>
            <textarea class="input" name="description" rows="2">${isEdit?src.description:''}</textarea></div>
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
      else        { await api('POST', '/api/data-catalog/sources', payload);            showToast('Source created'); }
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

// ── Reload all data and re-render ─────────────────────────────────────────────
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

// ── Main entry ────────────────────────────────────────────────────────────────
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
