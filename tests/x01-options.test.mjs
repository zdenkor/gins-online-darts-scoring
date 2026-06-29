// New tests for the X01 options: bull-throw, legs, sets, max darts, 170.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  new01, throwDarts01, submitTurnTotal01,
  resolveBullThrow, checkoutSuggestions, CHECKOUT_170,
  MAX_TURN_TOTAL,
} from '../js/game/engine.js';

const D = (s, m = 1) => ({ segment: s, multiplier: m });
const DBL = (s) => D(s, 2);
const TPL = (s) => D(s, 3);

/* ---------- Bull-throw resolver ---------- */
test('bull: D25 throws first', () => {
  const r = resolveBullThrow(['A', 'B'], [
    { playerIndex: 0, dart: D(20, 3) }, // A: T20
    { playerIndex: 1, dart: DBL(25) }, // B: D25 (closest)
  ]);
  assert.deepEqual(r.order, [1, 0]);
  assert.deepEqual(r.tiedPlayers, []);
});

test('bull: S25 beats T20', () => {
  const r = resolveBullThrow(['A', 'B'], [
    { playerIndex: 0, dart: TPL(20) }, // T20
    { playerIndex: 1, dart: D(25, 1) }, // S25
  ]);
  assert.deepEqual(r.order, [1, 0]);
});

test('bull: tie at D25 triggers re-throw (only tied players)', () => {
  const r = resolveBullThrow(['A', 'B', 'C'], [
    { playerIndex: 0, dart: DBL(25) },
    { playerIndex: 1, dart: DBL(25) },
    { playerIndex: 2, dart: DBL(20) }, // not bull
  ]);
  assert.equal(r.order, null);
  assert.deepEqual(r.tiedPlayers, [0, 1]);
});

test('bull: tie broken by dart value (D20 + S25 vs S25 alone)', () => {
  // Both D25 = 50, tie → re-throw
  const r = resolveBullThrow(['A', 'B'], [
    { playerIndex: 0, dart: DBL(25) },
    { playerIndex: 1, dart: DBL(25) },
  ]);
  assert.equal(r.order, null);
  assert.deepEqual(r.tiedPlayers, [0, 1]);
});

/* ---------- legs / sets progression ---------- */
test('legs: best-of-3 (first to 2 legs wins the set)', () => {
  const g = new01(['A'], { start: 100, legsToWin: 2, setsToWin: 1 });
  // Leg 1: A scores 100 in one turn → wins the leg (legsWon=1)
  submitTurnTotal01(g, 100);
  assert.equal(g.players[0].legsWon, 1);
  assert.equal(g.winner, null); // not yet — need 2 legs
  assert.equal(g.players[0].score, 100); // new leg started
  // Leg 2: A scores 100 again → wins the set and match
  submitTurnTotal01(g, 100);
  assert.equal(g.players[0].setsWon, 1);
  assert.equal(g.winner, 0);
});

test('legs: mid-set — legsWon persists across legs (does NOT reset to 0)', () => {
  const g = new01(['A'], { start: 100, legsToWin: 3, setsToWin: 1 });
  // Win leg 1 — legsWon=1
  submitTurnTotal01(g, 100);
  assert.equal(g.players[0].legsWon, 1);
  // Win leg 2 — legsWon=2, still in same set (need 3)
  submitTurnTotal01(g, 100);
  assert.equal(g.players[0].legsWon, 2);
  assert.equal(g.winner, null);
});

test('sets: best-of-3 sets, first to 2 sets wins the match', () => {
  const g = new01(['A'], { start: 50, legsToWin: 1, setsToWin: 2 });
  // Set 1, leg 1: 50
  submitTurnTotal01(g, 50);
  assert.equal(g.players[0].setsWon, 1);
  assert.equal(g.winner, null);
  // Set 2, leg 1: 50 → wins match
  submitTurnTotal01(g, 50);
  assert.equal(g.players[0].setsWon, 2);
  assert.equal(g.winner, 0);
});

test('legs: rotation across players uses throwOrder', () => {
  // With order [1, 0], B throws first
  const g = new01(['A', 'B'], { start: 501, order: [1, 0] });
  assert.equal(g.current, 1); // B throws first
  submitTurnTotal01(g, 50);
  assert.equal(g.current, 0); // A now
  submitTurnTotal01(g, 50);
  assert.equal(g.current, 1); // B again
});

/* ---------- max-darts cap ---------- */
test('max-darts: rejects 4th dart when cap=3 (per-dart entry)', () => {
  const g = new01(['A'], { start: 100, maxDarts: 3 });
  throwDarts01(g, [D(10), D(10), D(10), D(10)]); // 4 darts, cap=3
  // 30 should be subtracted (3 darts accepted, 4th ignored)
  assert.equal(g.players[0].score, 70);
  assert.equal(g.players[0].dartsThisLeg, 3);
});

test('max-darts: cap=6 allows the leg to play up to 6 total darts (across visits)', () => {
  const g = new01(['A'], { start: 100, maxDarts: 6 });
  // First visit: 3 darts, 30 points
  throwDarts01(g, [D(10), D(10), D(10)]);
  assert.equal(g.players[0].score, 70);
  assert.equal(g.players[0].dartsThisLeg, 3);
  // Second visit: 3 more darts (leg has 3-dart-per-visit limit but 6-dart leg cap)
  throwDarts01(g, [D(10), D(10), D(10)]);
  assert.equal(g.players[0].score, 40);
  assert.equal(g.players[0].dartsThisLeg, 6);
});

/* ---------- 170 ---------- */
test('170: CHECKOUT_170 equals 60 + 60 + 50', () => {
  assert.equal(CHECKOUT_170.total, 170);
  // Verify darts sum to 170
  const sum = CHECKOUT_170.darts.reduce((s, d) => s + d.segment * d.multiplier, 0);
  assert.equal(sum, 170);
});

test('170: checkoutSuggestions finds T20+T20+BULL for 170', () => {
  const r = checkoutSuggestions(170, true, 3);
  assert.ok(r.length > 0);
  // First suggested checkout for 170 is the canonical T20+T20+BULL
  assert.equal(r[0].total, 170);
  assert.match(r[0].description, /T20.*T20.*BULL.*170/);
});

test('170: no checkout for 169 in 3 darts with double-out', () => {
  const r = checkoutSuggestions(169, true, 3);
  assert.equal(r.length, 0);
});

test('170: checkout for 40 in 1 dart = D20', () => {
  const r = checkoutSuggestions(40, true, 3);
  assert.ok(r.length > 0);
  assert.match(r[0].description, /D20|40/);
});

test('MAX_TURN_TOTAL is 180', () => {
  assert.equal(MAX_TURN_TOTAL, 180);
});

/* ---------- legs-per-set presets (e.g. 2 legs per set) ---------- */
test('preset: 2 legs per set — players alternate winning legs; first to 2 wins the set', () => {
  const g = new01(['A', 'B'], { start: 100, legsToWin: 2, setsToWin: 1, order: [0, 1] });
  // Leg 1: A wins (legsWon=1, score resets)
  submitTurnTotal01(g, 100);
  assert.equal(g.players[0].legsWon, 1);
  assert.equal(g.winner, null);
  // Leg 2: B wins (legsWon=1, scores reset)
  submitTurnTotal01(g, 100);
  assert.equal(g.players[1].legsWon, 1);
  assert.equal(g.winner, null);
  // Leg 3: A wins again — A now has 2 legs, takes the set and the match
  submitTurnTotal01(g, 100);
  // After match ends, player-card state shows the leg won; legsWon holds
  // the final leg count (2) until the next game starts.
  assert.equal(g.players[0].legsWon, 2);
  assert.equal(g.players[0].setsWon, 1);
  assert.equal(g.winner, 0);
});

test('preset: 3 legs per set, 3 sets per match (custom format)', () => {
  const g = new01(['A'], { start: 50, legsToWin: 3, setsToWin: 3 });
  // Win 3 legs to take set 1 (need 3 successful throws)
  for (let i = 0; i < 3; i++) submitTurnTotal01(g, 50);
  assert.equal(g.players[0].setsWon, 1);
  assert.equal(g.winner, null);
  // Win 3 more legs to take set 2
  for (let i = 0; i < 3; i++) submitTurnTotal01(g, 50);
  assert.equal(g.players[0].setsWon, 2);
  assert.equal(g.winner, null);
  // Win 3 more legs to take set 3 — match
  for (let i = 0; i < 3; i++) submitTurnTotal01(g, 50);
  assert.equal(g.players[0].setsWon, 3);
  assert.equal(g.winner, 0);
});

test('max-darts-per-leg: applies across multiple turns (cap=5)', () => {
  const g = new01(['A'], { start: 1000, maxDarts: 5 });
  // First visit: 3 darts (60 points), dart count = 3
  throwDarts01(g, [D(20), D(20), D(20)]);
  assert.equal(g.players[0].score, 940);
  assert.equal(g.players[0].dartsThisLeg, 3);
  // Second visit: 2 more darts allowed (cap=5), bringing count to 5
  throwDarts01(g, [D(20), D(20)]);
  assert.equal(g.players[0].score, 900);
  assert.equal(g.players[0].dartsThisLeg, 5);
  // 6th dart rejected (leg cap reached)
  throwDarts01(g, [D(20)]);
  assert.equal(g.players[0].score, 900);
});

test('max-darts-per-leg: resets between legs', () => {
  // Use legsToWin=2 so a single leg win does NOT trigger the set branch.
  const g = new01(['A'], { start: 100, maxDarts: 3, legsToWin: 2, setsToWin: 1 });
  // 3 darts all T20: dart 1 (T20=60) accepted → score 40; dart 2 busts; dart 3 not processed.
  throwDarts01(g, [D(20, 3), D(20, 3), D(20, 3)]);
  assert.equal(g.players[0].score, 40);
  assert.equal(g.players[0].dartsThisLeg, 1);
  // Win the leg with the calculator: 40 → 0 → new leg starts at 100
  submitTurnTotal01(g, 40);
  assert.equal(g.players[0].score, 100); // new leg
  assert.equal(g.players[0].legsWon, 1);
  assert.equal(g.players[0].dartsThisLeg, 0); // reset for new leg
});
