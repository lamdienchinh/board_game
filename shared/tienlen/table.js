// The Tiến Lên table: deals, takes plays / passes, lets bots move and scores the round.
import { Table } from '../table.js';
import { deal, choose, Match, toiTrang, settle } from './rules.js';

export class TienLen extends Table {
  static SEATS = 4;
  game = 'tienlen';
  lastWinner = null;

  start() {
    const players = this.lineup, hands = deal().map((h, s) => (players.includes(s) ? h : []));
    // First game (or the last winner is gone): whoever holds the lowest dealt card leads with it — 3♠ with 4 players.
    const first = !players.includes(this.lastWinner), low = Math.min(...hands.flat());
    const starter = first ? hands.findIndex(h => h.includes(low)) : this.lastWinner;
    this.match = new Match(hands.map(h => [...h]), starter, first ? low : null, players);
    const w = this.all.map(k => (starter + k) % this.size).find(q => players.includes(q) && toiTrang(hands[q]));
    const toi = w == null ? null : { p: w, why: toiTrang(hands[w]), cards: hands[w] };
    this.seats();
    this.emit(s => ({ type: 'deal', hand: hands[s], starter, must: this.match.must, toi, players }));
    if (!toi) return this.schedule(3000);
    this.match.win(w, toi.why);
    this.end();
  }

  move(s, a) {
    const m = this.match;
    if (a.type === 'pass') return m.cur ? this.pass(s) : 'Bạn đang được đi trước, không thể bỏ lượt';
    if (a.type !== 'play' || !Array.isArray(a.ids)) return 'Nước đi không hợp lệ';
    return m.check(s, a.ids) ?? this.play(s, a.ids);
  }
  auto(p) {
    const m = this.match;
    const danger = this.all.some(q => q !== p && m.live(q) && m.hands[q].length === 1);
    const ids = choose(m.hands[p], m.cur, { must: m.must, danger });
    ids ? this.play(p, ids) : this.pass(p);
  }

  play(p, ids) {
    const res = this.match.play(p, ids);
    this.emit({ type: 'play', p, ids: [...ids] });
    if (this.match.over) this.end();
    else this.schedule(800 + (res.chop ? 700 : 0) + (res.reset ? 1000 : 0));
  }
  pass(p) {
    const { reset } = this.match.pass(p);
    this.emit({ type: 'pass', p });
    this.schedule(450 + (reset ? 900 : 0));
  }
  end() {
    const m = this.match, result = settle(m);
    this.lastWinner = m.done[0];
    result.forEach(r => (this.score[r.p] += r.pts));
    this.last = { rows: result.map(r => ({ p: r.p, pts: r.pts, note: r.notes.join(' · ') })) };
    this.emit({ type: 'end', score: this.score, result });
    this.roundOver();
  }
}
