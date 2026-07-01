// =================================================================
// Lightweight localStorage wrapper with namespacing.
// =================================================================
const NS = 'gindarts:';

export const store = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(NS + key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(NS + key, JSON.stringify(value)); }
    catch (e) { console.warn('store.set failed', e); }
  },
  remove(key) {
    try { localStorage.removeItem(NS + key); } catch {}
  },
};

// Per-game-type stats: { type: { played, wins: { playerName: N }, best: { playerName: score } } }
export function recordGameResult(state) {
  if (!state || !state.winner && state.winner !== 0) return;
  const stats = store.get('stats', {});
  const t = state.type;
  stats[t] = stats[t] || { played: 0, wins: {}, best: {} };
  stats[t].played += 1;
  const winner = state.players[state.winner];
  stats[t].wins[winner.name] = (stats[t].wins[winner.name] || 0) + 1;
  const score = winner.score | 0;
  const prev = stats[t].best[winner.name] || 0;
  // For 01: lower is better (winning score = 0 is best). For Cricket/Shanghai: higher is better.
  const isBetter = t === 'x01' ? (score <= prev || prev === 0 ? score !== 0 || prev === 0 : false) : score > prev;
  if (isBetter) stats[t].best[winner.name] = score;
  store.set('stats', stats);

  // Append the per-game dart history for the stats feature (phase 1).
  // Stored separately so the legacy summary stays cheap.
  recordGameHistory(state);
}

// Append the finished game to the per-scope history log.
// Each entry is one game with the full rawDarts array, the scope, the
// start time, and the player list — enough to compute every lifetime
// and per-scope stat in the UI later.
export function recordGameHistory(state) {
  if (!state || state.winner == null) return;
  const history = store.get('gameHistory', []);
  const entry = {
    id: `${state.startedAt || Date.now()}-${(history.length + 1).toString(36)}`,
    type: state.type,                  // 'x01' | 'cricket' | 'shanghai'
    startedAt: state.startedAt || null,
    endedAt: state.endedAt || Date.now(),
    winner: state.players[state.winner]?.name,
    winnerIndex: state.winner,
    players: state.players.map(p => p.name),
    opts: state.opts || {},
    scope: state.scope || { type: 'standalone' },
    rawDarts: (state.rawDarts || []).slice(), // snapshot copy
  };
  history.push(entry);
  // Cap history to keep storage small — keep the last 500 games
  while (history.length > 500) history.shift();
  store.set('gameHistory', history);
}

export function getGameHistory() {
  return store.get('gameHistory', []);
}

export function clearGameHistory() {
  store.remove('gameHistory');
}

export function getStats() {
  return store.get('stats', {});
}

export function saveLastGame(state) {
  // Trim to keep storage small — last 200 raw darts only
  const trimmed = { ...state, rawDarts: (state.rawDarts || []).slice(-200) };
  store.set('lastGame', trimmed);
}

export function loadLastGame() {
  return store.get('lastGame', null);
}

// =================================================================
// UI stats settings — toggleable user preferences for the Stats page.
// `checkoutStats` (default true) shows the checkout-statistic table in
// the Stats screen. Settings live in localStorage under
// `gindarts:uiStatsSettings` so they survive reloads without needing
// the IndexedDB settings store round-trip.
// =================================================================
const UI_STATS_DEFAULTS = Object.freeze({ checkoutStats: true });

export function loadUiStatsSettings() {
  const raw = store.get('uiStatsSettings', null);
  if (!raw || typeof raw !== 'object') return { ...UI_STATS_DEFAULTS };
  return { checkoutStats: raw.checkoutStats !== false };
}

export function saveUiStatsSettings(settings) {
  const merged = { ...UI_STATS_DEFAULTS, ...(settings || {}) };
  store.set('uiStatsSettings', merged);
  return merged;
}
