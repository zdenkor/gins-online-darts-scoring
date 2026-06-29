// =================================================================
// SVK (Slovenská Šípkarská Federácia / Slovak Steel Darts) player
// lookup — via LOCAL CACHE.
//
// Why local cache?
// The SVK portal at https://portal.slovaksteeldarts.sk/licencie
// is a PHP backend with no CORS headers. A direct `fetch()` from
// our origin is always blocked by the browser.
//
// The workaround: the admin imports the SVK list ONCE (opens the
// portal manually in a tab, selects all rows, copies, pastes into
// our app). We parse + store in the local `svk_players` IDB
// store. From then on, lookups are fast + offline + no CORS.
//
// Admin workflow:
//   1. Open https://portal.slovaksteeldarts.sk/licencie
//   2. Select-all the table rows, copy (Ctrl+A inside the table,
//      Ctrl+C — or right-click → "Copy")
//   3. In our app: Settings → "Import SVK license list" → paste
//   4. From then on, competitions player picker has a
//      "🔍 Search SVK cache" button that looks up locally.
// =================================================================

import { put, getAll } from '../db/index.js';

const PORTAL_BASE = 'https://portal.slovaksteeldarts.sk';
const SEARCH_PATH = '/licencie';

/**
 * Parse the SVK license table from copied text.
 *
 * Accepts tab-separated, multi-space, or pipe-separated rows.
 * The first non-empty line is treated as the header.
 *
 * Expected columns (header is matched case-insensitively, but
 * positional fallback also works):
 *   SVK ID | SetDarts ID | Priezvisko Meno | Mesto | Materský Klub
 *
 * Returns: [{ svkId, setDartsId, name, surname, firstName, town, club }, ...]
 */
export function parseSVKListText(text) {
  if (!text || typeof text !== 'string') return [];
  // Detect separator: tab > multiple-space > pipe > single space
  // TSV is the common clipboard format from HTML tables.
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  // Skip header row (contains "SVK" but no 6-digit suffix match)
  let startIdx = 0;
  const firstFields = splitRow(lines[0]);
  if (!/^SVK\d{6}$/i.test(firstFields[0] || '')) {
    startIdx = 1;
  }

  const rows = [];
  for (let i = startIdx; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    if (cells.length < 3) continue;
    const svkId = (cells[0] || '').toUpperCase().trim();
    if (!/^SVK\d{6}$/.test(svkId)) continue;
    const setDartsId = (cells[1] || '').trim();
    const name = (cells[2] || '').trim();
    const town = (cells[3] || '').trim();
    const club = (cells[4] || '').trim();
    const { surname, firstName } = splitSlovakName(name);
    rows.push({
      svkId, setDartsId, name, surname, firstName, town, club,
    });
  }
  return rows;
}

/**
 * Split a row using the best available separator.
 */
function splitRow(line) {
  if (line.includes('\t')) return line.split('\t').map(s => s.trim());
  if (line.includes('|')) return line.split('|').map(s => s.trim());
  // Multiple spaces (HTML table → TSV not always preserved)
  return line.split(/\s{2,}| \| /).map(s => s.trim()).filter(Boolean);
}

/**
 * "Priezvisko Meno" Slovak convention: surname first, then
 * firstName. May include middle initials ("Novák Ján ml.").
 */
export function splitSlovakName(name) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { surname: '', firstName: '' };
  if (parts.length === 1) return { surname: parts[0], firstName: '' };
  // Drop trailing middle-name tokens
  const middleTokens = /^(st|ml|sr|jr|st\.|ml\.|sr\.|jr\.)$/i;
  let end = parts.length;
  while (end > 2 && middleTokens.test(parts[end - 1])) end--;
  const surname = parts[0];
  const firstName = parts.slice(1, end).join(' ');
  return { surname, firstName };
}

/**
 * Import a parsed list into the local `svk_players` store.
 * Existing entries with the same svkId are overwritten (the new
 * data wins). Returns { imported, total }.
 */
export async function importSVKList(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { imported: 0, total: 0 };
  }
  let imported = 0;
  for (const row of rows) {
    if (!row.svkId) continue;
    await put('svk_players', row);
    imported++;
  }
  const all = await getAll('svk_players');
  return { imported, total: all.length };
}

/**
 * Search the local SVK cache by surname + optional firstName.
 * Case-insensitive, accent-tolerant via .toLowerCase() only
 * (Slovak has diacritics — exact lowercase match).
 *
 * Returns: [{ svkId, setDartsId, name, surname, firstName, town, club }, ...]
 * Sorted by surname, then firstName.
 */
export async function searchSVKCache({ surname, firstName } = {}) {
  const all = await getAll('svk_players');
  const sL = (surname || '').trim().toLowerCase();
  const fL = (firstName || '').trim().toLowerCase();
  let matches = all;
  if (sL) {
    matches = matches.filter(p => (p.surname || '').toLowerCase().includes(sL));
  }
  if (fL) {
    matches = matches.filter(p => (p.firstName || '').toLowerCase().includes(fL));
  }
  matches.sort((a, b) =>
    (a.surname || '').localeCompare(b.surname || '') ||
    (a.firstName || '').localeCompare(b.firstName || '')
  );
  return matches;
}

/**
 * Look up a single SVK player by exact svkId.
 */
export async function findInSVKCache(svkId) {
  if (!svkId) return null;
  const { get } = await import('../db/index.js');
  return await get('svk_players', svkId.toUpperCase());
}

/**
 * Get cache stats: { count, lastImportedAt }.
 * lastImportedAt is from the most recent record's svkId numeric
 * portion, or null. (We don't store timestamps in the records
 * themselves yet — could add later.)
 */
export async function getSVKCacheStats() {
  const all = await getAll('svk_players');
  return {
    count: all.length,
    populated: all.length > 0,
  };
}

/**
 * Clear the local SVK cache.
 */
export async function clearSVKCache() {
  const { clear } = await import('../db/index.js');
  await clear('svk_players');
  return { cleared: true };
}

/**
 * Online lookup via CORS proxy fallback chain.
 *
 * The SVK portal has no CORS headers — direct fetch fails. We
 * route through public CORS proxies that fetch server-side and
 * re-emit with CORS headers. Tried in order; first one to
 * succeed wins.
 *
 * Returns: { ok, rows, error?, url? }
 *   ok=true  → rows parsed from the portal HTML
 *   ok=false → all proxies failed; admin can open `url` manually
 */
export async function lookupPlayerOnSVK(name) {
  if (!name || !name.trim()) {
    return { ok: false, error: 'empty', url: manualSearchUrl('') };
  }
  const q = name.trim();
  const targetUrl = manualSearchUrl(q);

  // CORS proxy fallback chain. Each wraps the target URL.
  // All are free, no-key public services. If one is down, the
  // next tries. If all fail, we surface the manual-search URL.
  const PROXIES = [
    (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
    (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u) => `https://cors-anywhere.herokuapp.com/${u}`,
  ];

  for (const proxy of PROXIES) {
    try {
      const proxiedUrl = proxy(targetUrl);
      const html = await fetchOnce(proxiedUrl);
      const rows = parseSVKPortalHtml(html);
      if (rows.length > 0) {
        return { ok: true, rows, source: proxiedUrl };
      }
    } catch (e) {
      // try next proxy
      continue;
    }
  }

  // All proxies failed (or returned no parseable rows).
  return { ok: false, error: 'all-proxies-failed', url: targetUrl };
}

/**
 * Fetch a URL with one-shot error-event suppression (so the
 * global error handler doesn't fire on transient CORS/network
 * failures). Returns the response text on 2xx, throws otherwise.
 */
async function fetchOnce(url) {
  const swallowFetchError = (e) => {
    const err = e?.error || e?.reason;
    if (err && err.name === 'TypeError' && /Failed to fetch/i.test(err.message || '')) {
      e.preventDefault?.();
      e.stopImmediatePropagation?.();
      return true;
    }
    return false;
  };
  window.addEventListener('error', swallowFetchError, { capture: true });
  let res;
  try {
    res = await fetch(url, { method: 'GET', credentials: 'omit',
      headers: { 'Accept': 'text/html,application/xhtml+xml' } });
  } finally {
    window.removeEventListener('error', swallowFetchError, { capture: true });
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

/**
 * Parse the SVK portal HTML response into player rows.
 *
 * The portal renders an HTML table; we look for <tr> rows with
 * <td> cells matching the column layout:
 *   SVK ID | SetDarts ID | Priezvisko Meno | Mesto | Materský Klub
 */
function parseSVKPortalHtml(html) {
  if (!html || typeof html !== 'string') return [];
  // Lightweight HTML parse — strip tags, extract rows.
  // We only need cell text, no DOM walking.
  const rowMatches = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const rows = [];
  for (const tr of rowMatches) {
    const tds = (tr.match(/<td[\s\S]*?<\/td>/gi) || [])
      .map(td => td.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim());
    if (tds.length < 3) continue;
    const svkId = (tds[0] || '').toUpperCase().trim();
    if (!/^SVK\d{6}$/.test(svkId)) continue;
    const setDartsId = (tds[1] || '').trim();
    const name = (tds[2] || '').trim();
    const town = (tds[3] || '').trim();
    const club = (tds[4] || '').trim();
    const { surname, firstName } = splitSlovakName(name);
    rows.push({ svkId, setDartsId, name, surname, firstName, town, club });
  }
  return rows;
}

/**
 * Build the manual-search URL the admin can open in a popup.
 */
export function manualSearchUrl(name) {
  const q = encodeURIComponent((name || '').trim());
  return `${PORTAL_BASE}${SEARCH_PATH}?q=${q}&search=${q}`;
}

export const SVK_PORTAL_BASE = PORTAL_BASE;
export const SVK_SEARCH_PATH = SEARCH_PATH;