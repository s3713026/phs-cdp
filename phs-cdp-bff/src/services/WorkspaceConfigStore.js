/**
 * WorkspaceConfigStore — the ONLY reader/writer of the data platform's
 * workspace configuration file (workspaceConfig.json).
 *
 * Why this exists
 * ---------------
 * The data platform (RudderStack, config-from-file mode) reads its sources,
 * destinations and connections from one JSON file and re-reads it every few
 * seconds. Several routes used to write that file, each in its own dialect, so
 * saving from one screen silently erased what another screen had saved.
 *
 * This module keeps one business model in memory:
 *
 *   sources         [{ id, name, writeKey, enabled, type, config }]
 *   destinations    [{ id, name, type, enabled, config, advancedConfig, … }]
 *   links           [{ sourceId, destinationId }]
 *   transformations [{ id, name, code, versionId, … }]
 *   destTransformations [{ destinationId, transformationId }]
 *
 * and serialises it to the exact layout the data platform expects
 * (sources[].Destinations[] + connections map). Everything the platform does
 * not understand (unlinked destinations, UI-only settings, transformation
 * source code) lives under the top-level "phs" key, which the platform ignores.
 */
const fs   = require('fs');
const path = require('path');

const CONFIG_PATH =
  process.env.WORKSPACE_CONFIG_PATH ||
  process.env.RUDDERSTACK_WORKSPACE_CONFIG ||
  path.join(__dirname, '../../workspaceConfig.json');

// Path to RudderStack's own workspaceConfig — kept in sync so RS picks up new sources.
const RS_CONFIG_PATH =
  process.env.RUDDERSTACK_CONFIG_PATH ||
  path.join(__dirname, '../../../rudderstack/workspaceConfig.json');


const DEFAULT_WORKSPACE_ID = 'phs-workspace';

// ─── helpers ──────────────────────────────────────────────────────────────────
function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
const pick = (...vals) => vals.find(v => v !== undefined && v !== null);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const flag = (o) => !(o.enabled === false || o.Enabled === false);

/** A destination that delivers events into this platform's own profile store. */
function isSystemDestination(dest) {
  if (!dest) return false;
  if (dest.system === true) return true;
  const url = String((dest.config && (dest.config.webhookUrl || dest.config.url)) || '');
  return /\/api\/webhook\/rudderstack/.test(url);
}

// ─── parse (any historical layout → model) ───────────────────────────────────
function parseDestination(d) {
  const def = d.DestinationDefinition || d.destinationDefinition || {};
  return {
    id:      pick(d.ID, d.id),
    name:    pick(d.Name, d.name, ''),
    type:    String(pick(def.Name, def.name, d.destinationDefinitionId, d.DestinationDefinitionId, d.type, 'WEBHOOK')),
    displayType: pick(def.DisplayName, def.displayName),
    enabled: flag(d),
    config:  isObj(pick(d.Config, d.config)) ? { ...pick(d.Config, d.config) } : {},
    advancedConfig: d.advancedConfig,
    deliveryConfig: d.deliveryConfig,
    consentConfig:  d.consentConfig,
    dataSelection:  d.dataSelection,
    system:         d.system,
    createdAt:      d.createdAt,
    updatedAt:      d.updatedAt,
    _transformationRefs: (d.Transformations || d.transformations || [])
      .map(t => (isObj(t) ? pick(t.ID, t.id) : t)).filter(Boolean),
  };
}

function parse(raw) {
  raw = isObj(raw) ? raw : {};
  const phs = isObj(raw.phs) ? raw.phs : {};

  const destMap = new Map();
  const addDest = (d, { override = false } = {}) => {
    if (!isObj(d)) return;
    const parsed = parseDestination(d);
    if (!parsed.id) return;
    if (!destMap.has(parsed.id)) { destMap.set(parsed.id, parsed); return; }
    if (override) {
      const prev = destMap.get(parsed.id);
      const merged = { ...prev };
      for (const [k, v] of Object.entries(parsed)) if (v !== undefined) merged[k] = v;
      destMap.set(parsed.id, merged);
    }
  };

  // 1. what the data platform is actually running (embedded in sources)
  // 2. legacy top-level list
  // 3. our own block — authoritative for UI-only fields and unlinked destinations
  const sources = [];
  const links = [];
  const seenLink = new Set();
  const destTransformations = [];

  for (const s of (Array.isArray(raw.sources) ? raw.sources : [])) {
    if (!isObj(s)) continue;
    const id = pick(s.ID, s.id);
    if (!id) continue;
    const def = s.SourceDefinition || s.sourceDefinition || {};
    sources.push({
      id,
      name:     pick(s.Name, s.name, ''),
      writeKey: pick(s.WriteKey, s.writeKey, ''),
      enabled:  flag(s),
      type:     String(pick(def.Name, def.name, s.sourceDefinitionId, s.SourceDefinitionId, 'Javascript')),
      category: pick(def.Category, def.category),
      config:   isObj(pick(s.Config, s.config)) ? { ...pick(s.Config, s.config) } : {},
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    });

    const refs = [
      ...(Array.isArray(s.Destinations) ? s.Destinations : []),
      ...(Array.isArray(s.destinations) ? s.destinations : []),
    ];
    for (const ref of refs) {
      let destId = null;
      if (typeof ref === 'string') destId = ref;
      else if (isObj(ref)) {
        destId = pick(ref.ID, ref.id, ref.destinationId);
        // a full embedded object (not a bare { id, destinationId } pointer)
        if (ref.Name !== undefined || ref.name !== undefined || ref.Config || ref.config || ref.DestinationDefinition) {
          addDest(ref);
        }
      }
      if (!destId) continue;
      const key = `${id}→${destId}`;
      if (!seenLink.has(key)) { seenLink.add(key); links.push({ sourceId: id, destinationId: destId }); }
    }
  }

  for (const d of (Array.isArray(raw.destinations) ? raw.destinations : [])) addDest(d);
  for (const d of (Array.isArray(phs.destinations) ? phs.destinations : [])) addDest(d, { override: true });

  // transformations: our block first, legacy top-level as fallback
  const transformations = (Array.isArray(phs.transformations) ? phs.transformations
    : Array.isArray(raw.transformations) ? raw.transformations : [])
    .filter(t => isObj(t) && t.id).map(t => ({ ...t }));
  const trIds = new Set(transformations.map(t => t.id));

  const rawDT = Array.isArray(phs.destTransformations) ? phs.destTransformations
    : Array.isArray(raw.destTransformations) ? raw.destTransformations : [];
  const seenDT = new Set();
  const addDT = (destinationId, transformationId) => {
    if (!destinationId || !trIds.has(transformationId)) return;
    const key = `${destinationId}→${transformationId}`;
    if (seenDT.has(key)) return;
    seenDT.add(key);
    destTransformations.push({ destinationId, transformationId });
  };
  rawDT.forEach(dt => isObj(dt) && addDT(dt.destinationId, dt.transformationId));
  for (const d of destMap.values()) (d._transformationRefs || []).forEach(tid => addDT(d.id, tid));

  const destinations = [...destMap.values()].map(d => { const { _transformationRefs, ...rest } = d; return rest; });
  const destIds = new Set(destinations.map(d => d.id));

  return {
    workspaceId: raw.workspaceId || DEFAULT_WORKSPACE_ID,
    sources,
    destinations,
    links: links.filter(l => destIds.has(l.destinationId)),
    transformations,
    destTransformations: destTransformations.filter(dt => destIds.has(dt.destinationId)),
  };
}

// ─── serialise (model → data-platform layout) ────────────────────────────────
function serialise(model) {
  const destById = new Map(model.destinations.map(d => [d.id, d]));
  const trById   = new Map(model.transformations.map(t => [t.id, t]));
  const connections = {};

  const embed = (d) => ({
    ID: d.id,
    Name: d.name,
    DestinationDefinition: {
      Name: d.type,
      DisplayName: d.displayType || d.name || d.type,
      Category: d.type === 'WEBHOOK' ? 'webhook' : undefined,
    },
    Enabled: d.enabled !== false,
    Config: d.config || {},
    // Only published transformations are handed to the data platform (one per destination).
    Transformations: model.destTransformations
      .filter(dt => dt.destinationId === d.id)
      .map(dt => trById.get(dt.transformationId))
      .filter(t => t && t.status !== 'Draft' && t.versionId)
      .slice(0, 1)
      .map(t => ({ ID: t.id, VersionID: t.versionId, Config: {} })),
    IsProcessorEnabled: true,
  });

  const sources = model.sources.map(s => {
    const linked = model.links
      .filter(l => l.sourceId === s.id)
      .map(l => destById.get(l.destinationId))
      .filter(Boolean);
    linked.forEach(d => {
      connections[`${s.id}_${d.id}`] = {
        sourceId: s.id, destinationId: d.id,
        enabled: d.enabled !== false, processorEnabled: true,
      };
    });
    return {
      ID: s.id,
      Name: s.name,
      WriteKey: s.writeKey,
      Enabled: s.enabled !== false,
      SourceDefinition: { Name: s.type, ...(s.category ? { Category: s.category, Type: s.category } : {}) },
      Config: s.config || {},
      Destinations: linked.map(embed),
      ...(s.createdAt ? { createdAt: s.createdAt } : {}),
      ...(s.updatedAt ? { updatedAt: s.updatedAt } : {}),
    };
  });

  return {
    workspaceId: model.workspaceId || DEFAULT_WORKSPACE_ID,
    sources,
    connections,
    // Ignored by the data platform — owned by the Unified API.
    phs: {
      version: 2,
      updatedAt: new Date().toISOString(),
      destinations: model.destinations.map(d => ({
        id: d.id, name: d.name, destinationDefinitionId: d.type, displayName: d.displayType,
        enabled: d.enabled !== false, config: d.config || {},
        advancedConfig: d.advancedConfig, deliveryConfig: d.deliveryConfig,
        consentConfig: d.consentConfig, dataSelection: d.dataSelection,
        system: d.system, createdAt: d.createdAt, updatedAt: d.updatedAt,
      })),
      transformations: model.transformations,
      destTransformations: model.destTransformations,
    },
  };
}

// ─── file access ──────────────────────────────────────────────────────────────
function load() {
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      // An unreadable file must never be treated as "empty" and then overwritten.
      const e = new Error(`Workspace configuration cannot be read: ${err.message}`);
      e.code = 'CONFIG_UNREADABLE';
      throw e;
    }
  }
  return parse(raw);
}

function save(model) {
  const out = JSON.stringify(serialise(model), null, 2);
  JSON.parse(out); // sanity
  // Written in place on purpose: the file is bind-mounted into the data platform
  // container, and replacing it (rename) would detach that mount.
  fs.writeFileSync(CONFIG_PATH, out, 'utf8');

  // Sync sources to RudderStack's own workspaceConfig so RS picks up new write keys.
  try {
    const rsRaw = (() => { try { return JSON.parse(fs.readFileSync(RS_CONFIG_PATH, 'utf8')); } catch (_) { return {}; } })();
    const serialised = JSON.parse(out);
    // Merge: add/update BFF sources into RS config by WriteKey
    const rsSourceMap = new Map((rsRaw.sources || []).map(s => [s.WriteKey || s.writeKey, s]));
    for (const s of (serialised.sources || [])) {
      const wk = s.WriteKey || s.writeKey;
      if (wk) rsSourceMap.set(wk, s);
    }
    rsRaw.sources = [...rsSourceMap.values()];
    // Preserve connections/workspaceId from RS config
    if (serialised.workspaceId && !rsRaw.workspaceId) rsRaw.workspaceId = serialised.workspaceId;
    fs.writeFileSync(RS_CONFIG_PATH, JSON.stringify(rsRaw, null, 2), 'utf8');
  } catch (syncErr) {
    // Non-fatal: BFF config saved; RS will keep existing sources until next restart.
    console.warn('[WorkspaceConfigStore] RS config sync failed:', syncErr.message);
  }

  return model;
}

/** Read → change → write, in one synchronous step (no interleaving in Node). */
function mutate(fn) {
  const model = load();
  const result = fn(model);
  save(model);
  return result;
}

function notFound(what) {
  const e = new Error(`${what} not found`);
  e.status = 404;
  return e;
}
function badRequest(msg) {
  const e = new Error(msg);
  e.status = 400;
  return e;
}

// ─── Sources ──────────────────────────────────────────────────────────────────
function listSources() { return load().sources; }

function createSource({ name, type, config = {}, enabled = true, category }) {
  if (!name || !type) throw badRequest('name and sourceDefinitionId are required');
  return mutate(model => {
    const slug = String(type).replace(/[^A-Za-z0-9]/g, '').slice(0, 24) || 'source';
    // Auto-detect category for known source types
    const isWebhook = /webhook/i.test(type) || /webhook/i.test(category || '');
    const resolvedCategory = isWebhook ? 'webhook' : (category || undefined);
    const src = {
      id: uid('src'), name: String(name).trim(),
      writeKey: `phs_${slug}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      enabled: enabled !== false, type: String(type), category: resolvedCategory,
      config: isObj(config) ? config : {},
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    model.sources.push(src);
    // Every data source feeds the customer profile store out of the box.
    model.destinations.filter(isSystemDestination).forEach(d => {
      model.links.push({ sourceId: src.id, destinationId: d.id });
    });
    return src;
  });
}

function updateSource(id, updates = {}) {
  return mutate(model => {
    const src = model.sources.find(s => s.id === id);
    if (!src) throw notFound('Source');
    if (updates.name !== undefined) src.name = String(updates.name).trim();
    if (updates.enabled !== undefined) src.enabled = updates.enabled !== false;
    if (isObj(updates.config)) src.config = updates.config;
    src.updatedAt = new Date().toISOString();
    return src;
  });
}

function deleteSource(id) {
  return mutate(model => {
    const before = model.sources.length;
    model.sources = model.sources.filter(s => s.id !== id);
    if (model.sources.length === before) throw notFound('Source');
    model.links = model.links.filter(l => l.sourceId !== id);
    return { ok: true };
  });
}

// ─── Destinations ─────────────────────────────────────────────────────────────
function listDestinations() { return load().destinations; }

function createDestination({ name, type, displayType, config = {}, enabled = true, sourceIds = [] }) {
  if (!name || !type) throw badRequest('name and destinationDefinitionId are required');
  return mutate(model => {
    const dest = {
      id: uid('dest'), name: String(name).trim(), type: String(type), displayType,
      enabled: enabled !== false, config: isObj(config) ? config : {},
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    model.destinations.push(dest);
    for (const sid of (Array.isArray(sourceIds) ? sourceIds : [])) {
      if (model.sources.some(s => s.id === sid)) model.links.push({ sourceId: sid, destinationId: dest.id });
    }
    return dest;
  });
}

const DEST_UI_FIELDS = ['advancedConfig', 'deliveryConfig', 'consentConfig', 'dataSelection'];
// Advanced settings the data platform itself understands → copied into Config
const RS_ADVANCED_KEYS = ['requestTimeout', 'maxAttempts', 'noOfWorkers', 'maxBatchSize',
  'uploadFreq', 'warehouseSyncFreq', 'enableDedup', 'skipTracksTable', 'skipUsersTable'];

function updateDestination(id, updates = {}) {
  return mutate(model => {
    const dest = model.destinations.find(d => d.id === id);
    if (!dest) throw notFound('Destination');
    if (updates.name !== undefined) dest.name = String(updates.name).trim();
    if (updates.enabled !== undefined) dest.enabled = updates.enabled !== false;
    if (isObj(updates.config)) dest.config = updates.config;
    DEST_UI_FIELDS.forEach(k => { if (updates[k] !== undefined) dest[k] = updates[k]; });
    if (isObj(updates.advancedConfig)) {
      RS_ADVANCED_KEYS.forEach(k => {
        if (updates.advancedConfig[k] !== undefined) dest.config[k] = updates.advancedConfig[k];
      });
    }
    dest.updatedAt = new Date().toISOString();
    return dest;
  });
}

function deleteDestination(id) {
  return mutate(model => {
    const before = model.destinations.length;
    model.destinations = model.destinations.filter(d => d.id !== id);
    if (model.destinations.length === before) throw notFound('Destination');
    model.links = model.links.filter(l => l.destinationId !== id);
    model.destTransformations = model.destTransformations.filter(dt => dt.destinationId !== id);
    return { ok: true };
  });
}

// ─── Links ────────────────────────────────────────────────────────────────────
function link(sourceId, destinationId) {
  return mutate(model => {
    if (!model.sources.some(s => s.id === sourceId)) throw notFound('Source');
    if (!model.destinations.some(d => d.id === destinationId)) throw notFound('Destination');
    if (!model.links.some(l => l.sourceId === sourceId && l.destinationId === destinationId)) {
      model.links.push({ sourceId, destinationId });
    }
    return { ok: true };
  });
}

function unlink(sourceId, destinationId) {
  return mutate(model => {
    if (!model.sources.some(s => s.id === sourceId)) throw notFound('Source');
    model.links = model.links.filter(l => !(l.sourceId === sourceId && l.destinationId === destinationId));
    return { ok: true };
  });
}

// ─── Transformations ──────────────────────────────────────────────────────────
function saveTransformations(fn) { return mutate(fn); }

module.exports = {
  CONFIG_PATH,
  load, save, mutate, parse, serialise,
  isSystemDestination, uid,
  listSources, createSource, updateSource, deleteSource,
  listDestinations, createDestination, updateDestination, deleteDestination,
  link, unlink, saveTransformations,
};
