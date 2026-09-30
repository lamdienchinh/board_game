// Xì dách (Vietnamese blackjack) hands: points, special hands and who wins against the dealer.
import { ACE, TWO, rank } from '../deck.js';

export const MIN_PLAYER = 16, MIN_DEALER = 15, MAX_CARDS = 5;
const isAce = c => rank(c) === ACE;
const val = c => { const r = rank(c); return r === TWO ? 2 : r <= 7 ? r + 3 : 10; }; // J Q K = 10
const MULT = { xibang: 3, xidach: 2, ngulinh: 2, thuong: 1, quac: 1 };

// An ace is 11 or 10 in a 2-card hand, 10 or 1 in a 3-card hand, 1 after that; take the best total ≤ 21.
export function points(h) {
  const aces = h.filter(isAce).length, base = h.reduce((a, c) => a + (isAce(c) ? 0 : val(c)), 0);
  const [hi, lo] = h.length <= 2 ? [11, 10] : h.length === 3 ? [10, 1] : [1, 1];
  let best = base + aces * lo;
  for (let k = 1; k <= aces; k++) { const t = base + k * hi + (aces - k) * lo; if (t <= 21 && t > best) best = t; }
  return best;
}

export function kind(h) {
  const aces = h.filter(isAce).length;
  if (h.length === 2 && aces === 2) return 'xibang';
  if (h.length === 2 && aces === 1 && h.some(c => !isAce(c) && val(c) === 10)) return 'xidach';
  if (points(h) > 21) return 'quac';
  return h.length === MAX_CARDS ? 'ngulinh' : 'thuong';
}
export const special = h => ['xibang', 'xidach'].includes(kind(h));
// xì bàng > xì dách > ngũ linh > 21 > … ; quắc is below everything. Equal kinds tie (two ngũ linh → hòa).
const strength = h => ({ xibang: 100, xidach: 90, ngulinh: 80, quac: -1 })[kind(h)] ?? points(h);

// Stars the player wins (+) or pays (−) against the dealer. The winner's hand sets the multiplier.
export function versus(ph, dh) {
  const a = kind(ph), b = kind(dh);
  if (a === 'quac' && b === 'quac') return 0; // both bust → hòa
  const d = strength(ph) - strength(dh);
  return d > 0 ? MULT[a] : d < 0 ? -MULT[b] : 0;
}

export function describeHand(h) {
  const p = points(h);
  return { xibang: 'Xì bàng', xidach: 'Xì dách', ngulinh: `Ngũ linh ${p} điểm`, quac: `Quắc ${p} điểm` }[kind(h)] ?? `${p} điểm`;
}

