// A game table: seats, host, bots, emotes and stars. Each game extends it with start / move / auto.
// The server runs one per room; the browser runs one locally for solo play. Seats are absolute (0..size-1).
//
// A seat is played by a bot when nobody sits there (names[s] == null) or when its human is "waiting":
// they (re)joined mid-round, so the bot finishes that round for them and they take over from the next.

export const EMOTES = { '😂': ['🤭', '😆'], '😎': ['🙄', '😤'], '😭': ['🥺', 'Thương thương~'], '👍': ['💖', '✌️'], '🔥': ['😤', '🔥🔥'], '💖': ['🥰', '💞'] };
const HOST_ONLY = new Set(['start', 'bots', 'dealer']), EMOTE_MS = 1200;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];

export class Table {
  static SEATS = 4;
  static DEFAULT_BOTS = 3;

  // send(seat, event) is only called for human seats.
  // turnMs > 0 auto-plays for a human who takes too long. pace scales every delay (0 in tests).
  // bots: how many bots the host wants; they fill free seats, and a human who joins takes a bot's place.
  constructor(send, { names, score, turnMs = 0, pace = 1, bots = this.constructor.DEFAULT_BOTS } = {}) {
    const size = this.constructor.SEATS; // pad whatever the caller passed to the table's seat count
    names = Array.from({ length: size }, (_, i) => names?.[i] ?? null);
    score = Array.from({ length: size }, (_, i) => score?.[i] ?? 0);
    Object.assign(this, { send, names, score, turnMs, pace, bots: Math.min(bots, size - 1), size, match: null, timer: null });
    this.all = [...names.keys()];
    this.arrivals = this.all.filter(s => names[s] != null); // humans in the order they sat down
    this.waiting = new Set(); // humans who sat down mid-round
    this.afk = new Set();     // humans who let the clock run out: the bot plays them at bot speed until they act
    this.lastEmote = [];
    this.last = null;         // public summary of the last round, so someone who just sat down sees what happened
  }

  get playing() { return !!this.match && !this.match.over; }
  get host() { return this.arrivals[0] ?? -1; } // whoever has been here longest runs the room
  // Seats in the next round: every human, plus bots in the first free seats.
  get lineup() {
    const free = this.all.filter(s => this.names[s] == null).slice(0, this.bots);
    return this.all.filter(s => this.names[s] != null || free.includes(s));
  }
  isBot(s) { return this.names[s] == null || this.waiting.has(s); }
  isHuman(s) { return this.names[s] != null; }

  // Game events skip waiting humans: they have no copy of this round to replay them on.
  emit(ev) { for (const s of this.all) if (!this.isBot(s)) this.send(s, typeof ev === 'function' ? ev(s) : ev); }
  broadcast(ev) { for (const s of this.all) if (this.isHuman(s)) this.send(s, ev); }

  seats() {
    const players = this.playing ? this.match.players : this.lineup;
    this.broadcast({
      type: 'seats', game: this.game, names: this.names, score: this.score, host: this.host, bots: this.bots, players,
      playing: this.playing, waiting: [...this.waiting], last: this.last, ...this.extra(),
    });
  }
  extra() { return {}; } // game-specific room settings for the seats event

  // prefer: the seat this person had before, if it's still free. Mid-round they wait for the next one.
  join(name, prefer) {
    const s = this.names[prefer] === null ? prefer : this.names.lastIndexOf(null); // bots sit in the first free seats
    if (s < 0) return -1;
    this.names[s] = name;
    this.arrivals.push(s);
    if (this.playing) this.waiting.add(s);
    return s;
  }
  // The same person reconnected to their seat (refresh, new tab): they lost the round's state, so they wait too.
  rejoin(s) {
    if (!this.playing || this.waiting.has(s)) return;
    this.waiting.add(s);
    if (this.match.turn === s) this.schedule();
  }
  leave(s) {
    this.names[s] = null; // a bot takes over mid-round, right away
    this.arrivals = this.arrivals.filter(q => q !== s);
    this.waiting.delete(s);
    this.afk.delete(s);
    this.seats();
    if (this.playing && this.match.turn === s) this.schedule();
  }
  stop() { clearTimeout(this.timer); this.match = null; }
  // Every game calls this once its end event is out: waiting humans become regular players.
  roundOver() {
    clearTimeout(this.timer);
    this.waiting.clear();
    this.seats();
  }

  // A human's request. Returns an error message, or undefined when it went through.
  handle(s, a) {
    if (!this.isHuman(s)) return 'Không phải ghế của bạn';
    if (typeof a?.type !== 'string') return 'Nước đi không hợp lệ';
    if (this.afk.delete(s) && this.playing && this.match.turn === s) this.schedule(); // welcome back: full clock again
    if (a.type === 'emote') return this.emote(s, a.k);
    if (HOST_ONLY.has(a.type)) {
      if (s !== this.host) return a.type === 'start' ? 'Chỉ chủ phòng mới được bắt đầu' : 'Chỉ chủ phòng mới được chỉnh bàn chơi';
      if (this.playing) return 'Ván đang diễn ra';
      if (a.type === 'bots') return this.setBots(a.n);
      if (a.type === 'dealer') return this.setDealer ? this.setDealer(a.p) : 'Trò này không có nhà cái';
      return this.lineup.length < 2 ? 'Cần ít nhất 2 người chơi' : this.start();
    }
    if (this.waiting.has(s)) return 'Bạn sẽ vào chơi từ ván sau';
    if (!this.playing || this.match.turn !== s) return 'Chưa đến lượt bạn';
    return this.move(s, a);
  }

  setBots(n) {
    if (!Number.isInteger(n) || n < 0 || n >= this.size) return 'Số máy không hợp lệ';
    this.bots = n;
    this.seats();
  }

  // Delays roughly match the client animations so bots don't feel rushed.
  delay(p, anim = 0) {
    if (this.isBot(p) || this.afk.has(p)) return anim + rnd(650, 1300);
    return this.turnMs && anim + this.turnMs; // 0: a human may think forever
  }
  schedule(anim = 0) {
    clearTimeout(this.timer);
    const p = this.match.turn, ms = this.delay(p, anim);
    if (!ms) return;
    this.timer = setTimeout(() => {
      if (!this.playing || this.match.turn !== p) return;
      if (!this.isBot(p)) this.afk.add(p);
      try { this.auto(p); } catch (e) { console.error(e); this.stop(); } // a bug in one table must not take the whole server down
    }, ms * this.pace);
  }

  // One emote per seat every EMOTE_MS: each one goes to every seat and makes a bot answer.
  emote(s, k) {
    if (!Object.hasOwn(EMOTES, k)) return 'Biểu cảm không hợp lệ';
    const now = Date.now();
    if (now - (this.lastEmote[s] ?? 0) < EMOTE_MS * this.pace) return 'Từ từ thôi~';
    this.lastEmote[s] = now;
    this.emit({ type: 'emote', p: s, text: k });
    const bots = (this.playing ? this.match.players : this.lineup).filter(q => this.isBot(q));
    if (bots.length) setTimeout(() => this.emit({ type: 'emote', p: pick(bots), text: pick(EMOTES[k]), mood: k === '😭' ? 'sad' : 'happy' }), 700 * this.pace);
  }
}
