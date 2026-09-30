import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createAuth, verifyGoogleToken } from '../server/auth.js';
import { sameOrigin } from '../server/http.js';
import { createHmac } from 'node:crypto';

const CLIENT = 'app.apps.googleusercontent.com';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const keys = async () => new Map([['k1', publicKey]]);
const enc = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(payload, { kid = 'k1', key = privateKey } = {}) {
  const head = enc({ alg: 'RS256', kid }), body = enc(payload);
  return `${head}.${body}.${sign('RSA-SHA256', Buffer.from(`${head}.${body}`), key).toString('base64url')}`;
}
const good = { sub: '42', aud: CLIENT, iss: 'https://accounts.google.com', exp: Date.now() / 1000 + 600, given_name: 'Linh' };

test('Google ID tokens: signature, audience, issuer, expiry', async () => {
  assert.equal((await verifyGoogleToken(jwt(good), CLIENT, keys)).sub, '42');
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  for (const bad of [jwt(good, { key: other }), jwt({ ...good, aud: 'x' }), jwt({ ...good, iss: 'evil.com' }),
    jwt({ ...good, exp: 1 }), jwt(good, { kid: 'nope' }), 'garbage', undefined]) {
    await assert.rejects(verifyGoogleToken(bad, CLIENT, keys), { status: 401 });
  }
});

// A tiny stand-in for req/res: cookies go out through set-cookie and come back in the cookie header.
function jar() {
  let cookie = '';
  const res = () => ({ appendHeader: (_, v) => (cookie = v.split(';')[0]) });
  return { req: () => ({ headers: { cookie } }), res, set: v => (cookie = v), get: () => cookie };
}

test('sessions: guests get a signed cookie, Google login replaces it, tampering is rejected', async () => {
  const auth = createAuth({ sessionSecret: 's3cret', googleClientId: CLIENT }, { fetchKeys: keys }), j = jar();
  const guest = auth.session(j.req(), j.res());
  assert.ok(guest.guest && guest.id.startsWith('guest:'));
  assert.equal(auth.session(j.req(), j.res()).id, guest.id, 'same cookie → same guest');
  const user = await auth.google(j.res(), jwt(good));
  assert.deepEqual([user.id, user.name], ['google:42', 'Linh']);
  assert.equal(auth.peek(j.req()).id, 'google:42');
  const [data, sig] = decodeURIComponent(j.get().split('=')[1]).split('.');
  j.set(`sid=${encodeURIComponent(`${enc({ id: 'google:1' })}.${sig}`)}`);
  assert.equal(auth.peek(j.req()), null, 'forged payload');
  j.set(`sid=${encodeURIComponent(`${data}.x${sig}`)}`);
  assert.equal(auth.peek(j.req()), null, 'forged signature');
  const off = createAuth({ sessionSecret: 's', googleClientId: null });
  await assert.rejects(off.google(j.res(), jwt(good)), { status: 404 });
});

test('an expired session cookie is refused even with a valid signature', () => {
  const auth = createAuth({ sessionSecret: 'k' }), data = enc({ id: 'google:1', exp: Date.now() - 1000 });
  const sig = createHmac('sha256', 'k').update(data).digest('base64url');
  assert.equal(auth.peek({ headers: { cookie: `sid=${data}.${sig}` } }), null);
  assert.equal(auth.peek({ headers: { cookie: 'sid=%E0%A4%A' } }), null, 'malformed cookie is not a crash');
});

test('cross-site POSTs are refused', () => {
  const req = origin => ({ headers: { host: 'bai.example.com', ...(origin && { origin }) } });
  assert.ok(sameOrigin(req('https://bai.example.com')));
  assert.ok(sameOrigin(req()));
  assert.ok(!sameOrigin(req('https://evil.example.com')));
  assert.ok(!sameOrigin(req('null')));
});
