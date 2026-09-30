// The HTML layer over the 3D table: name tags and speech bubbles that follow the buddies, banner, toast, scores.
import { $, clamp, esc } from '../core/util.js';
import { S } from '../core/state.js';
import { camera } from '../scene/stage.js';
import { PEOPLE, bots } from '../scene/buddies.js';

export const anchors = [], tags = [], bubs = [];
const timers = [];
for (let p = 0; p < PEOPLE.length; p++) {
  const a = document.createElement('div');
  a.className = 'anchor';
  a.innerHTML = `<div class="stack"><div class="bubble"></div>${p ? `<div class="tag"><i class="av" style="--c:${PEOPLE[p].color}"></i><span class="nm"></span><em>13</em></div>` : ''}</div>`;
  $('#anchors').append(a);
  anchors[p] = a; bubs[p] = a.querySelector('.bubble'); tags[p] = a.querySelector('.tag');
}
tags[0] = $('#meTag');
export const tagCount = p => (p ? tags[p].querySelector('em') : $('#meCount'));

export function bubble(p, html, ms = 1600) {
  bubs[p].innerHTML = html; bubs[p].classList.add('show');
  clearTimeout(timers[p]); timers[p] = setTimeout(() => bubs[p].classList.remove('show'), ms);
}
export const hideBubble = p => { clearTimeout(timers[p]); bubs[p].classList.remove('show'); };
export const hideBubbles = () => PEOPLE.forEach((_, p) => hideBubble(p));
export const THINK = '<span class="dots" aria-label="đang nghĩ"><i></i><i></i><i></i></span>';

export function banner(big, small = '') {
  const el = $('#banner');
  el.innerHTML = `<b>${esc(big)}</b>${small ? `<span>${esc(small)}</span>` : ''}`;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}
let toastT;
export function toast(msg, ms = 2200) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), ms);
}

// Show the tags of the seats in play.
export function showTags() {
  for (let p = 1; p < PEOPLE.length; p++) anchors[p].hidden = !(p < S.N && S.active[p]);
  $('#anchors').classList.toggle('many', S.active.filter(Boolean).length > 4);
}

// Redraw everything that depends on the game state.
export function updateHUD() {
  S.view?.hud();
  const many = S.active.filter(Boolean).length > 4;
  $('#scores').classList.toggle('many', many);
  $('#scores').innerHTML = PEOPLE.slice(0, S.N).map((P, p) => !S.active[p] ? '' : `<span class="chip"><i class="av" style="--c:${P.color}"></i><span class="nm">${esc(S.names[p])}</span><b>★${S.score[p]}</b></span>`).join('');
  S.view?.label();
}
export function setLabel(text, state = '') {
  const el = $('#label');
  el.textContent = text; el.dataset.state = state;
}

// Name tags follow their buddy's head, then get nudged apart along the axis they overlap least,
// kept on screen between the top bar and your hand. Sizes are read before any write.
// ponytail: pairwise O(n²) relaxation, fine for ≤ 10 tags.
export function placeTags() {
  const gap = 6, top = $('#top').getBoundingClientRect().bottom + gap, bottom = innerHeight - S.handTopPx - gap, box = [];
  for (let p = 1; p < S.N; p++) {
    if (anchors[p].hidden) continue;
    const W = bots[p].g.position.clone().setY(2.25).project(camera);
    // a showing speech bubble sits on top of the tag, so it counts as part of the box
    const talk = bubs[p].classList.contains('show'), w = Math.max(tags[p].offsetWidth, talk ? bubs[p].offsetWidth : 0) + gap;
    const h = tags[p].offsetHeight + (talk ? bubs[p].offsetHeight + 6 : 0) + gap;
    box.push({ p, w, h, x: (W.x + 1) / 2 * innerWidth, cy: (1 - W.y) / 2 * innerHeight - h / 2 });
  }
  const fit = b => { b.x = clamp(b.x, b.w / 2, innerWidth - b.w / 2); b.cy = clamp(b.cy, top + b.h / 2, Math.max(top, bottom - b.h / 2)); };
  const tight = bottom - top < 2.5 * Math.max(0, ...box.map(b => b.h)); // no vertical room: spread sideways
  for (let it = 0; it < 24; it++) {
    box.forEach(fit);
    let moved = false;
    for (let i = 0; i < box.length; i++) for (let j = i + 1; j < box.length; j++) {
      const a = box[i], b = box[j], ox = (a.w + b.w) / 2 - Math.abs(a.x - b.x), oy = (a.h + b.h) / 2 - Math.abs(a.cy - b.cy);
      if (ox <= 0 || oy <= 0) continue;
      moved = true;
      if (ox < oy || tight) { const d = (a.x < b.x ? -ox : ox) / 2; a.x += d; b.x -= d; }
      else { const d = (a.cy < b.cy ? -oy : oy) / 2; a.cy += d; b.cy -= d; }
    }
    if (!moved) break;
  }
  for (const b of box) { fit(b); anchors[b.p].style.transform = `translate(${b.x}px, ${b.cy + b.h / 2}px)`; }
  anchors[0].style.transform = `translate(${innerWidth / 2}px, ${innerHeight - S.handTopPx}px)`;
}
