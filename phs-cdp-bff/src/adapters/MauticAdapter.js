const axios = require('axios');

class MauticAdapter {
  constructor() {
    this.baseUrl  = process.env.MAUTIC_BASE_URL || '';
    this.username = process.env.MAUTIC_USERNAME || '';
    this.password = process.env.MAUTIC_PASSWORD || '';
    this.timeout  = 10000; // 10s timeout
  }

  get headers() {
    return {
      Authorization: `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`,
      'Content-Type': 'application/json',
    };
  }

  async request(method, path, data = null, params = {}) {
    const fullUrl = `${this.baseUrl}/api${path}`;
    console.log(`[MauticAdapter] ${method} ${fullUrl}`);
    try {
      const res = await axios({
        method, url: fullUrl,
        auth: { username: this.username, password: this.password },
        headers: { 'Content-Type': 'application/json' },
        ...(method !== 'DELETE' ? { params, data } : {}),        
        timeout: this.timeout,
      });
      return { ok: true, data: res.data };
    } catch (err) {
      const status  = err.response?.status;
      const message = err.response?.data?.errors?.[0]?.message || err.message;
      console.log(`[MauticAdapter] ERROR ${method} ${fullUrl} → HTTP ${status}: ${message}`);
      console.log(`[MauticAdapter] RAW RESPONSE:`, JSON.stringify(err.response?.data));
      console.log(`[MauticAdapter] RAW HEADERS:`, JSON.stringify(err.response?.headers));
      return { ok: false, status, message, raw: err.response?.data };
    }
  }

  // ── SEGMENTS (= Audiences in our UI) ──
  async getSegments({ start = 0, limit = 200 } = {}) {
    return this.request('GET', '/segments', null, { start, limit });
  }

  async getSegment(id) {
    return this.request('GET', `/segments/${id}`);
  }

  async createSegment(payload) {
    return this.request('POST', '/segments/new', payload);
  }

  async updateSegment(id, payload) {
    return this.request('PATCH', `/segments/${id}/edit`, payload);
  }

  // async deleteSegment(id) {
  //   // Step 1: Unpublish + isGlobal:false + clear filters
  //   const unpub = await this.request('PATCH', `/segments/${id}/edit`, { isPublished: false, isGlobal: false, filters: [] });
  //   console.log(`[MauticAdapter.deleteSegment] unpublish id=${id} ok=${unpub.ok}`);

  //   // Step 2: Retry DELETE với backoff — Mautic cần thời gian commit sau PATCH
  //   const delays = [500, 1000, 2000];
  //   let result;
  //   for (let i = 0; i <= delays.length; i++) {
  //     if (i > 0) {
  //       const wait = delays[i - 1];
  //       console.log(`[MauticAdapter.deleteSegment] retry ${i} after ${wait}ms...`);
  //       await new Promise(r => setTimeout(r, wait));
  //     }
  //     result = await this.request('DELETE', `/segments/${id}/delete`);
  //     console.log(`[MauticAdapter.deleteSegment] attempt ${i+1}: ok=${result.ok} status=${result.status}`);
  //     if (result.ok || result.status === 404) break;
  //   }

  //   if (!result.ok && result.status === 404) {
  //     return { ok: true, data: null };
  //   }
  //   return result;
  // }

  async deleteSegment(id) {
    // DELETE trực tiếp — PATCH trước gây conflict trong Mautic
    const delays = [0, 500, 1500];
    let result;
    for (let i = 0; i < delays.length; i++) {
      if (delays[i] > 0) {
        await new Promise(r => setTimeout(r, delays[i]));
      }
      result = await this.request('DELETE', `/segments/${id}/delete`);
      console.log(`[MauticAdapter.deleteSegment] attempt ${i+1}: ok=${result.ok} status=${result.status}`);
      if (result.ok || result.status === 404) break;
    }
    if (result.status === 404) return { ok: true, data: null };
    return result;
  }

  async getSegmentContacts(segmentId, { start = 0, limit = 50 } = {}) {
    return this.request('GET', `/segments/${segmentId}/contacts`, null, { start, limit });
  }

  // ── CONTACTS (= Customers in our UI) ──
  async getContacts({ start = 0, limit = 50, search = '', orderBy = 'id', orderByDir = 'DESC' } = {}) {
    return this.request('GET', '/contacts', null, { start, limit, search, orderBy, orderByDir });
  }

  async getContact(id) {
    return this.request('GET', `/contacts/${id}`);
  }

  async createContact(payload) {
    return this.request('POST', '/contacts/new', payload);
  }

  async updateContact(id, payload) {
    return this.request('PATCH', `/contacts/${id}/edit`, payload);
  }

  async getContactSegments(id) {
    return this.request('GET', `/contacts/${id}/segments`);
  }

  async getContactActivityLog(id, { limit = 25 } = {}) {
    return this.request('GET', `/contacts/${id}/activity`, null, { limit });
  }

  // ── CAMPAIGNS ──
  async getCampaigns({ start = 0, limit = 50 } = {}) {
    return this.request('GET', '/campaigns', null, { start, limit });
  }

  async getCampaign(id) {
    return this.request('GET', `/campaigns/${id}`);
  }

  // ── STATS ──
  async getStats(table, { limit = 10, start = 0 } = {}) {
    return this.request('GET', `/stats/${table}`, null, { limit, start });
  }

  // ── HEALTH CHECK ──
  async healthCheck() {
    const result = await this.request('GET', '/contacts', null, { limit: 1 });
    return result.ok;
  }
  // ── FIELDS ──
  async getContactFields() {
    return this.request('GET', '/fields/contact', null, { limit: 200 });
  }
}

module.exports = MauticAdapter;
