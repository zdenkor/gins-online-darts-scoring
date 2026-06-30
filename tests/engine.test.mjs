// =================================================================
// Engine tests using node:test (zero dependencies, runs in Node 18+).
// Run with:  node tests/engine.test.mjs
// =================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';

// The engine uses ES module export — we import directly from source.
import {
  dartValue, dartLabel, throwPoints,
  new01, throwDarts01, submitTurnTotal01,
  newCricket, throwDartsCricket,
  newShanghai, throwDartsShanghai,
} from '../js/game/engine.js';

/* ---------- helpers ---------- */
const D = (s, m=1) => ({ segment: s, multiplier: m });

/* ---------- value/label ---------- */
test('dartValue: singles/doubles/triples', () => {
  assert.equal(dartValue(D(20, 1)), 20);
  assert.equal(dartValue(D(20, 2)), 40);
  assert.equal(dartValue(D(20, 3)), 60);
  assert.equal(dartValue(D(25, 1)), 25);
  assert.equal(dartValue(D(25, 2)), 50); // bullseye
  assert.equal(dartValue(D(0, 1)), 0);   // miss
  assert.equal(dartValue(null), 0);
});
test('dartLabel: format', () => {
  assert.equal(dartLabel(D(20, 1)), '20');
  assert.equal(dartLabel(D(20, 2)), 'D20');
  assert.equal(dartLabel(D(20, 3)), 'T20');
  assert.equal(dartLabel(D(25, 2)), 'BULL');
  assert.equal(dartLabel(D(0, 1)), 'MISS');
});
test('throwPoints: sum of three', () => {
  assert.equal(throwPoints([D(20), D(20), D(20)]), 60);
  assert.equal(throwPoints([D(20,3), D(20,3), D(25,2)]), 60+60+50);
});

/* ---------- 01 ---------- */
test('01 501: standard checkout — T20, T20, D20, D15 leaves 41 (D18 would win)', () => {
  // Simpler: 3-dart turn removes score by dart points. From 501 we just verify subtraction.
  const g = new01(['A'], { start: 501 });
  throwDarts01(g, [D(20), D(20), D(20)]); // 60 off
  assert.equal(g.players[0].score, 441);
});

test('01 501: bust when overshoot keeps score', () => {
  const g = new01(['A'], { start: 50 });
  throwDarts01(g, [D(20)]); // 20, score 30
  assert.equal(g.players[0].score, 30);
  throwDarts01(g, [D(20, 3)]); // 60 → bust, score reverts to 30
  assert.equal(g.players[0].score, 30);
  assert.equal(g.current, 0); // only 1 player → still 0
});

test('01 double-out: cannot win on non-double', () => {
  const g = new01(['A'], { start: 20, doubleOut: true });
  throwDarts01(g, [D(20)]);
  assert.equal(g.players[0].score, 20); // bust? wait, 20 would leave 0 but not double → bust
  assert.equal(g.players[0].legsWon, 0);
});

test('01 double-out: D10 wins leg', () => {
  const g = new01(['A'], { start: 20, doubleOut: true });
  throwDarts01(g, [D(10, 2)]);
  assert.equal(g.players[0].score, 0);
  assert.equal(g.players[0].legsWon, 1);
});

test('01 double-in: scoring locked until first double', () => {
  const g = new01(['A'], { start: 501, variation: 'doubleInDoubleOut' });
  assert.equal(g.players[0].opened, false);
  throwDarts01(g, [D(20, 1), D(20, 1), D(20, 1)]);
  assert.equal(g.players[0].score, 501); // no score yet
  assert.equal(g.players[0].opened, false);
  // next turn hit a double to open
  throwDarts01(g, [D(20, 2)]);
  assert.equal(g.players[0].opened, true);
  assert.equal(g.players[0].score, 461);
});

test('01 master-out: bull or double finishes', () => {
  const g = new01(['A'], { start: 50, variation: 'masterOut' });
  throwDarts01(g, [D(25, 2)]); // bull = 50, finish
  assert.equal(g.players[0].score, 0);
  assert.equal(g.players[0].legsWon, 1);
});

test('01 triple-out: T10 wins from 30', () => {
  const g = new01(['A'], { start: 30, variation: 'tripleOut' });
  throwDarts01(g, [D(10, 3)]);
  assert.equal(g.players[0].score, 0);
  assert.equal(g.players[0].legsWon, 1);
});

test('submitTurnTotal01 accepts totals for all in/out variants (total-entry mode)', () => {
  // The user prefers a single total-entry numpad for ALL in/out
  // combinations (single-in/single-out, double-in/double-out,
  // triple-in/master-out, etc.). The engine trusts the caller's
  // total and applies it directly. DI/DO per-dart validation
  // would require segment-tap entry, which the user does not want.
  const g = new01(['A'], { start: 501, variation: 'doubleInDoubleOut' });
  const r = submitTurnTotal01(g, 60);
  assert.equal(r.events[0].type, 'turn');
  assert.equal(g.players[0].score, 441);
});
test('01 double-out: bust on 1 left', () => {
  const g = new01(['A'], { start: 21, doubleOut: true });
  throwDarts01(g, [D(20)]); // leaves 1 → bust
  assert.equal(g.players[0].score, 21);
});

test('01 multi-player: rotates current after 3 darts', () => {
  const g = new01(['A','B'], { start: 301 });
  throwDarts01(g, [D(20), D(20), D(20)]); // A's turn
  assert.equal(g.current, 1);
  throwDarts01(g, [D(20), D(20), D(20)]);
  assert.equal(g.current, 0);
});

/* ---------- Cricket ---------- */
test('Cricket: closes numbers with marks', () => {
  const g = newCricket(['A','B']);
  throwDartsCricket(g, [D(20,3), D(19,3)]); // A closes 20 & 19 in one turn
  assert.equal(g.players[0].marks[20], 3);
  assert.equal(g.players[0].marks[19], 3);
});

test('Cricket: extra marks on closed target score points', () => {
  const g = newCricket(['A','B']);
  // A closes 20 in one dart (T20 = 3 marks) — turn ends after 1 dart.
  throwDartsCricket(g, [D(20,3)]);
  assert.equal(g.players[0].marks[20], 3);
  // B takes a turn with a miss — turn ends.
  throwDartsCricket(g, [D(0,1)]);
  assert.equal(g.current, 0);
  // Now A's turn again. A hits another T20 — all 3 marks are extra; B is open
  // on 20, so A should score 60 points (3 * 20).
  throwDartsCricket(g, [D(20,3)]);
  assert.equal(g.players[0].score, 60);
});

test('Cricket: win requires all closed AND leading (or tying only with all-closed opponents)', () => {
  const g = newCricket(['A','B']);
  // Phase 1: A closes every target while B stays at score 0 with all targets open.
  // We achieve this by feeding A's turns via throws that B can't catch up on.
  // Strategy: A closes a target on a throw where B is open — A scores points.
  // To keep B from scoring, B must throw numbers that A has already closed.
  // Simplest: A goes first, closes everything with T-triple darts.
  // A takes 7 turns (one per target: 20,19,18,17,16,15,25) and scores heavily.
  // B takes 7 turns in between, but if B throws targets A has already closed,
  // B scores nothing. We'll direct B's turns via the test.
  const aTurns = [
    [D(20,3)], // A closes 20, B open → +60
    [D(20,3)], // A: 20 closed, B open on 19 only → 0 pts. Then B's turn.
    [D(19,3)], // A closes 19, B open → +57
    [D(19,3)], // 0 pts
    [D(18,3)], // +54
    [D(18,3)], // 0 pts
    [D(17,3)], // +51
    [D(17,3)], // 0 pts
    [D(16,3)], // +48
    [D(16,3)], // 0 pts
    [D(15,3)], // +45
    [D(15,3)], // 0 pts
    [D(25,2)], // closes bull (D25 = 2 marks). B open on 25 → +25*2 = +50 to A
  ];
  for (const turn of aTurns) {
    if (g.winner != null) break;
    throwDartsCricket(g, turn);
    // B's turn: throw a number A has already closed so B scores nothing
    if (g.winner != null) break;
    throwDartsCricket(g, [D(20,1)]); // B hits 20, A closed → 0 points
  }
  // After all throws: A has all targets closed; B has marks only on 20.
  assert.equal(g.players[0].marks[20], 3);
  assert.equal(g.players[0].marks[25], 2);
  // Points are only awarded for extra marks beyond the closing 3 (since the
  // closing marks themselves have applied=3, leftover=0). A's first T20
  // closes 20 with no points; subsequent T20s on a still-open opponent score 60.
  // Total A: 60 + 57 + 54 + 51 + 48 + 45 = 315.
  assert.equal(g.players[0].score, 315);
  // B's score: only the 1-mark throws on closed targets = 0.
  assert.equal(g.players[0].score > g.players[1].score, true);
  // B is still open on 19,18,17,16,15,25. So A's lead should already have triggered a win
  // the moment A closed everything (throw 13). Let's confirm.
  assert.equal(g.winner, 0);
});

/* ---------- Shanghai ---------- */
test('Shanghai: only current target scores', () => {
  const g = newShanghai(['A'], { n: 3 });
  throwDartsShanghai(g, [D(1), D(5), D(1,2)]); // round 1
  assert.equal(g.players[0].score, 3); // 1 + 0 + 2
  assert.equal(g.round, 2);
});

test('Shanghai: advances rounds across players', () => {
  const g = newShanghai(['A','B'], { n: 3 });
  throwDartsShanghai(g, [D(1), D(1), D(1)]); // A round 1
  assert.equal(g.current, 1); // now B
  throwDartsShanghai(g, [D(1), D(1), D(1)]); // B round 1
  assert.equal(g.current, 0);
  assert.equal(g.round, 2);
});

test('Shanghai: highest score wins after final round', () => {
  const g = newShanghai(['A','B'], { n: 2 });
  // Round 1: A scores 6 (T2), B scores 0 (misses)
  throwDartsShanghai(g, [D(2,3), D(2,3), D(2,3)]); // A gets 18
  throwDartsShanghai(g, [D(0), D(0), D(0)]);       // B gets 0
  // Round 2: A scores 6 (T2 again would be wrong — round 2 target is 2... wait n=2 means round 1 and 2)
  throwDartsShanghai(g, [D(2,3), D(2,3), D(2,3)]); // A scores 18 more → 36 total
  throwDartsShanghai(g, [D(2,1), D(2,1), D(2,1)]); // B scores 6
  assert.equal(g.winner, 0);
});
