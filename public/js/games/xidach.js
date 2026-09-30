// Xì Dách in the browser. The fun part is opening the cards:
//  - the deck is riffled before every deal;
//  - your cards arrive face down: tap to flip, or drag a card up to peel it open from the corner (nặn bài);
//  - hands shown on the table land face down and flip one by one; the dealer's reveal gets a drum roll
//    and a pause before the last card.
import { points, kind, describeHand, MIN_PLAYER, MIN_DEALER, MAX_CARDS } from '@shared/xidach/rules.js';
import { $, V, Q, pick, wait, clamp, store } from '../core/util.js';
import { S, L, abs, rot, seatIds, myTurn, turnNow, scoreKey } from '../core/state.js';
import { sfx } from '../core/audio.js';
import { scene } from '../scene/stage.js';
import { tween } from '../scene/tween.js';
import { cards, H, STEP, layoutHand, layoutBot, claim, free, stackDeck, shuffleDeck, toHand, flipCard, hitMine } from '../scene/cards.js';
import { PEOPLE, SEAT, bots, setMood, calmAll } from '../scene/buddies.js';
import { burst, fx } from '../scene/effects.js';
import { tags, tagCount, bubble, hideBubble, hideBubbles, banner, toast, updateHUD, setLabel } from '../ui/hud.js';
import { closeOverlays, showEnd, resultRow, renderSettings } from '../ui/menu.js';

const BIG = { xibang: 'XÌ BÀNG!', xidach: 'XÌ DÁCH!', ngulinh: 'NGŨ LINH!' };
const star = d => (d > 0 ? `+${d}★` : d < 0 ? `−${-d}★` : 'Hòa');
let xd = null, peel = null;

// Your cards you've already looked at, and whether any are still face down.
const seen = () => H.mine.filter(c => !c.userData.down).map(c => c.userData.id);
const hidden = () => H.mine.filter(c => c.userData.down);
const allIds = () => H.mine.map(c => c.userData.id);
function flipAll() {
  const down = hidden();
  down.forEach((c, i) => setTimeout(() => flipCard(c), i * 120));
  if (down.length) setTimeout(updateHUD, down.length * 120 + 350);
  return down.length > 0;
}

/* ---------- HUD ---------- */
function hud() {
  const t = turnNow(), my = myTurn(), pts = points(seen()), boss = xd?.dealer === 0, peeking = hidden().length > 0;
  for (let p = 0; p < S.N; p++) {
    const r = xd?.res[p], n = H.handCards[p]?.length ?? 0, cai = xd?.dealer === p ? 'Cái · ' : '';
    if (p) tags[p].querySelector('.nm').textContent = S.names[p];
    tagCount(p).textContent = !xd ? '·' : r != null ? cai + star(r) : cai + (p ? `${n} lá` : !peeking ? `${pts} điểm` : seen().length ? `${pts} + ?` : '? điểm');
    tags[p].classList.toggle('active', t === p && !S.dealing);
    tags[p].classList.toggle('stood', !!xd?.stood.has(p) && r == null);
    const can = p > 0 && my && boss && !peeking && pts >= MIN_DEALER && r == null && xd.players.includes(p);
    tags[p].classList.toggle('xet', can);
    if (p) { tags[p].tabIndex = can ? 0 : -1; tags[p].setAttribute('role', can ? 'button' : 'group'); }
  }
  // Face-down cards keep the buttons live: pressing one flips your cards first, the table checks the rules.
  $('#playBtn').disabled = !my || H.mine.length >= MAX_CARDS;
  $('#passBtn').hidden = boss; $('#passBtn').disabled = !my || (!peeking && pts < MIN_PLAYER);
  $('#hintBtn').hidden = !boss; $('#hintBtn').disabled = !my || (!peeking && pts < MIN_DEALER);
}
function label() {
  const ids = allIds(), pts = points(seen()), t = turnNow();
  if (!xd) return setLabel('Rút bài sát 21 điểm để thắng nhà cái.');
  if (xd.res[0] != null) return setLabel(`${describeHand(ids)} · ${star(xd.res[0])}`, xd.res[0] > 0 ? 'good' : xd.res[0] < 0 ? 'bad' : '');
  if (hidden().length && !S.dealing) return setLabel(`Chạm để lật, hoặc kéo lá bài lên để nặn 🤞${seen().length ? ` · đang có ${pts} điểm` : ''}`);
  if (t === 0 && xd.dealer === 0) return setLabel(pts < MIN_DEALER ? `${pts} điểm — nhà cái phải đủ ${MIN_DEALER}, rút thêm` : `${pts} điểm — rút, chạm tên để xét, hoặc lật bài`);
  if (t === 0) {
    const bust = kind(ids) === 'quac';
    return setLabel(bust ? `Quắc rồi (${pts} điểm) — dằn và mong nhà cái cũng quắc` : pts < MIN_PLAYER ? `Bạn có ${pts} điểm — chưa đủ ${MIN_PLAYER}, phải rút` : `Bạn có ${pts} điểm — rút thêm hay dằn?`, bust ? 'bad' : '');
  }
  if (t != null) return setLabel(`${S.names[t]} đang ${t === xd.dealer ? 'làm cái' : 'nặn bài'}… · bạn có ${pts} điểm`);
  setLabel(xd.over ? 'Hết ván' : 'Đang chia bài…');
}

/* ---------- cards ---------- */
function give(p, id) {
  const c = p ? H.spare.pop() : free(id);
  H.handCards[p].push(c); sfx('flick');
  if (p) { bots[p].g.attach(c); return layoutBot(p); }
  Object.assign(c.userData, { down: true, peel: 0, peelShown: 0 });
  c.userData.cover.visible = true;
  layoutHand();
  return toHand(c);
}

// Lay a hand face down in front of its seat, then turn the cards over one by one.
async function reveal(p, { slow = false } = {}) {
  const hand = H.handCards[p], n = hand.length, many = xd.players.length > 4, sc = S.pileScale * (many ? 0.62 : 0.85);
  const base = SEAT[p].clone().multiplyScalar(many ? 0.6 : 0.5), side = V(-SEAT[p].z, 0, SEAT[p].x).normalize();
  const spot = i => base.clone().addScaledVector(side, (i - (n - 1) / 2) * (many ? 0.3 : 0.42) * sc).setY(0.02 + i * STEP);
  sfx('whoosh');
  await Promise.all(hand.map((c, i) => { scene.attach(c); return tween(c, { pos: spot(i), quat: Q(Math.PI / 2, 0, 0), scale: sc, arc: 0.6, dur: 0.4, delay: i * 0.05 }); }));
  if (slow) { sfx('drum'); await wait(600); }
  for (let i = 0; i < n; i++) {
    const last = i === n - 1;
    if (slow && last) await wait(450); // the last card keeps everyone waiting
    await tween(hand[i], { pos: spot(i), quat: Q(-Math.PI / 2, 0, 0), arc: 0.35 * sc, dur: slow && last ? 0.5 : many ? 0.16 : 0.22 });
    sfx('flip');
  }
}

/* ---------- events ---------- */
async function onDeal(ev) {
  closeOverlays(); calmAll(); hideBubbles();
  S.dealing = true;
  const d = L(ev.dealer);
  xd = { dealer: d, players: ev.players.map(L), turn: null, res: {}, text: {}, stood: new Set(), over: false };
  H.selected.clear(); H.hover = null; H.pile = [];
  stackDeck(cards);
  H.spare = cards.filter(c => !ev.hand.includes(c.userData.id)).sort(() => Math.random() - 0.5);
  H.mine = []; H.handCards = PEOPLE.map((_, p) => (p ? [] : H.mine));
  updateHUD();
  toast(d ? `${S.names[d]} làm cái ván này` : 'Bạn làm cái ván này');
  await shuffleDeck(cards);
  const jobs = [], seats = seatIds().map(j => (d + 1 + j) % S.N).filter(q => xd.players.includes(q));
  for (let k = 0; k < 2; k++) for (const q of seats) { jobs.push(give(q, ev.hand[k])); await wait(xd.players.length > 6 ? 90 : 150); }
  await Promise.all(jobs);
  S.dealing = false;
  for (const q of xd.players) if (q && q !== d) setMood(bots[q], 'peek', 1.4); // everybody squeezes their cards
}
async function onTurn(ev) {
  xd.turn = L(ev.p);
}
async function onDraw(ev) {
  const p = L(ev.p);
  if (p) { setMood(bots[p], 'peek', 1); hideBubble(p); }
  await give(p, ev.id);
  if (p && H.handCards[p].length === MAX_CARDS) bubble(p, 'Đủ 5 lá!', 1200);
  updateHUD();
  await wait(200);
}
async function onStand(ev) {
  const p = L(ev.p);
  xd.stood.add(p);
  bubble(p, pick(['Dằn!', 'Đủ rồi~', 'Dừng nha']), 1200); sfx('pass');
  setMood(bots[p], 'shrug', 0.8);
  updateHUD();
  await wait(350);
}
async function onShow(ev) {
  const p = L(ev.p), d = xd.dealer, k = kind(ev.ids), text = describeHand(ev.ids), dealer = ev.delta == null, many = xd.players.length > 6;
  xd.text[p] = text;
  if (ev.xet) {
    bubble(d, `Xét ${S.names[p]}!`, 1200); sfx('pop');
    if (p === 0) toast('Nhà cái xét bài bạn!');
    await wait(500);
  }
  if (p) { hideBubble(p); claim(p, ev.ids); await reveal(p, { slow: dealer }); }
  else if (flipAll()) await wait(hidden().length * 120 + 400);
  if (BIG[k]) {
    banner(BIG[k], p === d ? `Nhà cái ${S.names[p]}` : S.names[p]);
    burst(p ? SEAT[p].clone().multiplyScalar(0.5).setY(0.6) : V(0, 1.2, 1.5), k === 'xibang' ? 110 : 60);
    if (k === 'xibang') fx.shake = 0.3;
  }
  if (dealer) bubble(p, text, 2400);
  else {
    const v = ev.delta;
    xd.res[p] = v;
    bubble(p, `${text} · ${star(v)}`, 2600);
    setMood(bots[p], v > 0 ? 'happy' : v < 0 ? 'sad' : 'idle', 1.6);
    setMood(bots[d], v < 0 ? 'happy' : v > 0 ? 'shock' : 'idle', 1.2);
    sfx(p === 0 ? (v > 0 ? 'win' : v < 0 ? 'lose' : 'pop') : v ? 'pop' : 'pass');
    if (p === 0 && v > 0) burst(V(0, 1.2, 1.5), 70, 1.1);
  }
  updateHUD();
  await wait(BIG[k] ? 1400 : many ? 450 : 800);
}
function endSub() {
  $('#endSub').textContent = `${S.names[xd.dealer]} làm cái. Ván sau: ${S.names[S.xdNext]} làm cái.`;
  renderSettings();
}
function onEnd(ev) {
  const r = xd, d = r.dealer, delta = rot(ev.delta);
  S.xdNext = L(ev.next);
  S.score = rot(ev.score);
  if (!S.room) store.set(scoreKey(), S.score);
  r.over = true; r.res[d] = delta[d];
  flipAll();
  updateHUD();
  setTimeout(() => {
    $('#endTitle').textContent = delta[0] > 0 ? 'Bạn thắng!' : delta[0] < 0 ? 'Bạn thua rồi' : 'Hòa vốn';
    endSub();
    const order = seatIds().map(k => (d + k) % S.N).filter(p => r.players.includes(p));
    $('#results').innerHTML = order.map((p, i) => resultRow(p, i, S.names[p], `${p === d ? 'Nhà cái · ' : ''}${r.text[p] ?? ''}`, star(delta[p]), S.score[p])).join('');
    if (xd === r && !S.busy) showEnd();
  }, 1500);
}

/* ---------- input ---------- */
// Any action first turns your face-down cards over; the table then says whether the move is allowed.
function act(a) {
  if (!myTurn()) return;
  flipAll();
  S.sent = true; updateHUD();
  S.net.send(a);
}
tags.forEach((t, p) => p && (t.onclick = t.onkeydown = e => {
  if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault?.();
  if (S.view === xidach && t.classList.contains('xet')) act({ type: 'check', p: abs(p) });
}));
const KEYS = { r: 'draw', d: 'stand', l: 'reveal' };

export const xidach = {
  labels: { hint: 'Lật bài', pass: 'Dằn', play: 'Rút' },
  thinkMood: 'peek',
  turn: () => (xd && !xd.over ? xd.turn : null),
  over: () => !!xd?.over,
  hud, label,
  events: { 'xd-deal': onDeal, 'xd-turn': onTurn, 'xd-draw': onDraw, 'xd-stand': onStand, 'xd-show': onShow, 'xd-end': onEnd },
  onSeats() { if (xd?.over) endSub(); },
  buttons: { play: () => act({ type: 'draw' }), pass: () => act({ type: 'stand' }), hint: () => act({ type: 'reveal' }) },
  key(e) {
    const k = e.key.toLowerCase();
    if (k === 'n') { if (flipAll()) sfx('flip'); return; }
    if (KEYS[k]) act({ type: KEYS[k] });
  },
  // Nặn bài: drag a face-down card upward to peel it open; let go past halfway (or just tap) to flip it.
  pointerdown(e) {
    const c = hitMine(e);
    if (!c?.userData.down) return;
    peel = { c, y0: e.clientY, moved: false };
    $('#c').setPointerCapture?.(e.pointerId);
  },
  pointermove(e) {
    if (!peel) return;
    const u = peel.c.userData, k = clamp((peel.y0 - e.clientY) / (innerHeight * 0.22), 0, 1);
    if (Math.abs(k - u.peel) > 0.02) { if (Math.abs(k - u.peel) > 0.09 || !peel.moved) sfx('peel'); peel.moved = true; u.peel = k; layoutHand(); }
    if (k >= 1) this.pointerup();
  },
  pointerup() {
    if (!peel) return;
    const { c, moved } = peel, u = c.userData;
    peel = null;
    if (!moved || u.peel >= 0.45) { flipCard(c); setTimeout(updateHUD, 350); }
    else { u.peel = 0; layoutHand(); }
  },
};
