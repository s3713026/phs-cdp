/**
 * AudienceService — Audience definitions backed by cdp-postgres
 * Syncs to Mautic segments for execution
 */
const db = require('../db/pool');
const MauticAdapter = require('../adapters/MauticAdapter');

const AudienceService = {

  async listAudiences() {
    const result = await db.query(`
      SELECT * FROM cdp_audiences
      WHERE status != 'archived'
      ORDER BY updated_at DESC
    `);
    return result.rows;
  },

  async getAudience(id) {
    const [audienceRes, versionsRes] = await Promise.all([
      db.query('SELECT * FROM cdp_audiences WHERE id = $1', [id]),
      db.query(`
        SELECT * FROM cdp_audience_versions
        WHERE audience_id = $1
        ORDER BY changed_at DESC
        LIMIT 10
      `, [id]),
    ]);

    const audience = audienceRes.rows[0];
    if (!audience) return null;

    // Try to get real size from Mautic
    // MauticAdapter.getSegment() returns { ok, data } where data = { list: { contactCount, ... } }
    let mauticSize = null;
    if (audience.mautic_segment_id) {
      try {
        const mautic = new MauticAdapter();
        const seg = await mautic.getSegment(audience.mautic_segment_id);
        if (seg?.ok) {
          mauticSize = seg.data?.list?.contactCount ?? null;
        }
      } catch { /* Mautic unavailable — use stored estimate */ }
    }

    return {
      ...audience,
      estimated_size: mauticSize ?? audience.estimated_size,
      versions: versionsRes.rows,
    };
  },

  async createAudience(definition, createdBy = 'system') {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const result = await client.query(`
        INSERT INTO cdp_audiences
          (name, description, type, conditions, status, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [
        definition.name,
        definition.description || null,
        definition.type || 'dynamic',
        JSON.stringify(definition.conditions || []),
        'draft',
        createdBy,
      ]);
      const audience = result.rows[0];

      // Save initial version
      await client.query(`
        INSERT INTO cdp_audience_versions (audience_id, conditions, changed_by, note)
        VALUES ($1, $2, $3, 'Initial version')
      `, [audience.id, JSON.stringify(definition.conditions || []), createdBy]);

      // Create Mautic segment
      // MauticAdapter.createSegment() returns { ok, data } where data = { list: { id, ... } }
      try {
        const mautic = new MauticAdapter();
        const mauticFilters = conditionsToMauticFilters(definition.conditions || []);
        const segResult = await mautic.createSegment({
          name: definition.name,
          alias: `cdp_${definition.name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 50)}`,
          isPublished: true,
          isGlobal: true,
          filters: mauticFilters,
        });
        const mauticSegmentId = segResult?.ok ? (segResult.data?.list?.id || segResult.data?.segment?.id) : null;
        if (mauticSegmentId) {
          await client.query(
            'UPDATE cdp_audiences SET mautic_segment_id = $1, status = $2 WHERE id = $3',
            [mauticSegmentId, 'active', audience.id]
          );
          audience.mautic_segment_id = mauticSegmentId;
          audience.status = 'active';
        } else {
          console.warn('[AudienceService] Mautic createSegment did not return an id:', segResult?.message);
        }
      } catch (mauticErr) {
        console.warn('[AudienceService] Mautic createSegment failed:', mauticErr.message);
        // Continue without Mautic — audience stays in draft
      }

      await client.query('COMMIT');
      return audience;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async updateAudience(id, definition, changedBy = 'system') {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // Get current version
      const current = await client.query('SELECT * FROM cdp_audiences WHERE id = $1', [id]);
      if (!current.rows[0]) throw new Error('Audience not found');
      const currentAudience = current.rows[0];

      // Save version history before update
      await client.query(`
        INSERT INTO cdp_audience_versions (audience_id, conditions, changed_by, note)
        VALUES ($1, $2, $3, $4)
      `, [
        id,
        JSON.stringify(currentAudience.conditions || []),
        changedBy,
        definition.change_note || 'Updated conditions',
      ]);

      // Build SET clauses dynamically
      const updates = {};
      if (definition.name)        updates.name = definition.name;
      if (definition.description !== undefined) updates.description = definition.description;
      if (definition.conditions)  updates.conditions = JSON.stringify(definition.conditions);
      if (definition.status)      updates.status = definition.status;

      const setClauses = Object.entries(updates)
        .map(([k, _], i) => `${k} = $${i + 2}`)
        .join(', ');

      const result = await client.query(`
        UPDATE cdp_audiences
        SET ${setClauses}, version = version + 1, updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [id, ...Object.values(updates)]);
      const updatedAudience = result.rows[0];

      // Sync to Mautic
      if (definition.conditions && currentAudience.mautic_segment_id) {
        try {
          const mautic = new MauticAdapter();
          const mauticFilters = conditionsToMauticFilters(definition.conditions);
          await mautic.updateSegment(currentAudience.mautic_segment_id, {
            name: definition.name || currentAudience.name,
            filters: mauticFilters,
          });
        } catch (mauticErr) {
          console.warn('[AudienceService] Mautic updateSegment failed:', mauticErr.message);
        }
      }

      await client.query('COMMIT');
      return updatedAudience;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async previewAudienceSize(id) {
    const audience = await this.getAudience(id);
    if (!audience) return null;

    if (audience.mautic_segment_id) {
      try {
        const mautic = new MauticAdapter();
        // getSegmentContacts returns { ok, data: { contacts: {...}, total: N } }
        const result = await mautic.getSegmentContacts(audience.mautic_segment_id, { limit: 1 });
        return {
          estimated_size: result?.ok ? (result.data?.total || 0) : (audience.estimated_size || 0),
          mautic_synced: result?.ok || false,
        };
      } catch { /* fall through */ }
    }

    return {
      estimated_size: audience.estimated_size || 0,
      mautic_synced: false,
    };
  },
};

/**
 * Translate CDP audience conditions → Mautic segment filters
 * This is the core translation layer — extend as needed for new fields
 */
function conditionsToMauticFilters(conditions = []) {
  const filters = [];

  for (const cond of conditions) {
    const { field, operator, value } = cond;

    // Map CDP field → Mautic field
    const mauticField = CDP_TO_MAUTIC_FIELD[field];
    if (!mauticField) {
      console.warn(`[AudienceService] Unknown field for Mautic mapping: ${field}`);
      continue;
    }

    const mauticOp = CDP_TO_MAUTIC_OPERATOR[operator] || 'eq';

    filters.push({
      glue: cond.glue || 'and',
      field: mauticField,
      object: 'lead',
      type: 'text',
      operator: mauticOp,
      properties: { filter: String(value) },
    });
  }

  return filters;
}

// CDP field name → Mautic contact field alias
const CDP_TO_MAUTIC_FIELD = {
  lifecycle_stage:    'cdp_lifecycle_stage',
  email:              'email',
  phone:              'phone',
  full_name:          'fullname',
  kyc_status:         'cdp_kyc_status',
  product_interests:  'cdp_product_interests',
  // Behavioral — stored as Mautic custom fields
  first_trade:        'cdp_first_trade',
  last_login:         'last_active',
  trading_frequency:  'cdp_trading_frequency',
  cash_utilization:   'cdp_cash_utilization',
};

// CDP operator → Mautic operator
const CDP_TO_MAUTIC_OPERATOR = {
  equals:         'eq',
  not_equals:     'neq',
  contains:       'like',
  not_contains:   'notLike',
  greater_than:   'gt',
  less_than:      'lt',
  is_empty:       'empty',
  is_not_empty:   'notEmpty',
};

module.exports = AudienceService;
