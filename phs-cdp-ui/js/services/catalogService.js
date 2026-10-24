/**
 * catalogService.js
 * Fetch unified field catalog từ BFF /api/catalog/fields
 * UI Audience Builder dùng để hiển thị đúng fields + operators + options
 */

const API_BASE = window.PHS_API_BASE || 'http://localhost:3001/api';

let _cache = null;
let _fetchPromise = null;

export async function getFieldCatalog() {
  if (_cache) return _cache;
  if (_fetchPromise) return _fetchPromise;

  _fetchPromise = fetch(`${API_BASE}/catalog/fields`, {
    headers: { 'x-phs-role': 'operator' }
  })
    .then(r => r.json())
    .then(data => {
      _cache = data;
      _fetchPromise = null;
      console.log(`[catalog] Loaded ${data.sources?.total} fields (Mautic: ${data.sources?.mautic}, PHS: ${data.sources?.phs})`);
      return data;
    })
    .catch(err => {
      console.warn('[catalog] Failed to load from BFF, using fallback:', err.message);
      _fetchPromise = null;
      _cache = getFallbackCatalog();
      return _cache;
    });

  return _fetchPromise;
}

export async function getFieldByAlias(alias) {
  const catalog = await getFieldCatalog();
  return catalog.fields?.find(f => f.field === alias) || null;
}

export async function getFieldsByCategory() {
  const catalog = await getFieldCatalog();
  return catalog.grouped || {};
}

export function clearCatalogCache() {
  _cache = null;
}

// Fallback nếu BFF unreachable
function getFallbackCatalog() {
  const fields = [
    { field: 'phs_lifecycle_stage', label: 'Lifecycle Stage',    category: 'Lifecycle', type: 'select',  source: 'phs',
      operators: ['equals','not_equals','in','not_in'],
      options: ['Prospect','Lead','eKYC','Account Opening','Funding','First Trade','Active Investor','VIP','Dormant','Churn Risk','Reactivation'] },
    { field: 'phs_customer_tier',   label: 'Customer Tier',      category: 'Profile',   type: 'select',  source: 'phs',
      operators: ['equals','not_equals','in','not_in'],
      options: ['Platinum','Gold','Silver','Standard'] },
    { field: 'phs_trading_frequency', label: 'Trading Frequency',category: 'Behavior',  type: 'number',  source: 'phs',
      operators: ['gt','gte','lt','lte','equals'], unit: 'trades/month' },
    { field: 'phs_cash_utilization', label: 'Cash Utilization',  category: 'Financial', type: 'number',  source: 'phs',
      operators: ['gt','gte','lt','lte','equals'], unit: '%' },
    { field: 'phs_product_interest', label: 'Product Interest',  category: 'Product',   type: 'select',  source: 'phs',
      operators: ['in','not_in','contains'],
      options: ['Margin','Elites Pick','Elites Portfolio','Elites Seeds','Standard Account'] },
    { field: 'phs_first_trade',      label: 'First Trade',       category: 'Lifecycle', type: 'boolean', source: 'phs',
      operators: ['equals'], options: ['true','false'] },
    { field: 'email',                label: 'Email',             category: 'Contact',   type: 'email',   source: 'mautic',
      operators: ['equals','not_equals','contains','empty','not_empty'] },
    { field: 'firstname',            label: 'First Name',        category: 'Contact',   type: 'text',    source: 'mautic',
      operators: ['equals','not_equals','contains','empty','not_empty'] },
    { field: 'tags',                 label: 'Tags',              category: 'Contact',   type: 'tags',    source: 'mautic',
      operators: ['in','not_in','empty','not_empty'] },
  ];
  const grouped = {};
  for (const f of fields) {
    if (!grouped[f.category]) grouped[f.category] = [];
    grouped[f.category].push(f);
  }
  return { fields, grouped, sources: { mautic: 3, phs: 6, total: 9 }, syncedAt: null, fallback: true };
}
