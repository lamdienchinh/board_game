// The 52 card meshes, your hand (pinned to the camera), the buddies' fans, and the pile on the table.
import * as THREE from 'three';
import { RANKS, TWO, rank, suit } from '@shared/deck.js';
import { V, Q, rnd, wait } from '../core/util.js';
import { S } from '../core/state.js';
import { sfx } from '../core/audio.js';
import { renderer, scene, camera, canvasTex } from './stage.js';
import { tween, easeIn } from './tween.js';
import { PEOPLE, SEAT, bots } from './buddies.js';

export const CW = 0.7, CH = 0.98;
const INK = '#3B2A4A', RED = '#EF476F';
renderer.localClippingEnabled = true; // for peeling the cover off a face-down card (nặn bài)

const cardGeo = (() => {
  const s = new THREE.Shape(), w = CW / 2, h = CH / 2, r = 0.075;
  s.moveTo(-w + r, -h); s.lineTo(w - r, -h); s.quadraticCurveTo(w, -h, w, -h + r);
  s.lineTo(w, h - r); s.quadraticCurveTo(w, h, w - r, h); s.lineTo(-w + r, h);
  s.quadraticCurveTo(-w, h, -w, h - r); s.lineTo(-w, -h + r); s.quadraticCurveTo(-w, -h, -w + r, -h);
  const g = new THREE.ShapeGeometry(s, 5), pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / CW + 0.5, pos.getY(i) / CH + 0.5);
  return g;
})();

function suitShape(x, s, cx, cy, r) {
  x.beginPath();
  if (s === 2) { // ♦
    x.moveTo(cx, cy - r); x.lineTo(cx + r * 0.75, cy); x.lineTo(cx, cy + r); x.lineTo(cx - r * 0.75, cy);
  } else if (s === 3) { // ♥
    x.moveTo(cx, cy + r * 0.9);
    x.bezierCurveTo(cx - r * 1.35, cy - r * 0.1, cx - r * 0.65, cy - r * 1.15, cx, cy - r * 0.45);
    x.bezierCurveTo(cx + r * 0.65, cy - r * 1.15, cx + r * 1.35, cy - r * 0.1, cx, cy + r * 0.9);
  } else if (s === 0) { // ♠
    x.moveTo(cx, cy - r * 0.95);
    x.bezierCurveTo(cx + r * 1.35, cy + r * 0.05, cx + r * 0.6, cy + r * 0.9, cx, cy + r * 0.4);
    x.bezierCurveTo(cx - r * 0.6, cy + r * 0.9, cx - r * 1.35, cy + r * 0.05, cx, cy - r * 0.95);
    x.moveTo(cx, cy + r * 0.25); x.lineTo(cx + r * 0.32, cy + r); x.lineTo(cx - r * 0.32, cy + r);
  } else { // ♣
    for (const [dx, dy] of [[0, -0.45], [-0.5, 0.12], [0.5, 0.12]]) { x.moveTo(cx + dx * r + r * 0.42, cy + dy * r); x.arc(cx + dx * r, cy + dy * r, r * 0.42, 0, 6.283); }
    x.moveTo(cx, cy); x.lineTo(cx + r * 0.3, cy + r); x.lineTo(cx - r * 0.3, cy + r);
  }
  x.closePath(); x.fill();
}

// fonts must be ready before we paint the card faces
await Promise.race([document.fonts.load('800 60px "Baloo 2"'), wait(3000)]).catch(() => {});

function faceTex(id) {
  const r = rank(id), s = suit(id), col = s >= 2 ? RED : INK, label = RANKS[r];
  return canvasTex(320, 448, (x, w, h) => {
    x.fillStyle = '#FFFDF7'; x.fillRect(0, 0, w, h);
    x.strokeStyle = s >= 2 ? 'rgba(239,71,111,.2)' : 'rgba(59,42,74,.14)'; x.lineWidth = 8;
    x.beginPath(); x.roundRect(14, 14, w - 28, h - 28, 26); x.stroke();
    x.textAlign = 'center'; x.textBaseline = 'middle';
    const corner = () => {
      x.fillStyle = col; x.font = `800 ${label.length > 1 ? 60 : 74}px "Baloo 2", system-ui`;
      x.fillText(label, 52, 70); suitShape(x, s, 52, 126, 22);
    };
    corner(); x.save(); x.translate(w, h); x.rotate(Math.PI); corner(); x.restore();
    const cx = w / 2, cy = h / 2 + 4;
    x.fillStyle = r === TWO ? '#FFD6E2' : s >= 2 ? '#FFEFF3' : '#F1ECF7';
    x.beginPath(); x.arc(cx, cy, 84, 0, 6.283); x.fill();
    x.fillStyle = col;
    if (r === TWO) { // "heo" — Vietnamese players call the 2s pigs
      x.fillStyle = '#FF9EBB';
      for (const d of [-1, 1]) { x.beginPath(); x.moveTo(cx + d * 30, cy - 48); x.lineTo(cx + d * 62, cy - 66); x.lineTo(cx + d * 56, cy - 26); x.fill(); }
      x.beginPath(); x.arc(cx, cy, 58, 0, 6.283); x.fill();
      x.fillStyle = INK; for (const d of [-1, 1]) { x.beginPath(); x.arc(cx + d * 22, cy - 14, 6, 0, 6.283); x.fill(); }
      x.fillStyle = '#FF7FA5'; x.beginPath(); x.ellipse(cx, cy + 16, 24, 17, 0, 0, 6.283); x.fill();
      x.fillStyle = '#C94F77'; for (const d of [-1, 1]) { x.beginPath(); x.ellipse(cx + d * 9, cy + 16, 4, 6, 0, 0, 6.283); x.fill(); }
      x.fillStyle = col; suitShape(x, s, cx, cy + 100, 16);
    } else if (r >= 8 && r <= 10) { // J Q K
      x.font = '800 132px "Baloo 2", system-ui'; x.fillText(label, cx, cy + 10);
    } else {
      suitShape(x, s, cx, cy, r === 11 ? 66 : 50);
    }
  });
}

const backTex = canvasTex(320, 448, (x, w, h) => {
  x.fillStyle = '#FF8FAB'; x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(255,255,255,.22)';
  for (let row = 0; row * 28 < h; row++) for (let xx = (row % 2) * 14; xx < w; xx += 28) { x.beginPath(); x.arc(xx, row * 28, 5, 0, 6.283); x.fill(); }
  x.strokeStyle = '#FFFDF7'; x.lineWidth = 10; x.beginPath(); x.roundRect(22, 22, w - 44, h - 44, 24); x.stroke();
  const cx = w / 2, cy = h / 2;
  x.fillStyle = '#FFFDF7'; x.beginPath(); x.arc(cx, cy, 60, 0, 6.283); x.fill();
  x.fillStyle = INK; for (const d of [-1, 1]) { x.beginPath(); x.arc(cx + d * 20, cy - 6, 7, 0, 6.283); x.fill(); }
  x.fillStyle = '#FFB3C7'; for (const d of [-1, 1]) { x.beginPath(); x.arc(cx + d * 32, cy + 12, 9, 0, 6.283); x.fill(); }
  x.strokeStyle = INK; x.lineWidth = 6; x.lineCap = 'round'; x.beginPath(); x.arc(cx, cy + 6, 13, 0.2 * Math.PI, 0.8 * Math.PI); x.stroke();
});
const backMat = new THREE.MeshBasicMaterial({ map: backTex });
const glowMat = new THREE.MeshBasicMaterial({ color: '#FF6F91' });

// A face-down card in your hand is face up with a "cover" (the back) drawn over it. Peeling moves a
// diagonal clipping line across the cover from the bottom-left corner, so the face shows bit by bit.
const PEEL = new THREE.Vector3(1, 1, 0).normalize(), REACH = PEEL.dot(V(CW / 2, CH / 2, 0)) + 0.02;

export const cards = Array.from({ length: 52 }, (_, id) => {
  const g = new THREE.Group();
  const front = new THREE.Mesh(cardGeo, new THREE.MeshBasicMaterial({ map: faceTex(id) }));
  const back = new THREE.Mesh(cardGeo, backMat);
  const glow = new THREE.Mesh(cardGeo, glowMat);
  const plane = new THREE.Plane(), cover = new THREE.Mesh(cardGeo, new THREE.MeshBasicMaterial({ map: backTex, clippingPlanes: [plane] }));
  front.position.z = 0.004; back.position.z = -0.004; back.rotation.y = Math.PI; cover.position.z = 0.007;
  glow.scale.set(1.1, 1.08, 1); glow.visible = cover.visible = false;
  g.add(front, back, glow, cover);
  Object.assign(g.userData, { id, front, glow, cover, plane, peel: 0, peelShown: 0, flip: null });
  front.userData.card = g;
  scene.add(g);
  return g;
});

/* ---------- hands ---------- */
// mine: your cards; handCards[p]: the meshes in seat p's hand (stand-ins while hidden); spare: undealt meshes.
export const H = { mine: [], handCards: PEOPLE.map(() => []), spare: [], pile: [], pileY: 0.02, hover: null, selected: new Set() };

export function resetCard(c) {
  scene.attach(c);
  Object.assign(c.userData, { follow: false, down: false, peel: 0, peelShown: 0, flip: null });
  c.userData.glow.visible = c.userData.cover.visible = false;
  c.userData.front.material.color.setScalar(1);
  c.visible = true; c.scale.setScalar(1);
}
// Stack the given cards face down in the middle of the table.
export function stackDeck(list = cards) {
  list.forEach((c, i) => { resetCard(c); c.position.set(0, 0.02 + i * 0.006, 0); c.quaternion.copy(Q(Math.PI / 2, 0, rnd(-0.05, 0.05))); });
}
// Split the deck in two, riffle it back together.
export async function shuffleDeck(list) {
  sfx('whoosh');
  await Promise.all(list.map((c, i) => tween(c, { pos: V(i % 2 ? 0.62 : -0.62, 0.02 + (i >> 1) * 0.006, rnd(-0.03, 0.03)), quat: Q(Math.PI / 2, 0, i % 2 ? -0.22 : 0.22), dur: 0.22, delay: i * 0.002 })));
  sfx('riffle');
  await Promise.all(list.map((c, i) => tween(c, { pos: V(0, 0.02 + i * 0.006, 0), quat: Q(Math.PI / 2, 0, rnd(-0.05, 0.05)), dur: 0.18, delay: i * 0.007, arc: 0.06 })));
}

// Your hand lives in camera space so it stays pinned to the bottom of the screen.
// Portrait screens split it into two rows (low cards behind) so each card can be bigger.
export function layoutHand() {
  const { mine, selected, hover } = H, n = mine.length, d = 3, hh = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * d, hw = hh * camera.aspect;
  const rows = camera.aspect < 1 && n > 7 ? 2 : 1, per = Math.ceil(n / rows), W = 1.84 * hw;
  const big = S.game === 'xidach' ? 1.18 : 1; // few cards in xì dách: show them bigger, easier to peel
  const hcap = (rows > 1 ? 0.37 : innerHeight < 560 ? 0.46 : 0.4) * big; // share of half-height one card may take
  const s = Math.min(hcap * hh / CH, W / ((1 + (per - 1) * 0.3) * CW)), cw = CW * s, ch = CH * s;
  const px = 2 * hh / innerHeight, y0 = -hh + (S.barPx + 14) * px + ch / 2;
  mine.forEach((card, i) => {
    const back = rows > 1 && i < per, k = back ? per : n - per * (rows - 1), j = back ? i : i - per * (rows - 1);
    const sp = k > 1 ? Math.min(cw * (big > 1 ? 0.8 : 0.56), (W - cw) / (k - 1)) : 0, t = j - (k - 1) / 2;
    const u = card.userData, up = hover === card, lift = (selected.has(u.id) ? 0.26 : 0) + (up ? 0.06 : 0) + u.peel * 0.3;
    const y = y0 + (back ? 0.42 * ch : 0) + (((k - 1) / 2) ** 2 - t * t) * sp * 0.01 + lift * ch;
    Object.assign(u, { tp: V(t * sp, y, -d + i * 0.004 + u.peel * 0.3), tr: -t * 0.022 * (1 - u.peel), ts: s * (up ? 1.05 : 1) * (1 + u.peel * 0.15) });
    u.glow.visible = selected.has(u.id);
  });
  S.handTopPx = S.barPx + 14 + ch * (rows > 1 ? 1.72 : 1.3) / px;
}

// Your cards drift toward their slots every frame; covers follow their card; a flip spins the card edge-on and back.
export function stepHand(dt) {
  const kf = 1 - Math.exp(-dt * 16), kp = 1 - Math.exp(-dt * 20);
  for (const c of H.mine) {
    const u = c.userData;
    if (!u.follow) continue;
    c.position.lerp(u.tp, kf);
    let ry = 0;
    if (u.flip != null) {
      u.flip = Math.min(1, u.flip + dt / 0.32);
      if (u.flip >= 0.5 && u.down) { u.down = false; u.cover.visible = false; sfx('flip'); }
      ry = Math.sin(Math.PI * u.flip) * Math.PI / 2;
      if (u.flip >= 1) u.flip = null;
    }
    c.rotation.set(0, ry, c.rotation.z + (u.tr - c.rotation.z) * kf);
    c.scale.setScalar(c.scale.x + (u.ts - c.scale.x) * kf);
    u.peelShown += (u.peel - u.peelShown) * kp;
  }
}
// Called after the camera moved: clipping planes are in world space.
export function updateCovers() {
  for (const c of H.mine) {
    const u = c.userData;
    if (!u.cover.visible) continue;
    u.cover.updateMatrixWorld();
    u.plane.set(PEEL, REACH * (1 - 2 * u.peelShown)).applyMatrix4(u.cover.matrixWorld);
  }
}
export function flipCard(c) {
  const u = c.userData;
  if (!u.down || u.flip != null) return false;
  u.peel = 0; u.flip = 0;
  layoutHand();
  return true;
}

export function fanSlot(i, n) { // in the bot's local space; cards face the bot, backs face the table
  const t = i - (n - 1) / 2, a = t * 0.085;
  return { pos: V(Math.sin(a) * 0.55, 0.62 + Math.cos(a) * 0.55 - Math.abs(t) * 0.004, 0.8 + i * 0.004), quat: Q(-0.2, Math.PI, a), scale: 0.5 };
}
export const layoutBot = p => Promise.all(H.handCards[p].map((c, i, a) => tween(c, { ...fanSlot(i, a.length), dur: 0.35 })));
export const toHand = c => { camera.attach(c); return tween(c, { pos: c.userData.tp, quat: Q(0, 0, c.userData.tr), scale: c.userData.ts, dur: 0.45, arc: 0.3 }).then(() => (c.userData.follow = true)); };
export const toFan = (p, c, i, n) => { bots[p].g.attach(c); return tween(c, { ...fanSlot(i, n), dur: 0.45, arc: 0.5 }); };

/* ---------- table pile ---------- */
// Every pile card gets its own height, so overlapping cards never share a plane (z-fighting).
export const STEP = 0.006;
export function toPile(ids) {
  for (const c of H.pile) c.userData.front.material.color.setScalar(0.8);
  const n = ids.length, sp = Math.min(0.4, 3 / n) * S.pileScale, ang = rnd(-0.3, 0.3);
  const base = V(rnd(-0.3, 0.3), H.pileY, rnd(-0.25, 0.25));
  H.pileY += (n + 1) * STEP;
  return Promise.all(ids.map((id, i) => {
    const c = cards[id];
    c.userData.follow = false; c.userData.glow.visible = false;
    scene.attach(c); H.pile.push(c);
    const off = V((i - (n - 1) / 2) * sp, 0, 0).applyAxisAngle(V(0, 1, 0), ang).setY(i * STEP);
    return tween(c, { pos: base.clone().add(off), quat: Q(-Math.PI / 2, 0, ang), scale: S.pileScale, arc: 1.1, dur: 0.5, delay: i * 0.05 });
  }));
}
export async function sweep(toward) {
  const to = SEAT[toward].clone().multiplyScalar(0.5);
  await Promise.all(H.pile.map((c, i) => tween(c, { pos: V(to.x + rnd(-0.3, 0.3), 0.03 + i * STEP, to.z + rnd(-0.3, 0.3)), quat: Q(Math.PI / 2, 0, rnd(-1, 1)), scale: 0.01, dur: 0.45, delay: i * 0.015, ease: easeIn })));
  H.pile.forEach(c => (c.visible = false));
  H.pile = []; H.pileY = 0.02;
}

/* ---------- hidden cards ---------- */
// Opponents' cards are stand-in meshes (backs only). When real ids show up, the real meshes trade places with them.
function swapPlace(a, b) {
  const pa = a.parent, t = [a.position.clone(), a.quaternion.clone(), a.scale.clone()];
  [a.visible, b.visible] = [b.visible, a.visible];
  b.parent.add(a); pa.add(b);
  a.position.copy(b.position); a.quaternion.copy(b.quaternion); a.scale.copy(b.scale);
  b.position.copy(t[0]); b.quaternion.copy(t[1]); b.scale.copy(t[2]);
}
export function claim(p, ids) {
  const fan = H.handCards[p], pools = [...H.handCards, H.spare];
  for (const id of ids) {
    const c = cards[id];
    if (fan.includes(c)) continue;
    const from = pools.find(h => h.includes(c)), i = from.indexOf(c);
    const j = fan.findIndex(d => !ids.includes(d.userData.id)), d = fan[j];
    [from[i], fan[j]] = [d, c];
    swapPlace(c, d);
    const q = H.handCards.indexOf(from);
    if (q > 0) layoutBot(q);
  }
}
// Pull a real card out of the deck, or out of someone's face-down stand-ins.
export function free(id) {
  const c = cards[id], from = [...H.handCards, H.spare].find(a => a.includes(c));
  if (from === H.spare) from.splice(from.indexOf(c), 1);
  else if (from) { const d = H.spare.pop(); from[from.indexOf(c)] = d; swapPlace(c, d); }
  return c;
}

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
export function hitMine(e) {
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.intersectObjects(H.mine.filter(c => c.userData.follow).map(c => c.userData.front))[0]?.object.userData.card ?? null;
}
