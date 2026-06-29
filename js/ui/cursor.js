// =================================================================
// Cursor settings module.
//
// Provides a responsive, user-customizable cursor:
//   - Styles: default, target, crosshair
//   - Sizes: auto (responsive), small, medium, large, xlarge
//
// Settings are persisted locally in IndexedDB (`settings` store) and,
// when the user is signed in to Google, synced to Drive as
// `gins-darts/settings/cursor.json` under appDataFolder.
//
// Inline-SVG styles (crosshair) are applied to `<body>` as encoded
// data URIs. External-file styles (target = dartboard.svg) are
// applied as plain url() references so we can use the full artwork
// from `assets/` without bloating the data URI.
// =================================================================

import { get, put, getSettings as _getSettings, setSetting as _setSetting } from '../db/index.js';
import { authedFetch, isSignedIn } from '../auth/google.js';

const SETTINGS_KEY = 'cursor';
const DRIVE_FILE_NAME = 'gins-darts/settings/cursor.json';

const DEFAULTS = {
  style: 'default', // 'default' | 'target' | 'crosshair'
  size: 'auto',     // 'auto' | 'small' | 'medium' | 'large' | 'xlarge'
};

// Inline SVG shapes. Coordinates assume a 32x32 viewBox; the art is
// scaled by the `width`/`height` attributes in the data URI.
const SVG = {
  crosshair: `<svg xmlns='http://www.w3.org/2000/svg' width='{{SIZE}}' height='{{SIZE}}' viewBox='0 0 32 32'><circle cx='16' cy='16' r='10' fill='none' stroke='#fff' stroke-width='2'/><circle cx='16' cy='16' r='3' fill='#ff4d6d'/><line x1='16' y1='2' x2='16' y2='12' stroke='#fff' stroke-width='2'/><line x1='16' y1='20' x2='16' y2='30' stroke='#fff' stroke-width='2'/><line x1='2' y1='16' x2='12' y2='16' stroke='#fff' stroke-width='2'/><line x1='20' y1='16' x2='30' y2='16' stroke='#fff' stroke-width='2'/></svg>`,
};

// External-file styles: URL the SVG file directly. The browser
// renders the full SVG at its intrinsic size and scales it down to
// the rendered cursor size. Path is relative to the app root.
const EXTERNAL = {
  target: './assets/dartboard.svg',
};

// Hotspot offsets per style + rendered size. Inline art is anchored
// near the visual tip (top-left area); the dartboard art is centered,
// so the hotspot is the center pixel — the bullseye is the click point.
function hotspotFor(style, size) {
  if (style === 'target') {
    return [Math.round(size / 2), Math.round(size / 2)];
  }
  return [Math.round(size * 0.06), Math.round(size * 0.06)];
}

// Compute rendered size in device pixels. "auto" uses the smaller of
// width/height, which feels right on landscape tablets and phones.
function resolveSize(sizeName) {
  if (sizeName === 'small') return 20;
  if (sizeName === 'medium') return 28;
  if (sizeName === 'large') return 40;
  if (sizeName === 'xlarge') return 56;
  // auto
  const min = Math.min(window.innerWidth, window.innerHeight);
  if (min < 360) return 24;
  if (min < 480) return 28;
  if (min < 720) return 32;
  if (min < 1080) return 40;
  return 48;
}

// Encode a cursor style as a CSS `cursor` value. Default = system
// cursor. External styles = url() to the file. Inline styles = data
// URI with size interpolation.
function encodeCursor(style, size) {
  if (style === 'default') return 'default';
  const [hx, hy] = hotspotFor(style, size);
  if (EXTERNAL[style]) {
    return `url("${EXTERNAL[style]}") ${hx} ${hy}, auto`;
  }
  const svg = SVG[style];
  if (!svg) return 'default';
  const sized = svg.replace('{{SIZE}}', String(size)).replace('{{SIZE}}', String(size));
  const encoded = encodeURIComponent(sized).replace(/'/g, "%27");
  return `url("data:image/svg+xml,${encoded}") ${hx} ${hy}, auto`;
}

let _currentValue = null;
let _resizeHandler = null;

export function applyCursor(settings = DEFAULTS) {
  const style = settings?.style ?? DEFAULTS.style;
  const sizeName = settings?.size ?? DEFAULTS.size;
  const size = resolveSize(sizeName);

  // Clean up previous resize listener if style/size changed.
  if (_resizeHandler) {
    window.removeEventListener('resize', _resizeHandler);
    _resizeHandler = null;
  }

  document.body.style.cursor = encodeCursor(style, size);
  _currentValue = { style, size: sizeName, rendered: size };

  // Recompute on resize only for auto, since fixed sizes don't change.
  if (sizeName === 'auto') {
    _resizeHandler = () => {
      const newSize = resolveSize('auto');
      document.body.style.cursor = encodeCursor(style, newSize);
      _currentValue.rendered = newSize;
    };
    window.addEventListener('resize', _resizeHandler);
  }
}

export function currentCursor() {
  return _currentValue ? { ..._currentValue } : null;
}

// ----- Persistence -----

function mergeWithDefaults(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    style: s.style ?? DEFAULTS.style,
    size: s.size ?? DEFAULTS.size,
  };
}

export async function loadCursorSettings() {
  const row = await get('settings', SETTINGS_KEY);
  return mergeWithDefaults(row?.value);
}

export async function saveCursorSettings(settings) {
  const merged = mergeWithDefaults(settings);
  await _setSetting(SETTINGS_KEY, merged);
  return merged;
}

// ----- Google Drive sync -----
// Stored as `gins-darts/settings/cursor.json` in appDataFolder.

async function findDriveFile() {
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', `name = '${DRIVE_FILE_NAME}' and 'appDataFolder' in parents and trashed = false`);
  url.searchParams.set('fields', 'files(id,name,modifiedTime)');
  const r = await authedFetch(url);
  if (!r.ok) throw new Error('find cursor settings failed: ' + r.status);
  const data = await r.json();
  return data.files?.[0] || null;
}

async function downloadDriveFile(id) {
  const r = await authedFetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('download cursor settings failed: ' + r.status);
  return r.json();
}

async function uploadDriveFile(name, data, existingId) {
  const body = JSON.stringify({ schema: 1, savedAt: Date.now(), settings: data });
  if (existingId) {
    const r = await authedFetch(`https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (!r.ok) throw new Error('upload cursor settings failed: ' + r.status);
    return (await r.json()).id;
  }
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
  if (!r.ok) throw new Error('create cursor settings failed: ' + r.status);
  return (await r.json()).id;
}

// Push current local settings to Drive.
export async function pushCursorSettingsToDrive() {
  if (!(await isSignedIn())) return null;
  const local = await loadCursorSettings();
  const existing = await findDriveFile();
  return await uploadDriveFile(DRIVE_FILE_NAME, local, existing?.id);
}

// Pull settings from Drive and save locally. Returns the merged
// settings or null if not signed in / no file on Drive.
export async function pullCursorSettingsFromDrive() {
  if (!(await isSignedIn())) return null;
  const existing = await findDriveFile();
  if (!existing) return null;
  const data = await downloadDriveFile(existing.id);
  const settings = data?.settings && typeof data.settings === 'object' ? data.settings : {};
  const merged = mergeWithDefaults(settings);
  await _setSetting(SETTINGS_KEY, merged);
  return merged;
}

// Convenience: load from local + best-effort pull from Drive, then apply.
export async function initCursor() {
  let settings = await loadCursorSettings();
  try {
    const fromDrive = await pullCursorSettingsFromDrive();
    if (fromDrive) settings = fromDrive;
  } catch (e) {
    console.warn('Cursor settings Drive pull failed', e);
  }
  applyCursor(settings);
  return settings;
}
