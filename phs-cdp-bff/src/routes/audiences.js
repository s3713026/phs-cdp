const express = require('express');

// ─── Map PHS conditions → Mautic segment filters ────────────────────────────
const LABEL_TO_ALIAS = {
  'Customer Tier':         'phs_customer_tier',
  'Lifecycle Stage':       'phs_lifecycle_stage',
  'Trading Frequency':     'phs_trading_frequency',
  'Cash Utilization':      'phs_cash_utilization',
  'Product Interest':      'phs_product_interest',
  'First Trade':           'phs_first_trade',
  'First Trade Completed': 'phs_first_trade',
  'Days Since Last Trade': 'phs_days_since_last_trade',
  'Account Open Date':     'phs_account_open_date',
  'Email':        'email',
  'Email Address':'email',
  'First Name':   'firstname',
  'Last Name':    'lastname',
  'Phone':        'phone',
  'Mobile':       'mobile',
  'City':         'city',
  'Country':      'country',
  'Tags':         'tags',
};

// Reverse map: Mautic alias → PHS label (dùng cho GET)
const ALIAS_TO_LABEL = Object.fromEntries(
  Object.entries(LABEL_TO_ALIAS).map(([label, alias]) => [alias, label])
);

const MAUTIC_NATIVE_ALIASES = new Set([
  'email','firstname','lastname','phone','mobile','city','country',
  'zipcode','state','address1','address2','website','company',
  'position','tags',
]);

const MAUTIC_OPERATOR_MAP = {
  equals:       '=',
  not_equals:   '!=',
  contains:     'like',
  not_contains: '!like',
  starts_with:  'startsWith',
  gt:           'gt',
  gte:          'gte',
  lt:           'lt',
  lte:          'lte',
  in:           'in',
  not_in:       '!in',
  empty:        'empty',
  not_empty:    '!empty',
  between:      'between',
};

// Reverse map: Mautic operator → PHS operator (dùng cho GET)
const MAUTIC_TO_PHS_OPERATOR = Object.fromEntries(
  Object.entries(MAUTIC_OPERATOR_MAP).map(([phs, mautic]) => [mautic, phs])
);

function buildMauticFilters(conditions = []) {
  if (!conditions || conditions.length === 0) return [];
  const filters = [];
  conditions.forEach((c) => {
    const alias = LABEL_TO_ALIAS[c.field] || c.field;
    if (!MAUTIC_NATIVE_ALIASES.has(alias)) {
      return; // skip PHS custom fields — stored in phs_meta_audiences
    }
    const op       = MAUTIC_OPERATOR_MAP[c.operator] || '=';
    const rawValue = c.params?.value ?? c.value ?? '';
    // FIX Bug 3: dùng filters.length === 0 thay vì i === 0
    const glue     = filters.length === 0 ? 'and' : (c.logic === 'OR' ? 'or' : 'and');

    filters.push({
      glue,
      field:    alias,
      object:   'lead',
      type:     c.type || 'text',
      operator: op,
      filter:   Array.isArray(rawValue) ? rawValue.join('|') : String(rawValue),
    });
  });
  return filters;
}


const router  = express.Router();
const { AUDIENCES } = require('../mock/audiences');
const { requireRole } = require('../middleware/rbac');
const MauticAdapter  = require('../adapters/MauticAdapter');
const db = require('../db');

const mautic  = new MauticAdapter();
const useMock = process.env.USE_MOCK === 'true';

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function getMeta(mauticSegmentId) {
  try {
    const rows = await db.query(
      'SELECT * FROM phs_meta_audiences WHERE mautic_segment_id = ?',
      [mauticSegmentId]
    );
    return rows[0] || null;
  } catch { return null; }
}

async function getBulkMeta(ids) {
  if (!ids.length) return {};
  try {
    const placeholders = ids.map(() => '?').join(',');
    const rows = await db.query(
      `SELECT * FROM phs_meta_audiences WHERE mautic_segment_id IN (${placeholders})`,
      ids
    );
    const map = {};
    rows.forEach(r => { map[r.mautic_segment_id] = r; });
    return map;
  } catch { return {}; }
}

async function upsertMeta(mauticSegmentId, { description, tags, owner, notes, created_by, conditions }) {
  try {
    await db.query(`
      INSERT INTO phs_meta_audiences (mautic_segment_id, description, tags, owner, notes, created_by, conditions_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        description     = COALESCE(VALUES(description),     description),
        tags            = COALESCE(VALUES(tags),            tags),
        owner           = COALESCE(VALUES(owner),           owner),
        notes           = COALESCE(VALUES(notes),           notes),
        conditions_json = COALESCE(VALUES(conditions_json), conditions_json),
        updated_at      = CURRENT_TIMESTAMP
    `, [
      mauticSegmentId,
      description || '',
      JSON.stringify(tags || []),
      owner || 'system',
      notes || null,
      created_by || 'system',
      JSON.stringify(conditions || []),
    ]);
    return true;
  } catch (err) {
    console.error('[DB] upsertMeta failed:', err.message);
    return false;
  }
}

// ─── Mapper ──────────────────────────────────────────────────────────────────

function mapSegmentToAudience(seg, meta = null) {
  const filters = seg.filters || [];
  const count   = seg.contactCount || 0;
  const mauticOwner = (seg.createdBy && seg.createdBy.username)
                   || (seg.modifiedBy && seg.modifiedBy.username)
                   || 'system';

  return {
    id:          `mautic_seg_${seg.id}`,
    mauticId:    seg.id,
    name:        seg.name,
    description: (meta && meta.description) || seg.description || '',
    tags:        (meta && meta.tags) ? JSON.parse(meta.tags) : [],
    owner:       (meta && meta.owner) || mauticOwner,
    notes:       (meta && meta.notes) || '',
    type:        filters.length > 0 ? 'dynamic' : 'static',
    status:      seg.isPublished ? 'active' : 'paused',
    memberCount: count,
    size:        count,
    // FIX Bug 1 & 2: reverse-map Mautic field alias và operator về PHS label/operator
    conditions: (meta && meta.conditions_json)
                  ? JSON.parse(meta.conditions_json)
                  : filters.map(f => ({
                      field:    ALIAS_TO_LABEL[f.field] || f.field || 'unknown',
                      operator: MAUTIC_TO_PHS_OPERATOR[f.operator] || f.operator || 'equals',
                      value:    f.filter || '',
                    })),
    createdBy:  (meta && meta.created_by) || mauticOwner,
    createdAt:  seg.dateAdded    || new Date().toISOString(),
    updatedAt:  (meta && meta.updated_at)
                  ? new Date(meta.updated_at).toISOString()
                  : (seg.dateModified || new Date().toISOString()),
    source:     'mautic',
    lastEvaluated:  seg.dateModified
                      ? new Date(seg.dateModified).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
                      : 'Not evaluated',
    evaluationMode: filters.length > 0 ? 'Automatic' : 'Manual',
    dataFreshness:  seg.isPublished ? 'Near real-time' : 'Not yet evaluated',
    updatedDaysAgo: 0,
    composition:    {},
    sampleMembers:  [],
  };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET /api/audiences
router.get('/', requireRole('viewer'), async (req, res) => {
  const { status, type, tag, limit = 50, page = 1 } = req.query;

  if (!useMock) {
    const result = await mautic.getSegments({ limit: 200 });

    if (result.ok) {
      const lists    = result.data.lists || {};
      const segments = Object.values(lists);

      const segIds  = segments.map(s => s.id);
      const metaMap = await getBulkMeta(segIds);

      let audiences = segments.map(s => mapSegmentToAudience(s, metaMap[s.id] || null));

      if (audiences.length < 3) {
        const mockAuds = AUDIENCES.map(a => ({ ...a, source: 'mock' }));
        audiences = [...audiences, ...mockAuds];
      }

      if (status) audiences = audiences.filter(a => a.status === status);
      if (type)   audiences = audiences.filter(a => a.type   === type);
      if (tag)    audiences = audiences.filter(a => a.tags && a.tags.includes(tag));

      const total = audiences.length;
      const start = (Number(page) - 1) * Number(limit);
      return res.json({
        data:  audiences.slice(start, start + Number(limit)),
        total, page: Number(page), limit: Number(limit), source: 'mautic',
      });
    }

    console.warn(`[Audiences] Mautic unavailable: ${result.message}. Using mock.`);
  }

  let list = [...AUDIENCES];
  if (status) list = list.filter(a => a.status === status);
  if (type)   list = list.filter(a => a.type   === type);
  if (tag)    list = list.filter(a => a.tags && a.tags.includes(tag));
  const total = list.length;
  const start = (Number(page) - 1) * Number(limit);
  res.json({ data: list.slice(start, start + Number(limit)), total, page: Number(page), limit: Number(limit), source: 'mock' });
});

// GET /api/audiences/:id
router.get('/:id', requireRole('viewer'), async (req, res) => {
  const { id } = req.params;

  if (!useMock && id.startsWith('mautic_seg_')) {
    const mauticId = id.replace('mautic_seg_', '');
    const [result, meta] = await Promise.all([
      mautic.getSegment(mauticId),
      getMeta(mauticId),
    ]);
    if (result.ok) {
      return res.json(mapSegmentToAudience(result.data.list, meta));
    }
  }

  const a = AUDIENCES.find(x => x.id === id);
  if (!a) return res.status(404).json({ error: { message: 'Audience not found', code: 'NOT_FOUND' } });
  res.json(a);
});

// GET /api/audiences/:id/preview
router.get('/:id/preview', requireRole('viewer'), async (req, res) => {
  const { id } = req.params;

  if (!useMock && id.startsWith('mautic_seg_')) {
    const mauticId = id.replace('mautic_seg_', '');
    const segResult = await mautic.getSegment(mauticId);

    if (segResult.ok) {
      const seg  = segResult.data.list;
      const size = seg.contactCount || 0;
      return res.json({
        audienceId:            id,
        estimatedSize:         size,
        knownCustomers:        Math.floor(size * 0.85),
        anonymousVisitors:     Math.floor(size * 0.15),
        eligible:              Math.floor(size * 0.93),
        excluded:              Math.floor(size * 0.07),
        lifecycleDistribution: { active_investor:54, new_account:22, dormant:14, churn_risk:10 },
        topInterests:          ['margin','elites_pick','elites_portfolio'],
        consentEligible:       Math.floor(size * 0.80),
        source:                'mautic',
      });
    }
  }

  const a = AUDIENCES.find(x => x.id === id);
  if (!a) return res.status(404).json({ error: { message: 'Audience not found', code: 'NOT_FOUND' } });
  res.json({
    audienceId: a.id, estimatedSize: a.size || a.memberCount,
    knownCustomers:        Math.floor((a.size || 0) * 0.64),
    anonymousVisitors:     Math.floor((a.size || 0) * 0.36),
    eligible:              Math.floor((a.size || 0) * 0.928),
    excluded:              Math.floor((a.size || 0) * 0.072),
    lifecycleDistribution: { active_investor:54, new_account:22, dormant:14, churn_risk:10 },
    topInterests:          ['margin','elites_pick','elites_portfolio'],
    consentEligible:       Math.floor((a.size || 0) * 0.794),
    source: 'mock',
  });
});

// POST /api/audiences
router.post('/', requireRole('operator'), async (req, res) => {
  const { name, type, conditions, tags, description, owner, notes } = req.body;
  if (!name) return res.status(400).json({ error: { message: 'name is required', code: 'VALIDATION_ERROR' } });

  if (!useMock) {
    const mauticFilters = buildMauticFilters(conditions);
    console.log('[POST /audiences] Mautic filters:', JSON.stringify(mauticFilters));
    const result = await mautic.createSegment({ name, description: description || '', isPublished: true, isGlobal: false, filters: mauticFilters });
    console.log('[POST /audiences] Mautic result:', JSON.stringify(result?.data?.list?.id || result?.message));

    if (result.ok) {
      const seg = result.data.list;
      await upsertMeta(seg.id, { description, tags, owner: owner || req.userRole || 'operator', notes, created_by: req.userRole || 'operator', conditions });
      const meta = await getMeta(seg.id);
      return res.status(201).json(mapSegmentToAudience(seg, meta));
    }
    console.warn(`[POST /audiences] Mautic error: ${result.message}`);
  }

  const newAud = {
    id: `aud_${Date.now()}`, name, description: description || '', type: type || 'dynamic',
    status: 'draft', size: Math.floor(Math.random() * 10000) + 500, memberCount: 0,
    conditions: conditions || [], tags: tags || [], owner: owner || 'operator',
    createdBy: req.userRole || 'operator',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: 'mock',
  };
  res.status(201).json(newAud);
});

// PATCH /api/audiences/:id
// FIX Bug 4, 5, 6: dịch conditions → filters, lưu conditions_json vào DB, trả lỗi rõ ràng
router.patch('/:id', requireRole('operator'), async (req, res) => {
  const { id } = req.params;
  const { name, conditions, description, tags, owner, notes } = req.body;

  if (!useMock && id.startsWith('mautic_seg_')) {
    const mauticId = id.replace('mautic_seg_', '');

    // 1. Lưu metadata + conditions vào DB
    const hasMeta = description !== undefined || tags !== undefined
                  || owner !== undefined || notes !== undefined
                  || conditions !== undefined;
    if (hasMeta) {
      await upsertMeta(mauticId, { description, tags, owner, notes, conditions });
    }

    // 2. Build Mautic payload — chỉ gửi những gì Mautic hiểu
    const mauticPayload = {};
    if (name !== undefined)       mauticPayload.name    = name;
    if (conditions !== undefined) mauticPayload.filters = buildMauticFilters(conditions);

    // 3. Gửi sang Mautic nếu có thay đổi name hoặc conditions
    if (Object.keys(mauticPayload).length > 0) {
      const result = await mautic.updateSegment(mauticId, mauticPayload);
      if (!result.ok) {
        console.error(`[PATCH /audiences] Mautic update failed for segment ${mauticId}:`, result.message);
        return res.status(422).json({
          error: {
            message: 'Failed to update audience in Mautic.',
            code: 'MAUTIC_UPDATE_FAILED',
            detail: result.message,
          }
        });
      }
    }

    // 4. Lấy lại segment từ Mautic để trả về object đầy đủ
    const segResult = await mautic.getSegment(mauticId);
    if (segResult.ok) {
      const meta = await getMeta(mauticId);
      return res.json(mapSegmentToAudience(segResult.data.list, meta));
    }

    return res.status(500).json({ error: { message: 'Audience updated but could not be retrieved', code: 'FETCH_FAILED' } });
  }

  res.status(404).json({ error: { message: 'Audience not found', code: 'NOT_FOUND' } });
});

// DELETE /api/audiences/:id
router.delete('/:id', requireRole('operator'), async (req, res) => {
  const { id } = req.params;

  if (!useMock && id.startsWith('mautic_seg_')) {
    const mauticId = id.replace('mautic_seg_', '');

    const result = await mautic.deleteSegment(mauticId);
    if (!result.ok) {
      console.error(`[DELETE /audiences] Mautic delete failed for segment ${mauticId}:`, result.message, result.raw);
      const userMsg = result.status === 400
        ? `This audience cannot be deleted (Mautic error ${result.status}). Segment ID ${mauticId} may be a system segment or linked to a Mautic campaign. Try creating a new audience instead.`
        : 'Cannot delete this audience. It may be used in an active campaign or is a protected system segment.';

      return res.status(422).json({
        error: {
          message: userMsg,
          code: 'MAUTIC_DELETE_FAILED',
          mauticStatus: result.status,
          segmentId: mauticId,
          detail: result.message,
        }
      });
    }

    console.log(`[DELETE /audiences] Mautic segment ${mauticId} deleted successfully`);

    try {
      await db.query('DELETE FROM phs_meta_audiences WHERE mautic_segment_id = ?', [mauticId]);
      console.log(`[DELETE /audiences] Removed meta for segment ${mauticId}`);
    } catch (dbErr) {
      console.warn('[DELETE /audiences] DB cleanup error (Mautic already deleted):', dbErr.message);
    }

    return res.status(204).end();
  }

  res.status(204).end();
});

module.exports = router;
