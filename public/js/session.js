// The session: which game, solo or which room, and turning table events into state + animations.
// Events are queued and played one at a time, so animations never overlap.
import { TienLen } from '@shared/tienlen/table.js';
import { XiDach } from '@shared/xidach/table.js';
import { $, store } from './core/util.js';
import { S, L, rot, seatIds, turnNow, scoreKey } from './core/state.js';
import { sfx } from './core/audio.js';
import { soloTable, joinRoom } from './net.js';
import { PEOPLE, bots, setMood, showBuddies } from './scene/buddies.js';
import { bubble, toast, THINK, updateHUD, showTags } from './ui/hud.js';
import { renderGame, renderSettings, renderSeats, showRoom } from './ui/menu.js';
import { tienlen } from './games/tienlen.js';
import { xidach } from './games/xidach.js';

const TABLES = { tienlen: TienLen, xidach: XiDach }, VIEWS = { tienlen, xidach };
export const isGame = g => Object.hasOwn(TABLES, g);
const queue = [];

/* ---------- game + seats ---------- */
const botsKey = () => `${S.game}-bots`; // how many bots you like in solo, per game
const soloBots = () => { const T = TABLES[S.game]; return { n: Math.min(T.SEATS - 1, Math.max(1, store.get(botsKey(), T.DEFAULT_BOTS))), max: T.SEATS - 1 }; };
const loadScore = () => seatIds().map(i => store.get(scoreKey(), [])[i] ?? 0);

export function setGame(g) {
  S.game = g; S.N = TABLES[g].SEATS; S.view = VIEWS[g];
  if (!S.room) {
    S.score = loadScore();
    S.botInfo = soloBots();
    S.active = seatIds().map(p => p <= S.botInfo.n);
    S.names = PEOPLE.map(P => P.name);
    S.xdFixed = store.get('xd-dealer', null);
  }
  renderGame();
  applySeats();
  updateHUD();
}
function applySeats() { showBuddies(); showTags(); renderSettings(); }

function onSeats(ev) {
  if (S.room && ev.game !== S.game) setGame(ev.game); // first: the seat count depends on the game
  const seatNames = rot(ev.names), humans = ev.names.filter(n => n != null).length;
  S.names = seatNames.map((n, l) => (l ? n ?? PEOPLE[l].name : 'Bạn'));
  S.amHost = ev.host === S.me; S.hostSeat = L(ev.host);
  S.score = rot(ev.score);
  S.active = rot(seatIds().map(s => ev.players.includes(s)));
  S.botInfo = { n: Math.min(ev.bots, S.N - humans), max: S.N - humans };
  S.playing = ev.playing; S.waiting = ev.waiting.includes(S.me);
  if (!S.room) store.set(botsKey(), S.botInfo.n);
  if (ev.game === 'xidach') { S.xdFixed = ev.fixed; if (ev.next != null) S.xdNext = L(ev.next); if (!S.room) store.set('xd-dealer', S.xdFixed); }
  renderSeats(seatNames, ev.waiting.map(L), ev.last);
  applySeats();
  S.view.onSeats?.();
  updateHUD();
}

/* ---------- events ---------- */
export function onEvent(ev) {
  if (ev.type === 'hello') {
    Object.assign(S, { me: ev.seat, room: ev.room, cid: ev.cid });
    sessionStorage.setItem('room', ev.room); // a refresh brings you straight back to your seat
    showRoom();
  } else if (ev.type === 'seats') onSeats(ev);
  else if (ev.type === 'emote') onEmote(ev);
  else if (ev.type === 'error' && ev.fatal) {
    sessionStorage.removeItem('room');
    if (S.room) return backToMenu(ev.msg);
    S.net = null; // never got in: let them try again
    toast(ev.msg); sfx('error');
  } else if (ev.type === 'error') { toast(ev.msg); sfx('error'); S.sent = false; updateHUD(); renderSettings(); }
  else if (ev.type === 'lost') {
    if (ev.joined) return backToMenu('Mất kết nối — đang vào lại phòng…', true);
    sessionStorage.removeItem('room');
    S.net = null;
    toast('Không kết nối được máy chủ phòng');
  } else { queue.push(ev); pump(); }
}
async function pump() {
  if (S.busy) return;
  S.busy = true;
  while (queue.length) {
    const ev = queue.shift();
    S.sent = false;
    try { await S.view.events[ev.type]?.(ev); } catch (e) { console.error(e); }
  }
  S.busy = false;
  idle();
}
function idle() {
  updateHUD();
  const p = turnNow();
  if (p == null) return;
  if (p === 0) sfx('turn');
  else { setMood(bots[p], S.view.thinkMood, 60); bubble(p, THINK, 60000); }
}
function onEmote(ev) {
  const p = L(ev.p);
  bubble(p, ev.mood ? ev.text : `<span style="font-size:26px">${ev.text}</span>`, 1600);
  if (ev.mood) setMood(bots[p], ev.mood, 1);
  sfx('pop');
}

/* ---------- starting, settings, leaving ---------- */
export function startSolo() {
  S.net?.leave();
  S.net = soloTable(TABLES[S.game], { names: ['Bạn'], score: [...S.score], bots: S.botInfo.n, dealer: S.xdFixed }, onEvent);
  S.net.table.start();
}
export function startOnline(params) {
  if (S.net) return; // already connecting: a double click must not open two rooms
  const name = $('#nameIn').value.trim();
  store.set('tl-name', name);
  S.net = joinRoom({ name, ...params }, onEvent);
}
export function send(a) { S.net?.send(a); }

export function changeBots(d) {
  const n = S.botInfo.n + d;
  if (n < (S.room ? 0 : 1) || n > S.botInfo.max) return;
  if (S.net) return S.net.send({ type: 'bots', n }); // the table answers with a seats event
  S.botInfo.n = n; store.set(botsKey(), n);
  S.active = seatIds().map(p => p <= n);
  applySeats(); updateHUD();
}
export function changeDealer(v) {
  const p = v === '' ? null : +v;
  if (S.net) return S.net.send({ type: 'dealer', p });
  S.xdFixed = p; store.set('xd-dealer', p); renderSettings();
}
export function kick(seat) {
  const l = L(seat);
  if (confirm(`Mời ${S.names[l]} ra khỏi phòng? Người này sẽ không vào lại phòng được nữa.`)) S.net.send({ type: 'kick', p: seat });
}

// Leaving always reloads: the simplest way to get a clean table. rejoin keeps the room for the next page.
export function backToMenu(flash, rejoin = false) {
  if (!rejoin) { sessionStorage.removeItem('room'); S.net?.leave(); }
  if (flash) sessionStorage.setItem('flash', flash);
  location.reload();
}
