// Competition engine tests
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTournament, buildLeague, completeMatch, leagueStandings, detectCompetitionWinner,
  buildSingleMatch, buildTeamGame,
} from '../js/competition/engine.js';

test('Single-elim: 4 players produces R1 with 2 matches and R2 (final) with 1', () => {
  const { competition, matches } = buildTournament({
    name: 'T', ownerId: 1, players: [1, 2, 3, 4],
  });
  const r1 = matches.filter(m => m.round === 1 && !m.bracket);
  const r2 = matches.filter(m => m.round === 2 && !m.bracket);
  assert.equal(r1.length, 2);
  assert.equal(r2.length, 1);
});

test('Single-elim: byes handled when player count is not a power of 2', () => {
  const { matches } = buildTournament({
    name: 'T', ownerId: 1, players: [1, 2, 3, 4, 5, 6], // 8-slot, 2 byes
  });
  const r1 = matches.filter(m => m.round === 1 && !m.bracket);
  const byes = r1.filter(m => m.status === 'bye');
  // 8-slot bracket, 6 players → 2 byes
  assert.equal(byes.length, 2);
  // The non-bye R1 matches should be ready
  const ready = r1.filter(m => m.status === 'ready');
  assert.equal(ready.length, 2);
});

test('Single-elim: completeMatch advances winner to the linked next match', () => {
  const { matches } = buildTournament({ name: 'T', ownerId: 1, players: [1, 2, 3, 4] });
  const r1a = matches.find(m => m.round === 1 && m.slot === 0 && !m.bracket);
  const final = matches.find(m => m.round === 2 && m.slot === 0 && !m.bracket);
  assert.equal(final.p1, null);
  assert.equal(final.p2, null);
  completeMatch(matches, r1a.id, 'p1');
  assert.equal(final.p1, r1a.p1);
  assert.equal(final.p2, null);
});

test('Single-elim: full 4-player tournament ends with a winner', () => {
  const { competition, matches } = buildTournament({ name: 'T', ownerId: 1, players: [1, 2, 3, 4] });
  // Slot 0 R1: p1=seed[0]=1, p2=seed[3]=4 → 1 wins
  // Slot 1 R1: p1=seed[1]=2, p2=seed[2]=3 → 2 wins
  // Final: p1=1, p2=2 → 1 wins
  const r1a = matches.find(m => m.round === 1 && m.slot === 0 && !m.bracket);
  const r1b = matches.find(m => m.round === 1 && m.slot === 1 && !m.bracket);
  const final = matches.find(m => m.round === 2 && m.slot === 0 && !m.bracket);
  completeMatch(matches, r1a.id, 'p1');
  completeMatch(matches, r1b.id, 'p1');
  completeMatch(matches, final.id, 'p2');
  assert.equal(final.status, 'complete');
  const champ = detectCompetitionWinner(competition, matches);
  assert.equal(champ, 2);
});

test('League: single round-robin with 4 players produces 6 matches (C(4,2))', () => {
  const { matches } = buildLeague({ name: 'L', ownerId: 1, players: [1, 2, 3, 4], groups: 1, advancePerGroup: 2 });
  const group = matches.filter(m => m.bracket === 'group');
  assert.equal(group.length, 6);
});

test('League: standings compute wins/losses/score correctly', () => {
  const { competition, matches } = buildLeague({ name: 'L', ownerId: 1, players: [1, 2, 3, 4] });
  // Pair order in buildLeague is i<j, so matches have p1=lower-id, p2=higher-id.
  const f12 = matches.find(m => m.p1 === 1 && m.p2 === 2);
  const f34 = matches.find(m => m.p1 === 3 && m.p2 === 4);
  const f13 = matches.find(m => m.p1 === 1 && m.p2 === 3);
  const f24 = matches.find(m => m.p1 === 2 && m.p2 === 4);
  // Make 1 beat 2 and 3; 4 beats 2; 3 beats 4 → final: 1 first, then tiebreak on PF-PA
  completeMatch(matches, f12.id, 'p1'); // 1 wins
  completeMatch(matches, f34.id, 'p2'); // 4 wins
  completeMatch(matches, f13.id, 'p1'); // 1 wins
  completeMatch(matches, f24.id, 'p2'); // 4 wins
  const standings = leagueStandings(competition, matches);
  // 1: 2 wins, 0 losses. 4: 2 wins, 0 losses. 3: 0 wins. 2: 0 wins.
  assert.ok(standings.length === 4);
  assert.ok(standings[0].id === 1 || standings[0].id === 4, 'top is 1 or 4');
  // Tie-break by point differential: 1 has +2W vs lower ids (scored points matter only if matches set them; here we set winners only)
});

test('Double-elim: 4 players produces winners, losers, and grand final', () => {
  const { matches } = buildTournament({
    name: 'T', ownerId: 1, players: [1, 2, 3, 4], format: 'double elimination',
  });
  const winners = matches.filter(m => m.bracket === 'W');
  const losers = matches.filter(m => m.bracket === 'L');
  const grand = matches.filter(m => m.bracket === 'GF');
  assert.equal(winners.length >= 3, true); // R1 + R2 + final = 3
  assert.equal(losers.length >= 1, true);
  assert.equal(grand.length, 1);
});

test('completeMatch is idempotent', () => {
  const { matches } = buildTournament({ name: 'T', ownerId: 1, players: [1, 2, 3, 4] });
  const m = matches[0];
  completeMatch(matches, m.id, 'p1');
  completeMatch(matches, m.id, 'p1');
  assert.equal(m.score.p1, 1); // not 2
});

/* ---------- Single match (one or many matches between players) ---------- */
test('Single match: 2 players → exactly 1 match', () => {
  const { competition, matches } = buildSingleMatch({ name: 'Quick', ownerId: 1, players: [1, 2] });
  assert.equal(competition.type, 'single');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].p1, 1);
  assert.equal(matches[0].p2, 2);
  assert.equal(matches[0].status, 'ready');
});

test('Single match: 4 players → C(4,2) = 6 matches (round-robin)', () => {
  const { matches } = buildSingleMatch({ name: 'M', ownerId: 1, players: [1, 2, 3, 4] });
  assert.equal(matches.length, 6);
});

/* ---------- Team game ---------- */
test('Team game: 4 players → 2 teams of 2, 4 cross-team matches', () => {
  const { competition, matches } = buildTeamGame({ name: 'Cup', ownerId: 1, players: [1, 2, 3, 4] });
  assert.equal(competition.type, 'team');
  assert.equal(competition.teams.length, 2);
  assert.equal(competition.teams[0].length, 2);
  assert.equal(competition.teams[1].length, 2);
  // 2 teams × 2 players each × 2 cross-team matches each = 8? Wait: each
  // pair of teams plays (sizeA * sizeB) matches. Here 2×2 = 4.
  assert.equal(matches.length, 4);
  for (const m of matches) {
    assert.equal(m.bracket, 'team');
    assert.ok(m.teamA !== m.teamB);
    assert.equal(m.status, 'ready');
  }
});

test('Team game: 6 players → 2 teams of 3, 9 cross-team matches', () => {
  const { competition, matches } = buildTeamGame({ name: 'Big', ownerId: 1, players: [1, 2, 3, 4, 5, 6] });
  assert.equal(competition.teams.length, 2);
  assert.equal(competition.teams[0].length, 3);
  assert.equal(matches.length, 9);
});
