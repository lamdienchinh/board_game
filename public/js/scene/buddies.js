// The cute animal buddies around the table: who they are, how they're built, where they sit and how they move.
import * as THREE from 'three';
import { V, rnd } from '../core/util.js';
import { S, turnNow } from '../core/state.js';
import { scene, toon, SEAT_R } from './stage.js';

// Seat 0 is you. Up to 10 seats (xì dách).
export const PEOPLE = [
  { name: 'Bạn', color: '#FFC857' },
  { name: 'Mochi', color: '#FF9EBB', belly: '#FFE3EC', kind: 'cat', desc: 'mèo tinh ranh' },
  { name: 'Bơ', color: '#F2B27A', belly: '#FFE7CF', kind: 'bear', desc: 'gấu hiền lành' },
  { name: 'Tofu', color: '#B9A7F5', belly: '#F1ECFF', kind: 'bunny', desc: 'thỏ liều lĩnh' },
  { name: 'Mít', color: '#FFB870', belly: '#FFEBD6', kind: 'cat', desc: 'mèo lém lỉnh' },
  { name: 'Kem', color: '#8ED9C0', belly: '#E3F7F0', kind: 'bunny', desc: 'thỏ hiền khô' },
  { name: 'Bắp', color: '#F2D264', belly: '#FFF5CC', kind: 'bear', desc: 'gấu ham ăn' },
  { name: 'Sương', color: '#9CC8F2', belly: '#E6F1FC', kind: 'cat', desc: 'mèo mơ mộng' },
  { name: 'Gạo', color: '#E8D5C4', belly: '#FFF8F0', kind: 'bear', desc: 'gấu ngủ gật' },
  { name: 'Mây', color: '#F4A6D7', belly: '#FFE6F5', kind: 'bunny', desc: 'thỏ nhí nhảnh' },
];

// Seats go counter-clockwise like a real table (you → right → across → left).
export const SEAT = PEOPLE.map(() => V(0, 0, SEAT_R));

// a cup of trà sữa (milk tea) for every buddy
function boba(color) {
  const g = new THREE.Group();
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.48, 24), toon('#E9C9A5'));
  cup.position.y = 0.24;
  const lid = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon('#FFFDF7'));
  lid.position.y = 0.48;
  const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.62, 10), toon(color));
  straw.position.set(0.05, 0.72, 0); straw.rotation.z = -0.25;
  for (const m of [cup, lid, straw]) { m.castShadow = true; g.add(m); }
  scene.add(g);
  return g;
}

function makeBuddy(p) {
  const P = PEOPLE[p], g = new THREE.Group(), fur = toon(P.color), dark = toon('#2D2340'), white = toon('#FFFFFF'), pink = toon('#FF8FAB');
  const sph = (r, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
    const o = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), mat);
    o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true;
    return o;
  };
  const body = sph(0.66, fur, 0, 0.35, 0, 1, 0.92, 0.88);
  const belly = sph(0.42, toon(P.belly), 0, 0.3, 0.42, 1, 1.05, 0.45);
  const head = new THREE.Group();
  head.position.y = 1.3;
  head.add(sph(0.62, fur, 0, 0, 0, 1.1, 0.95, 1));
  const eyes = [-1, 1].map(s => {
    const e = sph(0.095, dark, s * 0.23, 0.04, 0.56, 1, 1.15, 0.6);
    e.add(sph(0.035, white, 0.03, 0.045, 0.06));
    return e;
  });
  head.add(...eyes, sph(0.1, pink, -0.4, -0.12, 0.49, 1, 0.55, 0.35), sph(0.1, pink, 0.4, -0.12, 0.49, 1, 0.55, 0.35));
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 8, 20, Math.PI), dark);
  mouth.position.set(0, -0.15, 0.6);
  head.add(mouth);
  for (const s of [-1, 1]) {
    if (P.kind === 'cat') {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.38, 20), fur);
      ear.position.set(s * 0.38, 0.52, 0); ear.rotation.z = -s * 0.4; ear.castShadow = true;
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.22, 16), pink);
      inner.position.set(0, -0.04, 0.09); ear.add(inner);
      head.add(ear);
    } else if (P.kind === 'bear') {
      head.add(sph(0.2, fur, s * 0.46, 0.44, -0.05), sph(0.11, toon(P.belly), s * 0.46, 0.44, 0.08, 1, 1, 0.5));
    } else {
      const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.5, 8, 16), fur);
      ear.position.set(s * 0.22, 0.86, -0.05); ear.rotation.z = -s * 0.14; ear.castShadow = true;
      const inner = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.38, 6, 12), pink);
      inner.position.z = 0.07; ear.add(inner);
      head.add(ear);
    }
  }
  g.add(body, belly, head, sph(0.16, fur, -0.42, 0.72, 0.55), sph(0.16, fur, 0.42, 0.72, 0.55));
  scene.add(g);
  return { p, g, cup: boba(P.color), head, eyes, mouth, body, mood: 'idle', until: 0, blink: rnd(1, 4), blinkEnd: 0, phase: Math.random() * 6 };
}

export const bots = PEOPLE.map((_, p) => p && makeBuddy(p)); // bots[0] is you: no buddy

// Spread whoever is playing evenly around the far side, leaving room in front of you.
export function layoutSeats() {
  const opp = bots.filter(b => b && b.p < S.N && S.active[b.p]).map(b => b.p), m = opp.length, gap = m <= 3 ? Math.PI / 2 : 1.2;
  opp.forEach((p, k) => {
    const th = m === 1 ? Math.PI : gap + k * (2 * Math.PI - 2 * gap) / (m - 1), b = bots[p];
    SEAT[p].set(SEAT_R * Math.sin(th), 0, SEAT_R * Math.cos(th));
    b.g.position.copy(SEAT[p]).setY(-0.35);
    b.g.lookAt(0, -0.35, 0);
    b.cup.position.copy(SEAT[p]).multiplyScalar(0.72).add(V(SEAT[p].z, 0, -SEAT[p].x).multiplyScalar(m > 3 ? 0.14 : 0.26));
  });
}
export function showBuddies() {
  for (let p = 1; p < PEOPLE.length; p++) bots[p].g.visible = bots[p].cup.visible = p < S.N && !!S.active[p];
  layoutSeats();
}

export function setMood(b, mood, secs = 1.2) { if (b) Object.assign(b, { mood, until: S.now + secs }); }
export const calmAll = () => bots.forEach(b => b && setMood(b, 'idle', 0));

const tmp = V();
function animate(b, dt) {
  const now = S.now, mood = b.until > now ? b.mood : 'idle', k = 1 - Math.exp(-dt * 8), k2 = 1 - Math.exp(-dt * 22), ph = now * 2 + b.phase;
  let jump = 0, tilt = 0, nod = 0, eyeY = 1, eyeS = 1, frown = false, mouthS = 1;
  if (mood === 'happy') { jump = Math.abs(Math.sin(now * 9 + b.phase)) * 0.28; eyeY = 0.3; mouthS = 1.5; tilt = Math.sin(now * 9) * 0.12; }
  else if (mood === 'shock') { jump = 0.14 + Math.sin(now * 40) * 0.02; eyeS = 1.35; frown = true; }
  else if (mood === 'sad') { nod = 0.35; frown = true; eyeY = 0.7; }
  else if (mood === 'think') { tilt = Math.sin(now * 2.5) * 0.22; nod = 0.18; }
  else if (mood === 'shrug') { tilt = 0.28; }
  else if (mood === 'peek') { nod = 0.42; tilt = Math.sin(now * 6) * 0.08; eyeY = 0.55; } // nặn bài: staring at the cards
  if (now > b.blink) { b.blink = now + rnd(2, 5); b.blinkEnd = now + 0.12; }
  if (now < b.blinkEnd) eyeY = 0.1;
  b.body.position.y += (0.35 + Math.sin(ph) * 0.025 + jump - b.body.position.y) * k2;
  b.head.position.y += (1.3 + jump * 1.1 + Math.sin(ph + 0.5) * 0.03 - nod * 0.15 - b.head.position.y) * k2;
  // look at whoever's turn it is (that includes you)
  let yaw = 0;
  const turn = turnNow();
  if (turn != null && turn !== b.p) {
    const l = b.g.worldToLocal(tmp.copy(SEAT[turn]));
    yaw = Math.max(-0.9, Math.min(0.9, Math.atan2(l.x, l.z)));
  }
  b.head.rotation.y += (yaw - b.head.rotation.y) * k;
  b.head.rotation.z += (tilt - b.head.rotation.z) * k;
  b.head.rotation.x += (nod - b.head.rotation.x) * k;
  b.eyes.forEach(e => e.scale.set(eyeS, 1.15 * eyeY * eyeS, 0.6));
  b.mouth.rotation.z = frown ? 0 : Math.PI;
  b.mouth.position.y = frown ? -0.2 : -0.15;
  b.mouth.scale.setScalar(b.mouth.scale.x + (mouthS - b.mouth.scale.x) * k);
}
export const animateBuddies = dt => { for (const b of bots) if (b) animate(b, dt); };
