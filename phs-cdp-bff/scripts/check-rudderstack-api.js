const http = require('http');
const RS_HOST = '100.117.24.87';
const RS_PORT = 8082;

function get(path) {
  return new Promise((resolve) => {
    const req = http.get({ host: RS_HOST, port: RS_PORT, path, timeout: 5000 }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ status: res.statusCode, body: body.slice(0, 300) }));
    });
    req.on('error', e => resolve({ status: 0, body: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
  });
}

async function main() {
  const paths = [
    '/backend-config',
    '/destination-definitions',
    '/source-definitions',
    '/api/v1/destinations',
    '/internal/definitions',
    '/health',
  ];
  console.log(`Testing RudderStack at ${RS_HOST}:${RS_PORT}\n`);
  for (const path of paths) {
    const r = await get(path);
    console.log(`[${r.status}] ${path}`);
    if (r.status > 0) console.log(`    ${r.body.replace(/\n/g,' ').slice(0,150)}`);
  }
}
main();
