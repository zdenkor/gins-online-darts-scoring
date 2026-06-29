// =================================================================
// Tournament players — distinct from `users` (admin accounts).
// Players don't log in; they just have identity metadata.
// =================================================================
import { put, get, getAll, del } from './index.js';

// ID format: CLUBCODE#NNNNNN
//   CLUBCODE = 1+ uppercase letters  (e.g. NR, NRZAL, BA, TT)
//   #        = literal hash
//   NNNNNN   = exactly 6 digits
// Always stored uppercase. Examples: NR#100298, NRZAL#000123.
// Registration number format:
//   - 1+ uppercase letters (club code, e.g. "NR", "NRZAL", "SVK")
//   - OPTIONAL separator: any non-alphanumeric char (e.g. "#", ".",
//     "-", "?", or empty string)
//   - Exactly 6 digits (serial number)
// Examples: "NR#100298", "NR.100298", "NR-100298", "SVK003112"
const REG_NUMBER_RE = /^[A-Z]{1,10}[^A-Z0-9]?\d{6}$/;

/**
 * Normalize a registration number: trim, uppercase, collapse whitespace.
 * Returns null if it doesn't match the required format.
 */
export function normalizeRegNumber(input) {
  if (!input) return null;
  const s = String(input).trim().toUpperCase().replace(/\s+/g, '');
  if (!REG_NUMBER_RE.test(s)) return null;
  return s;
}

/**
 * Parse a registration number into { clubCode, serial }.
 * Returns null on invalid input.
 */
export function parseRegNumber(input) {
  const norm = normalizeRegNumber(input);
  if (!norm) return null;
  // Find the separator (any non-alphanumeric) between letters and digits.
  const m = norm.match(/^([A-Z]+)([^A-Z0-9]?)(\d{6})$/);
  if (!m) return null;
  return { clubCode: m[1], separator: m[2], serial: m[3], full: norm };
}

/**
 * Create or update a player. The `regNumber` (if provided) must be
 * normalized first; pass null if unknown.
 * Returns the player id.
 */
export async function savePlayer({
  id, firstName, surname, middleName, nameSuffixes, town, club, regNumber, regAuthority,
}) {
  const norm = normalizeRegNumber(regNumber);
  if (regNumber && !norm) {
    throw new Error('Invalid registration number. Expected format: CLUB#123456 (e.g. NR#100298).');
  }
  const payload = {
      firstName: (firstName || '').trim(),
      surname: (surname || '').trim(),
      middleName: (middleName || '').trim(),
      nameSuffixes: (nameSuffixes || '').trim(),
      town: (town || '').trim(),
      club: (club || '').trim(),
      regNumber: norm || '',
      regAuthority: (regAuthority || '').trim(),
      updatedAt: Date.now(),
    };
  if (id) payload.id = id;
  if (!payload.firstName && !payload.surname) {
    throw new Error('Player needs at least a first name or surname.');
  }
  return await put('players', payload);
}

/**
 * Look up an existing player by exact regNumber match.
 */
export async function findByRegNumber(regNumber) {
  const norm = normalizeRegNumber(regNumber);
  if (!norm) return null;
  const all = await getAll('players');
  return all.find(p => p.regNumber === norm) || null;
}

/**
 * Find the highest numeric serial currently used by a given club
 * code (e.g. "NR"). Returns the next available serial, or null if
 * the club code isn't used yet by anyone.
 */
export async function highestSerialForClub(clubCode) {
  if (!clubCode) return null;
  const cc = clubCode.toUpperCase();
  const all = await getAll('players');
  let max = -1;
  for (const p of all) {
    const parsed = parseRegNumber(p.regNumber);
    if (parsed && parsed.clubCode === cc) {
      const n = parseInt(parsed.serial, 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max < 0 ? null : max;
}

/**
 * Allocate the next available reg number for a club code.
 * Returns the formatted string like "NR#100321", or null if
 * clubCode is empty.
 */
export async function nextRegNumberForClub(clubCode) {
  if (!clubCode) return null;
  const cc = clubCode.toUpperCase();
  const highest = await highestSerialForClub(cc);
  const next = (highest == null) ? 100000 : (highest + 1);
  // 6-digit padded serial.
  return `${cc}#${String(next).padStart(6, '0')}`;
}

/**
 * Look up the most common club shorthand for a given club name
 * (e.g. name "Nitra" → "NR" if existing players from Nitra use
 * that prefix). Returns "" if no shorthand known.
 */
export async function shorthandForClubName(clubName) {
  if (!clubName) return '';
  const clubs = await listClubs();
  const c = clubs.find(x => x.name.toLowerCase() === clubName.toLowerCase());
  return c ? c.shorthand : '';
}

/**
 * Case-insensitive search by surname (and optional first name).
 * Used by the picker search box. Returns up to `limit` matches.
 */
export async function searchPlayers({ surname, firstName, limit = 50 }) {
  const all = await getAll('players');
  const sL = (surname || '').trim().toLowerCase();
  const fL = (firstName || '').trim().toLowerCase();
  const matches = all.filter(p => {
    const sn = (p.surname || '').toLowerCase();
    const fn = (p.firstName || '').toLowerCase();
    if (sL && !sn.includes(sL)) return false;
    if (fL && !fn.includes(fL)) return false;
    return true;
  });
  // Sort: exact surname match first, then prefix, then anywhere.
  matches.sort((a, b) => {
    const aSn = (a.surname || '').toLowerCase();
    const bSn = (b.surname || '').toLowerCase();
    if (sL) {
      const aStarts = aSn.startsWith(sL);
      const bStarts = bSn.startsWith(sL);
      if (aStarts !== bStarts) return aStarts ? -1 : 1;
      if (aSn === sL && bSn !== sL) return -1;
      if (bSn === sL && aSn !== sL) return 1;
    }
    return aSn.localeCompare(bSn) || (a.firstName || '').localeCompare(b.firstName || '');
  });
  return matches.slice(0, limit);
}

/**
 * Find all existing players that match a CSV/text line.
 * Returns:
 *   { exactReg: player | null,
 *     byName: [matching players],
 *     parsed: { surname, firstName, middleName, town, club, regNumber } }
 */
export async function matchLine(line) {
  const parsed = parseLine(line);
  let exactReg = null;
  if (parsed.regNumber) exactReg = await findByRegNumber(parsed.regNumber);
  const byName = await searchPlayers({
    surname: parsed.surname,
    firstName: parsed.firstName,
    limit: 10,
  });
  // If reg matched, drop duplicates from byName.
  const filtered = exactReg ? byName.filter(p => p.id !== exactReg.id) : byName;
  return { exactReg, byName: filtered, parsed };
}

/**
 * Parse a single line into player fields. Supports:
 *   "Surname, FirstName, Middle, Town, Club, RegNumber"
 *   "Surname FirstName Middle Town Club RegNumber"  (tab or multi-space)
 *   "FirstName Surname"                             (2 tokens)
 *   "Surname"                                       (1 token)
 *   "#NR100298"                                     (reg-only)
 *
 * Heuristic: if the line has a #, the part after # is regNumber. The
 * rest is split on commas or whitespace.
 */
export function parseLine(line) {
  const raw = String(line || '').trim();
  if (!raw) return emptyParsed();

  // Pull out the reg number first. Two accepted formats:
  //   - LETTERS [SEP] NNNNNN   (1+ letters, optional non-alphanumeric
  //                            separator, 6 digits)
  //   - "SVKNNNNNN"           (3 letters "SVK" + 6 digits, no hash)
  //                           (SVK portal at portal.slovaksteeldarts.sk
  //                           uses this format for federation licenses)
  // 5-digit SetDarts IDs (e.g. "02337") are NOT extracted.
  let regNumber = '';
  let body = raw;
  // General: letters + optional separator + 6 digits. Capture the
    // optional separator (any non-alphanumeric) so we strip it cleanly.
    const genMatch = raw.match(/\b([A-Z]{1,10})([^A-Z0-9]?)(\d{6})\b/i);
    if (genMatch) {
      // Preserve the separator (if present) in the stored value so
      // regNumbers match exactly what the admin typed.
      regNumber = (genMatch[1] + genMatch[2] + genMatch[3]).toUpperCase();
      // Remove the entire matched substring from body
      const matchedStr = raw.slice(genMatch.index, genMatch.index + genMatch[0].length);
      body = raw.replace(matchedStr, '').trim();
    }

  // Split remaining body — prefer comma, fall back to whitespace.
  let parts;
  if (body.includes(',')) {
    parts = body.split(',').map(s => s.trim()).filter(Boolean);
  } else {
    parts = body.split(/\s+/).filter(Boolean);
  }

  // Drop pure-numeric tokens (SetDarts IDs like "02337") from the
    // start of the parts list — they're not part of the name.
    while (parts.length && /^\d+$/.test(parts[0])) parts.shift();

    // Common shape: ["Surname", "FirstName", ...]
    // Slovak convention: Surname first, then FirstName.
    const surname = parts[0] || '';
      const firstName = parts[1] || '';
      const middleName = parts[2] || '';
      const town = parts[3] || '';
      const club = parts[4] || '';
      const nameSuffixes = ''; // TODO: extract from trailing tokens when needed

      return {
        surname,
        firstName,
        middleName,
        nameSuffixes,
        town,
        club,
        regNumber,
      };
    }

    function emptyParsed() {
      return { surname: '', firstName: '', middleName: '', nameSuffixes: '',
               town: '', club: '', regNumber: '' };
    }

/**
 * Return the unique list of home clubs derived from existing
 * players. Each entry: { shorthand, name, count }.
 *
 * `shorthand` is the most common CLUBCODE prefix used by players
 * from that club (e.g. "NR" for Nitra). If a club has no players
 * with a regNumber, shorthand is "".
 *
 * Sorted alphabetically by club name.
 */
export async function listClubs() {
  const all = await getAll('players');
  const map = new Map(); // key: lowercase club name -> { name, codes: Map<code, count>, total }
  for (const p of all) {
    const name = (p.club || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    let entry = map.get(key);
    if (!entry) {
      entry = { name, codes: new Map(), total: 0 };
      map.set(key, entry);
    }
    entry.total++;
    const parsed = parseRegNumber(p.regNumber);
    if (parsed) {
      const c = parsed.clubCode;
      entry.codes.set(c, (entry.codes.get(c) || 0) + 1);
    }
  }
  const result = [];
  for (const entry of map.values()) {
    // Pick the most common code as the canonical shorthand.
    let shorthand = '';
    let best = 0;
    for (const [c, n] of entry.codes) {
      if (n > best) { shorthand = c; best = n; }
    }
    result.push({
      name: entry.name,
      shorthand,
      count: entry.total,
    });
  }
  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

/**
 * Filter players by club (case-insensitive name match). Used by
 * the picker when the user picks a club from the filter dropdown.
 * If `club` is empty, returns all players (no filter).
 */
export async function filterByClub(players, club) {
  if (!club) return players;
  const c = club.trim().toLowerCase();
  return players.filter(p => (p.club || '').trim().toLowerCase() === c);
}

/**
 * Format a player for display: "Surname, FirstName [Middle]" or fallback.
 */
export function formatPlayerName(p) {
  if (!p) return '?';
  const first = (p.firstName || '').trim();
  const last = (p.surname || '').trim();
  const mid = (p.middleName || '').trim();
  const suf = (p.nameSuffixes || '').trim();
  // Order: Surname, FirstName [Middle] [Suffixes]
  // Example: "Smith, John ml. Jr."
  if (last && first) {
    let result = `${last}, ${first}`;
    if (mid) result += ` ${mid}`;
    if (suf) result += ` ${suf}`;
    return result;
  }
  if (last) return [last, suf].filter(Boolean).join(' ');
  if (first) return [first, suf].filter(Boolean).join(' ');
  return `Player #${p.id || '?'}`;
}