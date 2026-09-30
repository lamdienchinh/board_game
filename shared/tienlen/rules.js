// Tiến Lên Miền Nam rules: combos, who beats whom, tới trắng, scoring and a greedy bot.
import { RANKS, TWO, rank, suit, name, asc, shuffle } from '../deck.js';

const isBomb = c => c.type === 'quad' || c.type === 'pairs';

export function deal(rng = Math.random) {
  const d = shuffle(rng);
  return [0, 1, 2, 3].map(p => d.slice(p * 13, p * 13 + 13).sort(asc));
}

export function classify(cards) {
  const n = cards.length;
  if (!n) return null;
  const cs = [...cards].sort(asc), rs = cs.map(rank), top = cs[n - 1];
  if (rs.every(r => r === rs[0])) return n <= 4 ? { type: ['single', 'pair', 'triple', 'quad'][n - 1], n, top } : null;
  if (rs[n - 1] === TWO) return null; // 2s never sit in a run
  if (n >= 3 && rs.every((r, i) => !i || r === rs[i - 1] + 1)) return { type: 'straight', n, top };
  if (n >= 6 && n % 2 === 0 && rs.every((r, i) => (i % 2 ? r === rs[i - 1] : !i || r === rs[i - 2] + 1))) return { type: 'pairs', n, top };
  return null;
}

// Does combo a beat combo b (b = null means a fresh lead)?
export function beats(a, b) {
  if (!a) return false;
  if (!b) return true;
  if (a.type === b.type && a.n === b.n) return a.top > b.top;
  const pig = rank(b.top) === TWO;
  const big = a.type === 'quad' || (a.type === 'pairs' && a.n >= 8);
  if (b.type === 'single' && pig) return isBomb(a);                 // any bomb chops a single 2
  if ((b.type === 'pair' && pig) || (b.type === 'pairs' && b.n === 6)) return big;
  if (b.type === 'quad') return a.type === 'pairs' && a.n >= 8;
  return false;
}

export function describe(c) {
  const r = RANKS[rank(c.top)];
  return {
    single: `lá ${name(c.top)}`, pair: `đôi ${r}`, triple: `sám cô ${r}`, quad: `tứ quý ${r}`,
    straight: `sảnh ${c.n} lá đến ${r}`, pairs: `${c.n / 2} đôi thông đến ${r}`,
  }[c.type];
}

// Tới trắng: a dealt hand that wins on the spot. Returns its name, or null.
export function toiTrang(hand) {
  const cnt = Array(13).fill(0);
  for (const c of hand) cnt[rank(c)]++;
  if (cnt[TWO] === 4) return 'tứ quý heo';
  if (cnt.slice(0, TWO).every(Boolean)) return 'sảnh rồng';
  for (let r = 0; r + 5 <= TWO; r++) if (cnt.slice(r, r + 5).every(k => k >= 2)) return '5 đôi thông';
  if (cnt.reduce((a, k) => a + (k >> 1), 0) >= 6) return '6 đôi';
  if (hand.every(c => suit(c) >= 2) || hand.every(c => suit(c) < 2)) return '13 lá đồng màu';
  return null;
}

// Stars per player in finishing order: last place gets 0, each place above one more (4 players: 3 2 1 0),
// then cóng and thối penalties.
export function settle(m) {
  const n = m.done.length;
  return m.done.map((p, i) => {
    const h = m.hands[p], notes = [];
    let pts = m.toi ? (i ? 0 : n - 1) : m.cong.includes(p) ? 0 : n - 1 - i;
    if (m.toi && !i) notes.push(`Tới trắng: ${m.toi}`);
    if (m.cong.includes(p)) { pts -= 1; notes.push('Cóng −1★'); }
    if (!m.toi && h.length) {
      const heo = h.filter(c => rank(c) === TWO).length;
      if (heo) { pts -= heo; notes.push(`Thối ${heo} heo −${heo}★`); }
      if (combos(h).some(isBomb)) { pts -= 1; notes.push('Thối hàng −1★'); }
    }
    return { p, pts, notes };
  });
}

function pick(arr, k, start = 0, pre = [], out = []) {
  if (pre.length === k) return out.push(pre), out;
  for (let i = start; i < arr.length; i++) pick(arr, k, i + 1, [...pre, arr[i]], out);
  return out;
}

// Every playable combo in a hand. Runs use the lowest suit below the top card
// and every suit at the top — enough for the bots without a 4^n blow-up.
export function combos(hand) {
  const by = Array.from({ length: 13 }, () => []);
  for (const c of [...hand].sort(asc)) by[rank(c)].push(c);
  const out = hand.map(c => [c]);
  for (const g of by) for (let k = 2; k <= g.length; k++) out.push(...pick(g, k));
  for (let s = 0; s < TWO - 2; s++) {
    const base = [];
    let pbase = [];
    for (let r = s; r < TWO && by[r].length; r++) {
      if (r - s >= 2) for (const c of by[r]) out.push([...base, c]);
      if (pbase && by[r].length >= 2) {
        if (r - s >= 2) for (const p of pick(by[r], 2)) out.push([...pbase, ...p]);
        pbase.push(by[r][0], by[r][1]);
      } else pbase = null;
      base.push(by[r][0]);
    }
  }
  return out.map(cards => ({ cards, ...classify(cards) }));
}

const minBy = (arr, f) => arr.reduce((a, b) => (f(b) < f(a) ? b : a));

// ponytail: greedy bot, no card counting or lookahead; add a search if bots feel too easy.
export function choose(hand, cur, { must = null, danger = false } = {}) {
  const opts = combos(hand).filter(c => beats(c, cur) && (must == null || c.cards.includes(must)));
  if (!opts.length) return null;
  const win = opts.find(c => c.n === hand.length);
  if (win) return win.cards;
  const heavy = c => isBomb(c) || rank(c.top) === TWO;
  const count = r => hand.filter(c => rank(c) === r).length;
  const breaks = c => ['single', 'pair', 'triple'].includes(c.type) && count(rank(c.top)) > c.n;
  const cost = c => c.top + (heavy(c) ? 60 : 0) + (breaks(c) ? 8 : 0);

  if (!cur) {
    if (danger) { // someone is about to go out: dump a group, or lead high
      const multi = opts.filter(c => c.n > 1 && !heavy(c));
      return (multi.length ? minBy(multi, c => -c.n * 100 + c.top) : minBy(opts, c => -c.top)).cards;
    }
    const low = must ?? Math.min(...hand);
    const lead = opts.filter(c => c.cards.includes(low) && !heavy(c));
    return minBy(lead.length ? lead : opts, c => -c.n * 100 + cost(c)).cards;
  }
  const tough = heavy(cur) || danger || hand.length <= 5;
  const pool = tough ? opts : opts.filter(c => !heavy(c));
  if (!pool.length) return null;
  if (danger && cur.type === 'single') return minBy(pool, c => -c.top).cards;
  return minBy(pool, cost).cards;
}

export class Match {
  // players: the seats in this game (2–4); everyone else is an empty seat.
  constructor(hands, starter, must = null, players = [0, 1, 2, 3]) {
    Object.assign(this, { hands, players, turn: starter, cur: null, last: -1, passed: new Set(), done: [], cong: [], toi: null, must });
  }
  get over() { return this.done.length === this.players.length; }
  live(q) { return this.players.includes(q) && !this.done.includes(q) && !this.cong.includes(q); }
  win(p, why) { Object.assign(this, { toi: why, done: [0, 1, 2, 3].map(k => (p + k) % 4).filter(q => this.players.includes(q)) }); }

  check(p, cards) {
    if (p !== this.turn || this.over) return 'Chưa đến lượt bạn';
    if (new Set(cards).size !== cards.length || !cards.every(x => this.hands[p].includes(x))) return 'Bạn không có những lá này';
    const c = classify(cards);
    if (!c) return 'Những lá này không thành bộ';
    if (this.must != null && !cards.includes(this.must)) return `Nước đầu phải có ${name(this.must)}`;
    if (!beats(c, this.cur)) return `Không chặn được ${describe(this.cur)}`;
    return null;
  }

  play(p, cards) {
    const err = this.check(p, cards);
    if (err) throw new Error(err);
    const combo = { ...classify(cards), cards: [...cards].sort(asc), by: p };
    const chop = !!this.cur && (this.cur.type !== combo.type || this.cur.n !== combo.n);
    const victim = chop ? this.cur.by : null;
    this.hands[p] = this.hands[p].filter(c => !cards.includes(c));
    Object.assign(this, { cur: combo, last: p, must: null });
    const finished = !this.hands[p].length;
    if (finished) {
      this.done.push(p);
      // cóng: still holding all 13 cards when the first player goes out → ranked last
      if (this.done.length === 1) this.cong = this.players.filter(q => this.hands[q].length === 13);
      const left = this.players.filter(q => this.live(q));
      if (left.length <= 1) this.done.push(...left, ...this.cong);
    }
    return { combo, chop, victim, finished, reset: this.advance() };
  }

  pass(p) {
    if (p !== this.turn || !this.cur) throw new Error('Bạn đang được đi trước, không thể bỏ lượt');
    this.passed.add(p);
    return { reset: this.advance() };
  }

  // Returns true when the round resets (everyone else passed) and the table clears.
  advance() {
    if (this.over) return false;
    const contenders = this.players.filter(q => this.live(q) && !this.passed.has(q) && q !== this.last);
    if (!contenders.length) {
      let q = this.last;
      while (!this.live(q)) q = (q + 1) % 4; // winner already went out → next player leads
      Object.assign(this, { turn: q, cur: null });
      this.passed.clear();
      return true;
    }
    let q = this.turn;
    do q = (q + 1) % 4; while (!contenders.includes(q));
    this.turn = q;
    return false;
  }
}
