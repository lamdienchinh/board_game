// Settings come from the environment. Locally, put them in .env (see .env.example);
// on Render / Railway / Fly / a VPS, set them in the platform's environment settings instead.
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const ENV_FILE = new URL('../.env', import.meta.url);
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE); // never overrides variables that are already set

const env = process.env, int = (v, d) => (Number.isFinite(+v) && v !== '' ? +v : d);

if (!env.SESSION_SECRET) console.warn('SESSION_SECRET chưa được đặt — dùng khóa tạm, mọi người sẽ bị đăng xuất khi server khởi động lại.');

export const config = Object.freeze({
  port: int(env.PORT, 8080),
  googleClientId: env.GOOGLE_CLIENT_ID?.trim() || null, // null → Google login hidden, everyone plays as a guest
  sessionSecret: env.SESSION_SECRET || randomBytes(32).toString('hex'),
  cookieSecure: env.COOKIE_SECURE === 'true', // set true behind HTTPS so the session cookie is never sent in clear
  maxRooms: int(env.MAX_ROOMS, 500),
  turnMs: int(env.TURN_MS, 45000),
  maxStreamsPerIp: int(env.MAX_STREAMS_PER_IP, 8), // open game connections from one address (each can hold a room)
  trustProxy: env.TRUST_PROXY === 'true',          // behind nginx / a platform proxy: read the client IP from X-Forwarded-For
});
