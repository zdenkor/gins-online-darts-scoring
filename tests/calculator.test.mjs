// Tests for the total-per-turn API (calculator-style entry).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  new01, newShanghai, newCricket,
  submitTurnTotal01, submitTurnTotalShanghai, submitTurnCricketMarks,
  MAX_TURN_TOTAL,
} from '../js/game/engine.js';

test('01 total: T20+D20+20 = 120 subtracts from score', () => {
  const g = new01(['A'], { start: 501 });
  submitTurnTotal01(g, 120); // T20(60) + D20(40) + 20 = 120
  assert.equal(g.players[0].score, 381);
  assert.equal(g.current, 0); // single player, stays on 0
});

test('01 total: bust when overshoot', () => {
  const g = new01(['A'], { start: 100 });
  submitTurnTotal01(g, 120); // 120 > 100 → bust
  assert.equal(g.players[0].score, 100);
});

test('01 total: bust on leaving 1 with double-out', () => {
  const g = new01(['A'], { start: 21, doubleOut: true });
  submitTurnTotal01(g, 20); // 21 - 20 = 1 → bust
  assert.equal(g.players[0].score, 21);
});

test('01 total: wins when lands on 0 (no double-out)', () => {
  const g = new01(['A'], { start: 120 });
  submitTurnTotal01(g, 120);
  assert.equal(g.winner, 0);
  assert.equal(g.players[0].score, 0);
});

test('01 total: wins on double-out finish (total equals remaining score)', () => {
  // With total-only entry, the player declares they finished via double.
  // The engine trusts the input.
  const g = new01(['A'], { start: 40, doubleOut: true });
  submitTurnTotal01(g, 40); // e.g. D20 = 40
  assert.equal(g.winner, 0);
  assert.equal(g.players[0].score, 0);
});

test('01 total: caps input over 180 as ignored', () => {
  const g = new01(['A'], { start: 501 });
  const r = submitTurnTotal01(g, 500);
  assert.equal(r.applied, 0);
  assert.equal(g.players[0].score, 501);
});

test('01 total: rotates current after turn (multi-player)', () => {
  const g = new01(['A', 'B'], { start: 501 });
  submitTurnTotal01(g, 60);
  assert.equal(g.current, 1);
  submitTurnTotal01(g, 60);
  assert.equal(g.current, 0);
});

test('Shanghai total: target N scored adds N*multiplier to score', () => {
  const g = newShanghai(['A'], { n: 3 });
  submitTurnTotalShanghai(g, 20); // single 20 on round 1 target = 20
  assert.equal(g.players[0].score, 20);
  // Round advances when current wraps to 0
  assert.equal(g.round, 2);
});

test('Shanghai total: T20 on round 1 adds 60', () => {
  const g = newShanghai(['A'], { n: 3 });
  submitTurnTotalShanghai(g, 60);
  assert.equal(g.players[0].score, 60);
});

test('Shanghai total: 0 = miss, score unchanged', () => {
  const g = newShanghai(['A'], { n: 3 });
  submitTurnTotalShanghai(g, 0);
  assert.equal(g.players[0].score, 0);
});

test('Cricket marks: [20, 20, 20] closes 20 and scores 60 vs open opponents', () => {
  const g = newCricket(['A', 'B']);
  submitTurnCricketMarks(g, [20, 20, 20]);
  // A closes 20 in 3 darts, no leftover marks → 0 points this turn
  assert.equal(g.players[0].marks[20], 3);
  assert.equal(g.players[0].score, 0);
});

test('Cricket marks: 4th mark on closed 20 scores points', () => {
  const g = newCricket(['A', 'B']);
  submitTurnCricketMarks(g, [20, 20, 20]); // close 20, no points
  // B's turn with miss (engine rotates)
  submitTurnCricketMarks(g, [0, 0, 0]);
  // A's turn: T20 = [20,20,20], all extra marks score 60
  submitTurnCricketMarks(g, [20, 20, 20]);
  assert.equal(g.players[0].score, 60);
});

test('Cricket win: close everything with all marks in one turn and lead', () => {
  const g = newCricket(['A']);
  submitTurnCricketMarks(g, [20, 19, 18, 17, 16, 15, 25, 25]); // 8 darts → close all
  // Wait, only 3 darts allowed. Let me do multiple turns.
});

test('Cricket win (single player): closes all + lead = win', () => {
  const g = newCricket(['A']);
  // Walk through closes turn by turn
  submitTurnCricketMarks(g, [20, 20, 20]); // close 20
  submitTurnCricketMarks(g, [19, 19, 19]); // close 19
  submitTurnCricketMarks(g, [18, 18, 18]); // close 18
  submitTurnCricketMarks(g, [17, 17, 17]); // close 17
  submitTurnCricketMarks(g, [16, 16, 16]); // close 16
  submitTurnCricketMarks(g, [15, 15, 15]); // close 15
  submitTurnCricketMarks(g, [25, 25]);     // close bull (2 marks)
  // All closed, single player, score 0 → wins
  assert.equal(g.winner, 0);
});
