import test from 'node:test';
import assert from 'node:assert/strict';
import { TienLen } from '../shared/tienlen/table.js';
import { XiDach } from '../shared/xidach/table.js';

test('bots fill the first free seats, a joiner takes the last free one (a bot\'s, if full)', () => {
  const t = new TienLen(() => {}, { names: ['host', null, null, null], bots: 1 });
  assert.deepEqual(t.lineup, [0, 1]);
  assert.equal(t.join('b'), 3);
  assert.deepEqual(t.lineup, [0, 1, 3]);
  assert.equal(t.handle(3, { type: 'bots', n: 3 }), 'Chỉ chủ phòng mới được chỉnh bàn chơi');
  assert.equal(t.handle(0, { type: 'dealer', p: 1 }), 'Trò này không có nhà cái');
  assert.equal(t.handle(0, { type: 'bots', n: 7 }), 'Số máy không hợp lệ');
  t.handle(0, { type: 'bots', n: 3 });
  assert.deepEqual(t.lineup, [0, 1, 2, 3]);
  assert.equal(t.join('c'), 2, 'full table: a human replaces a bot');
  t.leave(2);
  assert.deepEqual(t.lineup, [0, 1, 2, 3], 'the bot comes back');
  assert.equal(t.join('c', 2), 2, 'coming back: the old seat if it is free');
  t.handle(0, { type: 'bots', n: 0 });
  t.leave(3); t.leave(2);
  assert.equal(t.handle(0, { type: 'start' }), 'Cần ít nhất 2 người chơi');
  assert.equal(new TienLen(() => {}).size, 4);
});

test('the host is whoever joined first, not the lowest seat', () => {
  const t = new XiDach(() => {});
  assert.equal(t.join('a'), 9);
  assert.equal(t.join('b'), 8);
  assert.equal(t.host, 9);
  t.leave(9);
  assert.equal(t.host, 8);
});

// Someone sits down mid-round: the bot keeps their seat until the round is over, they get no game
// events meanwhile (nothing to replay them on), then they're a normal player.
test('joining mid-round waits for the next round', () => new Promise((done, fail) => {
  const got = [];
  let joined = false;
  const t = new TienLen((s, ev) => {
    try {
      if (s === 3) got.push(ev.type);
      if (joined && s === 0 && ev.type === 'end') setTimeout(() => {
        assert.ok(!got.includes('deal') && !got.includes('play'), 'waiting seat saw game events');
        assert.ok(got.includes('seats'));
        assert.equal(t.waiting.size, 0);
        assert.equal(t.handle(3, { type: 'emote', k: '👍' }), undefined);
        done();
      });
    } catch (e) { fail(e); }
  }, { names: ['a', null, null, null], bots: 3, turnMs: 1, pace: 0 });
  do t.start(); while (!t.playing); // a dealt tới trắng ends the round at once
  assert.equal(t.join('late'), 3);
  joined = true;
  assert.ok(t.isBot(3) && t.waiting.has(3));
  assert.equal(t.handle(3, { type: 'pass' }), 'Bạn sẽ vào chơi từ ván sau');
}));

test('a human who times out is played at bot speed until they act again', () => {
  const t = new TienLen(() => {}, { names: ['a', 'b', null, null], bots: 0, turnMs: 60000 });
  t.start();
  const p = t.match.turn;
  assert.equal(t.delay(p), 60000);
  t.afk.add(p);
  assert.ok(t.delay(p) < 2000, 'afk seat is fast');
  t.handle(p, { type: 'emote', k: '👍' });
  assert.ok(!t.afk.has(p));
  assert.equal(t.delay(p), 60000, 'back to the full clock');
  t.stop();
});

// Someone who sits down right after a round sees how it went, not an empty table.
test('newcomers get the last round in the seats event', () => new Promise((done, fail) => {
  const t = new XiDach((s, ev) => {
    try {
      if (s === 0 && ev.type === 'xd-end') setTimeout(() => {
        const got = [];
        t.send = (seat, e) => seat !== 0 && got.push(e);
        t.join('late');
        t.seats();
        const last = got.find(e => e.type === 'seats').last;
        assert.equal(last.rows.length, 4);
        assert.equal(last.rows.reduce((a, r) => a + r.pts, 0), 0);
        assert.ok(last.rows.every(r => typeof r.note === 'string' && r.note));
        done();
      });
    } catch (e) { fail(e); }
  }, { names: ['a'], bots: 3, turnMs: 1, pace: 0 });
  t.start();
}));

test('emotes are rate limited per seat; malformed actions are refused', () => {
  const t = new TienLen(() => {}, { names: ['a', 'b'], bots: 0 });
  assert.equal(t.emote(0, '👍'), undefined);
  assert.equal(t.emote(0, '👍'), 'Từ từ thôi~');
  assert.equal(t.emote(1, '👍'), undefined, 'other seats unaffected');
  assert.equal(t.handle(0, null), 'Nước đi không hợp lệ');
  assert.equal(t.handle(0, { type: 5 }), 'Nước đi không hợp lệ');
});
