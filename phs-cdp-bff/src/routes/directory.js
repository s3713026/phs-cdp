/**
 * /api/directory — RudderStack connector catalog
 *
 * Sources the full connector list from rsCatalogFetcher which:
 *   1. Reads from disk cache (rs-catalog-cache.json) if fresh
 *   2. Fetches from GitHub rudderlabs/rudder-integrations-config otherwise
 *   3. Falls back to a built-in list if GitHub is unreachable
 *
 * Marks items as `configured: true` when they appear in workspaceConfig.json.
 */
const express  = require('express');
const router   = express.Router();
const fs       = require('fs');
const path     = require('path');
const { getCatalog } = require('../data/rsCatalogFetcher');

// ─── Read workspaceConfig to find configured connectors ───────────────────────
const WS_CANDIDATES = [
  path.join(__dirname, '../../workspaceConfig.json'),
  path.join(__dirname, '../../../phs-cdp-ui/rudderstack-setup/workspaceConfig.json'),
];

function getConfiguredIds() {
  for (const p of WS_CANDIDATES) {
    try {
      const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
      const srcIds  = (raw.sources      || []).map(s => (s.sourceDefinitionId      || '').toLowerCase());
      const destIds = (raw.destinations || []).map(d => (d.destinationDefinitionId || '').toLowerCase());
      return { srcIds, destIds };
    } catch (_) {}
  }
  return { srcIds: [], destIds: [] };
}

// ─── Group items by category ──────────────────────────────────────────────────
function groupByCategory(items) {
  const map = {};
  for (const item of items) {
    const cat = item.category || 'Other';
    if (!map[cat]) map[cat] = [];
    map[cat].push(item);
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, items]) => ({ category, items }));
}

// ─── Routes ───────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const catalog = await getCatalog();
    const { srcIds, destIds } = getConfiguredIds();

    const sources = catalog.sources.map(s => ({
      ...s,
      configured: srcIds.includes(s.folder?.toLowerCase()) ||
                  srcIds.includes(s.id?.toLowerCase()),
    }));

    const destinations = catalog.destinations.map(d => ({
      ...d,
      configured: destIds.includes(d.folder?.toLowerCase()) ||
                  destIds.includes(d.id?.toLowerCase()),
    }));

    res.json({
      data: { sources, destinations },
      grouped: {
        sources:      groupByCategory(sources),
        destinations: groupByCategory(destinations),
      },
      total: { sources: sources.length, destinations: destinations.length },
      generatedAt: catalog.generatedAt,
    });
  } catch (err) {
    console.error('[directory] GET /:', err);
    res.status(500).json({ error: 'Failed to load connector catalog' });
  }
});

router.get('/sources', async (req, res) => {
  try {
    const catalog = await getCatalog();
    const { srcIds } = getConfiguredIds();
    const sources = catalog.sources.map(s => ({
      ...s,
      configured: srcIds.includes(s.folder?.toLowerCase()) ||
                  srcIds.includes(s.id?.toLowerCase()),
    }));
    res.json({ data: sources, grouped: groupByCategory(sources), total: sources.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load sources' });
  }
});

router.get('/destinations', async (req, res) => {
  try {
    const catalog = await getCatalog();
    const { destIds } = getConfiguredIds();
    const destinations = catalog.destinations.map(d => ({
      ...d,
      configured: destIds.includes(d.folder?.toLowerCase()) ||
                  destIds.includes(d.id?.toLowerCase()),
    }));
    res.json({ data: destinations, grouped: groupByCategory(destinations), total: destinations.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load destinations' });
  }
});

module.exports = router;
