// Tiến Lên in the browser: replays the table's events into a local Match mirror and animates them.
// We only know our own cards; opponents get placeholder -1s and face-down stand-in meshes.
import { classify, beats, describe, choose, combos, Match } from '@shared/tienlen/rules.js';
import { rank, TWO, name } from '@shared/deck.js';
import { $, V, pick, wait, cap, store } from '../core/util.js';
import { S, L, rot, myTurn, scoreKey } from '../core/state.js';
import { sfx } from '../core/audio.js';
import { cards, H, layoutHand, layoutBot, toPile, sweep, claim, stackDeck, shuffleDeck, toHand, toFan, hitMine } from '../scene/cards.js';
import { bots, setMood, calmAll } from '../scene/buddies.js';
import { burst, fx } from '../scene/effects.js';
import { tags, tagCount, bubble, hideBubble, hideBubbles, banner, toast, updateHUD, setLabel } from '../ui/hud.js';
import { closeOverlays, showEnd, resultRow } from '../ui/menu.js';

const PASS_LINES = ['Bỏ~', 'Bỏ lượt', 'Thôi 🙅', 'Qua!', 'Hmm… bỏ'];
const FLAVOR = ['Hehe~', '✨', 'Tới bạn đó 😏', 'Nhận nè!', '🎵', 'Dễ ợt~'];
const MEDALS = ['Nhất', 'Nhì', 'Ba', 'Bét'];
let match = null, drag = null;

/* ---------- HUD ---------- */
function hud() {
  const m = match;
  for (let p = 0; p < 4; p++) {
    const n = m ? m.hands[p].length : 13, place = m ? m.done.indexOf(p) : -1;
    if (p) tags[p].querySelector('.nm').textContent = S.names[p];
    tagCount(p).textContent = m?.cong.includes(p) ? 'Cóng' : place < 0 ? n : place === m.players.length - 1 ? 'Bét' : MEDALS[place];
    tags[p].classList.toggle('active', !!m && !S.dealing && !m.over && m.turn === p);
    tags[p].classList.toggle('passed', !!m && !!m.cur && m.passed.has(p));
    tags[p].classList.toggle('low', place < 0 && n <= 2 && !!m);
  }
  const off = !myTurn();
  $('#playBtn').disabled = off; $('#hintBtn').disabled = off; $('#passBtn').disabled = off || !match.cur;
}
function label() {
  const ids = [...H.selected], c = classify(ids), cur = match?.cur;
  if (!match) return setLabel('Chạm để chọn lá, hoặc vuốt qua nhiều lá.');
  if (!ids.length) {
    return setLabel(myTurn()
      ? (cur ? `Chặn ${describe(cur)} — hoặc bỏ lượt` : match.must != null ? `Bạn đi trước — nước đầu phải có ${name(match.must)}` : 'Bạn được đi trước — đánh bộ nào cũng được')
      : cur ? `Trên bàn: ${describe(cur)}` : 'Đang chờ người đi trước…');
  }
  if (!c) return setLabel('Chưa thành bộ', 'bad');
  setLabel(cap(describe(c)), beats(c, cur) && (match.must == null || ids.includes(match.must)) ? 'good' : 'bad');
}

/* ---------- events ---------- */
async function dealAnim(hands, starter) {
  S.dealing = true;
  H.selected.clear(); H.hover = null; H.pile = []; H.pileY = 0.02;
  const order = [];
  for (let k = 0; k < 13; k++) for (let j = 0; j < 4; j++) { const p = (starter + j) % 4; if (k < hands[p].length) order.push([p, hands[p][k], k]); }
  const dealt = new Set(order.map(o => o[1]));
  H.spare = cards.filter(c => !dealt.has(c.userData.id)); // undealt with fewer players: hidden stand-ins
  for (const c of H.spare) { stackDeck([c]); c.visible = false; }
  const deck = order.map(([, id]) => cards[id]).reverse(); // first dealt on top
  stackDeck(deck);
  H.mine = hands[0].map(id => cards[id]);
  H.handCards = hands.map(h => h.map(id => cards[id]));
  H.handCards[0] = H.mine;
  layoutHand(); updateHUD();
  await shuffleDeck(deck);
  const jobs = [];
  for (const [p, id, i] of order) {
    jobs.push(p ? toFan(p, cards[id], i, hands[p].length) : toHand(cards[id]));
    sfx('flick');
    await wait(40);
  }
  await Promise.all(jobs);
  S.dealing = false;
}

async function onDeal(ev) {
  closeOverlays(); calmAll(); hideBubbles();
  const players = ev.players.map(L), starter = L(ev.starter), rest = [...Array(52).keys()].filter(id => !ev.hand.includes(id));
  const hands = [0, 1, 2, 3].map(l => (l === 0 ? ev.hand : players.includes(l) ? rest.splice(0, 13) : []));
  match = new Match(hands.map((h, l) => (l ? h.map(() => -1) : [...h])), starter, ev.must, players);
  await dealAnim(hands, starter);
  if (ev.toi) return toiTrang(L(ev.toi.p), ev.toi);
  if (ev.must != null) toast(starter ? `${S.names[starter]} có ${name(ev.must)} nên đi trước` : `Bạn có ${name(ev.must)} — bạn đi trước!`);
  else toast(starter ? `${S.names[starter]} thắng ván trước nên đi trước` : 'Bạn thắng ván trước — bạn đi trước!');
}

// Someone was dealt an instant win: show their hand on the table, the game ends there.
async function toiTrang(p, { why, cards: ids }) {
  if (p) claim(p, ids);
  match.win(p, why);
  banner('TỚI TRẮNG!', `${S.names[p]} có ${why}`);
  sfx(p ? 'lose' : 'win'); burst(V(0, 0.3, 0), 90);
  if (p) { setMood(bots[p], 'happy', 3); bubble(p, 'Tới trắng! 🎉', 2200); }
  await toPile(ids);
}

async function doPlay(p, ids) {
  const m = match;
  if (p) { setMood(bots[p], 'idle', 0); hideBubble(p); claim(p, ids); m.hands[p].splice(0, ids.length, ...ids); }
  const res = m.play(p, ids), gone = new Set(ids);
  if (p === 0) { H.mine = H.mine.filter(c => !gone.has(c.userData.id)); H.handCards[0] = H.mine; H.selected.clear(); H.hover = null; }
  else H.handCards[p] = H.handCards[p].filter(c => !gone.has(c.userData.id));
  updateHUD();
  sfx('whoosh');
  const flight = toPile(ids);
  if (p === 0) layoutHand(); else layoutBot(p);
  await flight;
  sfx('land');
  react(p, res);
  await wait(res.chop ? 1000 : 280);
  if (res.reset && !m.over) { await wait(450); await sweep(p); }
}

async function doPass(p) {
  const m = match, res = m.pass(p);
  bubble(p, pick(PASS_LINES), 1300); sfx('pass');
  setMood(bots[p], 'shrug', 0.8);
  updateHUD();
  await wait(p ? 420 : 200);
  if (res.reset) {
    await wait(350); await sweep(m.last);
    if (m.turn === 0) toast('Hết vòng — bạn được đi trước!'); else bubble(m.turn, pick(['Tới mình~', 'Mình đi nhé!', 'Hehe, lượt mình']), 1200);
  }
}

function react(p, res) {
  const m = match, c = res.combo, others = [1, 2, 3].filter(q => q !== p && m.live(q)), names = S.names;
  if (res.chop) {
    banner('CHẶT!', `${names[p]} chặt bằng ${describe(c)}`);
    sfx('boom'); fx.shake = 0.35; burst(V(0, 0.3, 0), 60);
    if (p) { setMood(bots[p], 'happy', 1.6); bubble(p, pick(['Chặt nè! 💥', 'Bùm! 💣', 'Hehe~ 😼']), 1800); }
    if (res.victim) { setMood(bots[res.victim], 'shock', 1.8); bubble(res.victim, pick(['😱', 'Ơ kìa!', 'Không!! 😭']), 1800); }
    else others.forEach(q => setMood(bots[q], 'happy', 1));
  } else if (rank(c.top) === TWO) {
    banner('Heo!', c.n > 1 ? 'đôi heo 🐷🐷' : 'heo ra bàn 🐷'); sfx('pig');
    if (others.length) { const q = pick(others); setMood(bots[q], 'shock', 1); bubble(q, pick(['😮', 'Ồ!', 'Ụt ịt?!']), 1200); }
  } else if (c.n >= 5) {
    burst(V(0, 0.2, 0), 24, 0.6);
  }
  if (res.finished) {
    const place = m.done.indexOf(p);
    if (place === 0) {
      banner(p ? `${names[p]} về nhất!` : 'Bạn thắng!', 'Về nhất 🥇');
      sfx(p ? 'lose' : 'win');
      burst(p ? bots[p].g.position.clone().setY(1.5) : V(0, 1.2, 1.5), p ? 70 : 150, p ? 0.9 : 1.4);
    } else if (p === 0) toast(`Bạn về ${['nhất', 'nhì', 'ba'][place]}!`);
    if (p) { setMood(bots[p], 'happy', 3); bubble(p, place === 0 ? pick(['Mình thắng! 🎉', 'Về nhất! 🥇']) : 'Xong! ✨', 2200); }
    if (place === 0) for (const q of m.cong) q ? bubble(q, 'Cóng rồi 😱', 2200) : toast('Bạn bị cóng! 😱');
  } else if (m.hands[p].length === 1) {
    bubble(p, 'Báo 1 lá! ☝️', 1800);
    if (p) others.forEach(q => setMood(bots[q], 'shock', 0.8));
  } else if (p && !res.chop && Math.random() < 0.18) bubble(p, pick(FLAVOR), 1200);
}

function onEnd(ev) {
  const m = match, names = S.names, result = ev.result.map(r => ({ ...r, p: L(r.p) }));
  S.score = rot(ev.score);
  if (!S.room) store.set(scoreKey(), S.score);
  m.done.forEach((p, i) => {
    if (!p) return;
    const last = i === m.done.length - 1;
    setMood(bots[p], i === 0 ? 'happy' : last ? 'sad' : 'idle', 5);
    if (last) bubble(p, pick(['Ván sau biết tay 😤', 'Huhu 😭', 'Làm ván nữa!']), 3000);
  });
  updateHUD();
  setTimeout(() => {
    const won = m.done[0] === 0, place = m.done.indexOf(0);
    $('#endTitle').textContent = won ? 'Bạn thắng!' : `${names[m.done[0]]} thắng!`;
    $('#endSub').textContent = m.toi ? `${names[m.done[0]]} tới trắng với ${m.toi}.`
      : won ? 'Về nhất! Mấy bạn đòi phục thù kìa.'
      : place === m.done.length - 1 ? 'Về bét thì bao cả bàn trà sữa nha 🧋' : `Bạn về ${['nhất', 'nhì', 'ba'][place]}. Suýt nữa rồi!`;
    $('#results').innerHTML = result.map(({ p, pts, notes }, i) => resultRow(p, i, names[p], notes.join(' · '), `${pts > 0 ? '+' : ''}${pts} ★`, S.score[p])).join('');
    if (match === m && !S.busy) showEnd();
  }, 1900);
}

/* ---------- input ---------- */
function tryPlay() {
  if (!myTurn()) return;
  const ids = [...H.selected], err = ids.length ? match.check(0, ids) : 'Chọn lá bài trước đã';
  if (err) { toast(err); sfx('error'); return; }
  S.sent = true; updateHUD();
  S.net.send({ type: 'play', ids });
}
function tryPass() {
  if (!myTurn() || !match.cur) return;
  H.selected.clear(); layoutHand();
  S.sent = true; updateHUD();
  S.net.send({ type: 'pass' });
}
function hint() {
  if (!myTurn()) return;
  const h = match.hands[0];
  const ids = choose(h, match.cur, { must: match.must }) ??
    combos(h).filter(c => beats(c, match.cur)).sort((a, b) => a.top - b.top)[0]?.cards;
  if (!ids) { toast('Không có bộ nào chặn được — bỏ lượt thôi'); return; }
  H.selected.clear(); ids.forEach(id => H.selected.add(id));
  sfx('select'); layoutHand(); label();
}
function setSel(id, on) {
  if (on === H.selected.has(id)) return;
  on ? H.selected.add(id) : H.selected.delete(id);
  sfx(on ? 'select' : 'unselect'); layoutHand(); label();
}

export const tienlen = {
  labels: { hint: 'Gợi ý', pass: 'Bỏ lượt', play: 'Đánh' },
  thinkMood: 'think',
  turn: () => (match && !match.over ? match.turn : null),
  over: () => !!match?.over,
  hud, label,
  events: { deal: onDeal, play: e => doPlay(L(e.p), e.ids), pass: e => doPass(L(e.p)), end: onEnd },
  buttons: { play: tryPlay, pass: tryPass, hint },
  key(e) {
    if (e.key === 'Enter') tryPlay();
    else if (e.key === ' ') { e.preventDefault(); tryPass(); }
    else if (e.key.toLowerCase() === 'h') hint();
    else if (e.key === 'Escape') { H.selected.clear(); layoutHand(); label(); }
  },
  // Tap a card to (un)select it, or swipe across several.
  pointerdown(e) {
    const c = hitMine(e);
    if (!c) return;
    const id = c.userData.id;
    drag = { mode: !H.selected.has(id), seen: new Set([id]) };
    setSel(id, drag.mode);
  },
  pointermove(e) {
    const c = hitMine(e);
    if (drag && c && !drag.seen.has(c.userData.id)) { drag.seen.add(c.userData.id); setSel(c.userData.id, drag.mode); }
    if (e.pointerType === 'mouse' && c !== H.hover) { H.hover = c; layoutHand(); $('#c').style.cursor = c ? 'pointer' : ''; }
  },
  pointerup() { drag = null; },
};
