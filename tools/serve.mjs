#!/usr/bin/env node
// Minimal static file server for local development (no dependencies).
// Usage: npm start   then open http://localhost:8080
// To test on your phone on the same Wi-Fi, open http://<your-computer-ip>:8080
// (Service workers need https or localhost, so full install-to-home-screen
// testing on a phone is easiest after deploying; see README.)

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(normalize(ROOT))) throw Object.assign(new Error('forbidden'), { code: 'EACCES' });
    if (!(await stat(file)).isFile()) throw Object.assign(new Error('not a file'), { code: 'ENOENT' });
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(await readFile(file));
  } catch (e) {
    res.writeHead(e.code === 'EACCES' ? 403 : 404, { 'Content-Type': 'text/plain' });
    res.end(e.code === 'EACCES' ? 'Forbidden' : 'Not found');
  }
}).listen(PORT, () => console.log(`Breviary dev server: http://localhost:${PORT}`));
