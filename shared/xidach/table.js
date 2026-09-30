// The Xì Dách table: everyone plays against the dealer (nhà cái), who rotates each round unless the host pins one.
// Hidden cards only reach their owner.
import { shuffle } from '../deck.js';
import { Table } from '../table.js';
import { points, special, versus, describeHand, MIN_PLAYER, MIN_DEALER, MAX_CARDS } from './rules.js';

export class XiDach extends Table {
  static SEATS = 10; // 10 players × at most 5 cards = 50 ≤ 52: the most one deck can serve
  static DEFAULT_BOTS = 5;
  game = 'xidach';
  dealer = null; // this round's dealer
  fixed = null;  // seat the host pinned as dealer, or null to rotate

  constructor(send, opts = {}) {
    super(send, opts);
    this.fixed = opts.dealer ?? null;
  }

  // Who deals next: the pinned seat if it still plays, else the next seat in play after the last dealer.
  get nextDealer() {
    const players = this.lineup, prev = this.dealer ?? this.host;
    return players.includes(this.fixed) ? this.fixed : this.all.map(k => (prev + 1 + k) % this.size).find(q => players.includes(q));
  }
  setDealer(p) {
    if (p !== null && !(Number.isInteger(p) && p >= 0 && p < this.size)) return 'Ghế không hợp lệ';
    if (p !== null && !this.lineup.includes(p)) return 'Ghế này đang trống';
    this.fixed = p;
    this.seats();
  }
  // The pin is for whoever sat there: if they leave (even if a bot takes the seat) or the seat empties, rotate again.
  leave(s) {
    if (this.fixed === s) this.fixed = null;
    super.leave(s);
  }
  seats() {
    if (!this.playing && !this.lineup.includes(this.fixed)) this.fixed = null;
    super.seats();
  }
  extra() { return { fixed: this.fixed, next: this.playing ? null : this.nextDealer }; }

  start() {
    const players = this.lineup, deck = shuffle(), d = this.dealer = this.nextDealer;
    const order = this.all.slice(1).map(k => (d + k) % this.size).filter(q => players.includes(q)), hands = this.all.map(() => []);
    for (let k = 0; k < 2; k++) for (const q of [...order, d]) hands[q].push(deck.pop());
    this.match = { deck, hands, players, dealer: d, order, turn: d, stood: new Set(), done: new Set(), delta: this.all.map(() => 0), over: false };
    this.seats();
    this.emit(s => ({ type: 'xd-deal', dealer: d, hand: hands[s], players }));
    if (special(hands[d])) return this.finish(); // dealer's xì bàng / xì dách is shown right away
    for (const q of order) if (special(hands[q])) this.settle(q);
    this.next(2600);
  }

  // Players after the dealer go in turn; the dealer plays last.
  next(anim = 0) {
    const m = this.match;
    if (m.order.every(q => m.done.has(q))) return this.finish();
    m.turn = m.order.find(q => !m.done.has(q) && !m.stood.has(q)) ?? m.dealer;
    this.emit({ type: 'xd-turn', p: m.turn });
    this.schedule(anim);
  }

  move(s, a) {
    const m = this.match, h = m.hands[s], dealer = s === m.dealer, pts = points(h);
    if (a.type === 'draw') {
      if (h.length >= MAX_CARDS) return `Tối đa ${MAX_CARDS} lá`;
      const c = m.deck.pop();
      h.push(c);
      this.emit(t => ({ type: 'xd-draw', p: s, id: t === s ? c : null }));
      if (dealer && (h.length === MAX_CARDS || points(h) > 21)) return this.finish();
      if (!dealer && h.length === MAX_CARDS) return this.stand(s);
      return this.schedule(700);
    }
    if (a.type === 'stand' && !dealer) return pts < MIN_PLAYER ? `Chưa đủ ${MIN_PLAYER} điểm, phải rút thêm` : this.stand(s);
    if (a.type === 'check' && dealer) {
      if (pts < MIN_DEALER) return `Nhà cái phải đủ ${MIN_DEALER} điểm mới được xét`;
      if (!m.order.includes(a.p) || m.done.has(a.p)) return 'Không xét được người này';
      this.settle(a.p, true);
      return m.order.every(q => m.done.has(q)) ? this.finish() : this.schedule(900);
    }
    if (a.type === 'reveal' && dealer) return pts < MIN_DEALER ? `Nhà cái phải đủ ${MIN_DEALER} điểm mới được lật` : this.finish();
    return 'Nước đi không hợp lệ';
  }

  // ponytail: simple thresholds, no card counting; the dealer checks players who drew 3+ cards first.
  auto(p) {
    const m = this.match, h = m.hands[p], pts = points(h);
    if (p !== m.dealer) return this.move(p, { type: pts < 17 && h.length < MAX_CARDS ? 'draw' : 'stand' });
    const risky = m.order.find(q => !m.done.has(q) && m.hands[q].length >= 3);
    const type = pts < MIN_DEALER ? 'draw' : pts <= 17 && risky != null ? 'check' : pts < 17 ? 'draw' : 'reveal';
    this.move(p, { type, p: risky });
  }

  stand(s) {
    this.match.stood.add(s);
    this.emit({ type: 'xd-stand', p: s });
    this.next(500);
  }
  settle(q, xet = false) {
    const m = this.match, v = versus(m.hands[q], m.hands[m.dealer]);
    m.done.add(q);
    m.delta[q] += v; m.delta[m.dealer] -= v;
    this.score[q] += v; this.score[m.dealer] -= v;
    this.emit({ type: 'xd-show', p: q, ids: m.hands[q], delta: v, xet });
  }
  finish() {
    const m = this.match;
    this.emit({ type: 'xd-show', p: m.dealer, ids: m.hands[m.dealer], delta: null });
    for (const q of m.order) if (!m.done.has(q)) this.settle(q);
    m.over = true;
    const rows = [m.dealer, ...m.order].map(p => ({ p, pts: m.delta[p], note: (p === m.dealer ? 'Nhà cái · ' : '') + describeHand(m.hands[p]) }));
    this.last = { rows };
    this.emit({ type: 'xd-end', score: this.score, delta: m.delta, next: this.nextDealer });
    this.roundOver();
  }
}
