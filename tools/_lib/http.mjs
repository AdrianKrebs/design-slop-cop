// Tiny helpers shared between tools/scan/server.mjs and tools/label/server.mjs.

import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

export function send(res, status, contentType, body) {
  res.writeHead(status, { 'content-type': contentType, 'cache-control': 'no-store' });
  res.end(body);
}

export function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export async function serveFile(absPath, res) {
  try {
    const body = await readFile(absPath);
    return send(res, 200, MIME[extname(absPath)] || 'application/octet-stream', body);
  } catch {
    return send(res, 404, 'text/plain', 'not found');
  }
}
