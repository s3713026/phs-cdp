/**
 * GET /api/catalog/fields
 * Trả về unified field catalog từ Mautic + PHS business fields
 * UI dùng để build audience conditions biết đúng field nào available
 */
const express = require('express');
const router  = express.Router();
const MauticAdapter = require('../adapters/MauticAdapter');
const mautic = new MauticAdapter();

// ─── Operator mapping Mautic type → UI operators ───────────────────────────
const TYPE_OPERATORS = {
  text:     ['equals','not_equals','contains','not_contains','starts_with','empty','not_empty'],
  email:    ['equals','not_equals','contains','empty','not_empty'],
  number:   ['equals','not_equals','gt','gte','lt','lte','empty','not_empty'],
  select:   ['equals','not_equals','in','not_in','empty','not_empty'],
  boolean:  ['equals'],
  date:     ['equals','not_equals','gt','gte','lt','lte','between','empty','not_empty'],
  datetime: ['equals','not_equals','gt','gte','lt','lte','between','empty','not_empty'],
  lookup:   ['in','not_in','empty','not_empty'],
  tags:     ['in','not_in','empty','not_empty'],
  default:  ['equals','not_equals','empty','not_empty'],
};

function getOperators(mauticType) {
  return TYPE_OPERATORS[mauticType] || TYPE_OPERATORS.default;
}

// ─── PHS business fields (không có trong Mautic native) ────────────────────
// Các field này được BFF evaluate — không push filter xuống Mautic
const PHS_BUSINESS_FIELDS = [
  {
    field:       'phs_lifecycle_stage',
    label:       'Lifecycle Stage',
    category:    'Lifecycle',
    type:        'select',
    source:      'phs',
    mauticAlias: null,
    operators:   ['equals','not_equals','in','not_in'],
    options:     ['Prospect','Lead','eKYC','Account Opening','Funding','First Trade',
                  'Active Investor','VIP','Dormant','Churn Risk','Reactivation'],
  },
  {
    field:       'phs_customer_tier',
    label:       'Customer Tier',
    category:    'Profile',
    type:        'select',
    source:      'phs',
    mauticAlias: null,
    operators:   ['equals','not_equals','in','not_in'],
    options:     ['Platinum','Gold','Silver','Standard'],
  },
  {
    field:       'phs_trading_frequency',
    label:       'Trading Frequency',
    category:    'Behavior',
    type:        'number',
    source:      'phs',
    mauticAlias: null,
    operators:   ['gt','gte','lt','lte','equals'],
    unit:        'trades/month',
  },
  {
    field:       'phs_cash_utilization',
    label:       'Cash Utilization',
    category:    'Financial',
    type:        'number',
    source:      'phs',
    mauticAlias: null,
    operators:   ['gt','gte','lt','lte','equals'],
    unit:        '%',
  },
  {
    field:       'phs_product_interest',
    label:       'Product Interest',
    category:    'Product',
    type:        'select',
    source:      'phs',
    mauticAlias: null,
    operators:   ['in','not_in','contains'],
    options:     ['Margin','Elites Pick','Elites Portfolio','Elites Seeds','Standard Account'],
  },
  {
    field:       'phs_first_trade',
    label:       'First Trade Completed',
    category:    'Lifecycle',
    type:        'boolean',
    source:      'phs',
    mauticAlias: null,
    operators:   ['equals'],
    options:     ['true','false'],
  },
  {
    field:       'phs_days_since_last_trade',
    label:       'Days Since Last Trade',
    category:    'Behavior',
    type:        'number',
    source:      'phs',
    mauticAlias: null,
    operators:   ['gt','gte','lt','lte'],
    unit:        'days',
  },
  {
    field:       'phs_account_open_date',
    label:       'Account Open Date',
    category:    'Lifecycle',
    type:        'date',
    source:      'phs',
    mauticAlias: null,
    operators:   ['gt','gte','lt','lte','between'],
  },
];

// ─── Mautic field groups không cần show trong audience builder ──────────────
const MAUTIC_SKIP_GROUPS = ['social', 'professional'];
const MAUTIC_SKIP_FIELDS = ['color', 'signature', 'website', 'fax'];

// ─── Map Mautic field → unified catalog entry ───────────────────────────────
function mapMauticField(f) {
  return {
    field:       f.alias,
    label:       f.label || f.alias,
    category:    f.group ? capitalize(f.group) : 'Contact',
    type:        f.type || 'text',
    source:      'mautic',
    mauticAlias: f.alias,
    operators:   getOperators(f.type),
    options:     f.properties?.list
                   ? Object.entries(f.properties.list).map(([k, v]) => ({ value: k, label: v }))
                   : undefined,
    required:    f.isRequired || false,
    isCustom:    !f.isFixed,
  };
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// ─── Route ──────────────────────────────────────────────────────────────────
router.get('/fields', async (req, res) => {
  try {
    // 1. Pull Mautic contact fields
    let mauticFields = [];
    try {
      const result = await mautic.getContactFields();
      const raw = result?.data?.fields || result?.fields || [];
      mauticFields = Object.values(raw)
        .filter(f => !MAUTIC_SKIP_GROUPS.includes(f.group) && !MAUTIC_SKIP_FIELDS.includes(f.alias))
        .map(mapMauticField);
    } catch (err) {
      console.warn('[catalog] Mautic fields fetch failed:', err.message);
      // fallback: chỉ dùng PHS fields nếu Mautic unreachable
    }

    // 2. Merge: PHS fields + Mautic fields
    // PHS fields được ưu tiên (đứng trước), grouped by category
    const allFields = [...PHS_BUSINESS_FIELDS, ...mauticFields];

    // 3. Group by category
    const grouped = {};
    for (const f of allFields) {
      const cat = f.category || 'Other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(f);
    }

    // 4. Trả về cả flat list lẫn grouped
    res.json({
      fields:  allFields,
      grouped,
      sources: {
        mautic:  mauticFields.length,
        phs:     PHS_BUSINESS_FIELDS.length,
        total:   allFields.length,
      },
      syncedAt: new Date().toISOString(),
    });

  } catch (err) {
    console.error('[catalog] error:', err.message);
    res.status(500).json({ error: 'Failed to load field catalog' });
  }
});

// Sync: tạo custom fields PHS vào Mautic nếu chưa có
router.post('/sync-to-mautic', async (req, res) => {
  const results = [];

  // Lấy fields hiện có trong Mautic để check duplicate
  let existingAliases = new Set();
  try {
    const existing = await mautic.getContactFields();
    const raw = existing?.data?.fields || existing?.fields || [];
    Object.values(raw).forEach(f => existingAliases.add(f.alias));
  } catch (err) {
    console.warn('[catalog/sync] Cannot fetch existing fields:', err.message);
  }

  // PHS fields cần tạo trong Mautic (chỉ những field có mauticAlias = null → chưa có)
  const toCreate = PHS_BUSINESS_FIELDS.filter(f => !existingAliases.has(f.field));

  for (const phsField of toCreate) {
    try {
      const payload = {
        label:      phsField.label,
        alias:      phsField.field,
        type:       phsField.type === 'boolean' ? 'boolean' : phsField.type,
        group:      'core',
        isRequired: false,
        isPubliclyUpdatable: false,
      };

      // Thêm list options nếu là select
      if (phsField.type === 'select' && phsField.options) {
        payload.properties = {
          list: phsField.options.reduce((acc, opt) => {
            const val = typeof opt === 'string' ? opt : opt.value;
            acc[val] = typeof opt === 'string' ? opt : opt.label;
            return acc;
          }, {}),
        };
      }

      const result = await mautic.request('POST', '/fields/contact/new', payload);
      results.push({ field: phsField.field, status: 'created', mauticId: result?.data?.field?.id });
    } catch (err) {
      results.push({ field: phsField.field, status: 'error', message: err.message });
    }
  }

  // Fields đã tồn tại
  PHS_BUSINESS_FIELDS
    .filter(f => existingAliases.has(f.field))
    .forEach(f => results.push({ field: f.field, status: 'already_exists' }));

  res.json({ results, syncedAt: new Date().toISOString() });
});

module.exports = router;
