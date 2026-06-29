// =================================================================
// UI help icon system.
//
// Provides small inline help icons next to labels. Clicking an icon
// opens a modal with the explanation. Users can toggle icon visibility
// in Settings; the default is visible.
//
// Settings are persisted in IndexedDB (`settings` store) under the
// `uiHelp` key and, when signed in, synced to Google Drive as
// `gins-darts/settings/ui.json` in appDataFolder.
// =================================================================

import { get, setSetting as _setSetting } from '../db/index.js';
import { showModal, el } from '../util/helpers.js';
import { authedFetch, isSignedIn } from '../auth/google.js';

const SETTINGS_KEY = 'uiHelp';
const DRIVE_FILE_NAME = 'gins-darts/settings/ui.json';

const DEFAULTS = { show: true };

function merge(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return { show: s.show !== false };
}

export async function loadUiHelpSettings() {
  const row = await get('settings', SETTINGS_KEY);
  return merge(row?.value);
}

export async function saveUiHelpSettings(settings) {
  const merged = merge(settings);
  await _setSetting(SETTINGS_KEY, merged);
  _cached = merged;
  return merged;
}

let _cached = null;

export async function isHelpEnabled() {
  if (_cached) return _cached.show;
  const s = await loadUiHelpSettings();
  _cached = s;
  return s.show;
}

export function updateCachedUiHelp(value) {
  _cached = merge(value);
}

export function applyHelpIconsVisibility(show) {
  document.querySelectorAll('.help-icon').forEach(icon => {
    icon.style.display = show ? 'inline-flex' : 'none';
  });
}

// Build a label element that includes an inline help icon.
export function labelWithHelp(text, topic, htmlOrText, helpVisible) {
  const label = el('label', {}, text);
  label.appendChild(helpIcon(topic, htmlOrText, helpVisible));
  return label;
}

// Build a small help-icon button. If `visible` is not provided, the
// current cached setting is used (or default visible).
export function helpIcon(topic, htmlOrText, visible) {
  const btn = el('button', {
    class: 'help-icon',
    type: 'button',
    title: `Help: ${topic}`,
    'aria-label': `Help: ${topic}`,
    onclick: () => {
      const body = el('div', { class: 'help-modal-body' });
      if (typeof htmlOrText === 'string') {
        body.appendChild(el('p', { style: 'margin-top:0' }, htmlOrText));
      } else {
        body.appendChild(htmlOrText);
      }
      showModal({ title: topic, body });
    },
  }, 'ⓘ');
  btn.style.display = visible !== false ? 'inline-flex' : 'none';
  return btn;
}

// ----- Google Drive sync -----

async function findDriveFile() {
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', `name = '${DRIVE_FILE_NAME}' and 'appDataFolder' in parents and trashed = false`);
  url.searchParams.set('fields', 'files(id,name,modifiedTime)');
  const r = await authedFetch(url);
  if (!r.ok) throw new Error('find UI settings failed: ' + r.status);
  const data = await r.json();
  return data.files?.[0] || null;
}

async function downloadDriveFile(id) {
  const r = await authedFetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('download UI settings failed: ' + r.status);
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
    if (!r.ok) throw new Error('upload UI settings failed: ' + r.status);
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
  if (!r.ok) throw new Error('create UI settings failed: ' + r.status);
  return (await r.json()).id;
}

export async function pushUiHelpSettingsToDrive() {
  if (!(await isSignedIn())) return null;
  const local = await loadUiHelpSettings();
  const existing = await findDriveFile();
  return await uploadDriveFile(DRIVE_FILE_NAME, local, existing?.id);
}

export async function pullUiHelpSettingsFromDrive() {
  if (!(await isSignedIn())) return null;
  const existing = await findDriveFile();
  if (!existing) return null;
  const data = await downloadDriveFile(existing.id);
  const settings = data?.settings && typeof data.settings === 'object' ? data.settings : {};
  const merged = merge(settings);
  await _setSetting(SETTINGS_KEY, merged);
  _cached = merged;
  return merged;
}

export async function initUiHelp() {
  let settings = await loadUiHelpSettings();
  try {
    const fromDrive = await pullUiHelpSettingsFromDrive();
    if (fromDrive) settings = fromDrive;
  } catch (e) {
    console.warn('UI help Drive pull failed', e);
  }
  _cached = settings;
  applyHelpIconsVisibility(settings.show);
  return settings;
}
