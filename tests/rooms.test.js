import test from 'node:test';
import assert from 'node:assert/strict';
import { Lobby } from '../server/rooms.js';

let ids = 0;
// A fake connection that records what the server sent it.
const conn = user => ({ id: `c${++ids}`, user: { id: user }, got: [], closed: false, send(ev) { this.got.push(ev); }, close() { this.closed = true; } });
const hello = c => c.got.find(e => e.type === 'hello');
const lastSeats = c => c.got.findLast(e => e.type === 'seats');
const humans = c => lastSeats(c).names.filter(Boolean);

test('the same person twice in a room keeps one seat', () => {
  const lobby = new Lobby({ turnMs: 0 });
  const a = conn('ann'), code = (lobby.connect(a, { name: 'Ann', game: 'xidach' }), hello(a).room);
  const b = conn('bob');
  assert.equal(lobby.connect(b, { name: 'Bob', code }), null);
  const a2 = conn('ann'); // refresh / second tab
  assert.equal(lobby.connect(a2, { name: 'Ann', code }), null);
  assert.equal(hello(a2).seat, hello(a).seat);
  assert.ok(a.closed && a.got.at(-1).fatal, 'old tab is told and closed');
  assert.deepEqual(humans(b).sort(), ['Ann', 'Bob']);
  lobby.disconnect(a); // the old stream's close event arrives late
  assert.deepEqual(humans(b).sort(), ['Ann', 'Bob'], 'a replaced connection does not free the seat');
});

test('leaving and coming back gets the same seat; late beacons are ignored', () => {
  const lobby = new Lobby({ turnMs: 0 });
  const host = conn('h'); lobby.connect(host, { name: 'H', game: 'tienlen' });
  const code = hello(host).room, a = conn('ann');
  lobby.connect(a, { name: 'Ann', code });
  const seat = hello(a).seat;
  lobby.leave('ann', a.id);
  assert.deepEqual(humans(host), ['H']);
  const a2 = conn('ann');
  lobby.connect(a2, { name: 'Ann', code });
  assert.equal(hello(a2).seat, seat);
  lobby.leave('ann', a.id); // beacon from the page that already left
  assert.deepEqual(humans(host).sort(), ['Ann', 'H']);
});

test('joining another room leaves the first one', () => {
  const lobby = new Lobby({ turnMs: 0, emptyRoomMs: 0 });
  const h1 = conn('h1'), h2 = conn('h2'), a = conn('ann');
  lobby.connect(h1, { game: 'tienlen' }); lobby.connect(h2, { game: 'xidach' });
  lobby.connect(a, { name: 'Ann', code: hello(h1).room });
  const a2 = conn('ann');
  lobby.connect(a2, { name: 'Ann', code: hello(h2).room });
  assert.ok(a.closed);
  assert.deepEqual(humans(h1), ['Khách']);
  assert.equal(lobby.rooms.size, 2);
  lobby.disconnect(h1);
  assert.equal(lobby.rooms.size, 1, 'an empty room is closed');
});

test('the host can kick; the kicked person cannot come back; others cannot kick', () => {
  const lobby = new Lobby({ turnMs: 0 });
  const h = conn('h'), a = conn('ann'), b = conn('bob');
  lobby.connect(h, { name: 'H', game: 'xidach' });
  const code = hello(h).room;
  lobby.connect(a, { name: 'Ann', code }); lobby.connect(b, { name: 'Bob', code });
  assert.equal(lobby.act('bob', { type: 'kick', p: hello(a).seat }), 'Chỉ chủ phòng mới được mời người khác ra');
  assert.equal(lobby.act('h', { type: 'kick', p: hello(h).seat }), 'Không mời ra được ghế này');
  assert.equal(lobby.act('h', { type: 'kick', p: '__proto__' }), 'Không mời ra được ghế này');
  assert.equal(lobby.act('h', { type: 'kick', p: 0 }), 'Không mời ra được ghế này', 'a bot seat');
  assert.equal(lobby.act('h', { type: 'kick', p: hello(a).seat }), null);
  assert.ok(a.closed && /mời bạn ra/.test(a.got.at(-1).msg));
  assert.deepEqual(humans(h).sort(), ['Bob', 'H']);
  assert.match(lobby.connect(conn('ann'), { name: 'Ann', code }), /mời bạn ra/);
  assert.equal(lobby.act('ann', { type: 'start' }), 'Bạn không ở trong phòng nào');
});

test('a player who leaves mid-round is replaced by a bot at once; coming back waits for the next round', () => {
  const lobby = new Lobby({ turnMs: 60000 });
  const h = conn('h'), a = conn('ann');
  lobby.connect(h, { name: 'H', game: 'xidach' });
  const code = hello(h).room, room = lobby.rooms.get(code);
  lobby.connect(a, { name: 'Ann', code });
  const s = hello(a).seat;
  do lobby.act('h', { type: 'start' }); while (!room.table.playing);
  lobby.disconnect(a);
  assert.ok(room.table.isBot(s));
  const a2 = conn('ann');
  lobby.connect(a2, { name: 'Ann', code });
  assert.equal(hello(a2).seat, s);
  assert.ok(room.table.waiting.has(s));
  assert.deepEqual(lastSeats(a2).waiting, [s]);
  room.table.stop();
});

test('an empty room stays open a moment, so a refresh gets back in', () => {
  const lobby = new Lobby({ turnMs: 0, emptyRoomMs: 60000 });
  const a = conn('ann');
  lobby.connect(a, { name: 'Ann', game: 'xidach' });
  const { room: code, seat } = hello(a);
  lobby.leave('ann', a.id);
  assert.equal(lobby.rooms.size, 1);
  assert.deepEqual(lobby.open(), [], 'empty rooms are not listed');
  const a2 = conn('ann');
  assert.equal(lobby.connect(a2, { name: 'Ann', code }), null);
  assert.equal(hello(a2).seat, seat);
  assert.equal(lobby.rooms.get(code).table.host, seat, 'still the host');
  lobby.rooms.get(code).table.stop();
});

test('?game=constructor and friends fall back to a real game', () => {
  const lobby = new Lobby({ turnMs: 0, emptyRoomMs: 0 });
  for (const game of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    const c = conn(`u-${game}`);
    assert.equal(lobby.connect(c, { game }), null);
    assert.equal(lobby.rooms.get(hello(c).room).table.game, 'tienlen');
    lobby.disconnect(c);
  }
  assert.equal(lobby.rooms.size, 0, 'no leaked rooms');
});

test('same Google account on two devices = one seat; switching account closes the old page', () => {
  const lobby = new Lobby({ turnMs: 0 });
  const h = conn('h'); lobby.connect(h, { name: 'H', game: 'xidach' });
  const code = hello(h).room, phone = conn('google:42'), laptop = conn('google:42');
  lobby.connect(phone, { name: 'Linh', code });
  lobby.connect(laptop, { name: 'Linh', code });
  assert.deepEqual(humans(h).sort(), ['H', 'Linh']);
  assert.ok(phone.closed);
  lobby.remove('google:42', 'Bạn vừa đổi tài khoản');
  assert.ok(laptop.closed && laptop.got.at(-1).fatal, 'the page sitting as the old account is told');
  assert.deepEqual(humans(h), ['H']);
});
