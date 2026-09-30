// Who is this request? Everyone gets a session cookie: a guest id at first, a Google account after signing in.
// The cookie is signed with SESSION_SECRET (HMAC), so it can't be forged and survives server restarts.
import { createHmac, createPublicKey, randomUUID, timingSafeEqual, verify } from 'node:crypto';
import { cookies, setCookie, HttpError } from './http.js';

const COOKIE = 'sid', MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const b64 = s => Buffer.from(s, 'base64url');

export function createAuth({ sessionSecret, googleClientId, cookieSecure }, { fetchKeys = fetchGoogleKeys } = {}) {
  const mac = data => createHmac('sha256', sessionSecret).update(data).digest('base64url');
  const sign = user => { const data = Buffer.from(JSON.stringify(user)).toString('base64url'); return `${data}.${mac(data)}`; };
  function unsign(value) {
    const [data, sig] = String(value ?? '').split('.');
    if (!data || !sig) return null;
    const a = b64(sig), b = b64(mac(data));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    let user;
    try { user = JSON.parse(b64(data)); } catch { return null; }
    return user?.exp > Date.now() ? user : null; // the cookie's Max-Age is only a hint to the browser; this is the real expiry
  }
  const save = (res, user) => (setCookie(res, COOKIE, sign({ ...user, exp: Date.now() + MAX_AGE * 1000 }), { maxAge: MAX_AGE, secure: cookieSecure }), user);

  return {
    // The signed-in user, or a fresh guest (and its cookie) when there is none.
    session(req, res) {
      return unsign(cookies(req)[COOKIE]) ?? save(res, { id: `guest:${randomUUID()}`, name: null, guest: true });
    },
    // Only reads: for requests that must come from someone who already has a session.
    peek: req => unsign(cookies(req)[COOKIE]),

    // The browser got an ID token from Google Identity Services; check it really came from Google for our app.
    async google(res, credential) {
      if (!googleClientId) throw new HttpError(404, 'Máy chủ chưa bật đăng nhập Google');
      const p = await verifyGoogleToken(credential, googleClientId, fetchKeys);
      return save(res, { id: `google:${p.sub}`, name: p.given_name || p.name || null, picture: p.picture ?? null, email: p.email ?? null, guest: false });
    },
    logout: res => save(res, { id: `guest:${randomUUID()}`, name: null, guest: true }),
  };
}

// Google rotates its signing keys; cache them for as long as Google says (Cache-Control max-age).
let cache = { keys: null, until: 0 };
async function fetchGoogleKeys() {
  if (Date.now() < cache.until) return cache.keys;
  const r = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!r.ok) throw new HttpError(502, 'Không lấy được khóa của Google');
  const maxAge = +/max-age=(\d+)/.exec(r.headers.get('cache-control') ?? '')?.[1] || 3600;
  const keys = new Map((await r.json()).keys.map(k => [k.kid, createPublicKey({ key: k, format: 'jwk' })]));
  cache = { keys, until: Date.now() + maxAge * 1000 };
  return keys;
}

// A Google ID token is a JWT signed with RS256. Check signature, audience, issuer and expiry.
export async function verifyGoogleToken(token, clientId, fetchKeys = fetchGoogleKeys) {
  const bad = () => new HttpError(401, 'Đăng nhập Google không hợp lệ');
  const [h, p, s] = String(token ?? '').split('.');
  if (!h || !p || !s) throw bad();
  let header, payload;
  try { header = JSON.parse(b64(h)); payload = JSON.parse(b64(p)); } catch { throw bad(); }
  const key = header.alg === 'RS256' && (await fetchKeys()).get(header.kid);
  if (!key || !verify('RSA-SHA256', Buffer.from(`${h}.${p}`), key, b64(s))) throw bad();
  const issuer = ['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss);
  if (payload.aud !== clientId || !issuer || !(payload.exp * 1000 > Date.now()) || !payload.sub) throw bad();
  return payload;
}
