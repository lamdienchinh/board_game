// Entry point: wires the DOM to the session and runs the render loop.
import * as THREE from 'three';
import { EMOTES } from '@shared/table.js';
import { $, $$, V, rnd, store } from './core/util.js';
import { S } from './core/state.js';
import { sfx, unlockAudio, isMuted, setMuted } from './core/audio.js';
import { api } from './net.js';
import { renderer, scene, camera, camHome, fitCamera } from './scene/stage.js';
import { stepTweens } from './scene/tween.js';
import { animateBuddies } from './scene/buddies.js';
import { layoutHand, stepHand, updateCovers, stackDeck } from './scene/cards.js';
import { fx, stepEffects } from './scene/effects.js';
import { bubble, toast, placeTags } from './ui/hud.js';
import { setTab, tabKeys, openHelp, closeHelp, renderRooms, setOffline, renderStats, showRoom } from './ui/menu.js';
import { initAccount, logout } from './ui/account.js';
import * as session from './session.js';

/* ---------- menu ---------- */
$('#games').onclick = e => { const g = e.target.closest('button')?.dataset.game; if (g) { store.set('tl-game', g); session.setGame(g); } };
$('.tabs').onclick = e => { const t = e.target.closest('[role=tab]')?.dataset.tab; if (t) { setTab(t); refreshRooms(); } };
$('.tabs').onkeydown = tabKeys;
$('#accountChip').onclick = () => setTab('account');
$('#startBtn').onclick = () => { unlockAudio(); session.startSolo(); };
$('#createBtn').onclick = () => { unlockAudio(); session.startOnline({ game: S.game }); };
$('#joinBtn').onclick = () => {
  const code = $('#codeIn').value.trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) return toast('Mã phòng gồm 4 chữ cái');
  unlockAudio(); session.startOnline({ room: code });
};
$('#roomList').onclick = e => { const code = e.target.closest('button')?.dataset.code; if (code) { unlockAudio(); session.startOnline({ room: code }); } };
$('#logoutBtn').onclick = logout;
$('#resetBtn').onclick = () => {
  if (!confirm('Xóa hết sao khi chơi với máy?')) return;
  store.set('tl-score', []); store.set('xd-score', []);
  renderStats(); session.setGame(S.game);
};
for (const el of $$('.dealerctl select')) el.onchange = e => session.changeDealer(e.target.value);
for (const el of $$('.botctl')) el.onclick = e => { const d = +e.target.closest('button')?.dataset.d; if (d) session.changeBots(d); };

/* ---------- room + end ---------- */
$('#seatList').onclick = e => { const b = e.target.closest('.kick'); if (b) session.kick(+b.dataset.seat); };
$('#copyBtn').onclick = () => navigator.clipboard?.writeText(S.room).then(() => toast('Đã chép mã phòng'), () => {});
$('#roomStart').onclick = () => session.send({ type: 'start' });
$('#againBtn').onclick = () => { unlockAudio(); session.send({ type: 'start' }); };
$('#roomClose').onclick = () => ($('#room').hidden = true);
$('#peopleBtn').onclick = showRoom;
$('#roomLeave').onclick = $('#endLeave').onclick = () => session.backToMenu();

/* ---------- in game ---------- */
$('#helpBtn').onclick = openHelp;
$('#helpClose').onclick = closeHelp;
$('#playBtn').onclick = () => S.view.buttons.play();
$('#passBtn').onclick = () => S.view.buttons.pass();
$('#hintBtn').onclick = () => S.view.buttons.hint();

const muteBtn = $('#muteBtn'), soundIn = $('#soundIn');
const syncMute = () => {
  muteBtn.setAttribute('aria-pressed', isMuted()); muteBtn.setAttribute('aria-label', isMuted() ? 'Bật âm thanh' : 'Tắt âm thanh');
  soundIn.checked = !isMuted();
};
muteBtn.onclick = () => { setMuted(!isMuted()); syncMute(); unlockAudio(); sfx('pop'); };
soundIn.onchange = () => { setMuted(!soundIn.checked); syncMute(); unlockAudio(); sfx('pop'); };
syncMute();

const emotes = $('#emotes'), emoteBtn = $('#emoteBtn');
emotes.innerHTML = Object.keys(EMOTES).map(k => `<button aria-label="Gửi ${k}">${k}</button>`).join('');
emoteBtn.onclick = () => { emotes.hidden = !emotes.hidden; emoteBtn.setAttribute('aria-expanded', !emotes.hidden); };
emotes.onclick = e => {
  const k = e.target.closest('button')?.textContent;
  if (!k) return;
  emotes.hidden = true; emoteBtn.setAttribute('aria-expanded', false);
  unlockAudio();
  if (S.net) S.net.send({ type: 'emote', k }); else { sfx('pop'); bubble(0, `<span style="font-size:26px">${k}</span>`, 1600); }
};

const canvas = $('#c');
canvas.addEventListener('pointerdown', e => S.view.pointerdown(e));
canvas.addEventListener('pointermove', e => S.view.pointermove(e));
addEventListener('pointerup', () => S.view.pointerup());
addEventListener('pointercancel', () => S.view.pointerup());
addEventListener('keydown', e => {
  if (e.target.closest?.('input')) {
    if (e.key === 'Enter') (e.target.id === 'codeIn' ? $('#joinBtn') : $('#createBtn')).click();
    return;
  }
  if (e.key === 'Escape' && !$('#help').hidden) return closeHelp();
  if (e.target.closest?.('button, select, [role=button]') && (e.key === 'Enter' || e.key === ' ')) return;
  if (!$('#start').hidden) return; // menu open: no game keys
  S.view.key(e);
});

/* ---------- online lobby ---------- */
async function refreshRooms() {
  if ($('#start').hidden || $('#pane-online').hidden) return;
  try { renderRooms(await api('rooms')); } catch {}
}

/* ---------- layout + loop ---------- */
function resize() { fitCamera(); layoutHand(); }
addEventListener('resize', resize);
resize();
stackDeck(); // the deck waits in the middle of the table until you sit down

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  S.now += dt;
  stepTweens(dt);
  stepHand(dt);
  animateBuddies(dt);
  stepEffects(dt);
  camera.position.copy(camHome);
  if (fx.shake > 0) camera.position.add(V(rnd(-1, 1), rnd(-1, 1), 0).multiplyScalar(fx.shake));
  camera.updateMatrixWorld();
  updateCovers();
  placeTags();
  renderer.render(scene, camera);
});

/* ---------- boot ---------- */
const saved = store.get('tl-game');
session.setGame(session.isGame(saved) ? saved : 'tienlen');
setTab(store.get('menu-tab', 'solo'));
renderStats();
$('#nameIn').value = store.get('tl-name', '');
const flash = sessionStorage.getItem('flash');
if (flash) { sessionStorage.removeItem('flash'); toast(flash, 3200); }

const online = await initAccount();
setOffline(!online);
if (online) {
  refreshRooms();
  setInterval(refreshRooms, 3000);
  const back = sessionStorage.getItem('room'); // refreshed (or lost the connection) while in a room
  if (back) session.startOnline({ room: back });
}
