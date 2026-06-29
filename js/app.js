// Boot the app: load the build VERSION (from the VERSION file at repo
// root) and expose it on window.APP_VERSION before mounting the UI so
// the footer can render it without an extra round-trip.
import { mountApp, updateHeader } from './ui/screens.js';
import { seedIfEmpty } from './db/index.js';
import { currentUser } from './auth/auth.js';
import { isSignedIn } from './auth/google.js';
import { initCursor } from './ui/cursor.js';
import { initUiHelp, pullUiHelpSettingsFromDrive, applyHelpIconsVisibility } from './ui/help.js';
import { initDebugOverlay } from './util/debug-overlay.js';

// Global error display. If a JS error escapes anywhere in the app
// (uncaught exception, unhandled rejection), render it visibly on
// the page so users on a "black screen" can report what went wrong
// instead of seeing nothing. The display is a fixed banner at the
// top of the page — non-intrusive, easy to dismiss.
function showFatalError(err) {
  console.error('FATAL', err);
  let banner = document.getElementById('__fatal_error__');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = '__fatal_error__';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#7a1a1a;color:#fff;padding:12px 16px;font:13px ui-monospace,monospace;white-space:pre-wrap;max-height:60vh;overflow:auto;box-shadow:0 4px 12px rgba(0,0,0,.5);';
    document.body.appendChild(banner);
  }
  const stack = err?.stack || String(err);
  // Truncate to keep the banner manageable.
  const msg = (err?.message || String(err) || 'Unknown error');
  const stackTrim = stack.length > 800 ? stack.substring(0, 800) + '\n…(truncated)' : stack;
  banner.textContent = '⚠ ' + msg + '\n' + stackTrim;
}
window.addEventListener('error', (e) => showFatalError(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => showFatalError(e.reason || e));

async function loadVersion() {
  try {
    const r = await fetch('./VERSION', { cache: 'no-cache' });
    if (r.ok) {
      const v = (await r.text()).trim();
      if (v) window.APP_VERSION = v;
    }
  } catch (_) { /* offline or missing — keep undefined, footer hides it */ }
  if (!window.APP_VERSION) window.APP_VERSION = '0.0.0.1'; // fallback for file:// or offline
}

(async () => {
  await loadVersion();
  try { await seedIfEmpty(); } catch (e) { console.warn('seed failed', e); }
  // Initialize the user's preferred cursor before mounting so the
  // first paint already has the chosen pointer.
  try { await initCursor(); } catch (e) { console.warn('cursor init failed', e); }
  try { await initUiHelp(); } catch (e) { console.warn('ui help init failed', e); }
  // Restore debug overlay preference (settings screen handles ON/OFF).
  try { initDebugOverlay(); } catch (e) { console.warn('debug overlay init failed', e); }
  // Best-effort: try to restore a Google session from stored refresh
  // token. If it works, isSignedIn() will return true and the
  // header will show the user as signed in without any interaction.
  try { await isSignedIn(); } catch (e) { console.warn('google restore failed', e); }
  const root = document.getElementById('app');
  const user = currentUser();
  try {
    mountApp(root, { user });
    // After the app shell renders, refresh the header so it reflects
    // the just-restored Google session (the user object passed to
    // mountApp is the LOCAL user, not the Google user). Also pull the
    // latest cursor settings from Drive in case another device changed them.
    if (typeof updateHeader === 'function') updateHeader();
    try {
      const { pullCursorSettingsFromDrive, applyCursor } = await import('./ui/cursor.js');
      const fromDrive = await pullCursorSettingsFromDrive();
      if (fromDrive) applyCursor(fromDrive);
    } catch (e) { console.warn('cursor Drive pull failed', e); }
    try {
      const fromDriveHelp = await pullUiHelpSettingsFromDrive();
      if (fromDriveHelp) applyHelpIconsVisibility(fromDriveHelp.show);
    } catch (e) { console.warn('ui help Drive pull failed', e); }
  } catch (e) {
    showFatalError(e);
  }
})();