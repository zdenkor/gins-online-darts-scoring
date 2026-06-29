// =================================================================
// =================================================================
//   Tournament = single-elimination bracket or double-elimination bracket.
//   League     = round-robin in groups, with optional double round-robin
//                (each pair meets twice) and optional knockout stage.
//   Single game = one match (or round-robin if 3+ players are picked).
//   Team game  = auto-balanced teams, round-robin between team pairs.
// =================================================================
//
// All functions are pure (return new objects). Persisting to IndexedDB
// is the caller's job via the competition store.
// =================================================================

let _idSeq = 0;
const newId = () => ++_idSeq;

/* ---------- shared: a Match is { id, competitionId, round, slot, p1, p2, score, status, winner, next } */
function emptyMatch(competitionId, round, slot, opts = {}) {
  return {
    id: opts.id ?? newId(),
    competitionId, round, slot,
    p1: null, p2: null,
    score: { p1: 0, p2: 0 },
    status: 'pending',   // pending | ready | in-progress | complete | bye
    winner: null,         // 'p1' | 'p2' | null
    legsToWin: opts.legsToWin ?? 1,
    next: null,           // { matchId, takeSlot: 'p1' | 'p2' } — where the winner advances
    gameMode: opts.gameMode || null,  // 'x01' | 'cricket' | 'shanghai'
    gameOpts: opts.gameOpts || null,
  };
}

/* =================================================================
   Single match — just one game between two (or more) players.
   Round-robin style so the match history is preserved regardless of
   the number of participants (2-player is the only sensible config).
   ================================================================= */
export function buildSingleMatch({ name, ownerId, players, gameMode = 'x01', gameOpts = {}, legsToWin = 1, createdAt = Date.now() }) {
  const competition = {
    id: newId(),
    name: name || 'Single match',
    type: 'single',
    format: 'single elimination',
    ownerId,
    gameMode, gameOpts, legsToWin,
    seeds: players,
    status: 'pending',
    createdAt,
  };
  const matchOpts = { legsToWin, gameMode, gameOpts };
  const matches = [];
  // Pair everyone in a single round-robin pass so any 2+ players works.
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      matches.push({
        ...emptyMatch(competition.id, 1, matches.length + 1, matchOpts),
        bracket: 'single',
        p1: players[i],
        p2: players[j],
        status: 'ready',
      });
    }
  }
  return { competition, matches };
}

/* =================================================================
   Team game — players are divided into N teams. Each match is a
   paired contest between two teams; team score = sum of legs won by
   its members. The simplest format is "round-robin between teams"
   where each match pits one member of Team A vs one member of Team B.
   ================================================================= */
export function buildTeamGame({ name, ownerId, players, teams = [], gameMode = 'x01', gameOpts = {}, legsToWin = 1, createdAt = Date.now() }) {
  // teams: array of arrays of playerIds. If not provided, auto-balance.
  const T = teams.length ? teams : autoBalanceTeams(players);
  const competition = {
    id: newId(),
    name: name || 'Team game',
    type: 'team',
    format: 'team game',
    ownerId,
    gameMode, gameOpts, legsToWin,
    seeds: players,
    teams: T,
    status: 'pending',
    createdAt,
  };
  const matchOpts = { legsToWin, gameMode, gameOpts };
  const matches = [];
  // Round-robin between teams: each match is one player from Team A vs one from Team B.
  for (let i = 0; i < T.length; i++) {
    for (let j = i + 1; j < T.length; j++) {
      T[i].forEach((p1, idx1) => {
        T[j].forEach((p2, idx2) => {
          matches.push({
            ...emptyMatch(competition.id, 1, matches.length + 1, matchOpts),
            bracket: 'team',
            teamA: i, teamB: j,
            p1, p2,
            status: 'ready',
          });
        });
      });
    }
  }
  return { competition, matches };
}

function autoBalanceTeams(players) {
  // Snake-distribute players into 2 teams by default.
  const numTeams = 2;
  const teams = Array.from({ length: numTeams }, () => []);
  const sorted = [...players];
  let t = 0, dir = 1;
  for (let i = 0; i < sorted.length; i++) {
    teams[t].push(sorted[i]);
    if (t === numTeams - 1) dir = -1;
    else if (t === 0) dir = 1;
    else if (i % 2 === 1) dir = -dir;
    t += dir;
    if (t < 0) t = 0;
    if (t >= numTeams) t = numTeams - 1;
  }
  return teams;
}

/* =================================================================
   TOURNAMENT
   Supports:
     - format: 'single-elim' | 'double-elim'
     - seeding: 'random' | 'ordered' | array of player ids in order
   Returns { competition, matches } — matches include byes so total
   is a power of 2 (for single-elim) or 2x (for double-elim).
   ================================================================= */
export function buildTournament({ name, ownerId, players, format = 'single elimination', seeding = 'ordered', gameMode = 'x01', gameOpts = {}, legsToWin = 1, createdAt = Date.now() }) {
  const N = players.length;
  if (N < 2) throw new Error('Need at least 2 players');
  const seeds = resolveSeeding(players, seeding);
  const competition = {
    type: 'tournament',
    name: name || 'Tournament',
    ownerId,
    format,
    status: 'active',
    createdAt,
    gameMode, gameOpts, legsToWin,
    seeds,           // array of player ids in bracket order
    playerCount: N,
    winner: null,
  };
  const matches = [];
  if (format === 'single elimination') {
    buildSingleElim(matches, competition);
  } else if (format === 'double elimination') {
    buildDoubleElim(matches, competition);
  } else {
    throw new Error('Unknown format: ' + format);
  }
  assignPlayersToMatches(matches, seeds);
  applyByes(matches);
  return { competition, matches };
}

function buildSingleElim(matches, competition) {
  // Find next power of 2 ≥ N
  const N = competition.seeds.length;
  const size = nextPow2(N);
  const rounds = Math.log2(size);
  // Winners bracket: round 1 has size/2 matches; round r has size/(2^r)
  for (let r = 1; r <= rounds; r++) {
    const m = size / Math.pow(2, r);
    for (let s = 0; s < m; s++) {
      const match = emptyMatch(null, r, s, {
        legsToWin: competition.legsToWin,
        gameMode: competition.gameMode,
        gameOpts: competition.gameOpts,
      });
      // Link to next round (winners only)
      if (r < rounds) {
        const nextSlot = Math.floor(s / 2);
        match.next = { takeSlot: s % 2 === 0 ? 'p1' : 'p2' }; // placeholder matchId set after
      }
      matches.push(match);
    }
  }
  // Wire next pointers to actual match ids
  for (const m of matches) {
    if (m.next) {
      const nextRound = m.round + 1;
      const nextSlot = Math.floor(m.slot / 2);
      const target = matches.find(x => x.round === nextRound && x.slot === nextSlot);
      if (target) m.next.matchId = target.id;
    }
  }
  // Byes are applied after player assignment (caller does this)
}

function buildDoubleElim(matches, competition) {
  // Two brackets: winners (W) and losers (L). Final merges.
  // For simplicity we build a winners bracket + losers bracket + grand final.
  // Bracket sizes
  const N = competition.seeds.length;
  const wSize = nextPow2(N);
  const wRounds = Math.log2(wSize);

  // Winners bracket
  const wMatches = [];
  for (let r = 1; r <= wRounds; r++) {
    const count = wSize / Math.pow(2, r);
    for (let s = 0; s < count; s++) {
      const m = emptyMatch(null, r, s, {
        legsToWin: competition.legsToWin,
        gameMode: competition.gameMode,
        gameOpts: competition.gameOpts,
      });
      m.bracket = 'W';
      if (r < wRounds) {
        // winners advance in winners bracket
        const nextSlot = Math.floor(s / 2);
        m.nextWin = { takeSlot: s % 2 === 0 ? 'p1' : 'p2' };
      }
      m.nextLose = null; // drop into losers
      wMatches.push(m);
    }
  }
  // Wire winners next pointers
  for (const m of wMatches) {
    if (m.nextWin) {
      const target = wMatches.find(x => x.round === m.round + 1 && x.slot === Math.floor(m.slot / 2));
      if (target) m.nextWin.matchId = target.id;
    }
  }

  // Losers bracket: has 2 * (wRounds - 1) rounds for non-final losers
  // Standard double-elim loser bracket layout:
  //  For W of size 8: L has rounds 1..(2*(3-1)) = 6 rounds
  //  Round 1: W-R1 losers paired (4 matches) — but seed them carefully
  //  Round 2: L-R1 winners vs W-R2 losers (4 matches)
  //  Round 3: L-R2 winners only (2 matches)
  //  Round 4: L-R3 winners vs W-R3 losers (2 matches)
  //  Round 5: L-R4 winners only (1 match)
  //  Round 6: L-R5 winner vs W-R3 loser (final of L bracket)
  //  Then Grand Final: W winner vs L winner
  // We construct a simplified bracket that satisfies the semantics:
  //   - every W match loss drops the loser into a specific L slot.
  const lMatches = [];
  if (wRounds >= 2) {
    const lRounds = 2 * (wRounds - 1);
    for (let r = 1; r <= lRounds; r++) {
      // The number of L matches in a round alternates with W:
      // r=1,2,3,4: 4,4,2,2 for wSize=8. General formula varies; we use a
      // simple deterministic count: matches in L round r is max(1, wSize / 2^(ceil(r/2)+1)).
      const count = Math.max(1, Math.floor(wSize / Math.pow(2, Math.ceil(r / 2) + 1)));
      for (let s = 0; s < count; s++) {
        const m = emptyMatch(null, r, s, {
          legsToWin: competition.legsToWin,
          gameMode: competition.gameMode,
          gameOpts: competition.gameOpts,
        });
        m.bracket = 'L';
        if (r < lRounds) {
          const nextSlot = Math.floor(s / 2);
          m.nextWin = { takeSlot: s % 2 === 0 ? 'p1' : 'p2' };
        }
        lMatches.push(m);
      }
    }
  }
  // Wire L next pointers
  for (const m of lMatches) {
    if (m.nextWin) {
      const target = lMatches.find(x => x.round === m.round + 1 && x.slot === Math.floor(m.slot / 2));
      if (target) m.nextWin.matchId = target.id;
    }
  }

  // Grand final
  const grand = emptyMatch(null, wRounds + 1, 0, {
    legsToWin: competition.legsToWin,
    gameMode: competition.gameMode,
    gameOpts: competition.gameOpts,
  });
  grand.bracket = 'GF';

  // Hook winner of W-final into grand as p1, winner of L-final as p2
  const wFinal = wMatches.find(m => m.round === wRounds && m.slot === 0);
  const lFinal = lMatches.length ? lMatches.find(m => m.round === 2 * (wRounds - 1) && m.slot === 0) : null;
  if (wFinal) {
    wFinal.nextWin = { matchId: grand.id, takeSlot: 'p1' };
  }
  if (lFinal) {
    lFinal.nextWin = { matchId: grand.id, takeSlot: 'p2' };
  }

  matches.push(...wMatches, ...lMatches, grand);
  // For round 1 of W: losers drop to L round 1
  const wR1 = wMatches.filter(m => m.round === 1);
  // Pair losers into L round 1: pair W-R1 s=0 with W-R1 s=1, etc.
  for (let i = 0; i < wR1.length; i += 2) {
    const a = wR1[i], b = wR1[i + 1];
    if (!a || !b) continue;
    const lSlot = Math.floor(i / 2);
    const lTarget = lMatches.find(m => m.round === 1 && m.slot === lSlot);
    if (lTarget) {
      a.nextLose = { matchId: lTarget.id, takeSlot: 'p1' };
      b.nextLose = { matchId: lTarget.id, takeSlot: 'p2' };
    }
  }
  // For W round r (r>=2): losers drop into L round 2r-2
  for (let r = 2; r <= wRounds; r++) {
    const wr = wMatches.filter(m => m.round === r);
    const lRound = 2 * (r - 1);
    for (let i = 0; i < wr.length; i++) {
      const wm = wr[i];
      const lm = lMatches.find(m => m.round === lRound && m.slot === Math.floor(i / 2));
      if (lm) {
        // The losers from W round r face winners of L round (2r-3)
        // Since each L round halves, we approximate by alternating slots.
        wm.nextLose = { matchId: lm.id, takeSlot: (i % 2 === 0) ? 'p2' : 'p1' };
      }
    }
  }

  applyByes(matches);
}

/* =================================================================
   LEAGUE — single round-robin. Each player plays every other once.
   Group stage: split into groups; top N from each group advance to
   a knockout round (which we represent as additional bracket matches).
   ================================================================= */
export function buildLeague({ name, ownerId, players, groups = 1, advancePerGroup = 2, doubleRoundRobin = false, gameMode = 'x01', gameOpts = {}, legsToWin = 1, createdAt = Date.now() }) {
  if (groups < 1) throw new Error('groups must be >= 1');
  if (advancePerGroup < 1) throw new Error('advancePerGroup must be >= 1');
  const seeds = players.slice();
  // Snake-distribute players into groups
  const buckets = Array.from({ length: groups }, () => []);
  seeds.forEach((p, i) => {
    const g = i % groups;
    buckets[g].push(p);
  });
  const competition = {
    type: 'league',
    name: name || 'League',
    ownerId,
    status: 'active',
    createdAt,
    gameMode, gameOpts, legsToWin,
    groups, advancePerGroup, doubleRoundRobin,
    playerCount: players.length,
    winner: null,
    groupAssignments: buckets.map(b => b.slice()),
  };
  const matches = [];
  // Round-robin within each group
  for (let gi = 0; gi < groups; gi++) {
    const groupPlayers = buckets[gi];
    for (let i = 0; i < groupPlayers.length; i++) {
      for (let j = i + 1; j < groupPlayers.length; j++) {
        const a = groupPlayers[i], b = groupPlayers[j];
        matches.push(makeLeagueMatch(competition, gi + 1, matches.length, a, b));
        if (doubleRoundRobin) {
          matches.push(makeLeagueMatch(competition, gi + 1, matches.length, b, a));
        }
      }
    }
  }
  // Knockout stage: best-of (advancePerGroup*groups) advance
  const advancing = advancePerGroup * groups;
  if (advancing >= 2) {
    // Build a single-elim bracket for the top players (placeholder until standings computed).
    // For now, create placeholder matches with p1/p2 = null and a flag.
    const size = nextPow2(advancing);
    const rounds = Math.log2(size);
    for (let r = 1; r <= rounds; r++) {
      const count = size / Math.pow(2, r);
      for (let s = 0; s < count; s++) {
        const m = emptyMatch(null, r, s, {
          legsToWin: competition.legsToWin,
          gameMode: competition.gameMode,
          gameOpts: competition.gameOpts,
        });
        m.bracket = 'KO';
        if (r < rounds) {
          m.next = { takeSlot: s % 2 === 0 ? 'p1' : 'p2' };
          const target = matches.findLast?.(x => x.round === r + 1 && x.slot === Math.floor(s / 2));
          // Manual find:
          const t = matches.filter(x => x.round === r + 1 && x.slot === Math.floor(s / 2))[0];
          if (t) m.next.matchId = t.id;
        }
        matches.push(m);
      }
    }
  }
  return { competition, matches };
}

function makeLeagueMatch(competition, groupNumber, idx, a, b) {
  return {
    ...emptyMatch(null, 0, idx, {
      legsToWin: competition.legsToWin,
      gameMode: competition.gameMode,
      gameOpts: competition.gameOpts,
    }),
    bracket: 'group',
    group: groupNumber,
    p1: a, p2: b,
    status: 'ready',
  };
}

/* ---------- helpers ---------- */
function resolveSeeding(players, seeding) {
  if (Array.isArray(seeding)) return seeding.slice();
  if (seeding === 'random') {
    const arr = players.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  return players.slice();
}

function nextPow2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function applyByes(matches) {
  // For single-elim: any round-1 match with a null participant becomes a bye.
  // The non-null player is auto-advanced to the next round.
  for (const m of matches) {
    if (m.bracket === 'L' || m.bracket === 'GF' || m.bracket === 'KO') continue;
    if (m.round !== 1) continue;
    if (m.p1 && m.p2) continue;
    const advance = m.p1 || m.p2;
    if (!advance) continue;
    m.status = 'bye';
    m.winner = m.p1 ? 'p1' : 'p2';
    if (m.nextWin) placeWinner(matches, m, m.nextWin, advance);
  }
}

/* Assign seeded players to round-1 matches. Standard bracket pairing:
   slot i vs slot (size - 1 - i). For under-filled brackets (bye), one side
   is null. applyByes() (called after this) handles the auto-advance. */
function assignPlayersToMatches(matches, seeds) {
  const round1 = matches.filter(m => m.round === 1 && m.bracket !== 'KO');
  // Group round-1 matches by bracket (single-elim + winners of double-elim)
  const byBracket = {};
  for (const m of round1) {
    const key = m.bracket || 'SE';
    (byBracket[key] = byBracket[key] || []).push(m);
  }
  for (const [key, ms] of Object.entries(byBracket)) {
    const size = ms.length * 2;
    ms.forEach((m, i) => {
      const a = seeds[i] ?? null;
      const b = seeds[size - 1 - i] ?? null;
      m.p1 = a;
      m.p2 = b;
      if (a && b) m.status = 'ready';
      else if (a || b) m.status = 'pending'; // will become 'bye' in applyByes
      else m.status = 'pending';
    });
  }
}

/* =================================================================
   Match completion + bracket advancement.
   The caller passes the full list of matches (in-memory snapshot)
   and we mutate a copy.
   ================================================================= */
export function completeMatch(matches, matchId, winnerKey) {
  const idx = matches.findIndex(m => m.id === matchId);
  if (idx === -1) throw new Error('No such match');
  const m = matches[idx];
  if (m.status === 'complete') return matches;
  if (!['p1', 'p2'].includes(winnerKey)) throw new Error('Invalid winner');
  m.winner = winnerKey;
  m.status = 'complete';
  m.score[winnerKey] = (m.score[winnerKey] || 0) + 1;

  const winner = winnerKey === 'p1' ? m.p1 : m.p2;
  const loser = winnerKey === 'p1' ? m.p2 : m.p1;

  // Single-elim / double-elim advancement
  if (m.nextWin) {
    placeWinner(matches, m, m.nextWin, winner);
  }
  if (m.nextLose && loser) {
    placeWinner(matches, m, m.nextLose, loser);
  }
  // Some matches use 'next' (single-elim alias)
  if (m.next && !m.nextWin) {
    placeWinner(matches, m, m.next, winner);
  }
  return matches;
}

function placeWinner(matches, source, link, player) {
  const target = matches.find(x => x.id === link.matchId);
  if (!target) return;
  target[link.takeSlot] = player;
  if (target.p1 && target.p2 && target.status === 'pending') target.status = 'ready';
}

/* Compute current league standings from completed matches */
export function leagueStandings(competition, matches) {
  const table = new Map();
  for (const p of (competition.groupAssignments?.flat() || [])) {
    table.set(p, { id: p, played: 0, wins: 0, losses: 0, draws: 0, pointsFor: 0, pointsAgainst: 0, score: 0 });
  }
  for (const m of matches) {
    if (m.bracket !== 'group' || m.status !== 'complete') continue;
    const a = table.get(m.p1); const b = table.get(m.p2);
    if (!a || !b) continue;
    a.played++; b.played++;
    a.pointsFor += m.score.p1; b.pointsFor += m.score.p2;
    a.pointsAgainst += m.score.p2; b.pointsAgainst += m.score.p1;
    if (m.winner === 'p1') { a.wins++; a.score += 2; b.losses++; }
    else if (m.winner === 'p2') { b.wins++; b.score += 2; a.losses++; }
  }
  // Sort by score desc, then point differential, then pointsFor
  return [...table.values()].sort((x, y) =>
    (y.score - x.score) ||
    ((y.pointsFor - y.pointsAgainst) - (x.pointsFor - x.pointsAgainst)) ||
    (y.pointsFor - x.pointsFor)
  );
}

/* Detect overall competition winner (final match complete) */
export function detectCompetitionWinner(competition, matches) {
  if (competition.type === 'tournament') {
    if (competition.format === 'single elimination') {
      const maxRound = Math.max(...matches.filter(m => !m.bracket).map(m => m.round));
      const final = matches.find(m => m.round === maxRound && !m.bracket);
      if (final && final.status === 'complete') return final.winner === 'p1' ? final.p1 : final.p2;
    } else if (competition.format === 'double elimination') {
      const gf = matches.find(m => m.bracket === 'GF');
      if (gf && gf.status === 'complete') return gf.winner === 'p1' ? gf.p1 : gf.p2;
    }
  }
  if (competition.type === 'league') {
    const standings = leagueStandings(competition, matches);
    if (standings.length && standings[0].played > 0) {
      // If knockout stage is complete, use its winner. Otherwise, leader.
      const ko = matches.filter(m => m.bracket === 'KO');
      if (ko.length) {
        const maxR = Math.max(...ko.map(m => m.round));
        const final = ko.find(m => m.round === maxR);
        if (final && final.status === 'complete') return final.winner === 'p1' ? final.p1 : final.p2;
      }
      return standings[0].id;
    }
  }
  return null;
}
