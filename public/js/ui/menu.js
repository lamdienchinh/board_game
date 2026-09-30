// The overlay panels: main menu (game picker + tabs), room, end of round, rules. Rendering only —
// main.js wires the buttons to the session.
import { $, $$, esc, store } from '../core/util.js';
import { S, seatIds, L, abs } from '../core/state.js';
import { PEOPLE } from '../scene/buddies.js';

export const GAME_NAMES = { tienlen: 'Tiến Lên', xidach: 'Xì Dách' };
const TABS = ['solo', 'online', 'rules', 'account'];

/* ---------- tabs ---------- */
export function setTab(tab) {
  if (!TABS.includes(tab)) tab = 'solo';
  for (const t of TABS) {
    $(`#tab-${t}`).setAttribute('aria-selected', t === tab);
    $(`#tab-${t}`).tabIndex = t === tab ? 0 : -1;
    $(`#pane-${t}`).hidden = t !== tab;
  }
  if (tab === 'rules') $('#rulesHome').append($('#rulesBox'));
  store.set('menu-tab', tab);
}
export const currentTab = () => TABS.find(t => !$(`#pane-${t}`).hidden);
// Arrow keys move between tabs, like a native tab strip.
export function tabKeys(e) {
  const i = TABS.indexOf(currentTab()), d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
  if (!d || !e.target.closest('[role=tab]')) return;
  const t = TABS[(i + d + TABS.length) % TABS.length];
  setTab(t); $(`#tab-${t}`).focus();
}

/* ---------- game picker, rules, buttons ---------- */
export function renderGame() {
  const g = S.game;
  for (const b of $$('#games button')) b.setAttribute('aria-checked', b.dataset.game === g);
  for (const u of $$('.rules')) u.hidden = u.dataset.game !== g;
  $('#helpTitle').textContent = `Luật ${GAME_NAMES[g]}`;
  const { hint, pass, play } = S.view.labels;
  $('#hintBtn').textContent = hint; $('#passBtn').textContent = pass; $('#playBtn').textContent = play;
  $('#hintBtn').hidden = $('#passBtn').hidden = false;
  $('#friends').innerHTML = PEOPLE.slice(1, S.N).map(P => `<div class="friend"><i class="av" style="--c:${P.color}"></i><b>${P.name}</b><small>${P.desc}</small></div>`).join('');
}
export function openHelp() { $('#help .panel').insertBefore($('#rulesBox'), $('#helpClose')); $('#help').hidden = false; $('#helpClose').focus(); }
export function closeHelp() { $('#help').hidden = true; if (currentTab() === 'rules') $('#rulesHome').append($('#rulesBox')); }

/* ---------- table settings (bots, dealer) — shown in the menu, the room and the end panel ---------- */
export function renderSettings() {
  $$('.friend').forEach((f, i) => f.classList.toggle('off', !S.active[i + 1]));
  const min = S.room ? 0 : 1;
  for (const el of $$('.botctl')) {
    const [minus, plus] = el.querySelectorAll('button');
    el.querySelector('b').textContent = S.botInfo.n;
    minus.disabled = !S.amHost || S.botInfo.n <= min;
    plus.disabled = !S.amHost || S.botInfo.n >= S.botInfo.max;
  }
  // Xì dách dealer (absolute seat or null = rotate). Before a solo table exists we work out the next dealer ourselves.
  const pinned = S.xdFixed != null && S.active[L(S.xdFixed)];
  if (!S.net) S.xdNext = pinned ? L(S.xdFixed) : seatIds().find(l => l && S.active[l]);
  const opts = '<option value="">Xoay vòng mỗi ván</option>' +
    seatIds().filter(l => S.active[l]).map(l => `<option value="${abs(l)}">Luôn là ${esc(S.names[l])}</option>`).join('');
  for (const el of $$('.dealerctl')) {
    el.hidden = S.game !== 'xidach';
    const sel = el.querySelector('select');
    sel.innerHTML = opts; sel.value = pinned ? S.xdFixed : ''; sel.disabled = !S.amHost;
    el.querySelector('small').textContent = S.xdNext != null ? `Ván tới: ${S.names[S.xdNext]} làm cái` : '';
  }
}

/* ---------- room ---------- */
// seatNames: by local seat, null where no human sits. waiting: local seats that join from the next round.
// last: the table's summary of the previous round (absolute seats), so newcomers see how it went.
export function renderSeats(seatNames, waiting, last) {
  $('#roomGame').textContent = GAME_NAMES[S.game];
  $('#seatList').innerHTML = seatNames.map((n, l) => {
    const cls = [l ? (S.active[l] ? '' : 'empty') : 'me', waiting.includes(l) ? 'waiting' : ''].join(' ');
    const who = l ? (n ? 'người chơi' : S.active[l] ? 'máy' : '') : 'bạn';
    const kick = S.amHost && l && n ? `<button class="kick" data-seat="${abs(l)}" aria-label="Mời ${esc(n)} ra khỏi phòng">Mời ra</button>` : '';
    return `<li class="${cls}"><span class="med">${l + 1}</span><i class="av" style="--c:${PEOPLE[l].color}"></i><b>${esc(n ?? (S.active[l] ? PEOPLE[l].name : 'Ghế trống'))}</b><em>${S.active[l] || n ? `★${S.score[l]} · ` : ''}${who}${l === S.hostSeat ? ' · chủ phòng' : ''}${kick}</em></li>`;
  }).join('');
  const status = $('#roomStatus'), after = !S.playing && !!last;
  status.hidden = !S.waiting && !after;
  status.textContent = S.waiting ? 'Ván đang diễn ra — máy đang chơi thay bạn. Bạn sẽ vào bàn từ ván sau.'
    : S.amHost ? 'Ván vừa kết thúc — bấm Bắt đầu để chia ván mới.' : 'Ván vừa kết thúc — chờ chủ phòng chia ván mới.';
  $('#roomLast').hidden = !last;
  if (last) $('#lastList').innerHTML = last.rows.map((r, i) => resultRow(L(r.p), i, S.names[L(r.p)], r.note, `${r.pts > 0 ? '+' : r.pts < 0 ? '−' : ''}${Math.abs(r.pts)} ★`, S.score[L(r.p)])).join('');
  syncHost();
}
// Only the host can deal; everyone else waits for them.
export function syncHost() {
  const midRound = S.playing && !S.waiting;
  $('#roomStart').hidden = midRound;
  $('#roomClose').hidden = !midRound;
  $('#roomStart').disabled = $('#againBtn').disabled = !S.amHost || S.playing;
  $('#roomStart').textContent = S.playing ? 'Chờ ván này kết thúc…' : S.amHost ? 'Bắt đầu' : 'Chờ chủ phòng bắt đầu…';
  $('#againBtn').textContent = S.amHost ? 'Chơi ván mới' : 'Chờ chủ phòng chia ván mới…';
}
export function showRoom() {
  $('#start').hidden = true; $('#room').hidden = false;
  $('#roomCode').textContent = S.room;
  $('#peopleBtn').hidden = false;
  syncHost();
  ($('#roomStart').hidden ? $('#roomClose') : $('#roomStart')).focus();
}

/* ---------- end of round ---------- */
export function showEnd() {
  $('#endLeave').textContent = S.room ? 'Rời phòng' : 'Về menu';
  syncHost();
  $('#end').hidden = false;
  (S.amHost ? $('#againBtn') : $('#endLeave')).focus();
}
export const closeOverlays = () => { $('#start').hidden = $('#end').hidden = $('#room').hidden = true; };
// One row of the results list.
export const resultRow = (p, i, title, note, value, total) =>
  `<li class="${p ? '' : 'me'}"><span class="med">${i + 1}</span><i class="av" style="--c:${PEOPLE[p].color}"></i><b>${esc(title)}${note ? `<small>${esc(note)}</small>` : ''}</b><em>${value}<small>tổng ${total}</small></em></li>`;

/* ---------- online lobby ---------- */
export function renderRooms(list) {
  $('#roomCount').textContent = list.length ? `${list.length} phòng` : '';
  $('#roomList').innerHTML = list.length
    ? list.map(r => `<li><b>${esc(r.code)}</b><span>${GAME_NAMES[r.game] ?? ''} · ${esc(r.players.join(', '))} · ${r.players.length}/${r.seats}</span>`
      + `<i class="badge ${r.playing ? 'busy' : ''}">${r.playing ? 'đang chơi' : 'đang chờ'}</i><button class="btn ghost" data-code="${esc(r.code)}">Vào</button></li>`).join('')
    : '<li class="empty">Chưa có phòng nào — tạo một phòng đi!</li>';
}
export function setOffline(off) {
  $('#offline').hidden = !off;
  $('#online').hidden = off;
}

export function renderStats() {
  const mine = k => store.get(k, [])[0] ?? 0;
  $('#stats').innerHTML = `<div><b>★${mine('tl-score')}</b><small>Tiến Lên với máy</small></div><div><b>★${mine('xd-score')}</b><small>Xì Dách với máy</small></div>`;
}
