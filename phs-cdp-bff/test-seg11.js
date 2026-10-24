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
  // Xem segment 11 là gì
  console.log('\n=== GET segment 11 ===');
  const seg = await req('GET', '/segments/11');
  console.log(JSON.stringify(seg.data?.list || seg.data, null, 2));

  // Thử xóa
  console.log('\n=== DELETE segment 11 ===');
  const del = await req('DELETE', '/segments/11/delete');
  console.log(`ok=${del.ok} status=${del.status}`);
  console.log(JSON.stringify(del.data));
})();
