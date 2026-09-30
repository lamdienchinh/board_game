// Small HTTP helpers on top of node:http: JSON replies, body parsing, cookies, static files, SSE.
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const json = (res, status, body) => res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(body));

export async function readJson(req, limit = 4096) {
  let body = '';
  for await (const chunk of req) if ((body += chunk).length > limit) throw new HttpError(413, 'Dữ liệu quá lớn');
  let data;
  try { data = body ? JSON.parse(body) : {}; } catch {}
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, 'Dữ liệu không hợp lệ');
  return data;
}

const decode = s => { try { return decodeURIComponent(s); } catch { return null; } }; // a malformed %xx must not become a 500
export const cookies = req => Object.fromEntries((req.headers.cookie ?? '').split(';').map(c => c.trim().split('=').map(decode)).filter(c => c[0]));

export function setCookie(res, name, value, { maxAge, secure }) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (secure) parts.push('Secure');
  res.appendHeader('set-cookie', parts.join('; '));
}

// Server-Sent Events: one long response per player, each event is a JSON line.
// Writing to a stream whose socket is already gone would emit an unhandled 'error' and crash the process.
export function openStream(res) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'x-accel-buffering': 'no' });
  res.on('error', () => {});
  const write = s => res.writableEnded || res.destroyed || res.write(s);
  return {
    send: ev => write(`data: ${JSON.stringify(ev)}\n\n`),
    ping: () => write(':\n\n'),
    close: () => res.writableEnded || res.end(),
  };
}

// Browsers send Origin on every cross-site POST. Reject those: no login CSRF, no moves made from another site.
export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin navigations and non-browser clients
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

// The importmap in index.html is the only inline script; allow exactly it by hash.
export function securityHeaders(importmapHash) {
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'sha256-${importmapHash}' https://cdn.jsdelivr.net https://accounts.google.com/gsi/client`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style", // inline style="--c:…" on avatars
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data: https://*.googleusercontent.com",
    "connect-src 'self' https://accounts.google.com/gsi/",
    "frame-src https://accounts.google.com/gsi/",
    "frame-ancestors 'none'", "base-uri 'none'", "form-action 'self'", "object-src 'none'",
  ].join('; ');
  return {
    'content-security-policy': csp,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'cross-origin-opener-policy': 'same-origin-allow-popups', // the Google sign-in popup
  };
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

// Serves files from the given folders by URL prefix, e.g. { '/': 'public', '/shared/': 'shared' }.
// Returns false when nothing matched, so the caller can answer 404.
export function staticFiles(mounts) {
  const roots = Object.entries(mounts).map(([prefix, dir]) => [prefix, fileURLToPath(new URL(`../${dir}/`, import.meta.url))])
    .sort((a, b) => b[0].length - a[0].length); // longest prefix wins
  return async (res, path) => {
    const hit = roots.find(([prefix]) => path.startsWith(prefix));
    if (!hit) return false;
    const [prefix, root] = hit, rel = decode(path.slice(prefix.length) || 'index.html');
    const file = rel && resolve(root, '.' + sep + rel);
    if (!file || !file.startsWith(root) || !TYPES[extname(file)]) return false; // no ../ escapes, no unknown file types
    try {
      const data = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)], 'cache-control': 'no-cache' }).end(data);
      return true;
    } catch (e) {
      if (e.code === 'ENOENT' || e.code === 'EISDIR') return false;
      throw e;
    }
  };
}
