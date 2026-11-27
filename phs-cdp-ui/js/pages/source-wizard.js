/**
 * source-wizard.js  — BFF-driven Add Source wizard
 * 3 steps: Select Type → Configure → Connect (writeKey + SDK)
 */

const BFF = (window.PHSAPI?.BASE) || 'http://localhost:3001/api';

let _onClose = null;
let _onCreated = null;
let _step = 1;
let _catalog = null;
let _selectedItem = null;
let _createdSource = null;

function refreshIcons() { if (window.lucide) window.lucide.createIcons(); }
function n(str) { return (str || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

function avatarColor(label) {
  const palette = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#84cc16'];
  let h = 0;
  for (let i = 0; i < (label||'').length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

function logoImg(item, size = 32) {
  const bg = avatarColor(item.name);
  const initials = (item.name||'?').slice(0,2).toUpperCase();
  const fallback = `<span class="dir-avatar" style="width:${size}px;height:${size}px;border-radius:8px;background:${bg};color:#fff;font-size:${Math.max(10,Math.floor(size*.4))}px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;">${initials}</span>`;
  if (item.logoUrl) {
    return `<img src="${item.logoUrl}" alt="" style="width:${size}px;height:${size}px;object-fit:contain;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><span class="dir-avatar" style="width:${size}px;height:${size}px;border-radius:8px;background:${bg};color:#fff;font-size:${Math.max(10,Math.floor(size*.4))}px;font-weight:700;display:none;align-items:center;justify-content:center;">${initials}</span>`;
  }
  return fallback;
}

function stepsHTML() {
  const labels = ['Select Type', 'Configure', 'Connect'];
  return `<div class="dest-wizard-steps">${labels.map((label, i) => {
    const num = i + 1, active = _step === num, done = _step > num;
    return `<div class="dest-wizard-step${active?' is-active':''}${done?' is-done':''}"><span class="dest-wizard-step__dot">${done?'✓':num}</span> ${label}</div>${i < labels.length-1 ? '<div class="dest-wizard-step__sep"></div>' : ''}`;
  }).join('')}</div>`;
}

async function fetchCatalog() {
  if (_catalog) return _catalog;
  const res = await fetch(`${BFF}/directory/sources`);
  if (!res.ok) throw new Error('Failed to load catalog');
  const json = await res.json();
  // BFF returns { data: [flat], grouped: [{ category, items }] }
  // Use grouped for sidebar nav, fall back to flat grouping
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

async function renderStep1(activeCategory = 'All') {
  const body = document.querySelector('[data-setup-body]');
  body.innerHTML = `${stepsHTML()}
    <div style="display:flex;gap:0;height:calc(100vh - 160px);overflow:hidden;">
      <div id="sw-sidebar" style="width:210px;flex-shrink:0;border-right:1px solid var(--border-subtle);overflow-y:auto;padding:var(--space-3) 0;"></div>
      <div style="flex:1;overflow-y:auto;padding:var(--space-5);">
        <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-5);">
          <div class="search-field" style="flex:1;max-width:400px;"><i data-lucide="search"></i><input class="input" type="text" placeholder="Search sources…" id="sw-search" /></div>
        </div>
        <div id="sw-main-content"><div style="display:flex;align-items:center;gap:var(--space-2);padding:var(--space-8);color:var(--text-secondary);"><i data-lucide="loader-2" style="animation:spin 1s linear infinite;"></i>Loading sources…</div></div>
      </div>
    </div>`;
  refreshIcons();

  let catalog;
  try { catalog = await fetchCatalog(); }
  catch(e) {
    document.getElementById('sw-main-content').innerHTML = `<div style="padding:var(--space-8);text-align:center;color:var(--text-secondary);"><i data-lucide="wifi-off" style="width:32px;height:32px;margin-bottom:var(--space-3);display:block;margin-inline:auto;"></i><p>Could not load catalog — BFF unreachable.</p><button class="btn btn--outline" id="sw-retry">Retry</button></div>`;
    refreshIcons();
    document.getElementById('sw-retry')?.addEventListener('click', () => renderStep1());
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
  const sidebar = document.getElementById('sw-sidebar');
  sidebar.innerHTML = cats.map(c => {
    const count = c === 'All' ? allItems.length : (catMap[c]||[]).length;
    return `<button class="dest-directory-nav__item${c===activeCategory?' is-active':''}" data-sw-cat="${c}" style="width:100%;text-align:left;padding:6px 16px;border:none;background:none;cursor:pointer;font-size:13px;display:flex;justify-content:space-between;align-items:center;"><span>${c}</span><span style="font-size:11px;opacity:.6;">${count}</span></button>`;
  }).join('');

  sidebar.querySelectorAll('[data-sw-cat]').forEach(btn => btn.addEventListener('click', () => {
    sidebar.querySelectorAll('[data-sw-cat]').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    renderCards(btn.dataset.swCat);
  }));

  function cardHTML(it) {
    return `<button type="button" class="dest-directory-card" data-sw-pick="${it.id}" style="gap:var(--space-3);align-items:flex-start;"><span class="dest-directory-card__icon" style="flex-shrink:0;">${logoImg(it,28)}</span><div style="min-width:0;"><div class="dest-directory-card__name" style="font-size:13px;">${it.name}</div><div class="dest-directory-card__desc" style="font-size:11px;">${it.category||''}</div></div></button>`;
  }

  function wireCards() {
    document.querySelectorAll('[data-sw-pick]').forEach(btn => btn.addEventListener('click', () => {
      _selectedItem = allItems.find(it => it.id === btn.dataset.swPick) || null;
      if (_selectedItem) { _step = 2; renderStep2(); }
    }));
  }

  function renderCards(cat, query = '') {
    let items = cat === 'All' ? allItems : (catMap[cat]||[]);
    if (query) items = allItems.filter(it => n(it.name).includes(n(query)));
    const main = document.getElementById('sw-main-content');
    if (!items.length) { main.innerHTML = `<p style="color:var(--text-secondary);padding:var(--space-5);">No matches.</p>`; return; }
    const byGroup = {};
    if (query || cat === 'All') { items.forEach(it => { (byGroup[it._cat]=byGroup[it._cat]||[]).push(it); }); } 
    else { byGroup[cat] = items; }
    main.innerHTML = Object.entries(byGroup).map(([g,its]) =>
      `<div class="dest-directory-section" style="margin-bottom:var(--space-6);"><div class="dest-directory-section__title" style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-tertiary);margin-bottom:var(--space-3);">${g}</div><div class="dest-directory-grid">${its.map(cardHTML).join('')}</div></div>`
    ).join('');
    wireCards();
    refreshIcons();
  }

  renderCards(activeCategory);
  document.getElementById('sw-search')?.addEventListener('input', e => renderCards('All', e.target.value.trim()));
}

function renderStep2() {
  const body = document.querySelector('[data-setup-body]');
  const item = _selectedItem;
  const cat = (item.category || item._cat || '').toLowerCase();

  let extraHTML = '';
  if (cat.includes('cloud') || cat.includes('extract')) {
    extraHTML = `<div class="form-group"><label class="label">API Key / Token</label><input class="input" type="password" id="sw-cfg-apikey" placeholder="Your API key or access token" /><p class="form-hint">Used to pull data from the source on a schedule.</p></div><div class="form-group"><label class="label">Sync Frequency</label><div class="select" style="max-width:220px;"><select id="sw-cfg-sync"><option>Every hour</option><option>Every 3 hours</option><option>Every 6 hours</option><option>Daily</option></select><i class="select__chevron" data-lucide="chevron-down"></i></div></div>`;
  } else if (cat.includes('reverse') || cat.includes('etl')) {
    extraHTML = `<div class="form-group"><label class="label">Database URL</label><input class="input" type="text" id="sw-cfg-dburl" placeholder="postgresql://host:5432/dbname" /></div><div class="form-group"><label class="label">Schema / Table</label><input class="input" type="text" id="sw-cfg-schema" placeholder="public.users" /></div>`;
  } else {
    extraHTML = `<div class="dataflow-note" style="margin-top:0;"><i data-lucide="info"></i><span>This is an event stream source. After creation you'll receive a Write Key and SDK snippet to install on your app.</span></div>`;
  }

  body.innerHTML = `${stepsHTML()}
    <div style="max-width:560px;margin:0 auto;">
      <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-6);">
        <div style="flex-shrink:0;">${logoImg(item,36)}</div>
        <div><div style="font-weight:600;font-size:var(--text-md);">${item.name}</div><div style="font-size:var(--text-sm);color:var(--text-secondary);">${item.category||item._cat||''}</div></div>
      </div>
      <div class="stack gap-4">
        <div class="form-group"><label class="label" for="sw-name">Source name <span style="color:var(--color-error)">*</span></label><input class="input" type="text" id="sw-name" placeholder="e.g. PHS Website, PHS Mobile App" value="PHS ${item.name}" /><p class="form-hint">A friendly name for this source — only visible in PHS CDP.</p></div>
        ${extraHTML}
      </div>
      <div class="cluster gap-3" style="justify-content:flex-end;margin-top:var(--space-8);border-top:1px solid var(--border-subtle);padding-top:var(--space-5);">
        <button type="button" class="btn btn--ghost" id="sw-back"><i data-lucide="arrow-left"></i> Back</button>
        <button type="button" class="btn btn--primary" id="sw-create">Create Source</button>
      </div>
    </div>`;
  refreshIcons();

  document.getElementById('sw-back')?.addEventListener('click', () => { _step=1; renderStep1(); });
  document.getElementById('sw-create')?.addEventListener('click', async () => {
    const nameEl = document.getElementById('sw-name');
    const name = nameEl?.value?.trim();
    if (!name) { nameEl?.focus(); nameEl?.classList.add('input--error'); return; }
    const btn = document.getElementById('sw-create');
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" style="animation:spin 1s linear infinite;"></i> Creating…';
    refreshIcons();
    try {
      const payload = { name, sourceDefinitionId: item.id, category: item.category || item._cat };
      const apikey = document.getElementById('sw-cfg-apikey')?.value?.trim();
      const dburl  = document.getElementById('sw-cfg-dburl')?.value?.trim();
      if (apikey) payload.config = { apiKey: apikey };
      if (dburl)  payload.config = { ...(payload.config||{}), databaseUrl: dburl };
      const res = await fetch(`${BFF}/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-PHS-Role': 'operator' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err?.error?.message || `HTTP ${res.status}`); }
      _createdSource = await res.json();
      _step = 3;
      renderStep3();
    } catch(e) {
      btn.disabled = false; btn.textContent = 'Create Source';
      const errEl = document.createElement('div');
      errEl.className = 'dataflow-note dataflow-note--error';
      errEl.style.marginTop = 'var(--space-3)';
      errEl.innerHTML = `<i data-lucide="alert-circle"></i><span>${e.message}</span>`;
      btn.parentElement.before(errEl);
      refreshIcons();
    }
  });
}

function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function copyText(text, btnId) {
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.innerHTML = '<i data-lucide="check"></i>'; refreshIcons();
    setTimeout(() => { btn.innerHTML = '<i data-lucide="copy"></i>'; refreshIcons(); }, 2000);
  });
}

function renderStep3() {
  const body = document.querySelector('[data-setup-body]');
  const src  = _createdSource, item = _selectedItem;
  const wk   = src?.writeKey || '(writeKey assigned by server)';
  const dpUrl = window.PHSAPI?.RS_DATA_PLANE || 'https://your-dataplane.example.com';
  const cat = (item?.category || item?._cat || '').toLowerCase();
  const srcName = (item?.name || item?.id || '').toLowerCase();
  const isWebhook = cat.includes('webhook') || srcName.includes('webhook') ||
    (src?.type || '').toLowerCase().includes('webhook');
  const isCloud = cat.includes('cloud') || cat.includes('extract');
  const isEtl   = cat.includes('reverse') || cat.includes('etl');
  const isEvent  = !isWebhook && !isCloud && !isEtl;
  // Detect mobile SDK type
  const isFlutter     = srcName.includes('flutter')     || cat.includes('flutter');
  const isAndroid     = srcName.includes('android')     || cat.includes('android');
  const isIOS         = srcName.includes('ios')         || cat.includes('ios') || srcName.includes('swift');
  const isReactNative = srcName.includes('react-native')|| srcName.includes('reactnative');
  const isNodeSide    = srcName.includes('node')        || cat.includes('server') || cat.includes('backend');
  const isMobile      = isFlutter || isAndroid || isIOS || isReactNative;

  const cfgUrl = window.PHSAPI?.RS_CONFIG_URL || 'http://localhost:3001';

  // Build SDK snippet based on source type
  function buildSdkHtml() {
    if (!isEvent) return `<div class="dataflow-note" style="margin-top:var(--space-5);"><i data-lucide="check-circle-2"></i><span>Source created. Configure the sync schedule in Source settings to start pulling data.</span></div>`;
    
    let snippet = '';
    let label = '';

    if (isFlutter) {
      label = 'Flutter (Dart)';
      snippet = `# pubspec.yaml
dependencies:
  rudder_sdk_flutter: ^2.4.0

# main.dart
import 'package:rudder_sdk_flutter/RudderClient.dart';
import 'package:rudder_sdk_flutter/RudderConfig.dart';

final RudderController rudderClient = RudderClient.getInstance(
  WRITE_KEY: '${wk}',
  config: RudderConfigBuilder()
    .withDataPlaneUrl('${dpUrl}')
    .withControlPlaneUrl('${cfgUrl}')
    .build()
);

// Identify user after login
rudderClient.identify(userId: 'PHS-USER-001', traits: {
  'name': 'Nguyen Van A', 'email': 'user@phs.vn'
});

// Track an event
rudderClient.track(
  RudderProperty()
    ..setEventName('Product Viewed')
    ..setProperty('product_name', 'Margin')
);`;
    } else if (isAndroid) {
      label = 'Android (Kotlin)';
      snippet = `// build.gradle (app)
dependencies {
    implementation 'com.rudderstack.android.sdk:core:1.+'
    implementation 'com.google.code.gson:gson:2.8.9'
}

// Application.kt
val rudderClient = RudderClient.getInstance(
    this, "${wk}",
    RudderConfig.Builder()
        .withDataPlaneUrl("${dpUrl}")
        .withControlPlaneUrl("${cfgUrl}")
        .build()
)

// Identify user
rudderClient.identify("PHS-USER-001",
    RudderTraits().putName("Nguyen Van A").putEmail("user@phs.vn"), null)

// Track event
rudderClient.track("Product Viewed",
    RudderProperty().putValue("product_name", "Margin"))`;
    } else if (isIOS) {
      label = 'iOS (Swift)';
      snippet = `// Podfile
pod 'Rudder', '~> 1.0'

// AppDelegate.swift
import Rudder

let config = RSConfig(writeKey: "${wk}")
    .dataPlaneURL("${dpUrl}")
    .controlPlaneURL("${cfgUrl}")
RSClient.sharedInstance().configure(with: config)

// Identify user
RSClient.sharedInstance().identify("PHS-USER-001",
    traits: ["name": "Nguyen Van A", "email": "user@phs.vn"])

// Track event
RSClient.sharedInstance().track("Product Viewed",
    properties: ["product_name": "Margin"])`;
    } else if (isNodeSide) {
      label = 'Node.js';
      snippet = `// npm install @rudderstack/rudder-sdk-node
const Analytics = require('@rudderstack/rudder-sdk-node');
const client = new Analytics('${wk}', '${dpUrl}/v1/batch');

client.identify({ userId: 'PHS-USER-001', traits: { name: 'Nguyen Van A' } });
client.track({ userId: 'PHS-USER-001', event: 'Product Viewed', properties: { product_name: 'Margin' } });`;
    } else {
      // Default: JavaScript (web) with both tabs
      const jsSnip = `// npm install @rudderstack/analytics-js
import { RudderAnalytics } from '@rudderstack/analytics-js';

const analytics = new RudderAnalytics();
analytics.load('${wk}', '${dpUrl}');

// Identify a user
analytics.identify('USER_ID', { name: 'Nguyen Van A', email: 'user@phs.vn' });

// Track an event
analytics.track('Product Viewed', { product_name: 'Margin' });`;
      const nodeSnip = `// npm install @rudderstack/rudder-sdk-node
const Analytics = require('@rudderstack/rudder-sdk-node');
const client = new Analytics('${wk}', '${dpUrl}/v1/batch');

client.identify({ userId: 'USER_ID', traits: { name: 'Nguyen Van A' } });
client.track({ userId: 'USER_ID', event: 'Product Viewed', properties: { product_name: 'Margin' } });`;
      return `
    <div style="margin-top:var(--space-5);">
      <div style="font-size:var(--text-sm);font-weight:600;margin-bottom:var(--space-3);">SDK Installation</div>
      <div class="tabs" role="tablist" id="sw-sdk-tabs">
        <button class="tabs__tab" role="tab" aria-selected="true" data-sdk-tab="js">JavaScript</button>
        <button class="tabs__tab" role="tab" aria-selected="false" data-sdk-tab="node">Node.js</button>
      </div>
      <div id="sw-sdk-panel-js" style="position:relative;">
        <pre class="font-mono" style="background:var(--surface-2);border-radius:0 0 8px 8px;padding:var(--space-4);font-size:12px;overflow-x:auto;line-height:1.6;margin:0;">${escHtml(jsSnip)}</pre>
        <button type="button" class="btn btn--outline btn--sm" id="sw-copy-js" style="position:absolute;top:8px;right:8px;"><i data-lucide="copy"></i></button>
      </div>
      <div id="sw-sdk-panel-node" hidden style="position:relative;">
        <pre class="font-mono" style="background:var(--surface-2);border-radius:0 0 8px 8px;padding:var(--space-4);font-size:12px;overflow-x:auto;line-height:1.6;margin:0;">${escHtml(nodeSnip)}</pre>
        <button type="button" class="btn btn--outline btn--sm" id="sw-copy-node" style="position:absolute;top:8px;right:8px;"><i data-lucide="copy"></i></button>
      </div>
    </div>`;
    }

    return `
    <div style="margin-top:var(--space-5);">
      <div style="font-size:var(--text-sm);font-weight:600;margin-bottom:var(--space-3);">SDK Installation — ${label}</div>
      <div id="sw-sdk-panel-primary" style="position:relative;">
        <pre class="font-mono" style="background:var(--surface-2);border-radius:8px;padding:var(--space-4);font-size:12px;overflow-x:auto;line-height:1.6;margin:0;">${escHtml(snippet)}</pre>
        <button type="button" class="btn btn--outline btn--sm" id="sw-copy-primary" style="position:absolute;top:8px;right:8px;"><i data-lucide="copy"></i></button>
      </div>
    </div>`;
  }

  const sdkHtml = buildSdkHtml();

  body.innerHTML = `${stepsHTML()}
    <div style="max-width:620px;margin:0 auto;">
      <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-2);">
        <span style="width:40px;height:40px;border-radius:50%;background:var(--color-success-bg,#dcfce7);display:inline-flex;align-items:center;justify-content:center;">
          <i data-lucide="check-circle-2" style="color:var(--color-success,#16a34a);width:22px;height:22px;"></i>
        </span>
        <div>
          <div style="font-weight:600;font-size:var(--text-md);">Source created — ${src?.name || item?.name || ''}</div>
          <div style="font-size:var(--text-sm);color:var(--text-secondary);">${isWebhook ? 'Configure your system to send HTTP POST requests to the webhook endpoint below.' : isEvent ? 'Copy your Write Key and install the SDK to start sending data.' : 'Source created. Configure the sync schedule in source settings.'}</div>
        </div>
      </div>
      ${isWebhook ? `
      <div class="section" style="margin-top:var(--space-6);"><div class="section__body" style="padding:var(--space-4);">
        <div style="font-size:var(--text-sm);font-weight:600;margin-bottom:var(--space-2);">Webhook Endpoint URL</div>
        <div style="display:flex;align-items:center;gap:var(--space-2);">
          <code class="font-mono" style="flex:1;background:var(--surface-2);padding:10px 12px;border-radius:6px;font-size:13px;word-break:break-all;">${dpUrl}/v1/webhook?writeKey=${wk}</code>
          <button type="button" class="btn btn--outline btn--sm" id="sw-copy-wk" title="Copy URL"><i data-lucide="copy"></i></button>
        </div>
        <p style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:var(--space-2);">Configure your external system to send HTTP POST requests (JSON) to this URL.</p>
      </div></div>
      <div class="dataflow-note" style="margin-top:var(--space-4);">
        <i data-lucide="info"></i>
        <span>Send events as JSON: <code style="font-size:11px;">POST ${dpUrl}/v1/webhook?writeKey=${wk}</code> with <code style="font-size:11px;">Content-Type: application/json</code> in the request header.</span>
      </div>` : isEvent ? `
      <div class="section" style="margin-top:var(--space-6);"><div class="section__body" style="padding:var(--space-4);">
        <div style="font-size:var(--text-sm);font-weight:600;margin-bottom:var(--space-2);">Write Key</div>
        <div style="display:flex;align-items:center;gap:var(--space-2);">
          <code class="font-mono" style="flex:1;background:var(--surface-2);padding:10px 12px;border-radius:6px;font-size:13px;word-break:break-all;">${wk}</code>
          <button type="button" class="btn btn--outline btn--sm" id="sw-copy-wk" title="Copy Write Key"><i data-lucide="copy"></i></button>
        </div>
        <p style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:var(--space-2);">Keep this key private. Never expose it in client-side code for server-side sources.</p>
      </div></div>
      ${sdkHtml}` : `
      <div class="dataflow-note" style="margin-top:var(--space-6);">
        <i data-lucide="check-circle-2"></i>
        <span>Source created. Go to source settings to configure the sync schedule and start pulling data.</span>
      </div>`}
      <div class="cluster gap-3" style="justify-content:flex-end;margin-top:var(--space-8);border-top:1px solid var(--border-subtle);padding-top:var(--space-5);">
        <button type="button" class="btn btn--ghost" id="sw-add-another">Add another source</button>
        <button type="button" class="btn btn--primary" id="sw-done">View source</button>
      </div>
    </div>`;
  refreshIcons();

  const copyWkVal = isWebhook ? `${dpUrl}/v1/webhook?writeKey=${wk}` : wk;
  document.getElementById('sw-copy-wk')?.addEventListener('click', () => copyText(copyWkVal, 'sw-copy-wk'));
  document.querySelectorAll('[data-sdk-tab]').forEach(tab => tab.addEventListener('click', () => {
    document.querySelectorAll('[data-sdk-tab]').forEach(t => t.setAttribute('aria-selected','false'));
    tab.setAttribute('aria-selected','true');
    const jp = document.getElementById('sw-sdk-panel-js'), np = document.getElementById('sw-sdk-panel-node');
    if (jp) jp.hidden  = tab.dataset.sdkTab !== 'js';
    if (np) np.hidden = tab.dataset.sdkTab !== 'node';
  }));
  document.getElementById('sw-copy-js')?.addEventListener('click', () => copyText(jsSnippet, 'sw-copy-js'));
  document.getElementById('sw-copy-node')?.addEventListener('click', () => copyText(nodeSnippet, 'sw-copy-node'));
  document.getElementById('sw-done')?.addEventListener('click', () => { closeSourceWizard(); if (_onCreated) _onCreated(_createdSource); });
  document.getElementById('sw-add-another')?.addEventListener('click', () => { _step=1; _selectedItem=null; _createdSource=null; renderStep1(); });
}

// ── Public API ────────────────────────────────────────────────────────────────
export function openSourceWizard({ onClose, onCreated, presetProvider } = {}) {
  _onClose = onClose || null;
  _onCreated = onCreated || null;
  _step = 1;
  _selectedItem = _createdSource = null;

  document.querySelector('[data-setup-title]').textContent = 'Add Source';
  document.querySelector('[data-setup-back-label]').textContent = 'Back to Sources';
  document.querySelector('[data-view-setup]').hidden = false;
  document.body.style.overflow = 'hidden';

  if (presetProvider) {
    // Skip step 1 — pre-select from catalog then go to step 2
    fetchCatalog().then(grouped => {
      let found = null;
      for (const g of (grouped || [])) {
        found = g.items.find(it =>
          (it.id || '').toLowerCase() === presetProvider.toLowerCase() ||
          (it.name || '').toLowerCase() === presetProvider.toLowerCase()
        );
        if (found) break;
      }
      _selectedItem = found || { id: presetProvider, name: presetProvider, category: 'Event Stream' };
      _step = 2;
      renderStep2();
    }).catch(() => {
      _selectedItem = { id: presetProvider, name: presetProvider, category: 'Event Stream' };
      _step = 2;
      renderStep2();
    });
  } else {
    renderStep1();
  }
}

export function closeSourceWizard() {
  document.querySelector('[data-view-setup]').hidden = true;
  document.body.style.overflow = '';
  const url = new URL(location.href);
  if (url.searchParams.has('setup')) { url.searchParams.delete('setup'); history.replaceState({}, '', url); }
  if (_onClose) _onClose();
}
