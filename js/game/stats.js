// =================================================================
// Stats — pure functions that compute lifetime and per-scope stats
// from the per-game history stored by recordGameHistory().
//
// A stat function takes:
//   history       array of game entries (see util/store.js)
//   scope         { type: 'all-time' | 'league' | 'tournament' | 'match' | 'standalone', id?, name? }
//   playerName    the player to compute stats for
//
// Returns either a number, a percentage, or a stringified number
// (the UI is responsible for formatting / units).
// =================================================================

// Return only the games that match the given scope filter.
export function filterByScope(history, scope) {
  if (!scope || scope.type === 'all-time') return history.slice();
  if (scope.type === 'standalone') return history.filter(g => (g.scope?.type || 'standalone') === 'standalone');
  if (scope.type === 'league') return history.filter(g => g.scope?.type === 'league' && g.scope?.id === scope.id);
  if (scope.type === 'tournament') return history.filter(g => g.scope?.type === 'tournament' && g.scope?.id === scope.id);
  if (scope.type === 'match') return history.filter(g => g.scope?.type === 'match' && g.scope?.id === scope.id);
  return [];
}

// =================================================================
//   Walk through a game's rawDarts log and reconstruct:
//     - per-player turns: { playerName, total, darts, isLegWin, isCheckout, throwFirst, legIdx }
//     - per-player legs played: list of leg indexes they participated in
//   This is the foundation for every stat below.
// =================================================================
export function walkGame(entry, opts = {}) {
  // gameLegOffset: pass in the running count of legs across previous
  // games so legIdx is unique across the whole history. Defaults to 0
  // (so each game starts at 0 — used internally for per-game stats).
  const gameLegOffset = opts.gameLegOffset || 0;
  const players = entry.players || [];
  // For each player: ordered list of turns they threw
  const turns = Object.fromEntries(players.map(n => [n, []]));
  const legs = Object.fromEntries(players.map(n => [n, new Set()])); // set of leg indices
  // For each leg: who started it (so we can compute throw-first/second)
  const legStart = []; // array of leg-index → player name who threw first

  let legIdx = gameLegOffset;
  let currentLegStart = players[0]; // default to first player before any turn
  legStart.push(currentLegStart);
  let currentTurner = currentLegStart;

  for (const ev of entry.rawDarts || []) {
    if (ev.endLeg) {
      // Leg ended (either via turn-with-isLegWin or via End Leg command).
      // recordGameHistory already captured this event with { endLeg, legStart }.
      legIdx++;
      const nextStart = ev.legStart != null ? players[ev.legStart] : null;
      currentLegStart = nextStart || players[(ev.legStart != null ? ev.legStart + 1 : 0) % players.length];
      // Stay one leg ahead — push a placeholder for the next leg.
      legStart.push(currentLegStart);
      continue;
    }
    if (ev.by) currentTurner = ev.by;
    if (ev.total != null || ev.segments != null) {
      const t = {
        player: currentTurner,
        total: ev.total || 0,
        darts: ev.darts || 3,
        isLegWin: !!ev.isLegWin,
        isCheckout: !!ev.isCheckout,
        bust: !!ev.bust,
        legIdx,
        throwFirst: currentLegStart === currentTurner,
      };
      turns[currentTurner]?.push(t);
      legs[currentTurner]?.add(legIdx);
    }
  }

  return { turns, legs, legStart, nextLegOffset: legIdx + 1 };
}

// Sum up the total points a player scored across all turns in the history.
function totalPoints(turns) {
  return turns.reduce((s, t) => s + (t.bust ? 0 : t.total), 0);
}

// Total darts a player threw.
function totalDarts(turns) {
  return turns.reduce((s, t) => s + (t.darts || 0), 0);
}

// Count of turns where total >= threshold (X01 only — Cricket/Shanghai
// don't have the same "high turn" concept).
function countTurnsAtLeast(turns, threshold) {
  return turns.filter(t => !t.bust && t.total >= threshold).length;
}

// Count of legs won by this player (from rawDarts `isLegWin` flags).
function legsWon(turns) {
  return turns.filter(t => t.isLegWin).length;
}

// Total legs the player participated in (whether they won or lost).
function legsPlayed(turns, allLegs) {
  return allLegs;
}

// For X01: count legs won by a real checkout (the leg-winning turn
// hit exactly 0 with the engine's doubleOut / singleOut rules).
// We treat isCheckout as the source of truth (set by the engine).
function legsWonByCheckout(turns) {
  return turns.filter(t => t.isLegWin && t.isCheckout).length;
}

// Highest checkout = the largest last-turn total among leg wins.
function highestCheckout(turns) {
  let best = 0;
  for (const t of turns) if (t.isLegWin && t.total > best) best = t.total;
  return best;
}

// Count checkout-style legs won with total >= threshold.
function checkoutsAtLeast(turns, threshold) {
  return turns.filter(t => t.isLegWin && t.isCheckout && t.total >= threshold).length;
}

// 3-dart average across the whole history (per dart * 3).
function average3(turns) {
  const pts = totalPoints(turns);
  const darts = totalDarts(turns);
  if (darts === 0) return 0;
  return (pts / darts) * 3;
}

// "First 9" = average across the first 9 darts (3 turns) of every match.
// We treat each game as one sample and average the per-game first-9 average.
function first9Average(turns) {
  const first9Darts = [];
  let collected = 0;
  for (const t of turns) {
    if (collected >= 9) break;
    const room = 9 - collected;
    const take = Math.min(t.darts || 3, room);
    first9Darts.push({ total: t.bust ? 0 : (t.total * (take / (t.darts || 3))), darts: take });
    collected += take;
  }
  const pts = first9Darts.reduce((s, d) => s + d.total, 0);
  const darts = first9Darts.reduce((s, d) => s + d.darts, 0);
  if (darts === 0) return 0;
  return (pts / darts) * 3;
}

// "First 3" = average across the first 3 darts (1 turn).
function first3Average(turns) {
  if (turns.length === 0) return 0;
  const t = turns[0];
  if (t.darts === 0) return 0;
  return ((t.bust ? 0 : t.total) / t.darts) * 3;
}

// "With throw" / "Against throw" averages.
// With throw = average of turns where this player was throwing first in their leg.
// Against throw = average of turns where this player was throwing second.
function splitByThrow(turns) {
  const withThrow = turns.filter(t => t.throwFirst);
  const againstThrow = turns.filter(t => !t.throwFirst);
  return { withThrow, againstThrow };
}

// Legs won while throwing first vs second.
function legsWonThrowing(turns) {
  let first = 0, second = 0;
  for (const t of turns) {
    if (t.isLegWin) {
      if (t.throwFirst) first++;
      else second++;
    }
  }
  return { first, second };
}

// Per-leg best (fewest darts to win a leg) and counts of legs won in
// ≤ N darts. Since each leg may span multiple turns, sum the dart
// counts of all turns in the same legIdx up to and including the
// leg-winning turn.
function bestLegAndBins(turns) {
  // Group turns by legIdx
  const byLeg = new Map();
  for (const t of turns) {
    if (!byLeg.has(t.legIdx)) byLeg.set(t.legIdx, []);
    byLeg.get(t.legIdx).push(t);
  }
  let best = Infinity;
  const bins = { 9: 0, 12: 0, 15: 0, 18: 0, 21: 0 };
  for (const [legIdx, tList] of byLeg) {
    // The leg-winning turn is the one with isLegWin. Sum darts up to (and
    // including) that turn for this player.
    let dartsToWin = 0;
    let won = false;
    for (const t of tList) {
      dartsToWin += (t.darts || 0);
      if (t.isLegWin) { won = true; break; }
    }
    if (!won) continue;
    if (dartsToWin < best) best = dartsToWin;
    if (dartsToWin <= 9) bins[9]++;
    if (dartsToWin <= 12) bins[12]++;
    if (dartsToWin <= 15) bins[15]++;
    if (dartsToWin <= 18) bins[18]++;
    if (dartsToWin <= 21) bins[21]++;
  }
  if (best === Infinity) best = 0;
  return { best, bins };
}

// Max average of a single match — for X01 / Shanghai we walk each
// game and pick the highest per-game 3-dart average across this
// player's turns.
function maxAverage(history, playerName) {
  let best = 0;
  for (const g of history) {
    if (!(g.players || []).includes(playerName)) continue;
    const { turns } = walkGame(g);
    const myTurns = turns[playerName] || [];
    const avg = average3(myTurns);
    if (avg > best) best = avg;
  }
  return best;
}

// Count of matches won by this player.
function matchesWon(history, playerName) {
  return history.filter(g => g.winner === playerName).length;
}

// "Number of darts" — total darts thrown across all turns.
function numberOfDarts(turns) {
  return totalDarts(turns);
}

// =================================================================
//   Public: computeStats(playerName, history, scope)
//   Returns the full stat block for the player in the given scope.
// =================================================================
export function computeStats(playerName, history, scope) {
  const games = filterByScope(history, scope);
  // Walk each game, threading a running legIdx so it's unique across
  // the whole history. This is what makes legsTo9 / bestLegDarts
  // count correctly across multiple games.
  let offset = 0;
  const turnsByGame = games.map(g => {
    const w = walkGame(g, { gameLegOffset: offset });
    offset = w.nextLegOffset;
    return w;
  });
  // Flatten this player's turns across all games
  const allTurns = turnsByGame.flatMap(w => w.turns[playerName] || []);
  // Total legs played = sum of distinct legIdx for this player across
  // each game (legIdx is local to a game, so we sum per-game counts).
  const totalLegsPlayed = turnsByGame.reduce((s, w) => s + (w.legs[playerName]?.size || 0), 0);
  const totalLegsWon = legsWon(allTurns);
  const { withThrow, againstThrow } = splitByThrow(allTurns);
  const { first: legsWonFirst, second: legsWonSecond } = legsWonThrowing(allTurns);
  // "Total legs throwing first" = number of distinct legs this player
  // started. We can derive from the byLeg groups in walkGame.
  let totalLegsThrowingFirst = 0;
  let totalLegsThrowingSecond = 0;
  for (const w of turnsByGame) {
    for (const t of (w.turns[playerName] || [])) {
      if (t.throwFirst) totalLegsThrowingFirst++;
      else totalLegsThrowingSecond++;
    }
    // De-dup by legIdx so each leg counts once for throw-order stats
    const firstSet = new Set();
    const secondSet = new Set();
    for (const t of (w.turns[playerName] || [])) {
      if (t.throwFirst) firstSet.add(t.legIdx); else secondSet.add(t.legIdx);
    }
    // Count distinct legs (this is what we need for the percentage)
    // For simplicity, replace the sums with set sizes:
    // (and update the result below)
  }
  // Recompute distinct leg throw-order counts correctly
  let legsThrowFirstDistinct = 0;
  let legsThrowSecondDistinct = 0;
  for (const w of turnsByGame) {
    const f = new Set(), s = new Set();
    for (const t of (w.turns[playerName] || [])) {
      (t.throwFirst ? f : s).add(t.legIdx);
    }
    legsThrowFirstDistinct += f.size;
    legsThrowSecondDistinct += s.size;
  }

  const { best: bestLeg, bins } = bestLegAndBins(allTurns);

  // Find any X01 games for checkout-style stats — they only apply to X01.
  const x01Games = games.filter(g => g.type === 'x01');
  const x01TurnsByGame = x01Games.map(walkGame);
  const x01Turns = x01TurnsByGame.flatMap(w => w.turns[playerName] || []);

  return {
    player: playerName,
    games: games.length,
    matchesWon: matchesWon(games, playerName),

    // Per-turn aggregates
    numberOfDarts: numberOfDarts(allTurns),
    totalPoints: totalPoints(allTurns),
    average: average3(allTurns),
    first3Average: first3Average(allTurns),
    first9Average: first9Average(allTurns),
    withThrowAverage: average3(withThrow),
    againstThrowAverage: average3(againstThrow),
    maxAverage: maxAverage(games, playerName),

    // High-turn counts (X01 only — values are 0 for other types)
    count180: countTurnsAtLeast(x01Turns, 180),
    count171: countTurnsAtLeast(x01Turns, 171),
    count170Plus: countTurnsAtLeast(x01Turns, 170),
    count140Plus: countTurnsAtLeast(x01Turns, 140),
    count100Plus: countTurnsAtLeast(x01Turns, 100),

    // Leg stats
    legsPlayed: totalLegsPlayed,
    legsWon: totalLegsWon,
    legsWonPcnt: totalLegsPlayed ? (totalLegsWon / totalLegsPlayed) * 100 : 0,
    legsWonByCheckout: legsWonByCheckout(x01Turns),
    legsWonCheckoutPcnt: totalLegsWon ? (legsWonByCheckout(x01Turns) / totalLegsWon) * 100 : 0,
    highestCheckout: highestCheckout(x01Turns),
    checkout100Plus: checkoutsAtLeast(x01Turns, 100),

    // Throwing order
    legsThrowingFirst: legsThrowFirstDistinct,
    legsThrowingSecond: legsThrowSecondDistinct,
    legsWonThrowingFirst: legsWonFirst,
    legsWonThrowingSecond: legsWonSecond,
    legsWonFirstPcnt: legsThrowFirstDistinct ? (legsWonFirst / legsThrowFirstDistinct) * 100 : 0,
    legsWonSecondPcnt: legsThrowSecondDistinct ? (legsWonSecond / legsThrowSecondDistinct) * 100 : 0,

    // Best-leg bins
    bestLegDarts: bestLeg,
    legsTo9: bins[9],
    legsTo12: bins[12],
    legsTo15: bins[15],
    legsTo18: bins[18],
    legsTo21: bins[21],
  };
}

// List of all player names that appear in the history (sorted, de-duped).
export function listPlayers(history) {
  const s = new Set();
  for (const g of history) for (const p of (g.players || [])) s.add(p);
  return [...s].sort();
}

// List of all distinct non-standalone scopes (leagues + tournaments + matches).
export function listScopes(history) {
  const leagues = new Map();
  const tournaments = new Map();
  const matches = new Map();
  for (const g of history) {
    const s = g.scope || { type: 'standalone' };
    if (s.type === 'league') leagues.set(s.id, { id: s.id, name: s.name || s.id });
    if (s.type === 'tournament') tournaments.set(s.id, { id: s.id, name: s.name || s.id });
    if (s.type === 'match') matches.set(s.id, { id: s.id, name: s.name || s.id });
  }
  return {
    leagues: [...leagues.values()],
    tournaments: [...tournaments.values()],
    matches: [...matches.values()],
  };
}

// Format helper — turn a number into a 2-decimal string with leading sign.
export function fmt(n, opts = {}) {
  if (n == null || Number.isNaN(n)) return '–';
  if (opts.integer) return String(Math.round(n));
  return n.toFixed(opts.decimals ?? 2);
}