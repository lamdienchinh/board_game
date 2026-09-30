import test from 'node:test';
import assert from 'node:assert/strict';
import { points, kind, versus } from '../shared/xidach/rules.js';
import { XiDach } from '../shared/xidach/table.js';

const c = (r, s) => r * 4 + s;
// Run rounds until `rounds` xd-end events reached seat `watch`; onEvent may assert on anything.
const play = (opts, rounds, onEvent = () => {}, before = () => {}) => new Promise((done, fail) => {
  let n = 0;
  const t = new XiDach((s, ev) => {
    try {
      onEvent(s, ev, t, n);
      if (s === t.host && ev.type === 'xd-end' && ++n < rounds) setTimeout(() => t.handle(t.host, { type: 'start' }));
      else if (s === t.host && ev.type === 'xd-end') done(t);
    } catch (e) { fail(e); }
  }, { turnMs: 1, pace: 0, ...opts });
  before(t);
  t.handle(t.host, { type: 'start' });
});

test('hands', () => {
  const A = s => c(11, s), K = s => c(10, s), n = v => c(v - 3, 0); // n(5) = a 5
  assert.equal(kind([A(0), A(1)]), 'xibang');
  assert.equal(kind([A(0), K(1)]), 'xidach');
  assert.equal(kind([A(0), n(10)]), 'xidach');
  assert.equal(points([A(0), n(5)]), 16);
  assert.equal(points([A(0), n(5), n(6)]), 21, 'A = 10 with 3 cards');
  assert.equal(points([A(0), n(9), n(8)]), 18, 'A = 1 when 10 busts');
  assert.equal(points([A(0), n(5), n(7), n(8)]), 21, 'A = 1 with 4 cards');
  const two = s => c(12, s), five = [two(0), two(1), n(3), c(0, 1), n(4)], big5 = [n(3), n(4), n(4), c(1, 1), n(6)];
  assert.equal(kind(five), 'ngulinh');
  assert.equal(points(five), 14);
  const q = [K(0), K(1), n(5)], h20 = [K(2), K(3)], h19 = [K(0), n(9)], h21 = [K(1), n(8), n(3)];
  assert.equal(kind(q), 'quac');
  assert.equal(versus(five, h21), 2, 'ngũ linh beats 21, pays double');
  assert.equal(versus(q, q), 0, 'both bust → hòa');
  assert.equal(versus(h19, q), 1);
  assert.equal(versus(q, h19), -1);
  assert.equal(versus(h20, [A(0), K(1)]), -2, 'dealer xì dách takes double');
  assert.equal(versus([A(2), A(3)], [A(0), K(1)]), 3);
  assert.equal(versus(five, big5), 0, 'two ngũ linh → hòa');
  assert.equal(versus(h20, [K(0), c(7, 1)]), 0);
});

test('two players at a 10-seat table', () => play({ names: ['a', null, 'c', null], bots: 0 }, 50, (s, ev) => {
  if (ev.type === 'xd-deal') { assert.deepEqual(ev.players, [0, 2]); assert.ok([0, 2].includes(ev.dealer)); }
  if (ev.type === 'xd-end') assert.equal(ev.delta[1] + ev.delta[3], 0);
}));

// The host can pin a dealer, the next dealer is announced, a pinned seat that empties falls back to rotation.
test('dealer: pinned, announced, rotating', async () => {
  let next = null;
  const seen = [];
  await play({ names: ['a', 'b', null, null], bots: 2 }, 7, (s, ev, t, n) => {
    if (s !== 0) return;
    if (ev.type === 'seats' && !t.playing) next = ev.next;
    if (ev.type === 'xd-deal') { assert.equal(ev.dealer, next); seen.push(ev.dealer); }
    if (ev.type === 'xd-end') {
      next = ev.next;
      if (n === 2) { assert.deepEqual(seen, [1, 1, 1]); assert.equal(t.handle(0, { type: 'dealer', p: null }), undefined); }
    }
  }, t => {
    assert.equal(t.handle(1, { type: 'dealer', p: 1 }), 'Chỉ chủ phòng mới được chỉnh bàn chơi');
    assert.equal(t.handle(0, { type: 'dealer', p: 12 }), 'Ghế không hợp lệ');
    assert.equal(t.handle(0, { type: 'dealer', p: '1' }), 'Ghế không hợp lệ');
    t.handle(0, { type: 'bots', n: 1 });
    assert.equal(t.handle(0, { type: 'dealer', p: 3 }), 'Ghế này đang trống');
    t.handle(0, { type: 'bots', n: 2 });
    assert.equal(t.handle(0, { type: 'dealer', p: 1 }), undefined);
    assert.equal(next, 1);
  });
  assert.deepEqual(seen.slice(3), [2, 3, 0, 1]);
});

test('a pinned dealer who leaves → rotate', () => {
  const t = new XiDach(() => {}, { names: ['a', 'b', null, null], bots: 0, dealer: 1 });
  assert.equal(t.nextDealer, 1);
  t.leave(1);
  assert.equal(t.fixed, null);
  const u = new XiDach(() => {}, { names: ['a', 'b', null, null], bots: 3, dealer: 1 });
  u.leave(1);
  assert.equal(u.fixed, null, 'a bot filling the seat does not inherit the pin');
  u.handle(0, { type: 'bots', n: 1 });
  u.handle(0, { type: 'dealer', p: 1 }); // pin a bot seat, then remove that bot
  u.handle(0, { type: 'bots', n: 0 });
  assert.equal(u.fixed, null, 'pinned seat emptied → rotate');
});

test('a full 10-seat table: 1 human + 9 bots, the deck never runs dry', () => play(
  { names: ['a'], bots: 9 }, 100,
  (s, ev) => {
    if (ev.type === 'xd-deal') assert.deepEqual(ev.players, [...Array(10).keys()]);
    if (ev.type === 'xd-show') assert.ok(ev.ids.every(Number.isInteger));
    if (ev.type === 'xd-end') assert.equal(ev.score.reduce((a, b) => a + b), 0);
  },
  t => {
    assert.equal(t.handle(0, { type: 'bots', n: 10 }), 'Số máy không hợp lệ');
    assert.equal(t.join('b'), 9);
    assert.equal(t.lineup.length, 10);
    t.leave(9);
  },
));

// All seats are slow humans (auto-played on timeout). Every round is zero-sum, the dealer rotates,
// and nobody ever sees someone else's hidden card.
test('zero-sum rounds, rotating dealer, hidden cards stay hidden', () => {
  let dealer = null;
  return play({ names: ['a', 'b', 'c', 'd'], bots: 0 }, 200, (s, ev) => {
    if (ev.type === 'xd-draw' && ev.p !== s) assert.equal(ev.id, null);
    if (ev.type === 'xd-deal') assert.equal(ev.hand.length, 2);
    if (s !== 0) return;
    if (ev.type === 'xd-deal') { if (dealer != null) assert.equal(ev.dealer, (dealer + 1) % 4); dealer = ev.dealer; }
    if (ev.type === 'xd-end') {
      assert.equal(ev.score.reduce((a, b) => a + b), 0);
      assert.equal(ev.delta.reduce((a, b) => a + b), 0);
    }
  }, t => assert.equal(t.handle(1, { type: 'start' }), 'Chỉ chủ phòng mới được bắt đầu'));
});
