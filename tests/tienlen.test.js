import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, beats, deal, choose, Match, toiTrang, settle } from '../shared/tienlen/rules.js';
import { TienLen } from '../shared/tienlen/table.js';

const c = (r, s) => r * 4 + s; // rank index, suit index
const t = cards => classify(cards)?.type ?? null;
const R = (...rs) => rs.map((r, i) => c(r, i % 4));

test('combos', () => {
  assert.equal(t([c(0, 0)]), 'single');
  assert.equal(t([c(5, 0), c(5, 3)]), 'pair');
  assert.equal(t([c(0, 0), c(1, 2), c(2, 1)]), 'straight');
  assert.equal(t([c(10, 0), c(11, 0), c(12, 0)]), null, 'K-A-2 is not a run');
  assert.equal(t([c(3, 0), c(3, 1), c(4, 0), c(4, 1), c(5, 2), c(5, 3)]), 'pairs');
  assert.equal(t([c(3, 0), c(3, 1), c(5, 0), c(5, 1), c(6, 2), c(6, 3)]), null);
  assert.equal(t([c(7, 0), c(7, 1), c(7, 2), c(7, 3)]), 'quad');
  assert.equal(t([c(1, 0), c(2, 0)]), null);
});

test('who beats whom, chopping 2s', () => {
  const two = classify([c(12, 3)]), twoPair = classify([c(12, 0), c(12, 1)]);
  const threePairs = classify([c(0, 0), c(0, 1), c(1, 0), c(1, 1), c(2, 0), c(2, 1)]);
  const quad = classify([c(4, 0), c(4, 1), c(4, 2), c(4, 3)]);
  assert.ok(beats(classify([c(3, 3)]), classify([c(3, 2)])), 'suit breaks ties');
  assert.ok(!beats(classify([c(3, 0), c(4, 0), c(5, 0)]), classify([c(3, 1), c(4, 1), c(5, 1), c(6, 1)])), 'length must match');
  assert.ok(beats(threePairs, two) && !beats(threePairs, twoPair));
  assert.ok(beats(quad, two) && beats(quad, twoPair) && beats(quad, threePairs));
  assert.ok(!beats(quad, classify([c(9, 0)])), 'bombs only chop 2s / bombs');
});

test('bot-only games: every play is legal and every game ends', () => {
  for (let g = 0; g < 300; g++) {
    const hands = deal();
    const m = new Match(hands.map(h => [...h]), hands.findIndex(h => h.includes(0)), 0);
    for (let steps = 0; !m.over; steps++) {
      assert.ok(steps < 500, 'game stalls');
      const p = m.turn;
      const danger = [0, 1, 2, 3].some(q => q !== p && m.live(q) && m.hands[q].length === 1);
      const pick = choose(m.hands[p], m.cur, { must: m.must, danger });
      if (pick) m.play(p, pick); else m.pass(p);
    }
    assert.deepEqual([...m.done].sort(), [0, 1, 2, 3]);
  }
});

test('Match.check guards the server: only cards you hold, no duplicates', () => {
  const m = new Match([[0, 1, 5], [2, 3, 4], [6, 7, 8], [9, 10, 11]], 0, 0);
  assert.match(m.check(0, [0, 0]), /không có/);
  assert.match(m.check(0, [2]), /không có/);
  assert.equal(m.check(0, [0]), null);
});

test('tới trắng', () => {
  assert.equal(toiTrang([c(12, 0), c(12, 1), c(12, 2), c(12, 3), ...R(0, 1, 2, 3, 4, 5, 6, 7, 8)]), 'tứ quý heo');
  assert.equal(toiTrang([...R(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11), c(0, 3)]), 'sảnh rồng');
  assert.equal(toiTrang([c(2, 0), c(2, 1), c(3, 0), c(3, 1), c(4, 0), c(4, 1), c(5, 0), c(5, 1), c(6, 0), c(6, 1), c(9, 0), c(11, 2), c(12, 3)]), '5 đôi thông');
  assert.equal(toiTrang([c(0, 0), c(0, 1), c(2, 0), c(2, 1), c(4, 0), c(4, 1), c(6, 0), c(6, 1), c(8, 0), c(8, 1), c(10, 2), c(10, 3), c(12, 3)]), '6 đôi');
  assert.equal(toiTrang([0, 1, 4, 8, 13, 17, 21, 24, 29, 33, 41, 45, 49]), '13 lá đồng màu');
  assert.equal(toiTrang([0, 2, 5, 13, 16, 22, 29, 33, 38, 40, 45, 49, 51]), null);
});

test('cóng + thối: seat 0 goes out while seats 2 and 3 never played', () => {
  const m = new Match([[0], [4, 5], R(1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 12, 12), R(1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 0, 0)], 0);
  m.play(0, [0]);
  assert.ok(m.over);
  assert.deepEqual(m.done, [0, 1, 2, 3]);
  assert.deepEqual(m.cong, [2, 3]);
  assert.deepEqual(settle(m).map(r => r.pts), [3, 2, -1 - 3, -1 - 1]);
});

// Every seat is a slow human (auto-played on timeout). Seat 2's client rebuilds the game from events
// alone, with -1 placeholders for hidden cards, like the browser does.
test('a client can mirror the table from events', () => new Promise((done, fail) => {
  let mirror, games = 0, total = 0;
  const me = 2, t = new TienLen((s, ev) => {
    if (s !== me) return;
    try {
      if (ev.type === 'deal') {
        mirror = new Match([0, 1, 2, 3].map(q => (q === me ? [...ev.hand] : ev.players.includes(q) ? Array(13).fill(-1) : [])), ev.starter, ev.must, ev.players);
        if (ev.toi) mirror.win(ev.toi.p, ev.toi.why);
      }
      if (ev.type === 'play') { if (ev.p !== me) mirror.hands[ev.p].splice(0, ev.ids.length, ...ev.ids); mirror.play(ev.p, ev.ids); }
      if (ev.type === 'pass') mirror.pass(ev.p);
      if (ev.type === 'end') {
        assert.deepEqual(mirror.done, t.match.done);
        assert.deepEqual(mirror.cong, t.match.cong);
        total += ev.result.reduce((a, r) => a + r.pts, 0);
        assert.equal(ev.score.reduce((a, b) => a + b), total);
        if (++games < 20) setTimeout(() => t.handle(0, { type: 'start' })); else done();
      }
    } catch (e) { fail(e); }
  }, { names: ['a', 'b', 'c', 'd'], turnMs: 1, pace: 0 });
  assert.equal(t.handle(me, { type: 'play', ids: [0] }), 'Chưa đến lượt bạn');
  assert.equal(t.handle(me, { type: 'start' }), 'Chỉ chủ phòng mới được bắt đầu');
  t.start();
}));

test('3 humans: 13 cards each, lowest card leads, empty seat never plays', () => new Promise((done, fail) => {
  let games = 0;
  const t = new TienLen((s, ev) => {
    if (s !== 0) return;
    try {
      if (ev.type === 'deal') {
        assert.deepEqual(ev.players, [0, 1, 3]);
        const all = [0, 1, 3].flatMap(q => t.match.hands[q]);
        assert.equal(all.length, 39);
        if (ev.must != null) assert.equal(ev.must, Math.min(...all));
        assert.equal(t.match.hands[2].length, 0);
      }
      if (ev.type === 'play') assert.notEqual(ev.p, 2);
      if (ev.type === 'end') {
        assert.equal(ev.result.length, 3);
        assert.deepEqual(ev.result.map(r => r.p).sort(), [0, 1, 3]);
        if (++games < 20) setTimeout(() => t.handle(0, { type: 'start' })); else done();
      }
    } catch (e) { fail(e); }
  }, { names: ['a', 'b', null, 'd'], bots: 0, turnMs: 1, pace: 0 });
  t.handle(0, { type: 'start' });
}));
