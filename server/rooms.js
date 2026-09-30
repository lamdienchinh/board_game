// Rooms and who sits where. A connection is { id, user, send(event), close() } — rooms know nothing about HTTP.
//
// One person (user id) holds at most one seat anywhere:
//  - a second tab / a reconnect to the same room takes over the old connection's seat (no duplicate player);
//  - joining another room leaves the old one first;
//  - coming back after leaving sits you in your old seat again if it's still free.
import { TienLen } from '../shared/tienlen/table.js';
import { XiDach } from '../shared/xidach/table.js';

export const GAMES = { tienlen: TienLen, xidach: XiDach };
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const cleanName = n => String(n ?? '').replace(/[<>&"'`]/g, '').trim().slice(0, 12) || 'Khách';

export class Room {
  constructor(code, Game, opts) {
    this.code = code;
    this.conns = [];          // by seat
    this.left = new Map();    // user id → the seat they had
    this.banned = new Set();  // user ids the host kicked out
    this.table = new Game((s, ev) => this.conns[s]?.send(ev), opts);
  }
  get empty() { return !this.conns.some(Boolean); }
  seatOf(userId) { return this.conns.findIndex(c => c?.user.id === userId); }

  attach(conn, name) {
    const t = this.table;
    let s = this.seatOf(conn.user.id);
    if (s >= 0) { // same person again: the new connection replaces the old one
      const old = this.conns[s];
      this.conns[s] = conn;
      old.send({ type: 'error', msg: 'Bạn vừa mở phòng này ở nơi khác', fatal: true });
      old.close();
      t.names[s] = name;
      t.rejoin(s);
    } else {
      s = t.join(name, this.left.get(conn.user.id));
      if (s < 0) return 'Phòng đã đủ người';
      this.conns[s] = conn;
    }
    this.left.delete(conn.user.id);
    conn.send({ type: 'hello', seat: s, room: this.code, cid: conn.id });
    t.seats();
    return null;
  }

  // Seat s is gone (closed the page, left, got kicked): a bot takes it over right away.
  detach(s, msg) {
    const c = this.conns[s];
    if (!c) return;
    this.conns[s] = null;
    this.left.set(c.user.id, s);
    if (msg) { c.send({ type: 'error', msg, fatal: true }); c.close(); }
    this.table.leave(s);
  }

  summary() {
    const t = this.table;
    return { code: this.code, game: t.game, seats: t.size, players: t.names.filter(Boolean), playing: t.playing };
  }
}

export class Lobby {
  // emptyRoomMs: how long an empty room stays open, so whoever refreshed the page (or lost the connection) gets back in.
  constructor({ maxRooms = 500, turnMs = 45000, emptyRoomMs = 30000 } = {}) {
    Object.assign(this, { maxRooms, turnMs, emptyRoomMs, rooms: new Map(), seated: new Map() }); // seated: user id → { room, conn }
  }

  create(game) {
    let code;
    do code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
    while (this.rooms.has(code));
    const room = new Room(code, Object.hasOwn(GAMES, game) ? GAMES[game] : TienLen, { turnMs: this.turnMs }); // hasOwn: ?game=constructor must not reach Object.prototype
    this.rooms.set(code, room);
    return room;
  }

  // Sit conn down: in room `code`, or in a new room for `game`. Returns an error message, or null.
  connect(conn, { name, code, game }) {
    const id = conn.user.id, prev = this.seated.get(id);
    let room = null;
    if (code) {
      room = this.rooms.get(String(code).toUpperCase());
      if (!room) return 'Không có phòng nào mang mã này';
      if (room.banned.has(id)) return 'Chủ phòng đã mời bạn ra khỏi phòng này';
    } else if (this.rooms.size >= this.maxRooms) return 'Máy chủ đã đầy, thử lại sau nhé';
    room ??= this.create(game);
    const err = room.attach(conn, cleanName(name));
    this.cleanup(room); // cancels a pending close of an empty room, or closes a new room nobody could join
    if (err) return err;
    if (prev && prev.room !== room) this.remove(id, 'Bạn đã vào một phòng khác');
    this.seated.set(id, { room, conn });
    return null;
  }

  // The stream closed. Ignore it if a newer connection already took this person's seat.
  disconnect(conn) {
    if (this.seated.get(conn.user.id)?.conn === conn) this.remove(conn.user.id);
  }
  // "Rời phòng" / page closed: cid makes sure a late beacon from an old page can't remove the new one.
  leave(userId, cid) {
    const at = this.seated.get(userId);
    if (at && (!cid || at.conn.id === cid)) this.remove(userId);
  }
  remove(userId, msg) {
    const at = this.seated.get(userId);
    if (!at) return;
    this.seated.delete(userId);
    at.room.detach(at.room.seatOf(userId), msg);
    this.cleanup(at.room);
  }
  cleanup(room) {
    clearTimeout(room.expiry);
    if (!room.empty) return;
    const close = () => { if (room.empty) { room.table.stop(); this.rooms.delete(room.code); } };
    if (!this.emptyRoomMs) return close();
    room.expiry = setTimeout(close, this.emptyRoomMs);
    room.expiry.unref(); // don't keep the process (or a test run) alive just for this
  }

  // A move or a setting from a seated person.
  act(userId, a) {
    const at = this.seated.get(userId);
    if (!at) return 'Bạn không ở trong phòng nào';
    const s = at.room.seatOf(userId);
    if (a?.type === 'kick') return this.kick(at.room, s, a.p);
    return at.room.table.handle(s, a) ?? null;
  }
  // The host sends someone away; they can't come back to this room.
  kick(room, by, p) {
    if (by !== room.table.host) return 'Chỉ chủ phòng mới được mời người khác ra';
    if (!Number.isInteger(p) || p === by || !room.conns[p]) return 'Không mời ra được ghế này';
    const { id } = room.conns[p].user;
    room.banned.add(id);
    this.remove(id, 'Chủ phòng đã mời bạn ra khỏi phòng');
    return null;
  }

  // Rooms with a free seat. Mid-round ones too: newcomers wait for the next round.
  open() { return [...this.rooms.values()].filter(r => !r.empty && r.table.names.includes(null)).map(r => r.summary()); }
  // Keep idle streams alive through proxies (and notice dead ones sooner: a failed write closes them).
  ping() { for (const { conn } of this.seated.values()) conn.ping?.(); }
}
