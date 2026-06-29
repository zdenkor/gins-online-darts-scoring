// Tests for the stats module (js/game/stats.js).
// We feed in synthetic game history entries and verify the computed
// stats are correct.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeStats, filterByScope, listPlayers, listScopes, walkGame } from '../js/game/stats.js';

// Build a synthetic game history with realistic rawDarts entries.
// Player 'A' plays 2 X01 matches against 'B' in 501 with doubleOut.
// Match 1: A wins in 3 darts (60 + 60 + 381 = 501 → finishes with 381 triple on the 3rd dart).
//            B throws twice: 50 + 0. Total: 50 darts from B across the leg (well, 6 turns x 3 = 18 darts).
// Match 2: A wins 180, 180, 141 = 501 in 3 darts; B throws 60, 30.
function buildHistory1() {
  return [
    {
      id: 'm1',
      type: 'x01',
      startedAt: 1, endedAt: 2,
      winner: 'A',
      winnerIndex: 0,
      players: ['A', 'B'],
      opts: { start: 501, doubleOut: true, legsToWin: 1, setsToWin: 1 },
      scope: { type: 'standalone' },
      rawDarts: [
        { total: 60, darts: 3, by: 'A' },
        { total: 50, darts: 3, by: 'B' },
        { total: 60, darts: 3, by: 'A' },
        { total: 0, darts: 3, by: 'B' },
        { total: 381, darts: 3, isLegWin: true, isCheckout: true, by: 'A' },
        { endLeg: 'A', legStart: 0 },
      ],
    },
    {
      id: 'm2',
      type: 'x01',
      startedAt: 3, endedAt: 4,
      winner: 'A',
      winnerIndex: 0,
      players: ['A', 'B'],
      opts: { start: 501, doubleOut: true, legsToWin: 1, setsToWin: 1 },
      scope: { type: 'league', id: 'L1', name: 'Spring League' },
      rawDarts: [
        { total: 180, darts: 3, by: 'A' },
        { total: 60, darts: 3, by: 'B' },
        { total: 180, darts: 3, by: 'A' },
        { total: 30, darts: 3, by: 'B' },
        { total: 141, darts: 3, isLegWin: true, isCheckout: true, by: 'A' },
        { endLeg: 'A', legStart: 0 },
      ],
    },
  ];
}

test('walkGame: groups turns by player, marks throw order', () => {
  const h = buildHistory1();
  const { turns } = walkGame(h[0]);
  // A threw 3 turns (60, 60, 381 — last is legWin), B threw 2 turns (50, 0)
  assert.equal(turns['A'].length, 3);
  assert.equal(turns['B'].length, 2);
  assert.equal(turns['A'][0].total, 60);
  assert.equal(turns['A'][2].isLegWin, true);
  // A is player 0 → throwFirst for them
  assert.equal(turns['A'][0].throwFirst, true);
  // B is not player 0 → throwFirst is false
  assert.equal(turns['B'][0].throwFirst, false);
});

test('computeStats: averages, high-turn counts, leg stats for player A', () => {
  const h = buildHistory1();
  const all = { type: 'all-time' };
  const s = computeStats('A', h, all);
  // Total points scored by A: 60 + 60 + 381 + 180 + 180 + 141 = 1002
  assert.equal(s.totalPoints, 1002);
  // Total darts: 18 (3 turns x 3 darts x 2 games)
  assert.equal(s.numberOfDarts, 18);
  // 3-dart average = (1002 / 18) * 3 = 167
  assert.equal(s.average, 167);
  // First 9 darts = first 3 turns of match 1 = 60 + 60 + 381 / 9 * 3 = (501/9)*3 = 167
  assert.equal(s.first9Average, 167);
  // First 3 darts = first turn of match 1 = 60 / 3 * 3 = 60
  assert.equal(s.first3Average, 60);
  // 180s: 3 (381 in match 1 + 180 + 180 in match 2 — any turn ≥ 180 counts)
  assert.equal(s.count180, 3);
  // 171s: 2 (just the two 180s ≥ 171; 381 ≥ 171 too → 3 actually).
  //     Wait: countTurnsAtLeast(171) counts anything ≥ 171. 381, 180, 180 → 3.
  assert.equal(s.count171, 3);
  // 170+: 3 (same — 381, 180, 180)
  assert.equal(s.count170Plus, 3);
  // 140+: 4 (60(no), 60(no), 381(yes), 180(yes), 180(yes), 141(yes) = 4)
  assert.equal(s.count140Plus, 4);
  // 100+: same set, no 60s ≥ 100 → 4
  assert.equal(s.count100Plus, 4);
  // legs played: 2 (one per game, summed across games since legIdx is local)
  assert.equal(s.legsPlayed, 2);
  // legs won: 2
  assert.equal(s.legsWon, 2);
  // legs won %: 100
  assert.equal(s.legsWonPcnt, 100);
  // legs won by checkout: 2
  assert.equal(s.legsWonByCheckout, 2);
  // checkout %: 100
  assert.equal(s.legsWonCheckoutPcnt, 100);
  // highest checkout: 381
  assert.equal(s.highestCheckout, 381);
  // checkout 100+: 2
  assert.equal(s.checkout100Plus, 2);
  // best leg: 9 darts (3 turns of 3 darts each before the winning turn)
  assert.equal(s.bestLegDarts, 9);
  // legs to 9: 2 (both won in exactly 9 darts)
  assert.equal(s.legsTo9, 2);
  // legs to 12,15,18,21 also include these
  assert.equal(s.legsTo12, 2);
  assert.equal(s.legsTo15, 2);
  assert.equal(s.legsTo18, 2);
  assert.equal(s.legsTo21, 2);
  // matches won: 2
  assert.equal(s.matchesWon, 2);
  // games: 2
  assert.equal(s.games, 2);
});

test('computeStats: scope filtering (league vs all-time)', () => {
  const h = buildHistory1();
  const league = { type: 'league', id: 'L1', name: 'Spring League' };
  const leagueStats = computeStats('A', h, league);
  // Only match 2 is in the league
  assert.equal(leagueStats.games, 1);
  assert.equal(leagueStats.matchesWon, 1);
  assert.equal(leagueStats.totalPoints, 180 + 180 + 141);
  assert.equal(leagueStats.average, ((180 + 180 + 141) / 9) * 3); // 167
  // Only 1 game so maxAverage = that game's average
  assert.equal(leagueStats.maxAverage, 167);
});

test('computeStats: with-throw vs against-throw averages', () => {
  const h = buildHistory1();
  const all = { type: 'all-time' };
  const s = computeStats('A', h, all);
  // A always throws first → all A turns are with-throw
  assert.equal(s.withThrowAverage, 167);
  // A never throws second → against-throw avg is 0
  assert.equal(s.againstThrowAverage, 0);
  // A's legs throwing first = 2, second = 0
  assert.equal(s.legsThrowingFirst, 2);
  assert.equal(s.legsThrowingSecond, 0);
  // legs won throwing first = 2
  assert.equal(s.legsWonThrowingFirst, 2);
  assert.equal(s.legsWonThrowingSecond, 0);
  assert.equal(s.legsWonFirstPcnt, 100);
  assert.equal(s.legsWonSecondPcnt, 0);
});

test('computeStats: empty history returns zeros', () => {
  const s = computeStats('Ghost', [], { type: 'all-time' });
  assert.equal(s.games, 0);
  assert.equal(s.totalPoints, 0);
  assert.equal(s.average, 0);
  assert.equal(s.bestLegDarts, 0);
});

test('listPlayers: returns all unique player names sorted', () => {
  const h = buildHistory1();
  const players = listPlayers(h);
  assert.deepEqual(players, ['A', 'B']);
});

test('listScopes: returns unique leagues/tournaments/matches', () => {
  const h = buildHistory1();
  const scopes = listScopes(h);
  assert.deepEqual(scopes.leagues, [{ id: 'L1', name: 'Spring League' }]);
  assert.deepEqual(scopes.tournaments, []);
  assert.deepEqual(scopes.matches, []);
});

test('filterByScope: returns correct subset for each scope type', () => {
  const h = buildHistory1();
  assert.equal(filterByScope(h, { type: 'all-time' }).length, 2);
  assert.equal(filterByScope(h, { type: 'standalone' }).length, 1);
  assert.equal(filterByScope(h, { type: 'league', id: 'L1' }).length, 1);
  assert.equal(filterByScope(h, { type: 'league', id: 'other' }).length, 0);
});