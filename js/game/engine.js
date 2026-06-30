// =================================================================
// Dart scoring engine — pure functions, no DOM, no I/O.
// Three game modes: 301/501/301-DoubleOut, Cricket, Shanghai.
// A "throw" is up to 3 darts. Each dart = { segment, multiplier }
//   segment: 1..20, 25 (outer bull), 0 (miss)
//   multiplier: 1, 2 (double), 3 (triple)
// A dart's value = segment * multiplier (25*2 = 50 = bullseye).
// =================================================================

export const DBL = 2, TPL = 3;
export const BULL_OUTER = 25, BULL_INNER = 25; // inner counts as D25 in classic rules
export const MAX_DARTS_PER_TURN = 3;

/* ----- helpers ----- */
export function dartValue(d) {
  if (!d) return 0;
  const seg = d.segment | 0;
  const mult = d.multiplier | 0;
  if (seg < 0 || seg > 25) return 0;
  return seg * (mult || 1);
}

export function dartLabel(d) {
  if (!d) return '';
  if (d.segment === 0) return 'MISS';
  if (d.segment === 25) return d.multiplier === 2 ? 'BULL' : '25';
  const prefix = d.multiplier === 3 ? 'T' : d.multiplier === 2 ? 'D' : '';
  return prefix + d.segment;
}

export function throwPoints(throwArr) {
  return throwArr.reduce((s, d) => s + dartValue(d), 0);
}

/* ----- x01 in/out helpers ----- */
export const X01_IN_OPTIONS = {
  single: { label: 'SI', desc: 'Single In — any dart opens scoring.' },
  double: { label: 'DI', desc: 'Double In — a double opens scoring.' },
  triple: { label: 'TI', desc: 'Triple In — a triple opens scoring.' },
  master: { label: 'MI', desc: 'Master In — a double or bull opens scoring.' },
};

export const X01_OUT_OPTIONS = {
  single: { label: 'SO', desc: 'Single Out — any dart can finish.' },
  double: { label: 'DO', desc: 'Double Out — finish must be on a double.' },
  triple: { label: 'TO', desc: 'Triple Out — finish must be on a triple.' },
  master: { label: 'MO', desc: 'Master Out — finish must be on a double or bull.' },
};

export function x01InOutFlags(opts = {}) {
  // Backwards-compat: old boolean doubleOut and variation strings.
  let inRule = opts.in;
  let outRule = opts.out;
  if (!inRule && !outRule && opts.variation) {
    const map = {
      straight: { in: 'single', out: 'single' },
      doubleOut: { in: 'single', out: 'double' },
      masterOut: { in: 'single', out: 'master' },
      tripleOut: { in: 'single', out: 'triple' },
      doubleInDoubleOut: { in: 'double', out: 'double' },
      doubleInMasterOut: { in: 'double', out: 'master' },
      tripleInTripleOut: { in: 'triple', out: 'triple' },
    };
    const mapped = map[opts.variation];
    if (mapped) { inRule = mapped.in; outRule = mapped.out; }
  }
  if (!inRule && !outRule && opts.doubleOut) {
    inRule = 'single'; outRule = 'double';
  }
  inRule = inRule || 'single';
  outRule = outRule || 'single';
  return {
    inRule,
    outRule,
    doubleIn: inRule === 'double',
    tripleIn: inRule === 'triple',
    masterIn: inRule === 'master',
    doubleOut: outRule === 'double',
    tripleOut: outRule === 'triple',
    masterOut: outRule === 'master',
    needsPerDart: inRule !== 'single' || outRule !== 'single',
  };
}

function isDouble(d) { return d && d.multiplier === 2; }
function isTriple(d) { return d && d.multiplier === 3; }
function isMasterHit(d) { return isDouble(d) || (d.segment === 25 && d.multiplier === 2); }
function opensScoring(d, inRule) {
  if (inRule === 'double') return isDouble(d);
  if (inRule === 'triple') return isTriple(d);
  if (inRule === 'master') return isMasterHit(d);
  return true;
}
function finishesLeg(d, outRule) {
  if (outRule === 'double') return isDouble(d);
  if (outRule === 'triple') return isTriple(d);
  if (outRule === 'master') return isMasterHit(d);
  return true;
}

/* =================================================================
   01 Games — 301, 401, 501, 701, 1001 with optional in/out rules.
   ================================================================= */
export function new01(playerNames, opts = {}) {
  const start = opts.start ?? 501;
  const inOut = x01InOutFlags(opts);
  const legsToWin = Math.max(1, opts.legsToWin ?? 1);
  const setsToWin = Math.max(1, opts.setsToWin ?? 1);
  const maxDarts = Math.max(0, opts.maxDarts ?? 0);
  const order = opts.order ?? null;
  const players = playerNames.map((name, i) => ({
    name,
    score: start,
    legsWon: 0,
    setsWon: 0,
    history: [],
    dartsThisTurn: [],
    dartsThisLeg: 0,
    opened: inOut.inRule === 'single',
  }));
  return {
    type: 'x01',
    opts: { start, in: inOut.inRule, out: inOut.outRule, legsToWin, setsToWin, maxDarts },
    players,
    current: order ? order.indexOf(Math.min(...order.map((_, i) => i))) : 0,
    throwOrder: order || playerNames.map((_, i) => i),
    turnDarts: [],
    startedAt: Date.now(),
    endedAt: null,
    winner: null,
    rawDarts: [],
  };
}
export function throwDarts01(state, darts) {
  if (state.winner) return { state, events: [{ type: 'ignored', reason: 'game-over' }] };
  const player = state.players[state.current];
  const events = [];
  const accepted = [];
  const inOut = state.opts || {};
  // maxDarts: 0 = no limit; otherwise the per-leg soft cap.
  const cap = state.opts.maxDarts | 0;
  // The per-turn cap is 3 (MAX_DARTS_PER_TURN), unless the per-leg cap is
  // smaller, in which case we honor that.
  const turnCap = cap > 0 ? Math.min(cap, MAX_DARTS_PER_TURN) : MAX_DARTS_PER_TURN;

  for (const d of darts) {
    // Per-leg cap: 0 means unlimited.
    if (cap > 0 && (player.dartsThisLeg || 0) >= cap) {
      events.push({ type: 'cap-reached', cap });
      break;
    }
    if (accepted.length >= turnCap) break;

    const pts = dartValue(d);

    // Lock scoring until opened if DI/TI/MI is on.
    if (!player.opened && inOut.in !== 'single') {
      if (!opensScoring(d, inOut.in)) {
        player.dartsThisLeg = (player.dartsThisLeg || 0) + 1;
        events.push({ type: 'warmup', dart: d, scoreAfter: player.score });
        accepted.push(d);
        if (accepted.length >= turnCap) break;
        continue;
      }
      player.opened = true;
    }

    const prospective = player.score - pts;
    const isFinish = prospective === 0;
    const finishesOk = isFinish && finishesLeg(d, inOut.out);

    let wouldBust = prospective < 0;
    if (!wouldBust && inOut.out === 'double' && prospective === 1) wouldBust = true;
    if (!wouldBust && isFinish && inOut.out !== 'single' && !finishesOk) wouldBust = true;

    if (wouldBust) {
      events.push({ type: 'bust', dart: d });
      player.history.push({ what: 'BUST', delta: 0, scoreAfter: player.score });
      if (inOut.in !== 'single') player.opened = false;
      state.turnDarts = [];
      state.current = advanceTurn(state);
      state.turnDarts = [];
      return { state, events, acceptedDarts: accepted };
    }

    player.score = prospective;
    accepted.push(d);
    player.dartsThisLeg = (player.dartsThisLeg || 0) + 1;
    events.push({ type: 'dart', dart: d, delta: -pts, scoreAfter: player.score });
    player.history.push({ what: dartLabel(d), delta: -pts, scoreAfter: player.score });

    if (isFinish && finishesOk) {
      player.legsWon += 1;
      events.push({ type: 'leg-won', playerIndex: state.current, legsWon: player.legsWon, legsToWin: state.opts.legsToWin });
      if (player.legsWon >= state.opts.legsToWin) {
        player.setsWon = (player.setsWon || 0) + 1;
        events.push({ type: 'set-won', playerIndex: state.current, setsWon: player.setsWon, setsToWin: state.opts.setsToWin });
        if (player.setsWon >= state.opts.setsToWin) {
          state.winner = state.current;
          state.endedAt = Date.now();
          events.push({ type: 'win', playerIndex: state.current });
          state.turnDarts = [];
          return { state, events, acceptedDarts: accepted };
        }
        for (const p of state.players) { p.score = state.opts.start; p.dartsThisLeg = 0; p.legsWon = 0; p.opened = inOut.inRule === 'single'; }
        events.push({ type: 'new-set', startingScore: state.opts.start });
      } else {
        for (const p of state.players) { p.score = state.opts.start; p.dartsThisLeg = 0; p.opened = inOut.inRule === 'single'; }
        events.push({ type: 'new-leg', startingScore: state.opts.start });
      }
      state.current = advanceTurn(state);
      state.turnDarts = [];
      return { state, events, acceptedDarts: accepted };
    }
  }

  state.turnDarts = accepted;
  if (accepted.length >= turnCap) {
    state.current = advanceTurn(state);
    state.turnDarts = [];
  }
  return { state, events, acceptedDarts: accepted };
}

/* =================================================================
   Cricket — Numbers 15..20 plus Bull. First to "close" all targets
   AND have the highest (or tied) score wins. Marks beyond closing
   on a target score points until opponents close it.
   ================================================================= */
const CRICKET_NUMS = [20, 19, 18, 17, 16, 15, 25]; // last cell is bull

export function newCricket(playerNames, opts = {}) {
  const cutThroat = !!opts.cutThroat;
  // maxDartsPerLeg: 0 or undefined = no limit; otherwise soft cap per player.
  const maxDartsPerLeg = opts.maxDartsPerLeg ?? 0;
  const players = playerNames.map(name => ({
    name,
    score: 0,
    legsWon: 0,
    history: [],
    dartsThisLeg: 0,
    // marks: 0..3 per target; -1 means "not started"
    marks: Object.fromEntries(CRICKET_NUMS.map(n => [n, 0])),
  }));
  return {
    type: 'cricket',
    opts: { cutThroat, maxDartsPerLeg },
    players,
    current: 0,
    turnDarts: [],
    startedAt: Date.now(),
    winner: null,
  };
}

function marksForDart(d) {
  if (!d || d.segment === 0) return []; // miss
  const seg = d.segment;
  const inList = CRICKET_NUMS.includes(seg);
  if (!inList) return [];
  // Bull counts as outer(1) or inner(2) marks — we treat D25 as 2 marks
  const m = seg === 25 ? (d.multiplier === 2 ? 2 : 1) : d.multiplier;
  return [{ seg, m }];
}

export function throwDartsCricket(state, darts) {
  if (state.winner) return { state, events: [{ type: 'ignored', reason: 'game-over' }] };
  const events = [];
  const accepted = [];
  const cap = state.opts.maxDartsPerLeg | 0; // 0 = no limit
  const me0 = state.players[state.current];

  for (const d of darts) {
    // Per-leg cap: 0 means unlimited.
    if (cap > 0 && (me0.dartsThisLeg || 0) >= cap) {
      events.push({ type: 'cap-reached', cap });
      break;
    }
    const hits = marksForDart(d);
    accepted.push(d);
    me0.dartsThisLeg = (me0.dartsThisLeg || 0) + 1;
    if (hits.length === 0) {
      events.push({ type: 'dart', dart: d, delta: 0, scoreAfter: state.players[state.current].score });
      if (accepted.length >= MAX_DARTS_PER_TURN) break;
      continue;
    }
    for (const hit of hits) {
      const me = state.players[state.current];
      const have = me.marks[hit.seg] || 0;
      const need = Math.max(0, 3 - have);
      const applied = Math.min(hit.m, need);
      me.marks[hit.seg] = have + applied;
      let leftover = hit.m - applied;

      // Score points if I am closed on this segment while others aren't
      if (me.marks[hit.seg] >= 3 && leftover > 0) {
        const ptsPerMark = hit.seg; // bull counts as 25
        const opponentsOpen = state.players.some((p, i) =>
          i !== state.current && (p.marks[hit.seg] || 0) < 3
        );
        if (opponentsOpen) {
          const gained = leftover * ptsPerMark;
          if (state.opts.cutThroat) {
            // give points to opponents
            state.players.forEach((p, i) => {
              if (i !== state.current && (p.marks[hit.seg] || 0) < 3) {
                p.score += gained;
                p.history.push({ what: `${dartLabel(d)} (CT)`, delta: +gained, scoreAfter: p.score });
              }
            });
            events.push({ type: 'dart', dart: d, delta: 0, scoreAfter: me.score, scoredFor: 'opponents' });
          } else {
            me.score += gained;
            events.push({ type: 'dart', dart: d, delta: +gained, scoreAfter: me.score });
          }
        } else {
          events.push({ type: 'dart', dart: d, delta: 0, scoreAfter: me.score });
        }
      } else {
        events.push({ type: 'dart', dart: d, delta: 0, scoreAfter: me.score });
      }
    }

    if (accepted.length >= MAX_DARTS_PER_TURN) break;
  }

  state.turnDarts = accepted;

  // Win check: current player has closed ALL targets AND strictly leads
  // OR ties only with opponents who are also all-closed.
  const me = state.players[state.current];
  const isClosed = (p, n) => n === 25 ? (p.marks[n] || 0) >= 2 : (p.marks[n] || 0) >= 3;
  const allClosed = CRICKET_NUMS.every(n => isClosed(me, n));
  if (allClosed) {
    const openOpponentAtOrAbove = state.players.some((p, i) =>
      i !== state.current
      && CRICKET_NUMS.some(n => !isClosed(p, n))
      && p.score >= me.score
    );
    if (!openOpponentAtOrAbove) {
      me.legsWon += 1;
      state.winner = state.current;
      state.endedAt = Date.now();
      events.push({ type: 'win', playerIndex: state.current });
      state.turnDarts = [];
      return { state, events, acceptedDarts: accepted };
    }
  }

  // End the turn if either we filled the dart limit OR we accepted fewer than
  // 3 darts in this call (the caller is treating each invocation as a turn).
  const endOfTurn = accepted.length >= MAX_DARTS_PER_TURN
    || darts.length < MAX_DARTS_PER_TURN;
  if (endOfTurn) {
    state.current = (state.current + 1) % state.players.length;
    state.turnDarts = [];
  }
  return { state, events, acceptedDarts: accepted };
}

/* =================================================================
   Shanghai — Play numbers 1..7 (or 1..N) in order. Hit the current
   number for points; doubles/triples count extra. Highest total when
   you finish the last number wins.
   ================================================================= */
export function newShanghai(playerNames, opts = {}) {
  // n: number of rounds. 0 or undefined means play round-by-round until
  // the user quits (no end-of-game trigger; the match ends manually).
  const n = opts.n ?? 7;
  const players = playerNames.map(name => ({
    name,
    score: 0,
    legsWon: 0,
    history: [],
  }));
  return {
    type: 'shanghai',
    opts: { n },
    players,
    current: 0,
    round: 1,           // current target number 1..n (or 1..∞ if n=0)
    turnDarts: [],
    startedAt: Date.now(),
    winner: null,
  };
}

export function throwDartsShanghai(state, darts) {
  if (state.winner) return { state, events: [{ type: 'ignored', reason: 'game-over' }] };
  const events = [];
  const accepted = [];
  const me = state.players[state.current];
  const target = state.round;

  for (const d of darts) {
    accepted.push(d);
    if (d.segment === target) {
      const pts = dartValue(d);
      me.score += pts;
      events.push({ type: 'dart', dart: d, delta: +pts, scoreAfter: me.score });
      me.history.push({ what: dartLabel(d), delta: +pts, scoreAfter: me.score });
    } else {
      events.push({ type: 'dart', dart: d, delta: 0, scoreAfter: me.score });
    }
    if (accepted.length >= MAX_DARTS_PER_TURN) break;
  }

  state.turnDarts = accepted;

  // advance turn
  state.current = (state.current + 1) % state.players.length;
  if (state.current === 0) state.round += 1;

  // Win check at end of last round (only when n > 0; n = 0 = unlimited)
  if (state.opts.n > 0 && state.round > state.opts.n) {
    // highest score wins
    let bestIdx = 0;
    for (let i = 1; i < state.players.length; i++) {
      if (state.players[i].score > state.players[bestIdx].score) bestIdx = i;
    }
    const tied = state.players.filter(p => p.score === state.players[bestIdx].score).length > 1;
    if (!tied) {
      state.players[bestIdx].legsWon += 1;
      state.winner = bestIdx;
      state.endedAt = Date.now();
      events.push({ type: 'win', playerIndex: bestIdx });
    }
  }
  return { state, events, acceptedDarts: accepted };
}

/* =================================================================
   Undo: roll back the last accepted dart in the current game.
   We rebuild the state from scratch because each game has a different
   rule shape; easier than recording diffs. We rely on game.history.
   ================================================================= */
export function snapshotDarts(state) {
  // Collect the full ordered list of darts thrown across all turns so far.
  // We use each player's history entries (the textual log) — but to undo
  // we need structured darts. So we also keep a parallel rawDarts log on state.
  return state.rawDarts ? [...state.rawDarts] : [];
}

export function withRawDarts(state, rawDarts) {
  // shallow copy so engine stays pure-ish (state mutation is still internal)
  return { ...state, rawDarts: [...rawDarts] };
}

/* =================================================================
   Total-per-turn API — used when the entry UI captures one number
   for the whole turn (e.g. the calculator-style entry: enter "120"
   for T20 + D20 + 20). The engine doesn't decompose the total into
   individual darts; it applies the same arithmetic (subtract for 01,
   add for Shanghai, marks for Cricket) treating the total as the
   turn's points.

   For 01: total is the points scored this turn.
            - busts if it would drive score below 0 or to 1 (double-out)
              or finish without a double when double-out is on
            - wins if it lands exactly on 0 (and double rules satisfied)

   For Shanghai: total is the points to add for this turn if the
            current round target was hit; otherwise total === 0.
            Caller is responsible for entering the right value
            (single/double/triple of the target number, or 0 to miss).

   For Cricket: total-based scoring doesn't fit (marks are per-dart).
            We add submitTurnCricketMarks() instead — pass an array of
            numbers (e.g. [20, 20, 20]) and the engine applies them as
            single-mark hits to the corresponding segment.
   ================================================================= */

export function submitTurnTotal01(state, total) {
  if (state.winner != null) return { state, events: [{ type: 'ignored', reason: 'game-over' }], applied: 0 };
  const player = state.players[state.current];
  const pts = Math.max(0, Math.floor(total) || 0);
  if (pts > 180) return { state, events: [{ type: 'ignored', reason: 'total-too-high' }], applied: 0 };
  const inOut = state.opts || {};
  // Total-entry mode: the user enters a single total for the turn
  // (e.g. "60" for 3 darts of 20 each). The engine trusts the
  // caller's total and applies it directly. The double-in / double-out
  // validation is implicit — the caller is responsible for the
  // validity of the score, and the engine handles the bust logic
  // (over-scoring, or landing on 1 in DO mode). For more strict
  // per-dart validation, the segment-tap entry mode would be needed,
  // but the user prefers the simpler numpad entry for all in/out
  // combinations.
  const startScore = player.score;
  const prospective = startScore - pts;
  const isFinish = prospective === 0;
  const wouldBust = prospective < 0
    || (inOut.out === 'double' && prospective === 1);
  const events = [];
  if (wouldBust) {
    events.push({ type: 'bust', total: pts, scoreAfter: startScore });
    player.history.push({ what: `BUST (${pts})`, delta: 0, scoreAfter: startScore });
    state.turnDarts = [];
    state.current = advanceTurn(state);
    return { state, events, applied: 0, bust: true, darts: 3 };
  }
  const dartsThisTurn = 3;
  player.score = prospective;
  events.push({ type: 'turn', total: pts, delta: -pts, scoreAfter: player.score, darts: dartsThisTurn });
  player.history.push({ what: `${pts}`, delta: -pts, scoreAfter: player.score });
  state.turnDarts = [{ total: pts, darts: dartsThisTurn }];
  if (isFinish) {
    player.legsWon += 1;
    events.push({ type: 'leg-won', playerIndex: state.current, legsWon: player.legsWon, legsToWin: state.opts.legsToWin, isCheckout: true });
    if (player.legsWon >= state.opts.legsToWin) {
      player.setsWon = (player.setsWon || 0) + 1;
      events.push({ type: 'set-won', playerIndex: state.current, setsWon: player.setsWon, setsToWin: state.opts.setsToWin });
      if (player.setsWon >= state.opts.setsToWin) {
        state.winner = state.current;
        state.endedAt = Date.now();
        events.push({ type: 'win', playerIndex: state.current });
        state.turnDarts = [];
        return { state, events, applied: pts, darts: dartsThisTurn, isLegWin: true, isCheckout: true };
      }
      for (const p of state.players) { p.score = state.opts.start; p.dartsThisLeg = 0; p.legsWon = 0; }
      events.push({ type: 'new-set', startingScore: state.opts.start });
    } else {
      for (const p of state.players) { p.score = state.opts.start; p.dartsThisLeg = 0; }
      events.push({ type: 'new-leg', startingScore: state.opts.start });
    }
    state.current = advanceTurn(state);
    state.turnDarts = [];
    return { state, events, applied: pts, darts: dartsThisTurn, isLegWin: true, isCheckout: true };
  }
  state.current = advanceTurn(state);
  state.turnDarts = [];
  player.dartsThisLeg = (player.dartsThisLeg || 0) + dartsThisTurn;
  return { state, events, applied: pts, darts: dartsThisTurn };
}

// Move current to the next player in throwOrder, skipping game-over state.
function advanceTurn(state) {
  if (!state.throwOrder) return (state.current + 1) % state.players.length;
  const idx = state.throwOrder.indexOf(state.current);
  for (let step = 1; step <= state.players.length; step++) {
    const next = state.throwOrder[(idx + step) % state.throwOrder.length];
    if (state.players[next].score > 0 || next === state.current) return next;
  }
  return state.current;
}

function events_push_warn(state, pts, cap) {
  // No-op stub kept for forward compat — actual warning is emitted via UI.
  // We still count this in rawDarts so undo replays correctly.
}

export function submitTurnTotalShanghai(state, total) {
  if (state.winner != null) return { state, events: [{ type: 'ignored', reason: 'game-over' }], applied: 0 };
  const me = state.players[state.current];
  const pts = Math.max(0, Math.floor(total) || 0);
  if (pts > 180) return { state, events: [{ type: 'ignored', reason: 'total-too-high' }], applied: 0 };
  if (pts > 0) {
    me.score += pts;
    me.history.push({ what: `${pts}`, delta: +pts, scoreAfter: me.score });
  }
  // Always 3 darts per turn (total-based entry).
  const dartsThisTurn = 3;
  state.turnDarts = [{ total: pts, darts: dartsThisTurn }];
  const events = [{ type: 'turn', total: pts, delta: +pts, scoreAfter: me.score, darts: dartsThisTurn }];
  state.current = (state.current + 1) % state.players.length;
  if (state.current === 0) state.round += 1;
  if (state.round > state.opts.n) {
    let bestIdx = 0;
    for (let i = 1; i < state.players.length; i++) {
      if (state.players[i].score > state.players[bestIdx].score) bestIdx = i;
    }
    const tied = state.players.filter(p => p.score === state.players[bestIdx].score).length > 1;
    if (!tied) {
      state.players[bestIdx].legsWon += 1;
      state.winner = bestIdx;
      state.endedAt = Date.now();
      events.push({ type: 'win', playerIndex: bestIdx });
    }
  }
  state.turnDarts = [];
  return { state, events, applied: pts, darts: dartsThisTurn, isLegWin: state.winner != null && state.winner === state.current };
}

// Cricket: per-dart numbers in segment order. Marks are accumulated.
// Each element is a segment number (15..20 or 25 for bull), and the
// engine applies them as 1-mark hits. For double/triple marks, pass
// them as repeated entries (e.g. [20, 20, 20] for a T20).
export function submitTurnCricketMarks(state, segments) {
  if (state.winner != null) return { state, events: [{ type: 'ignored', reason: 'game-over' }] };
  const events = [];
  const me = state.players[state.current];
  const CRICKET_NUMS = [15, 16, 17, 18, 19, 20, 25];
  for (const seg of segments) {
    if (seg === 0) continue;
    if (seg === 25) {
      // BULL: each press counts as 1 mark (single bull)
      const have = me.marks[25] || 0;
      const need = Math.max(0, 2 - have);
      const applied = Math.min(1, need);
      me.marks[25] = have + applied;
      const leftover = 1 - applied;
      if (me.marks[25] >= 2 && leftover > 0) {
        const opponentsOpen = state.players.some((p, i) =>
          i !== state.current && (p.marks[25] || 0) < 2);
        if (opponentsOpen) {
          const gained = leftover * 25;
          if (state.opts.cutThroat) {
            state.players.forEach((p, i) => {
              if (i !== state.current && (p.marks[25] || 0) < 2) {
                p.score += gained;
                p.history.push({ what: `BULL (CT)`, delta: +gained, scoreAfter: p.score });
              }
            });
          } else {
            me.score += gained;
          }
        }
      }
      events.push({ type: 'dart', segment: seg, scoreAfter: me.score });
      continue;
    }
    if (!CRICKET_NUMS.includes(seg)) continue;
    const have = me.marks[seg] || 0;
    const need = Math.max(0, 3 - have);
    const applied = Math.min(1, need);
    me.marks[seg] = have + applied;
    const leftover = 1 - applied;
    if (me.marks[seg] >= 3 && leftover > 0) {
      const opponentsOpen = state.players.some((p, i) =>
        i !== state.current && (p.marks[seg] || 0) < 3);
      if (opponentsOpen) {
        const gained = leftover * seg;
        if (state.opts.cutThroat) {
          state.players.forEach((p, i) => {
            if (i !== state.current && (p.marks[seg] || 0) < 3) {
              p.score += gained;
              p.history.push({ what: `${seg} (CT)`, delta: +gained, scoreAfter: p.score });
            }
          });
        } else {
          me.score += gained;
        }
      }
    }
    events.push({ type: 'dart', segment: seg, scoreAfter: me.score });
  }
  state.turnDarts = segments.map(s => ({ segment: s, multiplier: 1 }));

  // Cricket: use actual segment count (1..3) as the darts count. The UI
  // already groups per turn, so this is the most precise count available.
  const dartsThisTurn = segments.filter(s => s && s !== 0).length;
  me.dartsThisLeg = (me.dartsThisLeg || 0) + dartsThisTurn;

  // Win check (same rule as throwDartsCricket)
  const isClosed = (p, n) => n === 25 ? (p.marks[n] || 0) >= 2 : (p.marks[n] || 0) >= 3;
  const allClosed = CRICKET_NUMS.every(n => isClosed(me, n));
  if (allClosed) {
    const openOpponentAtOrAbove = state.players.some((p, i) =>
      i !== state.current
      && CRICKET_NUMS.some(n => !isClosed(p, n))
      && p.score >= me.score
    );
    if (!openOpponentAtOrAbove) {
      me.legsWon += 1;
      state.winner = state.current;
      state.endedAt = Date.now();
      events.push({ type: 'win', playerIndex: state.current });
      state.turnDarts = [];
      return { state, events, acceptedDarts: segments, darts: dartsThisTurn, isLegWin: true };
    }
  }
  state.current = (state.current + 1) % state.players.length;
  state.turnDarts = [];
  return { state, events, acceptedDarts: segments, darts: dartsThisTurn };
}

// Maximum legal 3-dart total in a single turn. Used by the UI for validation.
export const MAX_TURN_TOTAL = 180;

/* =================================================================
   Bull-throw to decide throw order.
   Each player throws ONE dart. Closest to the bull throws first.
   Scoring priority (lower score = closer to bull = goes first):
     - D25 (double bull)         → 0   (closest)
     - S25 (single bull / outer) → 1
     - any other dart            → 2 + segment distance from 25
   Ties → re-throw only among tied players.
   Returns: { order: number[], throws: [{playerIndex, dart, rank}], tiedPlayers: [] }
   `throws` is one entry per player in input order; `tiedPlayers` is non-empty
   if a re-throw is needed (caller must call again with only the tied indices).
   ================================================================= */
export function resolveBullThrow(playerNames, throws_) {
  // throws_ : [{ playerIndex, dart: {segment, multiplier} }]
  const ranked = throws_.map(t => {
    const r = bullRank(t.dart);
    return { ...t, rank: r, value: t.dart ? dartValue(t.dart) : 0 };
  });
  const minRank = Math.min(...ranked.map(r => r.rank));
  const tied = ranked.filter(r => r.rank === minRank).map(r => r.playerIndex);
  if (tied.length > 1) {
    return { order: null, throws: ranked, tiedPlayers: tied };
  }
  // Sort by rank ascending (closest first); break ties by dart value desc
  const sorted = [...ranked].sort((a, b) => a.rank - b.rank || b.value - a.value);
  const order = sorted.map(r => r.playerIndex);
  return { order, throws: ranked, tiedPlayers: [] };
}

function bullRank(dart) {
  if (!dart) return 999;
  if (dart.segment === 25 && dart.multiplier === 2) return 0; // double bull
  if (dart.segment === 25) return 1;                           // single bull
  // Fall back to a rough "distance" — closest non-bull to bull.
  // For segments 1..20, distance = |seg - 25|. Multiply by ring bonus (D < T < S from center).
  const ring = dart.multiplier === 2 ? 0 : dart.multiplier === 3 ? 1 : 2;
  return 2 + ring * 20 + Math.abs(dart.segment - 25);
}

/* =================================================================
   Checkout helpers for X01. Given a remaining score and a darts-
   budget, suggest a finishing combination. Only meaningful for 01
   with double-out (where the last dart MUST be a double). The
   famous "170" = T20 + T20 + BULL(50).
   Returns: [{ darts: [{segment, multiplier}], total, description }]
   or [] if no checkout fits within the budget.
   ================================================================= */
export function checkoutSuggestions(remaining, inOutOrVariation = 'doubleOut', budget = 3) {
  let inRule = 'single', outRule = 'double';
  if (typeof inOutOrVariation === 'boolean') {
    inRule = 'single'; outRule = inOutOrVariation ? 'double' : 'single';
  } else if (typeof inOutOrVariation === 'string') {
    const flags = x01InOutFlags({ variation: inOutOrVariation });
    inRule = flags.inRule; outRule = flags.outRule;
  } else if (inOutOrVariation && typeof inOutOrVariation === 'object') {
    inRule = inOutOrVariation.in || 'single';
    outRule = inOutOrVariation.out || 'double';
  }
  if (remaining <= 0) return [];
  if (inRule !== 'single') return []; // no hints while closed out in DI/TI/MI
  const out = [];
  const TARGET_DOUBLES = [50, 40, 38, 36, 34, 32, 30, 28, 26, 24, 22, 20, 18, 16, 14, 12, 10, 8, 6, 4, 2];
  const TARGET_TRIPLES = [60, 57, 54, 51, 48, 45, 42, 39, 36, 33, 30, 27, 24, 21, 18, 15, 12, 9, 6, 3];
  const matchSum = (darts) => darts.reduce((s, d) => s + dartValue(d), 0);

  // Single-dart finishes
  if (budget >= 1) {
    if (outRule === 'triple') {
      for (const t of TARGET_TRIPLES) {
        if (t === remaining) {
          out.push({ darts: [{ segment: t / 3, multiplier: 3 }], total: remaining, description: `T${t / 3} = ${remaining}` });
          return out.slice(0, 1);
        }
      }
    } else if (outRule === 'master') {
      for (const d of TARGET_DOUBLES) {
        if (d === remaining) {
          out.push({
            darts: [{ segment: d === 50 ? 25 : d / 2, multiplier: 2 }],
            total: remaining,
            description: `${dartLabel({ segment: d === 50 ? 25 : d / 2, multiplier: 2 })} = ${remaining}`,
          });
          return out.slice(0, 1);
        }
      }
    } else {
      // single or double out
      if (outRule !== 'double' || (remaining <= 50 && remaining % 2 === 0) || remaining === 50) {
        const segment = outRule === 'double' ? (remaining === 50 ? 25 : remaining / 2) : (remaining === 25 ? 25 : remaining <= 20 ? remaining : 0);
        if (segment > 0) {
          const mult = (outRule === 'double' || remaining === 50) ? 2 : (remaining === 25 ? 1 : 1);
          out.push({ darts: [{ segment, multiplier: mult }], total: remaining, description: `${dartLabel({ segment, multiplier: mult })} = ${remaining}` });
          return out.slice(0, 1);
        }
      }
    }
  }

  if (budget >= 2) {
    const finishDarts = outRule === 'triple' ? TARGET_TRIPLES.map(t => ({ segment: t / 3, multiplier: 3, value: t }))
      : outRule === 'master' ? TARGET_DOUBLES.map(d => ({ segment: d === 50 ? 25 : d / 2, multiplier: 2, value: d }))
      : outRule === 'double' ? TARGET_DOUBLES.map(d => ({ segment: d === 50 ? 25 : d / 2, multiplier: 2, value: d }))
      : [{ segment: 0, multiplier: 1, value: remaining }];

    for (const fd of finishDarts) {
      if (fd.value > remaining) continue;
      const need = remaining - fd.value;
      for (let s = 20; s >= 1; s--) {
        const setupValues = [s, s * 2, s * 3, 25, 50];
        for (const sv of setupValues) {
          if (sv === need) {
            const setupDart = sv === 25 ? { segment: 25, multiplier: 1 }
              : sv === 50 ? { segment: 25, multiplier: 2 }
              : { segment: s, multiplier: sv / s };
            out.push({
              darts: [setupDart, { segment: fd.segment, multiplier: fd.multiplier }],
              total: remaining,
              description: `${dartLabel(setupDart)} + ${dartLabel({ segment: fd.segment, multiplier: fd.multiplier })} = ${remaining}`,
            });
            return out.slice(0, 1);
          }
        }
      }
    }
  }

  if (budget === 3) {
    const finishDarts = outRule === 'triple' ? TARGET_TRIPLES.map(t => ({ segment: t / 3, multiplier: 3, value: t }))
      : outRule === 'master' ? TARGET_DOUBLES.map(d => ({ segment: d === 50 ? 25 : d / 2, multiplier: 2, value: d }))
      : outRule === 'double' ? TARGET_DOUBLES.map(d => ({ segment: d === 50 ? 25 : d / 2, multiplier: 2, value: d }))
      : [{ segment: 0, multiplier: 1, value: 0 }];

    for (let t1 = 60; t1 >= 0; t1 -= 3) {
      for (let t2 = t1; t2 >= 0; t2 -= 3) {
        const after = remaining - t1 - t2;
        if (after < 0) continue;
        for (const fd of finishDarts) {
          if (fd.value !== after) continue;
          const d1 = { segment: t1 / 3, multiplier: 3 };
          const d2 = { segment: t2 / 3, multiplier: 3 };
          const d3 = { segment: fd.segment, multiplier: fd.multiplier };
          if (matchSum([d1, d2, d3]) === remaining) {
            out.push({ darts: [d1, d2, d3], total: remaining, description: `T${d1.segment} + T${d2.segment} + ${dartLabel(d3)} = ${remaining}` });
            return out.slice(0, 1);
          }
        }
      }
    }
  }

  return out;
}

/* =================================================================
   170 = T20 + T20 + BULL. Quick helper for the UI to show a big
   "170" checkout card prominently when the player is on 170.
   ================================================================= */
/* =================================================================
   Rebuild a game from an edited rawDarts array. Used by undo and by
   the history-edit UI: we replay every accepted turn on a fresh game
   state so the engine stays the single source of truth.
   ================================================================= */
export function rebuildGame(type, names, opts, rawDarts, stopIndex = rawDarts.length) {
  let fresh;
  if (type === 'x01') fresh = new01(names, opts);
  else if (type === 'cricket') fresh = newCricket(names, opts);
  else fresh = newShanghai(names, opts);
  fresh.rawDarts = [];
  for (let i = 0; i < stopIndex; i++) {
    const entry = rawDarts[i];
    if (fresh.winner != null) break;
    if (entry.dartsData && entry.dartsData.length) {
      throwDarts01(fresh, entry.dartsData);
      fresh.rawDarts.push(entry);
    } else if (entry.total != null) {
      if (type === 'x01') submitTurnTotal01(fresh, entry.total);
      else if (type === 'shanghai') submitTurnTotalShanghai(fresh, entry.total);
      fresh.rawDarts.push(entry);
    } else if (entry.segments) {
      submitTurnCricketMarks(fresh, entry.segments);
      fresh.rawDarts.push(entry);
    }
  }
  return fresh;
}

/* Edit one rawDarts entry and replay the rest. Returns the rebuilt game
   or null if the edited turn is invalid (would bust / win rules fail).
   The edited entry must be a full turn object compatible with the type. */
export function editRawDart(game, idx, newEntry) {
  const names = game.players.map(p => p.name);
  const opts = { ...game.opts, legsToWin: game.legsToWin };
  const before = game.rawDarts.slice(0, idx);
  const after = game.rawDarts.slice(idx + 1);
  let fresh = rebuildGame(game.type, names, opts, before);
  // Apply the edited turn.
  if (fresh.winner != null) return null;
  if (newEntry.dartsData && newEntry.dartsData.length) {
    const r = throwDarts01(fresh, newEntry.dartsData);
    if ((r.events || []).some(e => e.type === 'ignored')) return null;
    fresh.rawDarts.push(newEntry);
  } else if (newEntry.total != null) {
    let r;
    if (game.type === 'x01') r = submitTurnTotal01(fresh, newEntry.total);
    else if (game.type === 'shanghai') r = submitTurnTotalShanghai(fresh, newEntry.total);
    if ((r.events || []).some(e => e.type === 'ignored')) return null;
    fresh.rawDarts.push(newEntry);
  } else if (newEntry.segments) {
    const r = submitTurnCricketMarks(fresh, newEntry.segments);
    if ((r.events || []).some(e => e.type === 'ignored')) return null;
    fresh.rawDarts.push(newEntry);
  }
  // Replay the tail only while the game is still running.
  fresh = rebuildGame(game.type, names, opts, fresh.rawDarts.concat(after));
  return fresh;
}

export const CHECKOUT_170 = {
  darts: [
    { segment: 20, multiplier: 3 },
    { segment: 20, multiplier: 3 },
    { segment: 25, multiplier: 2 },
  ],
  total: 170,
  description: 'T20 + T20 + BULL = 170',
};

