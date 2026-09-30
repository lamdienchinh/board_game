// Every sound is synthesized with Web Audio — no sound files to load.
import { rnd, store } from './util.js';

let ac = null, noiseBuf = null, muted = store.get('tl-muted', false);
export const isMuted = () => muted;
export function setMuted(m) { muted = m; store.set('tl-muted', m); }

// Browsers only allow audio after a user gesture, so every button that starts something calls this.
export function unlockAudio() {
  try {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      noiseBuf = ac.createBuffer(1, ac.sampleRate / 2, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    ac.resume();
  } catch {}
}

function tone(f, d, { type = 'sine', v = 0.1, at = 0, to } = {}) {
  const t = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + 0.02);
}
function noise(d, { v = 0.2, f = 2000, q = 1, at = 0 } = {}) {
  const t = ac.currentTime + at, s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; fl.type = 'bandpass'; fl.frequency.value = f; fl.Q.value = q;
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  s.connect(fl).connect(g).connect(ac.destination); s.start(t); s.stop(t + d);
}

const SFX = {
  flick: () => noise(0.05, { v: 0.12, f: rnd(2500, 4000), q: 0.8 }),
  riffle: () => { for (let i = 0; i < 14; i++) noise(0.03, { v: 0.08, f: rnd(3000, 5000), q: 0.9, at: i * 0.035 }); },
  whoosh: () => noise(0.2, { v: 0.1, f: 1300, q: 0.6 }),
  land: () => { noise(0.06, { v: 0.22, f: 900 }); tone(190, 0.08, { v: 0.07 }); },
  flip: () => { noise(0.04, { v: 0.14, f: 3200, q: 1.2 }); tone(rnd(700, 760), 0.06, { type: 'triangle', v: 0.05 }); },
  peel: () => noise(0.08, { v: 0.05, f: rnd(1800, 2400), q: 2 }),
  drum: () => { for (let i = 0; i < 10; i++) noise(0.05, { v: 0.05 + i * 0.012, f: 220, q: 0.7, at: i * 0.06 }); },
  select: () => tone(rnd(820, 900), 0.07, { type: 'triangle', v: 0.07 }),
  unselect: () => tone(560, 0.06, { type: 'triangle', v: 0.05 }),
  pass: () => tone(420, 0.18, { v: 0.07, to: 260 }),
  turn: () => { tone(880, 0.12, { v: 0.05 }); tone(1320, 0.16, { v: 0.045, at: 0.08 }); },
  error: () => tone(200, 0.16, { type: 'square', v: 0.035 }),
  pop: () => tone(600, 0.1, { v: 0.08, to: 1100 }),
  pig: () => { tone(330, 0.12, { type: 'sawtooth', v: 0.04, to: 500 }); tone(360, 0.14, { type: 'sawtooth', v: 0.04, to: 540, at: 0.15 }); },
  boom: () => { tone(150, 0.6, { v: 0.3, to: 40 }); noise(0.4, { v: 0.3, f: 300, q: 0.5 }); },
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, { type: 'triangle', v: 0.08, at: i * 0.09 })),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.32, { type: 'triangle', v: 0.06, at: i * 0.15 })),
};
export const sfx = k => { if (!muted && ac) try { SFX[k](); } catch {} };
