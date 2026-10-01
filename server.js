import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 8080;
const ROOT = path.dirname(fileURLToPath(import.meta.url));

const MIME = {
  html: 'text/html',
  js: 'application/javascript',
  css: 'text/css',
  json: 'application/json',
  png: 'image/png',
  ico: 'image/x-icon',
  webmanifest: 'application/manifest+json',
  svg: 'image/svg+xml',
  woff: 'font/woff',
  woff2: 'font/woff2',
};

http.createServer((req, res) => {
  let f = req.url.split('?')[0];
  if (f === '/' || f === '') f = '/index.html';

  const fp = path.join(ROOT, f);

  // Segurança: não permitir acesso fora do ROOT
  if (!fp.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const data = fs.readFileSync(fp);
    const ext = path.extname(fp).slice(1);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'text/plain',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch (e) {
    res.writeHead(404);
    res.end('Not found: ' + f);
  }
}).listen(PORT, () => {
  console.log(`Copa Album Tracker rodando em http://localhost:${PORT}`);
});
