require('dotenv').config();
const axios = require('axios');

const baseUrl  = process.env.MAUTIC_BASE_URL;
const username = process.env.MAUTIC_USERNAME;
const password = process.env.MAUTIC_PASSWORD;
const auth     = Buffer.from(`${username}:${password}`).toString('base64');
const headers  = { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' };

async function test(method, path) {
  try {
    const res = await axios({ method, url: `${baseUrl}/api${path}`, headers, timeout: 8000 });
    console.log(`[${method} ${path}] ✅ ${res.status}:`, JSON.stringify(res.data).slice(0, 200));
  } catch (err) {
    const status = err.response?.status;
    const body   = err.response?.data;
    console.log(`[${method} ${path}] ❌ ${status}:`, JSON.stringify(body).slice(0, 300));
  }
}

(async () => {
  // 1. List segments để lấy 1 ID hợp lệ
  console.log('\n=== List segments ===');
  await test('GET', '/segments?limit=5');

  // 2. Thử các endpoint delete khác nhau với ID=2
  const id = process.argv[2] || 2;
  console.log(`\n=== Try DELETE /segments/${id}/delete ===`);
  await test('DELETE', `/segments/${id}/delete`);

  console.log(`\n=== Try DELETE /segments/${id} ===`);
  await test('DELETE', `/segments/${id}`);

  console.log(`\n=== Try POST /segments/${id}/delete ===`);
  await test('POST', `/segments/${id}/delete`);
})();
