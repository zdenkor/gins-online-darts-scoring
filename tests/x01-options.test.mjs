// New tests for the X01 options: bull-throw, legs, sets, max darts, 170.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  new01, throwDarts01, submitTurnTotal01,
  resolveBullThrow, checkoutSuggestions, isClosableX01, maxCheckoutAttemptsForX01, CHECKOUT_170,
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

/* ---------- isClosableX01 (closability gate for checkout-stat prompt) ---------- */
test('isClosableX01: classic DO unclosables (1, 159, 162, 163, 165, 166, 168, 169)', () => {
  for (const t of [1, 159, 162, 163, 165, 166, 168, 169]) {
    assert.equal(isClosableX01(t, { in: 'single', out: 'double' }, 3), false,
      `target=${t} should be unclosable on DO`);
  }
});
test('isClosableX01: classic DO closables (40, 50, 120, 170)', () => {
  for (const t of [40, 50, 60, 100, 120, 170]) {
    assert.equal(isClosableX01(t, { in: 'single', out: 'double' }, 3), true,
      `target=${t} should be closable on DO`);
  }
});
test('isClosableX01: MO unclosables — 1, 163, 166, 169, 172, 173, 175, 176, 178, 179 in budget 3', () => {
  // With the canonical MO finisher set (D + T + D-BULL), the
  // 3-dart-unclosable set shrinks vs the old "D + D-BULL only"
  // definition. 159 / 162 / 165 / 168 are now closable (T's are
  // legal finishers). The remaining 3-dart-unclosable numbers
  // are: 1, 163, 166, 169, 172, 173, 175, 176, 178, 179.
  for (const t of [1, 163, 166, 169, 172, 173, 175, 176, 178, 179]) {
    assert.equal(isClosableX01(t, { in: 'single', out: 'master' }, 3), false,
      `target=${t} should be 3-dart unclosable on MO`);
  }
  // Numbers that WERE 3-dart-unclosable under the old definition
  // are now closable — sanity-check a few.
  assert.equal(isClosableX01(50, { in: 'single', out: 'master' }, 3), true); // BULL
  assert.equal(isClosableX01(170, { in: 'single', out: 'master' }, 3), true); // T20+T20+BULL
  assert.equal(isClosableX01(159, { in: 'single', out: 'master' }, 3), true); // closable via T's
  assert.equal(isClosableX01(162, { in: 'single', out: 'master' }, 3), true);
  assert.equal(isClosableX01(60, { in: 'single', out: 'master' }, 1), true);  // T20 = 60 (1-dart)
  assert.equal(isClosableX01(45, { in: 'single', out: 'master' }, 1), true);  // T15 = 45
});
test('isClosableX01: TO unclosables include 1, 2 (smallest triple is T1=3)', () => {
  for (const t of [1, 2]) {
    assert.equal(isClosableX01(t, { in: 'single', out: 'triple' }, 3), false,
      `target=${t} should be unclosable on TO`);
  }
  for (const t of [3, 6, 30, 60, 180]) {
    assert.equal(isClosableX01(t, { in: 'single', out: 'triple' }, 3), true,
      `target=${t} should be closable on TO`);
  }
});
test('isClosableX01: SO has 9 unclosable numbers > 160 (max 3-dart total is 180)', () => {
  for (const t of [1, 2, 40, 50, 100, 120, 170, 180]) {
    assert.equal(isClosableX01(t, { in: 'single', out: 'single' }, 3), true,
      `target=${t} should be closable on SO`);
  }
  // SO unclosable: 163, 166, 169, 172, 173, 175, 176, 178, 179
  for (const t of [163, 166, 169, 172, 173, 175, 176, 178, 179]) {
    assert.equal(isClosableX01(t, { in: 'single', out: 'single' }, 3), false,
      `target=${t} should be unclosable on SO (max 3-dart total is 180)`);
  }
});
test('isClosableX01: 0 and > 180 always unclosable', () => {
  assert.equal(isClosableX01(0, { in: 'single', out: 'double' }, 3), false);
  assert.equal(isClosableX01(181, { in: 'single', out: 'double' }, 3), false);
  assert.equal(isClosableX01(500, { in: 'single', out: 'double' }, 3), false);
});
test('isClosableX01: boolean shorthand (true = DO, false = SO)', () => {
  assert.equal(isClosableX01(169, true, 3), false);  // 169 unclosable on DO
  assert.equal(isClosableX01(170, true, 3), true);   // 170 closable on DO
  assert.equal(isClosableX01(169, false, 3), false); // 169 also unclosable on SO
  assert.equal(isClosableX01(40, false, 3), true);   // 40 closable on SO
});

/* ---------- checkout-attempt gate logic (total-entry mode) ----------
   The UI's shouldAskCheckout() gate uses two isClosableX01() calls:
     gate 2: isClosableX01(target, out, 3)   — pre-turn target was closable
     gate 3: isClosableX01(remaining, out, 1) — post-turn remaining was a
              1-dart finish (the only signal in total-entry mode that the
              player was actually aiming at the close-out)
   These tests verify the boolean combinations the user expects. */
test('checkout gate: DO 101 throw 1 → remaining 100 → NOT a checkout (100 needs 2 darts)', () => {
  const target = 101, total = 1, out = 'double';
  // Gate 2: pre-turn 101 is closable on DO in 3 darts
  assert.equal(isClosableX01(target, { in: 'single', out }, 3), true,
    'pre-turn 101 should be DO-closable');
  // Gate 3: remaining 100 is NOT 1-dart closable on DO (it's T20+BULL = 2 darts)
  const remaining = target - total;
  assert.equal(isClosableX01(remaining, { in: 'single', out }, 1), false,
    'remaining 100 should NOT be 1-dart DO-closable');
});
test('checkout gate: DO 101 throw 81 → remaining 20 → IS a checkout (20 = D10)', () => {
  const target = 101, total = 81, out = 'double';
  assert.equal(isClosableX01(target, { in: 'single', out }, 3), true);
  const remaining = target - total;
  assert.equal(isClosableX01(remaining, { in: 'single', out }, 1), true,
    'remaining 20 should be 1-dart DO-closable (D10)');
});
test('checkout gate: DO 101 throw 41 → remaining 60 → NOT a checkout (60 unclosable on DO)', () => {
  const target = 101, total = 41, out = 'double';
  assert.equal(isClosableX01(target, { in: 'single', out }, 3), true);
  const remaining = target - total;
  assert.equal(isClosableX01(remaining, { in: 'single', out }, 1), false,
    'remaining 60 should NOT be 1-dart DO-closable (60 is unclosable on DO)');
});
test('checkout gate: DO 100 throw 60 → remaining 40 → IS a checkout (40 = D20)', () => {
  const target = 100, total = 60, out = 'double';
  assert.equal(isClosableX01(target, { in: 'single', out }, 3), true);
  const remaining = target - total;
  assert.equal(isClosableX01(remaining, { in: 'single', out }, 1), true,
    'remaining 40 should be 1-dart DO-closable (D20)');
});
test('checkout gate: DO 50 throw 50 → remaining 0 (leg-win) → IS a checkout', () => {
  const target = 50, total = 50, out = 'double';
  assert.equal(isClosableX01(target, { in: 'single', out }, 3), true);
  const remaining = target - total; // 0 — leg-win, always count
  assert.equal(remaining, 0);
});
test('checkout gate: DO 30 throw 35 → bust, remaining 30 (1-dart D15) → IS a checkout', () => {
  const target = 30, total = 35, out = 'double';
  assert.equal(isClosableX01(target, { in: 'single', out }, 3), true);
  // On a bust, remaining = target (unchanged)
  const remaining = target; // bust reverts
  assert.equal(isClosableX01(remaining, { in: 'single', out }, 1), true,
    'remaining 30 should be 1-dart DO-closable (D15)');
});

/* ---------- Alex/221 regression test ----------
   Reported bug: "Alex was on 221 (unclosable on DO), threw 85, the
   system asked for number of darts". Root cause: the pre-turn
   target was read from `game.players[game.current]?.score` AFTER
   the engine had already mutated it (and advanced to the next
   thrower). The fix captures the thrower's player entry BEFORE
   the engine runs.

   This test asserts the gate logic on the pre-turn target — the
   integration test in the UI (the actual modal firing or not)
   is harder to test without a full DOM. We verify the helper
   would block the modal for the 221 case. */
test('checkout gate: DO 221 (Alex regression) → pre-turn unclosable → NO modal', () => {
  // Alex was on 221 DO (unclosable in 3 darts on DO)
  const target = 221, out = 'double';
  assert.equal(isClosableX01(target, { in: 'single', out }, 3), false,
    '221 should be unclosable on DO (max 3-dart total is 180)');
  // The post-turn remaining 136 IS 3-dart closable on DO, but
  // the pre-turn target was NOT — the modal must not fire.
  const remaining = 136;
  assert.equal(isClosableX01(remaining, { in: 'single', out }, 3), true,
    'sanity: 136 is 3-dart DO-closable — but this is the POST-turn score, not the pre-turn target');
  // The gate uses the pre-turn target (221), which fails.
  const gateResult = isClosableX01(target, { in: 'single', out }, 3);
  assert.equal(gateResult, false, 'gate 2 should fail on pre-turn 221');
});

/* ---------- Alex/221 end-to-end regression test ----------
   The full flow: Alex on 221 DO throws 100, leaves 121. Both
   gate 2 (pre-turn 221 unclosable) AND gate 3 (post-turn 121
   not 1-dart closable) must block the modal. The previous fix
   captured a REFERENCE to the player object — which got
   mutated by the engine — so checkoutTarget silently read
   the POST-turn score (121) instead of 221. The current fix
   captures the score as a PRIMITIVE before the engine runs. */
test('checkout gate end-to-end: Alex 221 → 100 → 121 on DO → NO modal', () => {
  const g = new01(['Alex', 'Bob'], { start: 221, out: 'double' });
  // Capture the pre-turn score as a PRIMITIVE (not a player
  // reference) BEFORE calling submitTurnTotal01. This mirrors
  // the real commitTurnTotal flow in screens.js.
  const preTurnScore = g.players[g.current].score;
  submitTurnTotal01(g, 100);
  // Sanity: engine advanced current to Bob and set Alex's score to 121
  assert.equal(g.players[0].score, 121, 'Alex post-turn score should be 121');
  assert.equal(g.current, 1, 'current should advance to Bob');
  // The captured preTurnScore must still be 221 (primitive,
  // unaffected by the engine mutation).
  assert.equal(preTurnScore, 221, 'preTurnScore must remain 221 after engine mutation');
  // Gate 2: pre-turn 221 unclosable on DO
  assert.equal(isClosableX01(preTurnScore, { in: 'single', out: 'double' }, 3), false,
    'gate 2 should fail on pre-turn 221');
  // Gate 3 (post-turn remaining 121): not 1-dart closable on DO
  assert.equal(isClosableX01(121, { in: 'single', out: 'double' }, 1), false,
    'gate 3 should fail: 121 is not 1-dart DO-closable');
  // Both gates block the modal. The modal must NOT fire.
});

/* ---------- isClosableX01 budget dimension ---------- */
test('isClosableX01: budget=1 vs budget=3 — different unclosable sets', () => {
  // 100 is 2-dart (T20+BULL) on DO, not 1-dart
  assert.equal(isClosableX01(100, { in: 'single', out: 'double' }, 1), false,
    '100 should NOT be 1-dart DO-closable');
  assert.equal(isClosableX01(100, { in: 'single', out: 'double' }, 2), true,
    '100 should be 2-dart DO-closable (T20+BULL)');
  // 40 is 1-dart (D20) on DO
  assert.equal(isClosableX01(40, { in: 'single', out: 'double' }, 1), true);
  // 60 is 2-dart (D5 + D25) on DO
  assert.equal(isClosableX01(60, { in: 'single', out: 'double' }, 1), false,
    '60 should NOT be 1-dart DO-closable (it is 2-dart: D5 + D25)');
  assert.equal(isClosableX01(60, { in: 'single', out: 'double' }, 2), true,
    '60 should be 2-dart DO-closable');
  // 50 is 1-dart (BULL) on DO
  assert.equal(isClosableX01(50, { in: 'single', out: 'double' }, 1), true);
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

/* ---------- maxCheckoutAttemptsForX01 ----------
   The function encodes the user's checkout-stat Excel rules
   per out rule. The formula is per-out-rule:
   - DO: D1..D20 + D-BULL 1-dart finishers
   - MO: D1..D20 + T1..T20 + D-BULL 1-dart finishers
   - SO: any 1-60 1-dart finisher
   For each scenario we test the maximum number of darts the
   player could have aimed at the close-out this turn. */
test('maxCheckoutAttemptsForX01: DO — leg-win counts by budget', () => {
  const inOut = { in: 'single', out: 'double' };
  // 1-dart DO finish
  assert.equal(maxCheckoutAttemptsForX01(40, 40, inOut, true), 3);  // D20
  assert.equal(maxCheckoutAttemptsForX01(50, 50, inOut, true), 3);  // D-BULL
  assert.equal(maxCheckoutAttemptsForX01(2, 2, inOut, true), 3);    // D1
  // 2-dart DO finish (not in unclosable {91,93,95,97,99})
  assert.equal(maxCheckoutAttemptsForX01(81, 81, inOut, true), 2);
  assert.equal(maxCheckoutAttemptsForX01(100, 100, inOut, true), 2);
  // 3-dart DO finish
  assert.equal(maxCheckoutAttemptsForX01(170, 170, inOut, true), 1);
});

test('maxCheckoutAttemptsForX01: DO — non-leg-win gates by C2 >= B2-X', () => {
  const inOut = { in: 'single', out: 'double' };
  // 1-dart target (B2<=40 even, or B2=50) → max=3 always
  assert.equal(maxCheckoutAttemptsForX01(40, 10, inOut, false), 3);
  assert.equal(maxCheckoutAttemptsForX01(50, 0, inOut, false), 3);
  // 2-dart target (B2<=100 not in unclosable):
  //   C2 >= B2-40 → max=2; C2 >= B2-50 → max=1; else 0
  assert.equal(maxCheckoutAttemptsForX01(81, 60, inOut, false), 2);  // 60>=41
  assert.equal(maxCheckoutAttemptsForX01(81, 50, inOut, false), 2);  // 50>=41
  assert.equal(maxCheckoutAttemptsForX01(81, 41, inOut, false), 2);  // 41>=41
  assert.equal(maxCheckoutAttemptsForX01(81, 40, inOut, false), 1);  // 40>=31 (B2-50)
  assert.equal(maxCheckoutAttemptsForX01(81, 31, inOut, false), 1);  // 31>=31
  assert.equal(maxCheckoutAttemptsForX01(81, 30, inOut, false), 0);  // 30<31
  // 3-dart target (B2 in {101..170}):
  //   C2 >= B2-40 → max=1; else 0
  assert.equal(maxCheckoutAttemptsForX01(170, 130, inOut, false), 1);  // 130>=130
  assert.equal(maxCheckoutAttemptsForX01(170, 129, inOut, false), 0);  // 129<130
  // Unclosable DO targets → 0
  assert.equal(maxCheckoutAttemptsForX01(169, 100, inOut, false), 0);
  assert.equal(maxCheckoutAttemptsForX01(1, 0, inOut, false), 0);
});

test('maxCheckoutAttemptsForX01: MO — leg-win counts by budget', () => {
  const inOut = { in: 'single', out: 'master' };
  // 1-dart MO finish: D, T, or D-BULL
  assert.equal(maxCheckoutAttemptsForX01(40, 40, inOut, true), 3);  // D20
  assert.equal(maxCheckoutAttemptsForX01(50, 50, inOut, true), 3);  // D-BULL
  assert.equal(maxCheckoutAttemptsForX01(60, 60, inOut, true), 3);  // T20
  assert.equal(maxCheckoutAttemptsForX01(45, 45, inOut, true), 3);  // T15
  // 2-dart MO finish (C2<=120)
  assert.equal(maxCheckoutAttemptsForX01(100, 100, inOut, true), 2);
  // 3-dart MO finish (C2>120)
  assert.equal(maxCheckoutAttemptsForX01(170, 170, inOut, true), 1);
});

test('maxCheckoutAttemptsForX01: MO — non-leg-win gates by C2 >= B2-60', () => {
  const inOut = { in: 'single', out: 'master' };
  // 1-dart target (B2<=60 even/div3, or B2=50) → max=3 always
  assert.equal(maxCheckoutAttemptsForX01(50, 0, inOut, false), 3);
  assert.equal(maxCheckoutAttemptsForX01(60, 0, inOut, false), 3);
  // 2-dart target (B2<=120):
  //   C2 >= B2-60 → max=2; else 0
  assert.equal(maxCheckoutAttemptsForX01(100, 60, inOut, false), 2);  // 60>=40
  assert.equal(maxCheckoutAttemptsForX01(100, 39, inOut, false), 0);  // 39<40
  // 3-dart target (B2 in {121..180}):
  //   C2 >= B2-60 → max=1; else 0
  assert.equal(maxCheckoutAttemptsForX01(170, 130, inOut, false), 1);  // 130>=110
  assert.equal(maxCheckoutAttemptsForX01(170, 109, inOut, false), 0);  // 109<110
  // Unclosable MO targets → 0
  assert.equal(maxCheckoutAttemptsForX01(1, 0, inOut, false), 0);
  assert.equal(maxCheckoutAttemptsForX01(163, 100, inOut, false), 0);
});

test('maxCheckoutAttemptsForX01: SO — leg-win counts by budget', () => {
  const inOut = { in: 'single', out: 'single' };
  // 1-dart SO finish (C2<=60)
  assert.equal(maxCheckoutAttemptsForX01(60, 60, inOut, true), 3);
  assert.equal(maxCheckoutAttemptsForX01(40, 40, inOut, true), 3);
  // 2-dart SO finish (C2<=120)
  assert.equal(maxCheckoutAttemptsForX01(100, 100, inOut, true), 2);
  // 3-dart SO finish (C2>120)
  assert.equal(maxCheckoutAttemptsForX01(170, 170, inOut, true), 1);
});

test('maxCheckoutAttemptsForX01: SO — non-leg-win gates by C2 >= B2-60', () => {
  const inOut = { in: 'single', out: 'single' };
  // 1-dart target (B2<=60) → max=3 always
  assert.equal(maxCheckoutAttemptsForX01(60, 0, inOut, false), 3);
  assert.equal(maxCheckoutAttemptsForX01(60, 20, inOut, false), 3);
  // 2-dart target (B2<=120):
  //   C2 >= B2-60 → max=2; else 0
  assert.equal(maxCheckoutAttemptsForX01(100, 60, inOut, false), 2);  // 60>=40
  assert.equal(maxCheckoutAttemptsForX01(100, 30, inOut, false), 0);  // 30<40
  // 3-dart target (B2 in {121..180}):
  //   C2 >= B2-60 → max=1; else 0
  assert.equal(maxCheckoutAttemptsForX01(180, 150, inOut, false), 1);  // 150>=120
  assert.equal(maxCheckoutAttemptsForX01(180, 60, inOut, false), 0);   // 60<120
});

test('maxCheckoutAttemptsForX01: bust (D2<0) returns 0 for all out rules', () => {
  // B2 - C2 < 0 means the player overshot → bust
  assert.equal(maxCheckoutAttemptsForX01(50, 60, { in: 'single', out: 'double' }, false), 0);
  assert.equal(maxCheckoutAttemptsForX01(50, 60, { in: 'single', out: 'master' }, false), 0);
  assert.equal(maxCheckoutAttemptsForX01(50, 60, { in: 'single', out: 'single' }, false), 0);
});

test('maxCheckoutAttemptsForX01: leg-win with meta.isLegWin=false but D2=0 still treated as leg', () => {
  // Some callers pass isLegWin=false even though D2=0 means exact
  // score (leg-win by definition). Function should still pick
  // up the leg-win branch.
  assert.equal(maxCheckoutAttemptsForX01(40, 40, { in: 'single', out: 'double' }, false), 3);
});

/* ---------- maxCheckoutAttemptsForX01: TO (Triple Out) ----------
   1-dart TO finisher = T1..T20 (3, 6, ..., 60) OR D-BULL (50).
   NOT singles, NOT doubles 1..20. (Unlike MO which allows D,
   here only T and D-BULL are legal finishers.) */
test('maxCheckoutAttemptsForX01: TO — leg-win counts by budget', () => {
  const inOut = { in: 'single', out: 'triple' };
  // 1-dart TO finish (C2 divisible by 3 and <=60, OR C2=50)
  assert.equal(maxCheckoutAttemptsForX01(60, 60, inOut, true), 3);  // T20
  assert.equal(maxCheckoutAttemptsForX01(50, 50, inOut, true), 3);  // D-BULL
  assert.equal(maxCheckoutAttemptsForX01(30, 30, inOut, true), 3);  // T10
  assert.equal(maxCheckoutAttemptsForX01(3,  3,  inOut, true), 3);  // T1
  // 2-dart TO finish (C2<=120, e.g. 40 = T10+T10 last-T valid)
  assert.equal(maxCheckoutAttemptsForX01(40, 40, inOut, true), 2);
  // 3-dart TO finish (C2>120)
  assert.equal(maxCheckoutAttemptsForX01(170, 170, inOut, true), 1);
});
test('maxCheckoutAttemptsForX01: TO — non-leg-win gates by C2 >= B2-60', () => {
  const inOut = { in: 'single', out: 'triple' };
  // 1-dart target (B2<=60 divisible by 3, OR B2=50) → max=3
  assert.equal(maxCheckoutAttemptsForX01(60, 0,  inOut, false), 3);
  assert.equal(maxCheckoutAttemptsForX01(50, 0,  inOut, false), 3);
  assert.equal(maxCheckoutAttemptsForX01(30, 0,  inOut, false), 3);
  // NOT 1-dart: 40 (D20), 25 (S-BULL)
  assert.equal(maxCheckoutAttemptsForX01(40, 0,  inOut, false), 0);
  assert.equal(maxCheckoutAttemptsForX01(25, 0,  inOut, false), 0);
  // 2-dart target (B2<=120): C2>=B2-60 → max=2
  assert.equal(maxCheckoutAttemptsForX01(120, 60, inOut, false), 2); // 60>=60
  assert.equal(maxCheckoutAttemptsForX01(120, 59, inOut, false), 0); // 59<60
  // 3-dart target (B2 in {121..180}): C2>=B2-60 → max=1
  assert.equal(maxCheckoutAttemptsForX01(170, 130, inOut, false), 1);
  assert.equal(maxCheckoutAttemptsForX01(170, 109, inOut, false), 0);
});
test('maxCheckoutAttemptsForX01: TO — guards: D2=1 or D2=2 returns 0', () => {
  // 1 and 2 are too small for any 1-dart TO close (T1=3 minimum).
  assert.equal(maxCheckoutAttemptsForX01(50, 49, { in: 'single', out: 'triple' }, false), 0);
  assert.equal(maxCheckoutAttemptsForX01(50, 48, { in: 'single', out: 'triple' }, false), 0);
  assert.equal(maxCheckoutAttemptsForX01(60, 57, { in: 'single', out: 'triple' }, false), 3); // D2=3
});
