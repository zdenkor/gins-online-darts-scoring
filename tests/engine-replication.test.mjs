// Tests for engine replication (Option B: same events → same state).
// We run two independent engine instances and feed them the same
// sequence of turn totals. After every turn, their states must be
// deep-equal. This is the foundation of the v0.0.0.7 tournament
// sync: both host and peer run the same engine; the network carries
// the events, not the state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { new01, submitTurnTotal01, throwDarts01 } from '../js/game/engine.js';

function deepEqual(a, b) {
  // Strip startedAt — the engine uses Date.now() which makes two
  // engines initialized at different ms have different timestamps.
  // For the replication test, we care that the *gameplay state* is
  // identical, not the wall-clock initialization time.
  const sa = (s) => { const { startedAt, ...rest } = s; return rest; };
  return JSON.stringify(sa(a)) === JSON.stringify(sa(b));
}

// Mirror of the screens.js switchThrower / endLeg behavior, written
// here so we can exercise the engine in isolation. The replication
// invariant is: given the same sequence of "mutations" (turn + switch),
// both engines land in the same state.
function switchTo(state, idx) {
  if (state.current === idx) return;
  // Cycle: the engine doesn't expose a direct switch, so we just
  // run a no-op turn on the current player to advance. But that
  // adds darts. Instead, we set the current directly. The engine
  // allows this in tests (no immutability guard).
  state.current = idx;
}

test('two engines stay in sync on a 501 1-leg game', () => {
  const host = new01(['Alice', 'Bob'], { start: 501, doubleOut: true, legsToWin: 1 });
  const peer = new01(['Alice', 'Bob'], { start: 501, doubleOut: true, legsToWin: 1 });

  // Sequence of turn totals, alternating Alice / Bob.
  const turns = [
    { player: 0, total: 60 },
    { player: 1, total: 100 },
    { player: 0, total: 140 },
    { player: 1, total: 121 },
    { player: 0, total: 60 },
    { player: 1, total: 180 },
    { player: 0, total: 81 },
    { player: 1, total: 100 },
  ];

  for (const t of turns) {
    switchTo(host, t.player);
    switchTo(peer, t.player);
    const r1 = submitTurnTotal01(host, t.total);
    const r2 = submitTurnTotal01(peer, t.total);
    assert.equal(r1.darts, r2.darts, `dart count mismatch on turn total=${t.total}`);
  }

  assert.ok(deepEqual(host, peer), 'engines diverged after same sequence of turns');
});

test('replication handles bust turns identically', () => {
  const host = new01(['Alice', 'Bob'], { start: 501, doubleOut: true, legsToWin: 1 });
  const peer = new01(['Alice', 'Bob'], { start: 501, doubleOut: true, legsToWin: 1 });

  // Walk Alice down to 50, then she throws 60 → bust (state stays at 50).
  for (let i = 0; i < 3; i++) {
    switchTo(host, 0);
    switchTo(peer, 0);
    submitTurnTotal01(host, 100);  // 501 → 401 → 301 → 201 → 101 (after 4 turns actually)
    submitTurnTotal01(peer, 100);
  }
  // After 3 turns: Alice at 201.
  // One more:
  switchTo(host, 0);
  switchTo(peer, 0);
  submitTurnTotal01(host, 100);  // 101
  submitTurnTotal01(peer, 100);
  // Now Alice at 101, throws 60 → 41, valid.
  switchTo(host, 0);
  switchTo(peer, 0);
  submitTurnTotal01(host, 60);
  submitTurnTotal01(peer, 60);
  // Now Alice at 41. Bob throws something.
  switchTo(host, 1);
  switchTo(peer, 1);
  submitTurnTotal01(host, 50);
  submitTurnTotal01(peer, 50);
  // Alice throws 60 (would leave her at -19) → bust
  switchTo(host, 0);
  switchTo(peer, 0);
  const r1 = submitTurnTotal01(host, 60);
  const r2 = submitTurnTotal01(peer, 60);
  assert.equal(r1.darts, r2.darts);
  // After bust, Alice's score should be 41 (unchanged from before the turn)
  assert.equal(host.players[0].score, 41);
  assert.equal(peer.players[0].score, 41);
  assert.ok(deepEqual(host, peer), 'bust handling diverged');
});

test('throwDarts01 (per-dart input) replicates identically', () => {
  const host = new01(['Alice', 'Bob'], { start: 501, doubleOut: true, legsToWin: 1 });
  const peer = new01(['Alice', 'Bob'], { start: 501, doubleOut: true, legsToWin: 1 });

  // Alice throws T20 + T20 + 20 = 140
  const r1 = throwDarts01(host, [
    { segment: 20, multiplier: 3 },
    { segment: 20, multiplier: 3 },
    { segment: 20, multiplier: 1 },
  ]);
  const r2 = throwDarts01(peer, [
    { segment: 20, multiplier: 3 },
    { segment: 20, multiplier: 3 },
    { segment: 20, multiplier: 1 },
  ]);
  assert.deepEqual(r1.events, r2.events);
  assert.ok(deepEqual(host, peer), 'per-dart input diverged');
});

test('initial states are byte-identical given same opts', () => {
  const a = new01(['A', 'B'], { start: 501, doubleOut: true, legsToWin: 1 });
  const b = new01(['A', 'B'], { start: 501, doubleOut: true, legsToWin: 1 });
  // Strip the startedAt timestamp before comparing.
  a.startedAt = 0; b.startedAt = 0;
  assert.ok(deepEqual(a, b), 'initial states diverged');
});
