// Room server: serves the game, pushes events with Server-Sent Events, takes moves on POST /api/act.
// No dependencies — just `npm start`.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { config } from './config.js';
import { json, readJson, openStream, staticFiles, sameOrigin, securityHeaders, HttpError } from './http.js';
import { createAuth } from './auth.js';
import { Lobby } from './rooms.js';

const auth = createAuth(config);
const lobby = new Lobby(config);
const serveFile = staticFiles({ '/': 'public', '/shared/': 'shared' });
setInterval(() => lobby.ping(), 15000);

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const importmap = /<script type="importmap">([\s\S]*?)<\/script>/.exec(html)[1];
const HEADERS = securityHeaders(createHash('sha256').update(importmap).digest('base64'));

// ponytail: in-memory per-IP counter, fine for one instance; a shared store if this ever scales out.
const streams = new Map(); // ip → open event streams
const clientIp = req => (config.trustProxy && req.headers['x-forwarded-for']?.split(',')[0].trim()) || req.socket.remoteAddress;

// GET /api/events?name=Linh&game=xidach → create a room and sit down
// GET /api/events?name=Linh&room=ABCD  → join that room
function events(req, res, q) {
  const ip = clientIp(req), open = streams.get(ip) ?? 0;
  if (open >= config.maxStreamsPerIp) throw new HttpError(429, 'Quá nhiều kết nối từ máy này');
  streams.set(ip, open + 1);
  req.on('close', () => { const n = streams.get(ip) - 1; n ? streams.set(ip, n) : streams.delete(ip); });
  const user = auth.session(req, res), stream = openStream(res);
  const conn = { id: randomUUID(), user, ...stream };
  const err = lobby.connect(conn, { name: q.get('name') || user.name, code: q.get('room'), game: q.get('game') });
  if (err) return (conn.send({ type: 'error', msg: err, fatal: true }), conn.close());
  req.on('close', () => lobby.disconnect(conn));
}

// Signing in or out changes who you are: a page still sitting as the old you is told and closed, not left as a ghost.
const SWITCHED = 'Bạn vừa đổi tài khoản — vào lại phòng nhé';

// Everything under /api needs a session cookie (except the ones that hand one out).
const routes = {
  'GET /api/config': () => ({ googleClientId: config.googleClientId }),
  'GET /api/me': (req, res) => auth.session(req, res),
  'GET /api/rooms': () => lobby.open(),
  'POST /api/auth/google': async (req, res, user) => {
    const { credential } = await readJson(req), next = await auth.google(res, credential);
    if (user && user.id !== next.id) lobby.remove(user.id, SWITCHED);
    return next;
  },
  'POST /api/auth/logout': (req, res, user) => (user && lobby.remove(user.id, SWITCHED), auth.logout(res)),
  'POST /api/act': async (req, res, user) => {
    if (!user) throw new HttpError(403, 'Bạn không ở trong phòng này');
    return { error: lobby.act(user.id, await readJson(req)) };
  },
  'POST /api/leave': async (req, res, user) => (user && lobby.leave(user.id, (await readJson(req)).cid), { ok: true }),
};

http.createServer(async (req, res) => {
  for (const [k, v] of Object.entries(HEADERS)) res.setHeader(k, v);
  try {
    const url = new URL(req.url, 'http://x'), key = `${req.method} ${url.pathname}`; // inside try: a weird URL must not crash the process
    if (req.method === 'POST' && !sameOrigin(req)) throw new HttpError(403, 'Yêu cầu từ trang khác bị chặn');
    if (key === 'GET /api/events') return events(req, res, url.searchParams);
    if (Object.hasOwn(routes, key)) return json(res, 200, await routes[key](req, res, auth.peek(req)));
    if (req.method === 'GET' && await serveFile(res, url.pathname)) return;
    json(res, 404, { error: 'Không tìm thấy' });
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    if (!res.headersSent) json(res, e.status ?? 500, { error: e instanceof HttpError ? e.message : 'Lỗi máy chủ' });
  }
}).listen(config.port, () => console.log(`Chơi Bài Cùng Bạn đang chạy tại http://localhost:${config.port}`));
