const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

class RudderStackAdapter {
  constructor() {
    this.dataplaneUrl = process.env.RUDDERSTACK_DATA_PLANE_URL || '';
    this.writeKey     = process.env.RUDDERSTACK_WRITE_KEY || '';
    this.adminPwd     = process.env.RUDDERSTACK_ADMIN_PASSWORD || 'PHS@Rudder2024!';
  }

  // ── Health check — ping Data Plane ───────────────────────────────
  async healthCheck() {
    try {
      const res = await axios.get(`${this.dataplaneUrl}/health`, { timeout: 5000 });
      return res.data?.server === 'UP';
    } catch {
      return false;
    }
  }

  // ── Sources — đọc từ workspaceConfig.json (self-hosted) ──────────
  getSources() {
    // Tìm workspaceConfig.json theo thứ tự ưu tiên
    const candidates = [
      process.env.WORKSPACE_CONFIG_PATH,
      path.join(__dirname, '../../workspaceConfig.json'),
      path.join(__dirname, '../../../phs-cdp-ui/rudderstack-setup/workspaceConfig.json'),
    ].filter(Boolean);

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        try {
          const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
          return raw.sources || [];
        } catch {
          // tiếp tục thử file tiếp theo
        }
      }
    }
    return [];
  }

  // ── Send identify event đến Data Plane ───────────────────────────
  async identifyCustomer(userId, traits) {
    const res = await axios.post(`${this.dataplaneUrl}/v1/identify`, {
      userId,
      traits,
      context: { source: 'phs-cdp-bff' },
      timestamp: new Date().toISOString(),
    }, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(this.writeKey + ':').toString('base64')}`,
      },
      timeout: 8000,
    });
    return res.data;
  }

  // ── Send track event đến Data Plane ──────────────────────────────
  async trackEvent(userId, eventName, properties = {}) {
    const res = await axios.post(`${this.dataplaneUrl}/v1/track`, {
      userId,
      event: eventName,
      properties,
      context: { source: 'phs-cdp-bff' },
      timestamp: new Date().toISOString(),
    }, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(this.writeKey + ':').toString('base64')}`,
      },
      timeout: 8000,
    });
    return res.data;
  }
}

module.exports = RudderStackAdapter;