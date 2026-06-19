// Salt Network Staff Portal — local dev server + PCO proxy
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

// Load .env file if present (local development)
try {
  const env = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  env.split('\n').forEach(line => {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
  });
} catch (_) {}

const PORT          = process.env.PORT || 3000;
const PCO_HOST      = 'api.planningcenteronline.com';
const PCO_APP_ID    = process.env.PCO_APP_ID;
const PCO_SECRET    = process.env.PCO_SECRET;
const PORTAL_PASS   = process.env.PORTAL_PASSWORD;


if (!PCO_APP_ID || !PCO_SECRET) {
  console.error('\n  ERROR: PCO_APP_ID and PCO_SECRET must be set in environment or .env file\n');
  process.exit(1);
}
if (!PORTAL_PASS) {
  console.error('\n  ERROR: PORTAL_PASSWORD must be set in environment or .env file\n');
  process.exit(1);
}

const PCO_AUTH = 'Basic ' + Buffer.from(`${PCO_APP_ID}:${PCO_SECRET}`).toString('base64');

const MIME = {
  '.html': 'text/html',
  '.js':   'text/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ttf':  'font/ttf',
  '.ico':  'image/x-icon',
};

http.createServer((req, res) => {

  // ── HTTP Basic Auth gate ───────────────────────────────────────────────────
  const authHeader = req.headers['authorization'] || '';
  const b64 = authHeader.startsWith('Basic ') ? authHeader.slice(6) : '';
  const [, pass] = Buffer.from(b64, 'base64').toString().split(':');

  if (pass !== PORTAL_PASS) {
    res.writeHead(401, {
      'WWW-Authenticate': 'Basic realm="Salt Network Staff Portal"',
      'Content-Type': 'text/plain',
    });
    res.end('Access restricted to Salt Network staff.');
    return;
  }

  // ── PCO proxy ──────────────────────────────────────────────────────────────
  if (req.url.startsWith('/api/pco/')) {
    const pcoPath = req.url.replace('/api/pco', '');
    const options = {
      hostname: PCO_HOST,
      path:     pcoPath,
      method:   req.method,
      headers:  { 'Authorization': PCO_AUTH, 'Content-Type': 'application/json' },
    };

    const proxy = https.request(options, pcoRes => {
      res.writeHead(pcoRes.statusCode, {
        'Content-Type':                'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      pcoRes.pipe(res);
    });

    proxy.on('error', err => {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    });

    if (req.method === 'POST' || req.method === 'PATCH') {
      req.pipe(proxy);
    } else {
      proxy.end();
    }
    return;
  }

  // ── Static file server ─────────────────────────────────────────────────────
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  filePath = filePath.split('?')[0];

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });

}).listen(PORT, () => {
  console.log(`\n  Salt Network Staff Portal`);
  console.log(`  → http://localhost:${PORT}\n`);
});
