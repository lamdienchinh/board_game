// A 52-card deck shared by every game. Card id 0..51 = rank*4 + suit, so ids compare like cards do.
// rank 0..12 = 3..A,2 ; suit 0..3 = ♠ ♣ ♦ ♥
export const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
export const SUITS = ['♠', '♣', '♦', '♥'];
export const TWO = 12, ACE = 11;
export const rank = c => c >> 2;
export const suit = c => c & 3;
export const name = c => RANKS[rank(c)] + SUITS[suit(c)];
export const asc = (a, b) => a - b;

export function shuffle(rng = Math.random) {
  const d = [...Array(52).keys()];
  for (let i = 51; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}
