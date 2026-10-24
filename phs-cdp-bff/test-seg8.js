require('dotenv').config();
const axios = require('axios');

const baseUrl  = process.env.MAUTIC_BASE_URL;
const username = process.env.MAUTIC_USERNAME;
const password = process.env.MAUTIC_PASSWORD;
const auth     = Buffer.from(`${username}:${password}`).toString('base64');
const headers  = { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' };

async function req(method, path, data) {
  try {
    const res = await axios({ method, url: `${baseUrl}/api${path}`, headers, data, timeout: 8000 });
    return { ok: true, status: res.status, data: res.data };
  } catch (err) {
    return { ok: false, status: err.response?.status, data: err.response?.data };
  }
}

(async () => {
  const id = process.argv[2] || 8;

  // 1. Xem segment hiện tại
  console.log(`\n=== GET segment ${id} ===`);
  const seg = await req('GET', `/segments/${id}`);
  const filters = seg.data?.list?.filters || [];
  console.log(`filters count: ${filters.length}`);
  console.log(`isPublished: ${seg.data?.list?.isPublished}`);

  // 2. Unpublish + clear filters
  console.log(`\n=== PATCH: unpublish + clear filters ===`);
  const patch = await req('PATCH', `/segments/${id}/edit`, {
    isPublished: false,
    filters: []
  });
  console.log(`ok=${patch.ok} status=${patch.status}`);

  // 3. Delete
  console.log(`\n=== DELETE segment ${id} ===`);
  const del = await req('DELETE', `/segments/${id}/delete`);
  console.log(`ok=${del.ok} status=${del.status}`);
  console.log(JSON.stringify(del.data).slice(0, 200));
})();
