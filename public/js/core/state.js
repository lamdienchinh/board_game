// The client's shared state. Seats here are local: 0 is always you, the table's seats are rotated by `me`.
export const S = {
  game: 'tienlen',
  N: 4,               // seats at this game's table
  me: 0,              // your absolute seat at the table
  room: null,         // room code when online
  cid: null,          // this connection's id (lets "Rời phòng" leave only this page's seat)
  net: null,          // { send(action), leave() } — local table for solo, the server for rooms
  view: null,         // the current game's view (games/tienlen.js or games/xidach.js)
  amHost: true,
  waiting: false,     // you sat down mid-round: the bot plays your seat until the next round
  names: [], score: [], active: [], // by local seat; active = playing this round
  botInfo: { n: 3, max: 3 },
  hostSeat: 0,
  xdFixed: null, xdNext: null,      // xì dách: pinned dealer (absolute seat) / next dealer (local seat)
  dealing: false, busy: false, sent: false,
  // layout, measured by the stage
  barPx: 90, handTopPx: 240, pileScale: 1,
  now: 0,             // seconds since start, for animations
};

export const seatIds = () => [...Array(S.N).keys()];
export const L = s => (s - S.me + S.N) % S.N;         // absolute → local
export const abs = l => (l + S.me) % S.N;              // local → absolute
export const rot = a => seatIds().map(l => a[abs(l)]); // absolute-indexed array → local-indexed
export const turnNow = () => S.view?.turn() ?? null;
export const myTurn = () => !S.dealing && !S.busy && !S.sent && turnNow() === 0;
export const scoreKey = () => (S.game === 'xidach' ? 'xd-score' : 'tl-score'); // solo stars, kept in localStorage
