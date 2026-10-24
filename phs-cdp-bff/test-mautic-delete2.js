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
    return { ok: false, status: err.response?.status, data: err.response?.data, msg: err.message };
  }
}

(async () => {
  // 1. Tạo segment test
  console.log('\n=== Create test segment ===');
  const created = await req('POST', '/segments/new', { name: 'DELETE_TEST_' + Date.now(), isPublished: false });
  console.log(`ok=${created.ok} status=${created.status} id=${created.data?.list?.id}`);

  const segId = created.data?.list?.id;
  if (!segId) { console.log('Cannot get segment ID, abort'); return; }

  // 2. Xóa nó ngay
  console.log(`\n=== Delete segment ${segId} ===`);
  const deleted = await req('DELETE', `/segments/${segId}/delete`);
  console.log(`ok=${deleted.ok} status=${deleted.status}`);
  console.log(JSON.stringify(deleted.data).slice(0, 300));
})();
