// =================================================================
// Google Drive sync for competitions. Writes JSON files to the user's
// hidden `appDataFolder`. The Drive `drive.file` scope means we can
// only read files the app itself created — no risk of accessing
// anything else in the user's Drive.
//
// FILE LAYOUT (flat, all in appDataFolder — no subfolders):
//   competitions__<id>.json
//   matches__<competitionId>__<matchId>.json
//   game-history__<competitionId>__<matchId>.json
//   manifest.json
//
// Why flat? Drive API v3 does NOT support creating folders with
// `parents: ['appDataFolder']` — the alias only works for files.
// Subfolders would require first finding the real appDataFolder
// ID, which adds an extra round-trip and is fragile. Flat layout
// is simpler, faster, and works.
//
// On sign-in: pull everything to IndexedDB cache.
// On write: IndexedDB first, then push to Drive (best-effort).
// =================================================================

import {
  DRIVE_FOLDER_COMPETITIONS,
  DRIVE_FOLDER_MATCHES,
  DRIVE_FOLDER_HISTORY,
  DRIVE_MANIFEST_FILE,
  DRIVE_SCHEMA_VERSION,
} from '../config.js';
import { authedFetch, isSignedIn } from './google.js';
import { put } from '../db/index.js';

// ----- File naming -----
// Each "scope" gets a name prefix. The __ separator avoids name
// collisions (e.g. competition id "12" vs match id "34" wouldn't
// collide with competition id "1" + match id "234" because the
// competition id is bounded by what we generate).
function nameFor(scope, ...parts) {
  return `${scope}__${parts.join('__')}.json`;
}
function matchPrefix(scope) {
  return `${scope}__`;
}
function matchExact(name, scope, ...parts) {
  return name === nameFor(scope, ...parts);
}
function extractAfterPrefix(name, scope) {
  const prefix = matchPrefix(scope);
  if (!name.startsWith(prefix)) return null;
  if (!name.endsWith('.json')) return null;
  return name.substring(prefix.length, name.length - '.json'.length);
}

// ----- Drive file APIs (Drive API v3) -----
// All files live directly in appDataFolder. The 'appDataFolder'
// alias is supported by Drive v3 as a value in `parents` (for
// uploads) and `'appDataFolder' in parents` (for queries).

// List all files in appDataFolder whose name starts with `prefix`.
// Returns the raw {id, name, parents}[].
async function listByPrefix(prefix) {
  const all = [];
  let pageToken = null;
  do {
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', `name >= '${prefix}' and name < '${prefix}~' and 'appDataFolder' in parents and trashed = false`);
    url.searchParams.set('fields', 'files(id,name),nextPageToken');
    url.searchParams.set('pageSize', '200');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const r = await authedFetch(url);
    if (!r.ok) {
      const text = await r.text();
      throw new Error('listByPrefix failed: ' + r.status + ' — ' + text);
    }
    const data = await r.json();
    for (const f of data.files || []) all.push(f);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return all;
}

// Find a single file by its exact name.
async function findByName(name) {
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', `name = '${name}' and 'appDataFolder' in parents and trashed = false`);
  url.searchParams.set('fields', 'files(id)');
  const r = await authedFetch(url);
  if (!r.ok) {
    const text = await r.text();
    throw new Error('findByName failed: ' + r.status + ' — ' + text);
  }
  const data = await r.json();
  return data.files?.[0]?.id || null;
}

// Download JSON by file id. Returns null on 404.
async function downloadJsonFile(id) {
  const r = await authedFetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('download failed: ' + r.status);
  return r.json();
}

// Upload or update a JSON file directly in appDataFolder.
async function upsertJsonFile(name, data) {
  const body = JSON.stringify(data);
  const existing = await findByName(name);
  if (existing) {
    // Update content
    const r = await authedFetch(`https://www.googleapis.com/upload/drive/v3/files/${existing}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (!r.ok) {
      const text = await r.text();
      throw new Error('upsert update failed: ' + r.status + ' — ' + text);
    }
    return (await r.json()).id;
  } else {
    // Multipart upload (metadata + content)
    const meta = { name, parents: ['appDataFolder'] };
    const boundary = '-------gindarts' + Math.random().toString(36).slice(2);
    const multipart =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(meta) + `\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/json\r\n\r\n` +
      body + `\r\n` +
      `--${boundary}--`;
    const r = await authedFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: multipart,
    });
    if (!r.ok) {
      const text = await r.text();
      throw new Error('upsert create failed: ' + r.status + ' — ' + text);
    }
    return (await r.json()).id;
  }
}

// Delete a file by id. Tolerates 404 (already gone).
async function deleteFile(id) {
  if (!id) return;
  const r = await authedFetch(`https://www.googleapis.com/drive/v3/files/${id}`, { method: 'DELETE' });
  // 204 = ok, 404 = already gone
  if (r.status !== 204 && r.status !== 404) {
    const text = await r.text();
    throw new Error('delete failed: ' + r.status + ' — ' + text);
  }
}

// ----- Public sync API -----

// Push a competition (and all its matches + history) to Drive.
export async function pushCompetition(competition, matches = [], history = []) {
  if (!(await isSignedIn())) return;
  await upsertJsonFile(nameFor(DRIVE_FOLDER_COMPETITIONS, competition.id), {
    schema: DRIVE_SCHEMA_VERSION,
    savedAt: Date.now(),
    competition,
  });
  for (const m of matches) {
    await upsertJsonFile(nameFor(DRIVE_FOLDER_MATCHES, competition.id, m.id), {
      schema: DRIVE_SCHEMA_VERSION,
      savedAt: Date.now(),
      match: m,
    });
  }
  for (const h of history) {
    await upsertJsonFile(nameFor(DRIVE_FOLDER_HISTORY, competition.id, h.id), {
      schema: DRIVE_SCHEMA_VERSION,
      savedAt: Date.now(),
      history: h,
    });
  }
  await upsertJsonFile(DRIVE_MANIFEST_FILE, {
    schema: DRIVE_SCHEMA_VERSION,
    lastSyncAt: Date.now(),
  });
}

// Push a single match update.
export async function pushMatch(competitionId, match, history = []) {
  if (!(await isSignedIn())) return;
  await upsertJsonFile(nameFor(DRIVE_FOLDER_MATCHES, competitionId, match.id), {
    schema: DRIVE_SCHEMA_VERSION,
    savedAt: Date.now(),
    match,
  });
  for (const h of history) {
    await upsertJsonFile(nameFor(DRIVE_FOLDER_HISTORY, competitionId, match.id, h.id), {
      schema: DRIVE_SCHEMA_VERSION,
      savedAt: Date.now(),
      history: h,
    });
  }
}

// Pull everything from Drive into IndexedDB.
// Returns counts of { competitions, matches, histories }.
export async function pullAll() {
  if (!(await isSignedIn())) return { competitions: 0, matches: 0, histories: 0 };
  const counts = { competitions: 0, matches: 0, histories: 0 };

  // Competitions
  const compFiles = await listByPrefix(matchPrefix(DRIVE_FOLDER_COMPETITIONS));
  for (const f of compFiles) {
    const data = await downloadJsonFile(f.id);
    if (data?.competition) {
      await put('competitions', { ...data.competition, _fromDrive: true, _driveSavedAt: data.savedAt });
      counts.competitions++;
    }
  }

  // Matches
  const matchFiles = await listByPrefix(matchPrefix(DRIVE_FOLDER_MATCHES));
  for (const f of matchFiles) {
    const data = await downloadJsonFile(f.id);
    if (data?.match) {
      await put('matches', { ...data.match, _fromDrive: true, _driveSavedAt: data.savedAt });
      counts.matches++;
    }
  }

  // History
  const histFiles = await listByPrefix(matchPrefix(DRIVE_FOLDER_HISTORY));
  for (const f of histFiles) {
    const data = await downloadJsonFile(f.id);
    if (data?.history) {
      // History is a per-match dart log; IndexedDB `games` store is
      // the right home for it.
      const g = { ...data.history, _fromDrive: true, _driveSavedAt: data.savedAt };
      delete g.id;
      await put('games', g);
      counts.histories++;
    }
  }
  return counts;
}

// Delete a competition and all its matches from Drive.
export async function deleteCompetition(competitionId) {
  if (!(await isSignedIn())) return;
  // Delete the competition file itself
  const compId = await findByName(nameFor(DRIVE_FOLDER_COMPETITIONS, competitionId));
  if (compId) await deleteFile(compId);
  // Delete all match files for this competition
  const matchFiles = await listByPrefix(matchPrefix(DRIVE_FOLDER_MATCHES));
  for (const f of matchFiles) {
    const tail = extractAfterPrefix(f.name, DRIVE_FOLDER_MATCHES);
    if (!tail) continue;
    const [compIdStr, matchIdStr] = tail.split('__');
    if (String(competitionId) === compIdStr) await deleteFile(f.id);
  }
  // Delete all history files
  const histFiles = await listByPrefix(matchPrefix(DRIVE_FOLDER_HISTORY));
  for (const f of histFiles) {
    const tail = extractAfterPrefix(f.name, DRIVE_FOLDER_HISTORY);
    if (!tail) continue;
    const [compIdStr] = tail.split('__');
    if (String(competitionId) === compIdStr) await deleteFile(f.id);
  }
}

// ----- Dirty-queue retry -----
// Tracks writes that failed because the user was offline or token
// expired. Replays them on next sign-in or on next online tick.
const _dirty = new Set(); // keys like "comp:123" or "match:123:456"

export function markDirty(key) { _dirty.add(key); }
export function clearDirty(key) { _dirty.delete(key); }
export function dirtyKeys() { return [..._dirty]; }