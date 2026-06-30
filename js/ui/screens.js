// =================================================================
// View layer. Renders menu / setup / game / online / login /
// competitions / admin screens. No framework.
// =================================================================

import { el, toast, copyToClipboard, formatDuration, showModal, closeModal, buttonRow, capButtonRow, toggleRow, x01GameOptionsControls } from '../util/helpers.js';
import { enableDebugOverlay, disableDebugOverlay, isDebugOverlayOn } from '../util/debug-overlay.js';
import { store, getStats, saveLastGame, recordGameResult, loadLastGame, getGameHistory } from '../util/store.js';
import { HostRoom, GuestRoom } from '../net/rtc.js';
import {
  new01, newCricket, newShanghai,
  throwDarts01, throwDartsCricket, throwDartsShanghai,
  submitTurnTotal01, submitTurnTotalShanghai, submitTurnCricketMarks,
  dartValue, dartLabel, MAX_DARTS_PER_TURN, MAX_TURN_TOTAL,
  checkoutSuggestions, CHECKOUT_170,
  X01_IN_OPTIONS, X01_OUT_OPTIONS,
  editRawDart,
} from '../game/engine.js';
import * as comp from '../competition/engine.js';
import { put, getAll, get } from '../db/index.js';
import * as auth from '../auth/auth.js';
import * as googleAuth from '../auth/google.js';
import * as driveSync from '../auth/sync.js';
import { attachGameToTournamentHost } from './competition.js';
import { initCursor, applyCursor, saveCursorSettings, pushCursorSettingsToDrive, loadCursorSettings } from './cursor.js';
import { isHelpEnabled, applyHelpIconsVisibility, saveUiHelpSettings, pushUiHelpSettingsToDrive, helpIcon } from './help.js';

// Derive the game scope from the router params. League/tournament
// matches pass competitionType and competitionName alongside
// competitionId + matchId, so we can stamp the game with the right
// scope at creation time. The stats screen uses gameHistory[].scope
// to filter — this is what links a finished game to its parent
// league / tournament / match.
function deriveScopeFromParams(params) {
  if (!params) return { type: 'standalone' };
  if (params.matchId != null && params.competitionId != null && params.competitionType) {
    return {
      type: params.competitionType,          // 'league' | 'tournament'
      id: String(params.competitionId),
      matchId: String(params.matchId),
      name: params.competitionName || String(params.competitionId),
    };
  }
  if (params.matchId != null) {
    return { type: 'match', id: String(params.matchId) };
  }
  return { type: 'standalone' };
}
import { renderCalculator } from './calculator.js';
import { computeStats, listPlayers, listScopes, fmt } from '../game/stats.js';

// Reusable field: presets + Other (free-form number) for a per-leg cap.
//   label:    field label, e.g. "Max darts per leg"
//   presets:  array of { value, label }. value can be 0 (no limit) or a number.
//   value:    current numeric value; if not in presets, the input is shown.
//   onChange: fn(newValue) — called when the value changes (preset or input).
//   extraLabel: optional 2nd line label (e.g. "Number of rounds").
function capField({ label, presets, value, onChange, numberInputLabel = 'Custom number' }) {
  const wrap = el('div', { class: 'field' });
  wrap.appendChild(el('label', {}, label));
  const matched = presets.find(p => p.value === value);
  const numberInput = el('input', {
    type: 'number', min: '0', step: '1', placeholder: 'e.g. 25',
    value: matched ? '' : String(value),
    style: matched ? 'display:none; margin-top:6px;' : 'margin-top:6px;',
    oninput: e => onChange(Math.max(0, +e.target.value || 0)),
  });
  const select = el('select', {
    onchange: e => {
      const v = e.target.value;
      if (v === 'custom') {
        numberInput.style.display = '';
        numberInput.focus();
        onChange(Math.max(0, +numberInput.value || 0));
      } else {
        numberInput.style.display = 'none';
        onChange(+v);
      }
    },
  }, ...presets.map(p => el('option', {
    value: String(p.value),
    selected: matched ? p.value === matched.value : p.value === 'custom',
  }, p.label)));
  wrap.appendChild(select);
  wrap.appendChild(el('label', {
    style: matched ? 'display:none' : 'display:block; font-size:11px; text-transform:none; letter-spacing:0; margin-top:2px; color: var(--muted)',
  }, numberInputLabel));
  wrap.appendChild(numberInput);
  return wrap;
}

const CAP_PRESETS = [
  { value: 0, label: 'No limit (standard play)' },
  { value: 20, label: '20 darts' },
  { value: 30, label: '30 darts' },
  { value: 50, label: '50 darts' },
  { value: 100, label: '100 darts' },
  { value: 'custom', label: 'Other…' },
];

const SHANGHAI_ROUND_PRESETS = [
  { value: 0, label: 'No limit (end manually)' },
  { value: 7, label: '7 rounds' },
  { value: 10, label: '10 rounds' },
  { value: 20, label: '20 rounds' },
  { value: 'custom', label: 'Other…' },
];
import {
  renderLogin, renderCompetitions, renderCompNew,
  renderBracket, renderLeague, renderAdmin,
  renderSingleMatch, renderTeamGame,
} from './competition.js';

let _ctx = { user: null };
// Module-level handle to the active router so updateHeader() and
// handleGoogleSignIn() can navigate without being explicitly
// passed router every time. Set in mountApp() before go('menu').
let _router = null;

/**
 * Shared Google sign-in handler. Used by:
 *   - Header sign-in icon (updateHeader)
 *   - Settings screen "Sign in with Google" button
 *   - Competitions "+ New competition" gate modal
 *
 * All three call sites previously duplicated the same try/catch
 * around googleAuth.signIn() with bespoke toasts. This keeps
 * them in sync.
 *
 * @param {object} router - The router object from mountApp().
 * @param {string} nextScreen - The screen name to navigate to after
 *   successful sign-in. Default: 'menu'.
 * @returns {Promise<boolean>} true on success, false on failure.
 */
export async function handleGoogleSignIn(router, nextScreen = 'menu') {
  const r = router || _router;
  try {
    await googleAuth.signIn();
    toast('Signed in');
    if (typeof updateHeader === 'function') updateHeader();
    if (r && typeof r.go === 'function') r.go(nextScreen);
    return true;
  } catch (e) {
    if (/not configured/i.test(e.message)) {
      toast('Google sign-in not set up. Open Settings to configure.');
      if (r && typeof r.go === 'function') r.go('settings');
    } else if (/popup|blocked|closed/i.test(e.message)) {
      toast('Sign-in popup was closed or blocked. Try again and allow popups for this site.', { kind: 'error' });
    } else {
      toast('Sign in failed: ' + e.message, { kind: 'error' });
    }
    return false;
  }
}

export function mountApp(rootEl, ctx = {}) {
  _ctx = ctx;
  _router = null; // reset before re-creating
  rootEl.innerHTML = '';
  rootEl.appendChild(renderHeader());
  const main = el('main');
  rootEl.appendChild(main);
  rootEl.appendChild(renderFooter());

  const router = {
    get user() { return _ctx.user; },
    set user(v) { _ctx.user = v; updateHeader(); },
    go, main,
  };
  _router = router;

  // Listen for cross-screen events
  window.addEventListener('gindarts:open-match', async (e) => {
    const matchId = e.detail;
    const m = await get('matches', Number(matchId));
    if (!m) return;
    const c = await get('competitions', m.competitionId);
    if (!c) return;
    const userMap = await auth.listUsers();
    const nameOf = (id) => (userMap.find(u => u.id === id)?.displayName) || '?';
    router.go('game', {
      matchMode: true, competitionId: c.id, matchId: m.id,
      mode: c.gameMode, opts: c.gameOpts,
      names: [nameOf(m.p1), nameOf(m.p2)],
      legsToWin: m.legsToWin,
      setsToWin: m.setsToWin || c.setsToWin || c.gameOpts?.setsToWin || 1,
    });
  });

  go('menu');
  return router;

  function go(name, params = {}) {
    main.innerHTML = '';
    let screen;
    const runner = async () => {
      if (name === 'login') screen = renderLogin(router);
      else if (name === 'google-setup') screen = renderGoogleSetup(router);
      else if (name === 'settings') screen = renderSettings(router);
      else if (name === 'menu') screen = renderMenu(router);
      else if (name === 'setup') screen = renderSetup(router, params);
      else if (name === 'game') screen = renderGame(router, params);
      else if (name === 'online') screen = renderOnline(router);
      else if (name === 'join-tournament') screen = renderJoinTournament(router);
      else if (name === 'stats') screen = await renderStatsScreen(router);
      else if (name === 'competitions') screen = await renderCompetitions(router);
      else if (name === 'comp-new') screen = renderCompNew(router, params);
      else if (name === 'bracket-view') screen = await renderBracket(router, params);
      else if (name === 'league-view') screen = await renderLeague(router, params);
      else if (name === 'single-view') screen = await renderSingleMatch(router, params);
      else if (name === 'team-view') screen = await renderTeamGame(router, params);
      else if (name === 'admin') screen = await renderAdmin(router);
      // Fallback: unknown route → go home rather than crash.
      if (!screen) screen = renderMenu(router);
      // Await if a render function returned a Promise (forgot to await).
      if (screen && typeof screen.then === 'function') {
        try { screen = await screen; }
        catch (e) { showFatalError(e); screen = renderMenu(router); }
      }
      main.appendChild(screen);
      window.scrollTo({ top: 0 });
    };
    runner();
  }
}

/* ----- Header / Footer ----- */
function renderHeader() {
  const sub = el('span', { class: 'sub' }, 'Online Dart Scoring');
  const h1 = el('h1', {}, el('span', { class: 'logo' }), "Gin's Dart's", sub);
  const right = el('div', { class: 'row-flex' });
  const wrap = el('header', { class: 'app-header' }, h1, right);
  wrap._rightSlot = right;
  updateHeader.call(wrap);
  return wrap;
}
function updateHeader() {
  const w = document.querySelector('header.app-header');
  if (!w) return;
  const right = w.querySelector('.row-flex') || w.lastChild;
  right.innerHTML = '';
  const u = _ctx.user;
  // Google sign-in also counts as "logged in" — its user lives in
  // googleAuth.currentUser(), not in _ctx.user. Show the logout icon
  // for either path so the user always has a way to sign out from the
  // top of the page.
  const gUser = (() => { try { return googleAuth.currentUser(); } catch (_) { return null; } })();
  const isAuthed = !!(u || gUser);
  if (isAuthed) {
    const label = u ? u.displayName : (gUser?.email || 'Signed in');
    right.appendChild(el('span', { class: 'small muted' }, `Hi, ${label}`));
    if (u && auth.isAdmin(u)) {
      right.appendChild(el('button', { class: 'icon-btn', title: 'Admin', onclick: () => location.hash = '#admin' }, '⚙'));
    }
  }

  // Cursor settings icon: opens a quick settings modal. Placed to the
  // right of sign-out, styled like the inactive auth icons.
  const cursorSettingsBtn = el('button', {
    class: 'icon-btn auth-btn settings-btn',
    title: 'Cursor settings',
    'aria-label': 'Cursor settings',
    onclick: () => openCursorSettings(),
  });
  cursorSettingsBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1a9 9 0 0 0-1.46.13l-.86.14-.4 2.37c-.55.13-1.08.33-1.58.57l-1.9-1.35-1.58 1.58 1.35 1.9a7.1 7.1 0 0 0-.57 1.58l-2.37.4-.14.86A9 9 0 0 0 1 12a9 9 0 0 0 .13 1.46l.14.86 2.37.4c.13.55.33 1.08.57 1.58l-1.35 1.9 1.58 1.58 1.9-1.35c.5.24 1.03.44 1.58.57l.4 2.37.86.14A9 9 0 0 0 12 23a9 9 0 0 0 1.46-.13l.86-.14.4-2.37c.55-.13 1.08-.33 1.58-.57l1.9 1.35 1.58-1.58-1.35-1.9a7.1 7.1 0 0 0 .57-1.58l2.37-.4.14-.86A9 9 0 0 0 23 12a9 9 0 0 0-.13-1.46l-.14-.86-2.37-.4a7.1 7.1 0 0 0-.57-1.58l1.35-1.9-1.58-1.58-1.9 1.35a7.1 7.1 0 0 0-1.58-.57l-.4-2.37-.86-.14A9 9 0 0 0 12 1Zm0 6a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z"/></svg>';

  // Sign-out icon: red when signed-in (clickable), grey when not.
  // Font Awesome Classic Solid "arrow-right-from-bracket" (CC BY 4.0).
  // https://fontawesome.com/icons/arrow-right-from-bracket
  const signOutBtn = el('button', {
    class: 'icon-btn auth-btn sign-out' + (isAuthed ? '' : ' disabled'),
    title: isAuthed ? 'Sign out' : 'Not signed in',
    'aria-label': 'Sign out',
    onclick: async () => {
      if (!isAuthed) return;
      try { if (gUser) await googleAuth.signOut(); } catch (_) {}
      try { auth.logout(); } catch (_) {}
      _ctx.user = null;
      try { location.hash = ''; } catch (_) {}
      if (typeof updateHeader === 'function') updateHeader();
    },
  });
  signOutBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" aria-hidden="true"><path d="M502.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-128-128c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L402.7 224 192 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l210.7 0-73.4 73.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l128-128zM160 96c17.7 0 32-14.3 32-32s-14.3-32-32-32L96 32C43 32 0 75 0 128L0 384c0 53 43 96 96 96l64 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-64 0c-17.7 0-32-14.3-32-32l0-256c0-17.7 14.3-32 32-32l64 0z"/></svg>';
  if (!isAuthed) signOutBtn.disabled = true;
  // Sign-in icon: green when not signed-in (clickable), grey when signed-in.
  // Font Awesome Classic Solid "arrow-right-to-bracket" (CC BY 4.0).
  // https://fontawesome.com/icons/arrow-right-to-bracket
  const signInBtn = el('button', {
    class: 'icon-btn auth-btn sign-in' + (isAuthed ? ' disabled' : ''),
    title: isAuthed ? 'Already signed in' : 'Sign in with Google',
    'aria-label': 'Sign in',
    onclick: () => {
      if (isAuthed) return;
      // Trigger Google OAuth directly. router is in the module-level
      // _router (set by mountApp), so we don't need to pass it.
      handleGoogleSignIn(null, 'menu');
    },
  });
  signInBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" aria-hidden="true"><path d="M352 96l64 0c17.7 0 32 14.3 32 32l0 256c0 17.7-14.3 32-32 32l-64 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l64 0c53 0 96-43 96-96l0-256c0-53-43-96-96-96l-64 0c-17.7 0-32 14.3-32 32s14.3 32 32 32zm-9.4 182.6c12.5-12.5 12.5-32.8 0-45.3l-128-128c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L242.7 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l210.7 0-73.4 73.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l128-128z"/></svg>';
  if (isAuthed) signInBtn.disabled = true;
  // Layout: sign-in on the LEFT, sign-out in the MIDDLE, settings on the RIGHT.
  right.appendChild(signInBtn);
  right.appendChild(signOutBtn);
  right.appendChild(cursorSettingsBtn);
}

// Exported so app.js (and the boot path) can call it after restoring
// the Google session from IndexedDB. Without this, the header stays
// empty on first paint.
export { updateHeader };

// Quick cursor settings modal opened from the header gear icon.
async function openCursorSettings() {
  let current = await loadCursorSettings();

  const body = el('div', { class: 'cursor-settings-body' });
  body.appendChild(el('p', { class: 'small muted', style: 'margin-top:0;' },
    'Choose a pointer style and size. Settings are saved locally and synced to Google Drive when signed in.'));
  // Style: Default / Target / Crosshair
  const styleRow = buttonRow('Style', [
    { value: 'default', label: 'Default' },
    { value: 'target', label: 'Target' },
    { value: 'crosshair', label: 'Crosshair' },
  ], async (v) => {
    current.style = v;
    current = await saveCursorSettings(current);
    applyCursor(current);
    if (googleAuth.isSignedIn()) {
      try { await pushCursorSettingsToDrive(); } catch (e) { console.warn('cursor push failed', e); }
    }
  }, current.style).wrap;

  const sizeRow = buttonRow('Size', [
    { value: 'auto', label: 'Auto' },
    { value: 'small', label: 'Small' },
    { value: 'medium', label: 'Medium' },
    { value: 'large', label: 'Large' },
    { value: 'xlarge', label: 'XL' },
  ], async (v) => {
    current.size = v;
    current = await saveCursorSettings(current);
    applyCursor(current);
    if (googleAuth.isSignedIn()) {
      try { await pushCursorSettingsToDrive(); } catch (e) { console.warn('cursor push failed', e); }
    }
  }, current.size).wrap;

  body.appendChild(styleRow);
  body.appendChild(sizeRow);

  // UI help toggle inside the same settings modal.
  let uiHelp = await isHelpEnabled();
  const helpRow = buttonRow('Help icons', [
    { value: 'on', label: 'Show' },
    { value: 'off', label: 'Hide' },
  ], async (v) => {
    uiHelp = v === 'on';
    await saveUiHelpSettings({ show: uiHelp });
    applyHelpIconsVisibility(uiHelp);
    if (googleAuth.isSignedIn()) {
      try { await pushUiHelpSettingsToDrive(); } catch (e) { console.warn('ui help push failed', e); }
    }
  }, uiHelp ? 'on' : 'off').wrap;
  body.appendChild(helpRow);

  const preview = el('div', {
    class: 'cursor-preview',
    style: 'margin-top:16px; padding:16px; border-radius:12px; background:var(--bg-2); border:1px solid var(--line); min-height:80px; display:flex; align-items:center; justify-content:center;',
  }, el('span', { class: 'small muted' }, 'Move here to preview'));
  body.appendChild(preview);

  showModal({
    title: 'Cursor settings',
    body,
    actions: [{ label: 'Close' }],
  });
}

function renderFooter() {
  const ver = (typeof window !== 'undefined' && window.APP_VERSION) || '';
  const verEl = ver ? el('span', { class: 'version', title: 'App version' }, 'v' + ver) : null;
  return el('footer', { class: 'app-footer' },
    'No signup required',
    verEl ? ' · ' : null,
    verEl,
  );
}

/* ----- Google sign-in setup ----- */
function renderGoogleSetup(router) {
  const screen = el('section', { class: 'screen active' });
  screen.appendChild(el('h2', {}, 'Set up Google sign-in'));
  screen.appendChild(el('p', { class: 'muted' },
    'To sign in with Google, you need a Google OAuth Client ID. Register the app once at '));

  const linkPara = el('p', { class: 'small' });
  linkPara.append(
    el('a', { href: 'https://console.cloud.google.com/', target: '_blank', rel: 'noopener' },
      'console.cloud.google.com'),
    '. Then:'
  );
  screen.appendChild(linkPara);

  screen.appendChild(el('p', { class: 'small', style: 'margin-top: 8px;' },
    '1. Create or pick a project.'));
  screen.appendChild(el('p', { class: 'small' },
    '2. Enable Google Drive API (APIs & Services → Library → search "Google Drive API" → Enable).'));
  screen.appendChild(el('p', { class: 'small' },
    '3. Configure OAuth consent screen (External, add yourself as test user, scope: drive.file).'));
  screen.appendChild(el('p', { class: 'small' },
    '4. Create OAuth client ID (Web application, JS origin: https://zdenkor.github.io).'));
  screen.appendChild(el('p', { class: 'small' },
    '5. Paste the xxx.apps.googleusercontent.com string below.'));

  screen.appendChild(el('p', { class: 'small muted', style: 'margin-top: 12px;' },
    'The Client ID is stored only in this browser\'s localStorage. It is not sent anywhere except to Google\'s OAuth servers when you sign in.'));

  const currentId = googleAuth.getClientId();
  const input = el('input', { type: 'text',
    value: currentId || '',
    placeholder: 'xxx.apps.googleusercontent.com',
    style: 'width:100%; padding:10px 12px; border-radius:10px; background:var(--bg-2); border:1px solid var(--line); color:var(--text); margin: 12px 0; font-family: ui-monospace, monospace; font-size: 13px;' });

  const status = el('p', { class: 'small muted', style: 'margin-top: 8px;' });
  if (currentId) {
    status.append(`Current: ${currentId.substring(0, 12)}...`);
  } else {
    status.append('No Client ID set yet.');
  }

  const saveBtn = el('button', { class: 'btn primary block' }, 'Save and test');
  saveBtn.addEventListener('click', async () => {
    const id = (input.value || '').trim();
    if (!id || !id.includes('.apps.googleusercontent.com')) {
      toast('Paste a valid Client ID (it ends with .apps.googleusercontent.com)');
      return;
    }
    googleAuth.setClientId(id);
    toast('Saved. Testing…');
    saveBtn.disabled = true;
    try {
      await googleAuth.signIn();
      toast('Signed in!');
      router.go('menu');
    } catch (e) {
      toast('Could not sign in: ' + e.message);
      saveBtn.disabled = false;
    }
  });

  const clearBtn = el('button', { class: 'btn ghost small block', style: 'margin-top: 8px;' }, 'Clear saved Client ID');
  clearBtn.addEventListener('click', () => {
    googleAuth.clearClientId();
    input.value = '';
    status.innerHTML = '';
    status.append('No Client ID set yet.');
    toast('Cleared');
  });

  screen.appendChild(input);
  screen.appendChild(status);
  screen.appendChild(saveBtn);
  screen.appendChild(clearBtn);
  screen.appendChild(el('button', { class: 'btn ghost block', style: 'margin-top: 16px;',
    onclick: () => router.go('menu') }, '← Back'));
  return screen;
}

/* ----- Settings ----- */
function renderSettings(router) {
  const screen = el('section', { class: 'screen active settings' });
  screen.appendChild(el('h2', {}, 'Settings'));
  screen.appendChild(el('p', { class: 'muted', style: 'margin-top: -8px; margin-bottom: 16px;' },
    'App preferences, sign-in, and about info.'));

  // ---- Google sign-in section (always shown) ----
  // Everyone can see this — it's the only place to sign in.
  // Admin tools (Client ID setup) are visible only to superadmin.
  const me = googleAuth.currentUser();
  const isAdmin = googleAuth.isSuperadmin();
  const section = el('div', { class: 'card', style: 'margin-bottom: 16px;' });
  section.appendChild(el('h3', {}, 'Google sign-in'));
  if (me) {
    section.appendChild(el('p', { class: 'small' },
      'Signed in as ', el('strong', {}, me.email)));
    const signOutBtn = el('button', { class: 'btn ghost small block', style: 'margin-top: 8px;' }, 'Sign out');
    signOutBtn.addEventListener('click', async () => {
      await googleAuth.signOut();
      toast('Signed out');
      // Refresh the header so the logout icon disappears immediately
      // (it lives in the app shell, not the screen).
      if (typeof updateHeader === 'function') updateHeader();
      router.go('settings');
    });
    section.appendChild(signOutBtn);
  } else {
    section.appendChild(el('p', { class: 'small' }, 'Not signed in.'));
    const signInBtn = el('button', { class: 'btn primary small block' }, 'Sign in with Google');
    signInBtn.addEventListener('click', () => {
      handleGoogleSignIn(router, 'settings');
    });
    section.appendChild(signInBtn);
  }
  // Client ID setup — visible only to superadmin
  if (isAdmin) {
    const currentId = googleAuth.getClientId();
    const setupBtn = el('button', { class: 'btn ghost small block', style: 'margin-top: 12px;' },
      currentId ? 'Change Google sign-in setup' : 'Set up Google sign-in');
    setupBtn.addEventListener('click', () => router.go('google-setup'));
    section.appendChild(setupBtn);
    if (currentId) {
      const clearBtn = el('button', { class: 'btn ghost small block', style: 'margin-top: 4px; color: var(--mut);' },
        'Clear saved Client ID');
      clearBtn.addEventListener('click', () => {
        googleAuth.clearClientId();
        toast('Cleared');
        router.go('settings');
      });
      section.appendChild(clearBtn);
    }
  }
  screen.appendChild(section);

  // ---- SVK license list import section ----
  // Admin pastes the SVK portal table once; we cache it locally so
  // player picker lookups work offline + no CORS.
  (async () => {
    const { parseSVKListText, importSVKList, getSVKCacheStats, clearSVKCache, SVK_PORTAL_BASE, SVK_SEARCH_PATH } =
      await import('../auth/svk.js');
    const svkSection = el('div', { class: 'card', style: 'margin-bottom: 16px;' });
    svkSection.appendChild(el('h3', {}, 'SVK license list'));
    const stats = await getSVKCacheStats();
    svkSection.appendChild(el('p', { class: 'small' },
      stats.populated
        ? `Cache: ${stats.count} player${stats.count === 1 ? '' : 's'} imported.`
        : 'No SVK list imported yet. Paste the list from the SVK portal below.'));
    const importBtn = el('button', { class: 'btn primary small block', style: 'margin-top: 8px;' },
      stats.populated ? 'Re-import / refresh SVK list' : 'Import SVK license list');
    importBtn.addEventListener('click', () => {
      const body = el('div');
      body.appendChild(el('p', { class: 'small' },
        `Open ${SVK_PORTAL_BASE}${SVK_SEARCH_PATH} in a new tab, select the rows you want, copy, and paste here.`));
      const ta = el('textarea', { class: 'input', rows: 10,
        placeholder: 'Paste SVK portal rows here…\n\nExample:\nSVK ID\tSetDarts ID\tPriezvisko Meno\tMesto\tMaterský Klub\nSVK003107\t06814\tObonya Adam\tČaradice\tDarts Club Topoľčianky' });
      body.appendChild(ta);
      showModal({
        title: 'Import SVK license list',
        body,
        actions: [
          { label: 'Cancel', onclick: () => document.querySelector('.modal-backdrop')?.remove() },
          {
            label: 'Import',
            primary: true,
            onclick: async () => {
              try {
                const rows = parseSVKListText(ta.value);
                if (rows.length === 0) {
                  toast('No valid SVK rows found. Check the format.', { kind: 'error' });
                  return;
                }
                const { imported, total } = await importSVKList(rows);
                toast(`Imported ${imported} players (cache total: ${total})`);
                document.querySelector('.modal-backdrop')?.remove();
                router.go('settings');
              } catch (e) {
                toast('Import failed: ' + (e.message || String(e)), { kind: 'error' });
              }
            },
          },
        ],
      });
    });
    svkSection.appendChild(importBtn);
    if (stats.populated) {
      const clearBtn = el('button', { class: 'btn ghost small block', style: 'margin-top: 4px; color: var(--mut);' },
        'Clear SVK cache');
      clearBtn.addEventListener('click', async () => {
        if (!confirm('Clear all SVK cache entries? Players already saved to your `players` store are unaffected.')) return;
        await clearSVKCache();
        toast('SVK cache cleared');
        router.go('settings');
      });
      svkSection.appendChild(clearBtn);
    }
    screen.appendChild(svkSection);
  })();

  // ---- Debug section (developer aid) ----
  const debug = el('div', { class: 'card' });
  debug.appendChild(el('h3', {}, 'Debug'));
  debug.appendChild(el('p', { class: 'small muted' },
    'Hover the page with the cursor to see each element\u2019s tag, class, and computed size \u2014 handy when figuring out which CSS selector to change.'));
  // Use the standard toggleRow (segmented On/Off buttons) for
  // consistency with the rest of the app and a touch-friendly target.
  const overlayRow = toggleRow(
    'Show element labels on hover',
    [{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }],
    isDebugOverlayOn() ? 'on' : null,
    (selected) => {
      if (selected === 'on') enableDebugOverlay();
      else disableDebugOverlay();
    }
  );
  debug.appendChild(overlayRow.wrap);
  screen.appendChild(debug);

  // ---- About section ----
  const about = el('div', { class: 'card' });
  about.appendChild(el('h3', {}, 'About'));
  const v = window.APP_VERSION || '0.0.0.1';
  about.appendChild(el('p', { class: 'small' },
    'Version ', el('strong', {}, v)));
  about.appendChild(el('p', { class: 'small muted' },
    'Serverless, decentralized dart scoring. WebRTC between devices, local IndexedDB for data, optional Google Drive sync.'));
  about.appendChild(el('p', { class: 'small' },
    el('a', { href: 'https://github.com/zdenkor/gins-online-darts-scoring', target: '_blank', rel: 'noopener' },
      'Source code on GitHub')));
  screen.appendChild(about);

  // ---- Back button ----
  const back = el('button', { class: 'btn ghost block', style: 'margin-top: 16px;',
    onclick: () => router.go('menu') }, '← Back');
  screen.appendChild(back);

  return screen;
}

/* ----- Menu ----- */
function renderMenu(router) {
  const screen = el('section', { class: 'screen active menu' });
  screen.appendChild(el('h2', {}, _ctx.user ? `Welcome, ${_ctx.user.displayName}` : 'Pick a game'));
  screen.appendChild(el('p', { class: 'lede' }, 'Pass the device around locally, or open an online room and play with friends anywhere.'));

  // If there's a saved unfinished game, surface a Resume tile at the
  // top. Auto-saved on every turn by saveLastGame() in store.js.
  const saved = loadLastGame();
  if (saved && saved.winner == null && (saved.rawDarts || []).length > 0) {
    const summary = describeSaved(saved);
    screen.appendChild(el('div', { class: 'resume-banner', onclick: () => router.go('game', { resume: true }) },
      el('div', { class: 'resume-text' },
        el('strong', {}, '▶ Resume previous game'),
        el('div', { class: 'muted' }, summary),
      ),
      el('button', { class: 'btn ghost', onclick: e => { e.stopPropagation(); store.remove('lastGame'); router.go('menu'); } }, 'Discard'),
    ));
  }

  const grid = el('div', { class: 'menu-grid' });
  grid.appendChild(tile('x01 Games', 'Classic', '301, 401, 501, 701 or 1001 with optional Double-Out.', () => router.go('setup', { mode: 'x01' })));
  grid.appendChild(tile('Cricket', 'Strategy', 'Close 15–20 and the bull. Score points on closed numbers.', () => router.go('setup', { mode: 'cricket' })));
  grid.appendChild(tile('Shanghai', 'Quick', 'Hit numbers 1–7 in order. Doubles/triples count.', () => router.go('setup', { mode: 'shanghai' })));
  grid.appendChild(tile('Competitions', 'Multi', 'Tournaments (bracket), leagues (round-robin), single matches.', () => router.go('competitions')));
  grid.appendChild(tile('Join tournament', 'Player', 'Join a competition hosted on another device. Paste the host\'s code.', () => router.go('join-tournament')));
  grid.appendChild(tile('Online Room', 'WebRTC', 'Serverless. Share a QR; opponent scans to join.', () => router.go('online')));
  grid.appendChild(tile('Stats', 'Lifetime', 'Per-game wins and best scores, stored on this device.', () => router.go('stats')));
  // Settings tile. Always available — sign-in is optional.
  grid.appendChild(tile('Settings', 'Admin',
    'Sign in with Google, view app info, manage saved Client ID.',
    () => router.go('settings')));
  screen.appendChild(grid);
  return screen;
}

function tile(title, badge, body, onclick) {
  return el('div', { class: 'tile', onclick, role: 'button', tabindex: '0' },
    el('span', { class: 'badge' }, badge),
    el('h3', {}, title),
    el('p', {}, body),
  );
}

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

// Human-readable summary of a saved game for the Resume banner.
function describeSaved(g) {
  const mode = cap(g.type || 'x01');
  const scores = (g.players || []).map(p => `${p.name} ${p.score}`).join(' · ');
  const dartCount = (g.rawDarts || []).length;
  return `${mode} — ${scores} (${dartCount} turn${dartCount === 1 ? '' : 's'} played)`;
}

/* ----- Setup screen (unchanged shape, simpler) ----- */
function labelWithHelp(text, topic, htmlOrText, helpVisible) {
  const label = el('label', {}, text);
  label.appendChild(helpIcon(topic, htmlOrText, helpVisible));
  return label;
}

function renderSetup(router, { mode }) {
  const screen = el('section', { class: 'screen active' });
  screen.appendChild(el('h2', {}, 'Game setup'));
  screen.appendChild(el('p', { class: 'muted' }, `Mode: ${cap(mode)}`));

  // If user is signed in, default names are from their roster; else prompt
  (async () => {
    const helpVisible = await isHelpEnabled();
    let names;
    if (_ctx.user) {
      const all = await auth.listUsers();
      names = [_ctx.user.displayName];
      all.forEach(u => { if (u.id !== _ctx.user.id && names.length < 4) names.push(u.displayName); });
    } else {
      names = store.get('lastPlayers', ['Gin', 'Alex']);
    }
    const state = {
      players: [...names], mode,
      // X01 options
      start: 501, in: null, out: null,
      legsToWin: 1, setsToWin: 1,
      legsMode: 'best', setsMode: 'best',
      maxDartsPerLeg: 0, showCheckout: true,
      // Cricket
      cutThroat: false,
      // Shanghai
      n: 7,
      };

    const playerList = el('div');
    function redrawPlayers() {
      playerList.innerHTML = '';
      state.players.forEach((name, i) => {
        const idx = i; // capture for closure — otherwise `i` is shared
        // across all ✕ handlers and clicking one of them
        // always removes the last row, not the clicked one.
        const row = el('div', { class: 'player-row' });
        const input = el('input', { type: 'text', value: name, placeholder: `Player ${idx + 1}`, oninput: e => { state.players[idx] = e.target.value; }});
        const x = el('button', { class: 'x', title: 'Remove', onclick: () => { if (state.players.length <= 1) return; state.players.splice(idx, 1); redrawPlayers(); } }, '✕');
      row.appendChild(input); row.appendChild(x); playerList.appendChild(row);
      });
    }
    redrawPlayers();

    const addBtn = el('button', { class: 'btn ghost block', onclick: () => { if (state.players.length >= 8) { toast('Max 8 players'); return; } state.players.push(`Player ${state.players.length + 1}`); redrawPlayers(); } }, '+ Add player');

    let optsCard = el('div');
    function refreshOpts() {
      optsCard.innerHTML = '';
      if (mode === 'x01') {
        // Build the shared x01 controls (start, in/out, sets+mode,
        // legs+mode, max darts, checkout hints). The helper returns
        // row wraps so the caller decides the order. We use the
        // same order as before to keep the on-screen layout
        // identical for existing users.
        const x01Rows = x01GameOptionsControls({
          state, helpVisible, X01_IN_OPTIONS, X01_OUT_OPTIONS, labelWithHelp,
        });
        optsCard.appendChild(x01Rows.startRow.wrap);
        optsCard.appendChild(x01Rows.inRow.wrap);
        optsCard.appendChild(x01Rows.outRow.wrap);
        optsCard.appendChild(x01Rows.setsModeRow.wrap);
        optsCard.appendChild(x01Rows.sets.wrap);
        optsCard.appendChild(x01Rows.legsModeRow.wrap);
        optsCard.appendChild(x01Rows.legs.wrap);
        optsCard.appendChild(x01Rows.capRow.wrap);
        optsCard.appendChild(x01Rows.checkoutRow.wrap);
      } else if (mode === 'cricket') {
        const f = el('div', { class: 'field' });
        const cb = el('input', { type: 'checkbox', id: 'ct', onchange: e => state.cutThroat = e.target.checked });
        f.appendChild(cb);
        const ctLabel = el('label', { for: 'ct', style: 'display:inline; margin-left:6px; text-transform:none; letter-spacing:0;' }, 'Cut-throat (give points to opponents)');
        ctLabel.appendChild(helpIcon('Cut-throat Cricket', 'In cut-throat mode, points you score on a closed number are given to opponents who have not closed it yet. Last player with the lowest score wins.', helpVisible));
        f.appendChild(ctLabel);
        optsCard.appendChild(f);
      } else if (mode === 'shanghai') {
        const roundsRow = buttonRow(
          labelWithHelp('Number of rounds', 'Shanghai rounds',
            'How many numbers are played in order (1, 2, 3…). A "Shanghai" is hitting single, double and triple of the same number in one turn.',
            helpVisible),
          [5, 7, 9, 12, 20].map(n => ({ value: String(n), label: String(n) })),
          v => { state.n = +v; },
          String(state.n ?? 7));
        optsCard.appendChild(roundsRow.wrap);
      }
    }
    refreshOpts();

    const startBtn = el('button', { class: 'btn primary big block', onclick: () => {
      const names = state.players.map(s => (s || '').trim()).filter(Boolean);
      if (names.length < 1) { toast('Add at least one player'); return; }
      store.set('lastPlayers', names);
      router.go('game', {
              mode, opts: modeOpts(state), names,
              legsToWin: state.legsToWin,
              setsToWin: state.setsToWin,
              maxDartsPerLeg: state.maxDartsPerLeg,
              showCheckout: state.showCheckout,
      });
    } }, 'Start game');

    const back = el('button', { class: 'btn ghost', onclick: () => router.go('menu') }, '← Back');

    screen.appendChild(el('div', { class: 'card' },
      labelWithHelp('Players', 'Players', 'Enter the names of everyone playing. Tap + Add player for up to 8 players. You can tap ✕ to remove a player.', helpVisible),
      playerList, addBtn));
    screen.appendChild(el('div', { class: 'card' }, el('h3', { style: 'margin:0 0 8px' }, 'Options'), optsCard));
    screen.appendChild(startBtn);
    screen.appendChild(el('div', { style: 'height:10px' }));
    screen.appendChild(back);
  })();

  return screen;
}

function modeOpts(s) {
  if (s.mode === 'x01') return {
    start: s.start ?? 501,
    in: s.in || 'single',
    out: s.out || 'single',
    legsToWin: s.legsToWin ?? 1,
    setsToWin: s.setsToWin ?? 1,
    maxDarts: s.maxDartsPerLeg ?? 3,
    };
  if (s.mode === 'cricket') return { cutThroat: !!s.cutThroat };
  if (s.mode === 'shanghai') return { n: s.n ?? 7 };
  return {};
}

/* ----- Per-dart X01 entry grid (required for DI/TI/TO/MO variants) ----- */
function formatDart(d) {
  if (!d) return '';
  if (d.segment === 0) return 'MISS';
  if (d.segment === 25) return d.multiplier === 2 ? 'BULL' : '25';
  const prefix = d.multiplier === 3 ? 'T' : d.multiplier === 2 ? 'D' : 'S';
  return prefix + d.segment;
}

function renderX01DartGrid(buffer, onChange, onCommit, onExit, onMoreCommands) {
  let multiplier = 1;
  const root = el('div', { class: 'calc' });

  const display = el('div', { class: 'calc-display', style: 'min-height:48px;' });
  const entered = el('div', { class: 'calc-entered' }, buffer.length ? buffer.map(formatDart).join(' · ') : 'Tap a segment');
  const running = el('div', { class: 'calc-running' }, `Total: ${buffer.reduce((s, d) => s + dartValue(d), 0)}`);
  display.appendChild(entered);
  display.appendChild(running);
  root.appendChild(display);

  const actions = el('div', { class: 'calc-actions' });
  actions.appendChild(el('button', { class: 'calc-action-btn', onclick: onExit }, '⏻'));
  actions.appendChild(el('button', { class: 'calc-action-btn', onclick: onMoreCommands }, '⋯'));
  root.appendChild(actions);

  const multRow = el('div', { class: 'btn-row', style: 'margin:8px 0; justify-content:center;' });
  function mkMultBtn(m, text) {
    const btn = el('button', {
      class: 'btn segmented-btn' + (multiplier === m ? ' segmented-selected' : ''),
      onclick: () => {
        multiplier = m;
        Array.from(multRow.children).forEach(b => b.classList.remove('segmented-selected'));
        btn.classList.add('segmented-selected');
      },
    }, text);
    return btn;
  }
  multRow.appendChild(mkMultBtn(1, 'S'));
  multRow.appendChild(mkMultBtn(2, 'D'));
  multRow.appendChild(mkMultBtn(3, 'T'));
  root.appendChild(multRow);

  const pad = el('div', { style: 'display:flex; flex-wrap:wrap; gap:6px; justify-content:center; margin-bottom:8px;' });
  for (let s = 1; s <= 20; s++) {
    pad.appendChild(el('button', {
      class: 'btn',
      onclick: () => {
        if (buffer.length >= MAX_DARTS_PER_TURN) return;
        buffer.push({ segment: s, multiplier });
        onChange();
      },
    }, String(s)));
  }
  pad.appendChild(el('button', { class: 'btn', onclick: () => {
    if (buffer.length >= MAX_DARTS_PER_TURN) return;
    buffer.push({ segment: 25, multiplier });
    onChange();
  } }, 'BULL'));
  pad.appendChild(el('button', { class: 'btn ghost', onclick: () => {
    if (buffer.length >= MAX_DARTS_PER_TURN) return;
    buffer.push({ segment: 0, multiplier: 1 });
    onChange();
  } }, 'MISS'));
  root.appendChild(pad);

  const controls = el('div', { class: 'btn-row', style: 'justify-content:center;' });
  controls.appendChild(el('button', {
    class: 'btn ghost',
    onclick: () => { if (buffer.length) { buffer.pop(); onChange(); } },
  }, '↶ Back'));
  controls.appendChild(el('button', {
    class: 'btn ghost',
    onclick: () => { buffer.length = 0; onChange(); },
  }, 'Clear'));
  controls.appendChild(el('button', {
    class: 'btn primary',
    disabled: buffer.length ? null : '',
    onclick: () => { if (buffer.length) onCommit(); },
  }, 'Next ▶'));
  root.appendChild(controls);

  return { root, entered, running, isEmpty: () => buffer.length === 0 };
}

/* ----- Game screen (now uses calculator for entry) ----- */
function renderGame(router, params) {
  const screen = el('section', { class: 'screen active game-screen' });

  let game;
  if (params.resume) {
    game = loadLastGame();
    if (!game) { toast('No game to resume'); router.go('menu'); return screen; }
  } else {
    const names = params.names;
    if (params.mode === 'x01') game = new01(names, { ...(params.opts || {}), legsToWin: params.legsToWin ?? params.opts?.legsToWin ?? 1, setsToWin: params.setsToWin ?? params.opts?.setsToWin ?? 1, maxDarts: params.maxDartsPerLeg });
    else if (params.mode === 'cricket') game = newCricket(names, { ...(params.opts || {}), legsToWin: params.legsToWin });
    else if (params.mode === 'shanghai') game = newShanghai(names, { ...(params.opts || {}), legsToWin: params.legsToWin });
    game.rawDarts = [];
    game.legStart = 0; // first leg starts with player 0 (or whoever passed the bull test if enabled later)
    // Scope metadata — links this game to a league / tournament / match.
    // Standalone games (no league/tournament) just have { type: 'standalone' }.
    game.scope = params.scope || deriveScopeFromParams(params);
  }
  game.online = !!params.online;
  game.matchMode = !!params.matchMode;
  game.matchId = params.matchId || null;
  game.competitionId = params.competitionId || null;
  game.competitionType = params.competitionType || null;
  game.showCheckout = !!params.showCheckout;

  // Tournament integration: if the admin's competition view set up
  // an active host (via the "Player join" flow), wire this game to
  // it so events from connected peers are applied to this engine.
  // Also listen for game-state-changed events to re-render after
  // a peer-driven mutation.
  attachGameToTournamentHost(game);
  const stateChangeHandler = () => render();
  window.addEventListener('gindarts:game-state-changed', stateChangeHandler);

  // Header bar
  const meta = el('div', { class: 'meta' });
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => toast('Full screen is blocked by this browser'));
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }
  const fsBtn = el('button', { class: 'btn ghost', title: 'Toggle full screen', onclick: toggleFullscreen }, 'Fullscreen');
  function updateFsBtn() { fsBtn.textContent = document.fullscreenElement ? 'Exit' : 'Fullscreen'; }
  document.addEventListener('fullscreenchange', updateFsBtn);
  const toolbar = el('div', { class: 'game-toolbar' }, meta,
      el('div', { class: 'row-flex' },
        el('button', { class: 'btn', title: 'Undo last dart', onclick: undo }, '↶ Undo'),
        fsBtn,
      )
    );
    screen.appendChild(toolbar);

    // Shared history strip — lives between the toolbar (above) and the
    // scoreboard (below) as a full-width row. `let` so render() can
    // replace it with a fresh element after every throw.
    // For Cricket, render the cricket-specific scorecard TABLE instead
    // (per-player marks per cricket target, dart-count column, etc.).
    let sharedHistory = game.type === 'cricket'
      ? renderCricketScorecard()
      : renderSharedHistory();
    screen.appendChild(sharedHistory);

    // Scoreboard — two player cards side-by-side now that the shared
    // history has been hoisted out of the middle column.
      const board = el('div', { class: 'scoreboard' });
      screen.appendChild(board);

    // Calculator entry
    const calcHost = el('div', {});
    screen.appendChild(calcHost);

  // The current calc element. Re-assigned on every render() so the
  // card-click handler can ask it "is the turn empty?".
  let calc = null;

  // Per-dart buffer for x01 double-in / triple-in / triple-out / master-out variants.
    const x01DartBuffer = [];

    // History-edit mode. When set, the calc buffer is pre-loaded with
    // the values of an existing throw and the next Commit overwrites
    // that entry in `game.rawDarts` instead of appending a new one.
    // Shape: { idx, type: 'total' | 'darts' | 'segments' } where idx is
    // the position in `game.rawDarts`. `null` means we're entering a
    // new throw normally.
    let editingHistoryEntry = null;

  // Click on a non-active player card → switch active thrower. Only
  // legal at the start of a turn (no darts entered yet), otherwise
  // the buffered darts would be lost. The calc tracks "is the turn
  // empty" via its isEmpty() method.
  function switchThrower(idx) {
    if (game.winner != null) return;
    if (idx === game.current) return;
    if (!calc || !calc.isEmpty || !calc.isEmpty()) {
      // Mid-turn: a different player card click is silently ignored.
      // (The .clickable class won't be set on cards in this state, so
      // the user can't normally trigger this — defensive only.)
      return;
    }
    game.current = idx;
    afterThrow();
  }

  // Re-render just the player cards (used by the calc onChange
  // callback to keep the .clickable class in sync with buffer state
  // without re-rendering the whole screen). The shared history strip
  // is hoisted to the screen level (between toolbar and scoreboard),
  // so repaintScoreboard only touches the player cards here.
  function repaintScoreboard() {
    if (!board) return;
    board.innerHTML = '';
    if (game.players.length === 2) {
      const cell0 = el('div', { class: 'scoreboard-cell' });
      cell0.appendChild(renderPlayerCard(game.players[0], 0, game, canSwitchTo(0) ? switchThrower : null));
      board.appendChild(cell0);
      const cell1 = el('div', { class: 'scoreboard-cell' });
      cell1.appendChild(renderPlayerCard(game.players[1], 1, game, canSwitchTo(1) ? switchThrower : null));
      board.appendChild(cell1);
    } else {
      game.players.forEach((p, i) => {
        const cell = el('div', { class: 'scoreboard-cell' });
        cell.appendChild(renderPlayerCard(p, i, game, canSwitchTo(i) ? switchThrower : null));
        board.appendChild(cell);
      });
    }
  }

  // A player card is tappable iff:
  //   - game is still in progress
  //   - the target is not the current active thrower
  //   - the calc buffer is empty (no darts entered yet this turn).
  //     Before the first render, `calc` is null and we treat the
  //     turn as empty (which it is — the game just started).
  function canSwitchTo(idx) {
    if (game.winner != null) return false;
    if (idx === game.current) return false;
    if (calc == null) return true;
    if (typeof calc.isEmpty !== 'function') return true;
    return calc.isEmpty();
  }

  // Render the shared history strip. The element is hoisted to the
  // screen level (between the toolbar and the scoreboard) at
  // screen-build time and is NOT re-rendered on every repaint; the
  // `edit-thrower` cells rebind their click handlers on each rebuild.
  //
  // One row = one round of the leg. Each row has 5 columns:
  //   [P1 thrown | P1 remaining | round × 3 | P2 thrown | P2 remaining]
  //
  // The round count appears in the middle so it reads at a glance from
  // either side of the board. Empty future rounds render with `—`
  // placeholders. The last 3 rounds of the leg (rounds X, X-1, X-2,
  // where X = maxDarts / 3 — i.e. dart numbers 45, 42, 39 at
  // maxDarts=45) get a `.last3` class so the whole row paints red,
  // even when the round hasn't been played yet.
  //
  // Total round count = floor(opts.maxDarts / 3). When maxDarts is 0 or
  // unset the history sizes to the actual number of rounds thrown so
  // far.
  //
  // Returns the host element.
  function renderSharedHistory() {
    const editable = game.type === 'x01' || game.type === 'shanghai';
    const maxDarts = game.opts?.maxDarts ?? 0;
    const totalRounds = maxDarts > 0 ? Math.floor(maxDarts / 3) : 0;
    const globalRaw = game.rawDarts || [];
    const players = game.players || [];
    if (players.length < 2) return el('div', { class: 'shared-history' });
    const p1 = players[0];
    const p2 = players[1];
    const host = el('div', { class: 'shared-history' });

    // Index entries by their 1-based global round number. Round N
    // contains the two player entries at indices (N-1)*2 and (N-1)*2+1.
    const entriesByRound = new Map(); // round -> [entry, entry?]
    globalRaw.forEach((e, gi) => {
      const r = Math.floor(gi / 2) + 1;
      if (!entriesByRound.has(r)) entriesByRound.set(r, []);
      entriesByRound.get(r).push(e);
    });

    const list = el('div', { class: 'shared-history-list' });
    const roundsToShow = Math.max(totalRounds, entriesByRound.size, 1);
    const activeRound = Math.max(1, entriesByRound.size);
    // Column header row — mirrors the cricket-style 4-column Scored /
    // To Go layout. Stays in front of the scrolling rounds.
    const headerRow = el('div', { class: 'shared-history-row sh-header' });
    headerRow.appendChild(el('span', { class: 'sh-thrown' }, `${p1.name} scored`));
    headerRow.appendChild(el('span', { class: 'sh-remain' }, 'To go'));
    headerRow.appendChild(el('span', { class: 'sh-round' }, 'Dart'));
    headerRow.appendChild(el('span', { class: 'sh-thrown' }, `${p2.name} scored`));
    headerRow.appendChild(el('span', { class: 'sh-remain' }, 'To go'));
    list.appendChild(headerRow);
    for (let round = 1; round <= roundsToShow; round++) {
          const pair = entriesByRound.get(round) || [];
          const e1 = pair.find(e => e.by === p1.name) || null;
          const e2 = pair.find(e => e.by === p2.name) || null;
      const isLast3 = totalRounds > 0 && round > totalRounds - 3;
      const isActive = round === activeRound;
      const row = el('div', {
        class: 'shared-history-row'
          + (isLast3 ? ' last3' : '')
          + (isActive ? ' active' : ''),
      });
      // P1 (left player) thrown + remaining, then round dart-count in
      // P1 (left player) thrown + remaining, then round dart-count in
      // the middle, then P2 (right player) thrown + remaining. The
      // shared history mirrors the scoreboard layout: P1 on the
      // left, P2 on the right, round dart-count in the middle.
      //
      // Editing highlight: if `editingHistoryEntry` matches this
      // row's P1 or P2 entry, mark the row + the specific cell
      // with `editing` / `editing-cell` so the user can see which
      // number is being edited (yellow tint + pulsing inset border).
      const e1Idx = e1 ? (game.rawDarts || []).indexOf(e1) : -1;
      const e2Idx = e2 ? (game.rawDarts || []).indexOf(e2) : -1;
      const e1Editing = e1 && editingHistoryEntry
        && editingHistoryEntry.idx === e1Idx;
      const e2Editing = e2 && editingHistoryEntry
        && editingHistoryEntry.idx === e2Idx;
      if (e1Editing || e2Editing) {
        row.classList.add('editing');
      }
      row.appendChild(el('span', {
        class: 'sh-thrown sh-thrown-p1'
          + (e1 && e1.bust ? ' bust' : '')
          + (e1 && (e1.isCheckout || e1.isLegWin) ? ' win' : '')
          + (e1Editing ? ' editing-cell' : ''),
      }, e1 ? formatThrownDarts(e1) : '—'));
      row.appendChild(el('span', {
              class: 'sh-remain sh-remain-p1'
                + (e1 && e1.bust ? ' bust' : ''),
            }, e1 ? (e1.bust ? 'BUST' : String(computeRemaining(p1.name, e1, entriesByRound))) : '—'));
      // Round dart-count in the middle.
      row.appendChild(el('span', { class: 'sh-round' }, String(round * 3)));
      // P2 thrown + remaining.
      row.appendChild(el('span', {
        class: 'sh-thrown sh-thrown-p2'
          + (e2 && e2.bust ? ' bust' : '')
          + (e2 && (e2.isCheckout || e2.isLegWin) ? ' win' : '')
          + (e2Editing ? ' editing-cell' : ''),
      }, e2 ? formatThrownDarts(e2) : '—'));
      row.appendChild(el('span', {
              class: 'sh-remain sh-remain-p2'
                + (e2 && e2.bust ? ' bust' : ''),
            }, e2 ? (e2.bust ? 'BUST' : String(computeRemaining(p2.name, e2, entriesByRound))) : '—'));
    if (editable && (e1 || e2)) {
      row.classList.add('editable');
      row.title = 'Tap a thrown value to edit that thrower';
      // Each player-column span gets its own click handler so tapping
      // P1's column edits P1's entry and tapping P2's column edits
      // P2's entry (instead of always preferring P1).
      if (e1) {
        const p1Thrown = row.querySelector('.sh-thrown-p1');
        if (p1Thrown) p1Thrown.addEventListener('click', (ev) => {
          ev.stopPropagation();
          openHistoryEdit((game.rawDarts || []).indexOf(e1));
        });
      }
      if (e2) {
        const p2Thrown = row.querySelector('.sh-thrown-p2');
        if (p2Thrown) p2Thrown.addEventListener('click', (ev) => {
          ev.stopPropagation();
          openHistoryEdit((game.rawDarts || []).indexOf(e2));
        });
      }
    }
    list.appendChild(row);
}
    host.appendChild(list);
    return host;
  }

  // Format a rawDarts entry as a "T20 · 20 · 20" string for the
  // history row's "thrown" cell.
  function formatThrownDarts(entry) {
    if (entry.dartsData && entry.dartsData.length) {
    return entry.dartsData.map(dartLabel).join(' · ');
    }
    if (entry.total != null) return String(entry.total);
    if (entry.segments) return entry.segments.join(' · ');
    return '?';
  }

  // Walk `entriesByRound` from the start, summing up this player's
  // scores, until we reach `target`. Returns the remaining score the
  // player had AFTER throwing `target`. Busts don't change the score.
  function computeRemaining(playerName, target, entriesByRound) {
    const start = game.opts?.start ?? 0;
    let remaining = start;
    const rounds = [...entriesByRound.keys()].sort((a, b) => a - b);
    for (const r of rounds) {
      // entriesByRound stores pairs [entryP1?, entryP2?] per round.
      // Find the entry thrown by `playerName` in this round (if any).
      const pair = entriesByRound.get(r) || [];
      const e = pair.find(x => x && x.by === playerName);
      if (!e) continue;
      if (e.bust) {
        if (e === target) return remaining;
        continue;
      }
      const total = e.total ?? (e.dartsData ? e.dartsData.reduce((s, d) => s + dartValue(d), 0) : 0);
      remaining = Math.max(0, remaining - total);
      if (e === target) return remaining;
    }
    return remaining;
  }

// Open the calc in "edit mode" for an existing history entry. The
  // calc buffer is pre-loaded with the entry's values, the calc
  // shows an "Editing throw N" indicator, and the next Commit
  // overwrites that entry in `game.rawDarts` via `editRawDart`
  // instead of appending a new throw.
  //
  // Cancelling is implicit — any click on a different history cell
  // (or entering a fresh throw without committing first) drops the
  // edit-mode state. The calc's own clear/back actions also reset
  // the buffer but leave `editingHistoryEntry` set, so the next
  // digits the user types start a NEW throw under the original
  // edit-mode target — that's the simplest mental model.
function openHistoryEdit(idx) {
    if (game.winner != null) { toast('Cannot edit after match is over'); return; }
    const entry = game.rawDarts[idx];
    if (!entry) return;

    const isPerDart = game.type === 'x01' && (game.opts.in !== 'single' || game.opts.out !== 'single');

    // Clear any current calc buffer so the pre-loaded values are
    // visible immediately and don't get mixed with leftovers.
    x01DartBuffer.length = 0;

    if (isPerDart) {
      // Pre-load the per-dart buffer from the entry's dartsData.
      if (entry.dartsData && entry.dartsData.length) {
        for (const d of entry.dartsData) x01DartBuffer.push({ ...d });
      }
      editingHistoryEntry = { idx, type: 'darts' };
    } else if (game.type === 'x01') {
      // Single-in/single-out x01: load the turn total into the calc.
      // The calc UI shows whatever is currently in `x01TurnBuffer`
      // via `legRunningTotal` — but for edit we need a real buffer.
      // Easiest: synthesise a single-dart buffer whose total equals
      // `entry.total`, and let the user re-enter.
      if (entry.dartsData && entry.dartsData.length) {
        for (const d of entry.dartsData) x01DartBuffer.push({ ...d });
        editingHistoryEntry = { idx, type: 'darts' };
      } else {
        // Plain total entry — we still go through `x01DartBuffer` so
        // the calc has something to display. Commit will treat it as
        // a single throw of that total.
        editingHistoryEntry = { idx, type: 'total' };
      }
    } else if (game.type === 'shanghai') {
      if (entry.segments && entry.segments.length) {
        x01DartBuffer.length = 0;
        for (const s of entry.segments) x01DartBuffer.push(s);
      }
      editingHistoryEntry = { idx, type: 'segments' };
    } else {
      // Cricket / other — total-only edit for now.
      editingHistoryEntry = { idx, type: 'total' };
    }

    // Re-render so the calc picks up the pre-loaded buffer and
    // shows the edit-mode banner.
    render();
    toast(`Editing ${formatTurnLabel(entry, game)} — type a new value, then Commit`);
}

  function formatTurnLabel(entry, game) {
    const p = (game.players || []).find(pl => pl.name === entry.by);
    const name = p ? p.name : entry.by;
    if (entry.dartsData && entry.dartsData.length) {
      return `${name}: ${entry.dartsData.map(dartLabel).join(' · ')} = ${entry.total}`;
    }
    if (entry.total != null) return `${name}: ${entry.total}`;
    if (entry.segments) return `${name}: ${entry.segments.join(' · ')}`;
    return `${name}: ?`;
  }

  // Cricket scorecard — a tabular per-player view of marks on each
  // cricket target (20, 19, 18, 17, 16, 15, Bull). Mirrors the
  // 4-column Scored / To Go layout from the mockup image, with the
  // dart-count column in the middle and a row per cricket number.
  // Each cell shows:
  //   - Scored: marks the player currently has on this number
  //     ("✓" if closed)
  //   - To Go: marks still needed to close ("0" if closed)
  function renderCricketScorecard() {
    const CRICKET_NUMS = [20, 19, 18, 17, 16, 15, 25];
    const NUM_LABELS = { 20: '20', 19: '19', 18: '18', 17: '17', 16: '16', 15: '15', 25: 'BULL' };
    const players = game.players || [];
    if (players.length < 2) return el('div', { class: 'cricket-scorecard' });
    const [p1, p2] = players;
    const host = el('div', { class: 'cricket-scorecard' });
    const list = el('div', { class: 'cricket-scorecard-list' });

    // Column header — same 4-column + dart-count layout as the
    // mockup, with the player's name in the SCORED / TO GO cells.
    const p1Name = (p1.name || 'P1').toUpperCase();
    const p2Name = (p2.name || 'P2').toUpperCase();
    const header = el('div', { class: 'cricket-scorecard-row cricket-scorecard-header' },
      el('div', { class: 'cs-num' }),
      el('div', { class: 'cs-scored' }, `${p1Name} SCORED`),
      el('div', { class: 'cs-togo' }, 'TO GO'),
      el('div', { class: 'cs-dart' }, 'DART'),
      el('div', { class: 'cs-scored' }, `${p2Name} SCORED`),
      el('div', { class: 'cs-togo' }, 'TO GO'),
    );
    list.appendChild(header);

    // Data rows — one per cricket target. Marks display: empty
    // ("—") when 0, "1"/"2", or "✓" when player has closed (3
    // marks, or 2 for Bull).
    function marksFor(player, num) {
      const m = (player.marks && player.marks[num]) || 0;
      const max = num === 25 ? 2 : 3;
      if (m >= max) return '✓';
      return m > 0 ? String(m) : '—';
    }
    function toGoFor(player, num) {
      const m = (player.marks && player.marks[num]) || 0;
      const max = num === 25 ? 2 : 3;
      const left = Math.max(0, max - m);
      return left === 0 ? '0' : String(left);
    }
    // Total darts thrown so far across both players — used for the
    // cumulative DART count column (each row gets +3).
    let cumulativeDarts = 0;
    CRICKET_NUMS.forEach(num => {
      cumulativeDarts += 3;
      const m1 = (p1.marks && p1.marks[num]) || 0;
      const m2 = (p2.marks && p2.marks[num]) || 0;
      const max = num === 25 ? 2 : 3;
      // Highlight rows where one player has closed and the other hasn't
      // (the "battle" rows in cricket). Or rows currently being thrown at.
      const isActive = (m1 < max || m2 < max) && (m1 > 0 || m2 > 0);
      const row = el('div', {
        class: 'cricket-scorecard-row' + (isActive ? ' active' : ''),
        'data-num': num,
      },
        el('div', { class: 'cs-num' }, NUM_LABELS[num]),
        el('div', { class: 'cs-scored' }, marksFor(p1, num)),
        el('div', { class: 'cs-togo' }, toGoFor(p1, num)),
        el('div', { class: 'cs-dart' }, String(cumulativeDarts)),
        el('div', { class: 'cs-scored' }, marksFor(p2, num)),
        el('div', { class: 'cs-togo' }, toGoFor(p2, num)),
      );
      list.appendChild(row);
    });

    host.appendChild(list);
    return host;
  }

  function render() {
    meta.innerHTML = '';
    meta.appendChild(el('div', {}, 'Game', el('strong', {}, cap(game.type))));
    meta.appendChild(el('div', {}, 'Round/Turn', el('strong', {}, gameLabel(game))));
    if (game.type === 'x01') {
      // Sets to Win comes first (the larger container), Legs to Win
      // second. Sets are hidden when the count is 1 (single-set games
      // don't need the annotation). Legs are always shown — "Legs to Win
      // 3" means the first player to take 3 legs wins, which is best-of-5.
      // Single-leg games read as "Best of 1" so the label stays
      // meaningful.
      const setsToWin = game.opts.setsToWin;
      const legsToWin = game.opts.legsToWin;
      if (setsToWin > 1) {
        meta.appendChild(el('div', {}, 'Sets to Win', el('strong', {}, String(setsToWin))));
      }
      {
        const bestOf = Math.max(1, legsToWin * 2 - 1);
        meta.appendChild(el('div', {}, 'Legs to Win', el('strong', {}, `Best of ${bestOf}`)));
      }
      // Mode label: e.g. "501", or "501 · DI/DO" when in/out rules are set.
      // Single in/out are omitted (anything goes → not worth printing).
      const inLabel = game.opts.in !== 'single' ? X01_IN_OPTIONS[game.opts.in]?.label : '';
      const outLabel = game.opts.out !== 'single' ? X01_OUT_OPTIONS[game.opts.out]?.label : '';
      const ioLabel = [inLabel, outLabel].filter(Boolean).join('/');
      meta.appendChild(el('div', {}, 'Mode', el('strong', {}, `${game.opts.start}${ioLabel ? ' · ' + ioLabel : ''}`)));
    }
    if (game.type === 'shanghai') meta.appendChild(el('div', {}, 'Target', el('strong', {}, `Number ${Math.min(game.round, game.opts.n)}/${game.opts.n}`)));
    if (game.online) meta.appendChild(el('div', {}, 'Online', el('strong', {}, 'Host')));
    if (game.matchMode) meta.appendChild(el('div', {}, 'Match', el('strong', {}, 'Best of ' + (game.legsToWin * 2 - 1))));

    // Rebuild the shared history strip in place. It lives at screen
        // level (between toolbar and scoreboard); we swap the element with
        // a fresh render so new rounds show up after each throw.
        // For Cricket, swap with the cricket scorecard re-render instead.
        //
        // Scroll behaviour:
        // - If the user is parked at the bottom (or near it) of the strip,
        //   keep them pinned at the bottom so new rounds auto-scroll in.
        // - If they scrolled UP to read older rounds, preserve their
        //   scroll position so the next throw doesn't yank them back down.
        // - On a fresh render with no prior scrollTop (first render),
        //   land at the bottom too.
        if (sharedHistory && sharedHistory.parentNode) {
          const oldList = sharedHistory.querySelector('.shared-history-list');
          const wasPinnedToBottom = !oldList
            || oldList.scrollHeight - oldList.scrollTop - oldList.clientHeight < 20;
          const preservedScrollTop = oldList ? oldList.scrollTop : 0;

          const fresh = game.type === 'cricket'
            ? renderCricketScorecard()
            : renderSharedHistory();
          sharedHistory.replaceWith(fresh);
          sharedHistory = fresh;

          // Restore scroll on the freshly rendered list. If the user was
          // pinned at the bottom (or this is the first render), jump to the
          // new bottom so the latest round stays visible.
          const newList = fresh.querySelector('.shared-history-list');
          if (newList) {
            if (wasPinnedToBottom) {
              newList.scrollTop = newList.scrollHeight;
            } else {
              // Clamp to the new scrollHeight (the list might be shorter
              // on a fresh render, e.g. after a leg reset).
              newList.scrollTop = Math.min(preservedScrollTop,
                                           newList.scrollHeight - newList.clientHeight);
            }
          }
        }

    board.innerHTML = '';
    // Layout: two player cells side-by-side. The shared history strip
    // is hoisted to the screen level (between toolbar and scoreboard)
    // and is rebuilt by the block above on every render() call.
    if (game.players.length === 2) {
      const cell0 = el('div', { class: 'scoreboard-cell' });
      cell0.appendChild(renderPlayerCard(game.players[0], 0, game, canSwitchTo(0) ? switchThrower : null));
      board.appendChild(cell0);
      const cell1 = el('div', { class: 'scoreboard-cell' });
      cell1.appendChild(renderPlayerCard(game.players[1], 1, game, canSwitchTo(1) ? switchThrower : null));
      board.appendChild(cell1);
    } else {
      game.players.forEach((p, i) => {
        const cell = el('div', { class: 'scoreboard-cell' });
        cell.appendChild(renderPlayerCard(p, i, game, canSwitchTo(i) ? switchThrower : null));
        board.appendChild(cell);
      });
    }

    // Calculator or winner summary
    calcHost.innerHTML = '';
    if (game.winner != null) {
      calcHost.appendChild(el('div', { class: 'card', style: 'text-align:center' },
        el('h2', { style: 'margin:0 0 4px' }, `🏆 ${game.players[game.winner].name} wins the match!`),
        el('div', { class: 'muted' }, 'Final: ' + game.players.map(p => `${p.name} ${p.legsWon}`).join(' · ')),
        el('div', { class: 'btn-row', style: 'margin-top:10px' },
          el('button', { class: 'btn primary', onclick: endMatch }, game.matchMode ? 'Save & back' : 'New game'),
          el('button', { class: 'btn ghost', onclick: () => router.go(game.matchMode ? (game.matchMode ? 'bracket-view' : 'menu') : 'menu') }, 'Close'),
        ),
      ));
      return;
    }
    // Compute running leg total for the current player (sum of recent turns since last bust)
    const legTotal = computeLegRunningTotal(game);
    const x01NeedsDarts = game.type === 'x01' && (game.opts.in !== 'single' || game.opts.out !== 'single');
    if (!x01NeedsDarts) {
      calc = renderCalculator({
        legRunningTotal: legTotal,
        onCommit: commitTurnTotal,
        onSetScore: confirmSetScore,
        onExit: confirmExit,
        onMoreCommands: showMoreCommands,
        // Re-render the player cards on every calc input so the
        // .clickable class updates in sync with the buffer state.
        onChange: () => { repaintScoreboard(); },
      });
      calcHost.appendChild(calc);
    } else {
      // Per-dart entry is required for double-in / triple-in / triple-out / master-out.
      calc = renderX01DartGrid(x01DartBuffer, () => {
        entered.textContent = x01DartBuffer.length ? x01DartBuffer.map(formatDart).join(' · ') : 'Tap a segment';
        running.textContent = `Total: ${x01DartBuffer.reduce((s, d) => s + dartValue(d), 0)}`;
        repaintScoreboard();
      }, () => { commitX01Darts(); }, confirmExit, showMoreCommands);
      const { entered, running } = calc;
      calcHost.appendChild(calc.root);
    }
    // If Cricket: append a per-dart grid so the player can still mark each dart
    if (game.type === 'cricket') {
      calcHost.appendChild(el('div', { style: 'height:10px' }));
      const darts = el('div', { class: 'calc-hint', style: 'margin-bottom:8px' }, 'Cricket marks per dart: tap a number 3 times for T, 2 for D, 1 for S. Tap BULL same way.');
      calcHost.appendChild(darts);
      const dartPad = el('div', { style: 'display:flex; flex-wrap:wrap; gap:6px; justify-content:center' });
      const cricketSegments = [15, 16, 17, 18, 19, 20, 25];
      cricketSegments.forEach(n => {
        const lbl = n === 25 ? 'BULL' : String(n);
        dartPad.appendChild(el('button', { class: 'btn', onclick: () => commitCricketDart(n) }, lbl));
      });
      dartPad.appendChild(el('button', { class: 'btn ghost', title: 'Miss', onclick: () => commitCricketDart(0) }, 'MISS'));
      dartPad.appendChild(el('button', { class: 'btn primary', title: 'End turn', onclick: endCricketTurn }, 'Next ▶'));
      calcHost.appendChild(dartPad);
    }
  }

  function commitTurnTotal(total) {
    if (game.winner != null) return;
    // For 01: ignore 0 entries (player shouldn't commit a no-op)
    if (total === 0 && game.type !== 'shanghai') return;
    // Capture the thrower's name BEFORE submitTurnTotal01 advances
    // `game.current` to the next player — otherwise the entry's `by`
    // field would point at the next thrower, not the one who just threw.
    const throwerName = game.players[game.current]?.name;

    // History-edit branch: overwrite the existing entry at
    // `editingHistoryEntry.idx` instead of appending a new turn.
    if (editingHistoryEntry) {
        const { idx } = editingHistoryEntry;
        const oldEntry = game.rawDarts[idx];
        if (!oldEntry) { editingHistoryEntry = null; return; }
        const result = (game.type === 'x01') ? submitTurnTotal01(game, total)
          : (game.type === 'shanghai') ? submitTurnTotalShanghai(game, total)
          : null;
        const meta = result ? {
          darts: result.darts,
          isLegWin: !!result.isLegWin,
          isCheckout: !!result.isCheckout,
          bust: !!result.bust,
        } : { darts: 3, isLegWin: false, isCheckout: false, bust: false };
        const newEntry = { total, ...meta, by: oldEntry.by };
        const updated = editRawDart(game, idx, newEntry);
        if (!updated) { toast('Invalid turn (would bust or break game rules)'); return; }
        game = updated;
        editingHistoryEntry = null;
        afterThrow(false);
        toast('Turn updated');
        return;
    }

    const result = (game.type === 'x01') ? submitTurnTotal01(game, total)
        : (game.type === 'shanghai') ? submitTurnTotalShanghai(game, total)
        : null;
    const meta = result ? {
        darts: result.darts,
        isLegWin: !!result.isLegWin,
        isCheckout: !!result.isCheckout,
        bust: !!result.bust,
    } : { darts: 3, isLegWin: false, isCheckout: false, bust: false };
    game.rawDarts.push({ total, ...meta, by: throwerName });
    // Tournament sync: if this game has a tournament host (set up
    // by the bracket/league view's "Player join" flow), broadcast
    // the action to all connected peers. Peers will replay it on
    // their local engine — both sides stay in sync.
    if (game._tournamentHost && game._tournamentPeerId != null) {
      game._tournamentHost.broadcastEvent(
        game._tournamentEventSeq = (game._tournamentEventSeq || 0) + 1,
        { type: 'turn', total, ...meta, by: game.players[game.current]?.name }
      );
    }
    // If this turn ended the match, broadcast a final state too.
    // Otherwise the peer's UI never learns the match is over.
    if (game.winner != null && game._tournamentHost) {
      game._tournamentHost.broadcastEvent(
        game._tournamentEventSeq = (game._tournamentEventSeq || 0) + 1,
        { type: 'match-end', winner: game.winner, by: game.players[game.winner]?.name }
      );
    }
    afterThrow();
  }

  // X01 per-dart turn commit (for DI/TI/TO/MO variants).
  function commitX01Darts() {
  if (game.winner != null) return;
  if (x01DartBuffer.length === 0) return;
  const darts = x01DartBuffer.slice();
  // Capture the thrower's name BEFORE throwDarts01 advances
  // `game.current` to the next player.
  const throwerName = game.players[game.current]?.name;
  const result = throwDarts01(game, darts);
  const total = darts.reduce((s, d) => s + dartValue(d), 0);
  const meta = {
    darts: darts.length,
    isLegWin: !!result.state.winner || (result.events || []).some(e => e.type === 'leg-won'),
    isCheckout: (result.events || []).some(e => e.type === 'leg-won'),
    bust: (result.events || []).some(e => e.type === 'bust'),
  };
  game.rawDarts.push({ darts: darts.length, total, dartsData: darts, ...meta, by: throwerName });
  x01DartBuffer.length = 0;
  if (game._tournamentHost && game._tournamentPeerId != null) {
    game._tournamentHost.broadcastEvent(
      game._tournamentEventSeq = (game._tournamentEventSeq || 0) + 1,
      { type: 'x01-darts', darts, total, ...meta, by: throwerName }
    );
  }
  if (game.winner != null && game._tournamentHost) {
    game._tournamentHost.broadcastEvent(
      game._tournamentEventSeq = (game._tournamentEventSeq || 0) + 1,
      { type: 'match-end', winner: game.winner, by: game.players[game.winner]?.name }
    );
  }
  afterThrow();
  }

  // Cricket: per-dart entry. Each click adds a mark segment. The turn
  // ends when the player hits "Next ▶" or has added 3 marks.
  function commitCricketDart(seg) {
    if (game.winner != null) return;
    if (!game.cricketDarts) game.cricketDarts = [];
    if (seg === 0) {
      game.cricketDarts.push(0);
    } else {
      game.cricketDarts.push(seg);
    }
    // Auto-end at 3 darts
    if (game.cricketDarts.length >= MAX_DARTS_PER_TURN) endCricketTurn();
  }
  function endCricketTurn() {
    if (game.winner != null) return;
    const segs = game.cricketDarts || [];
    if (segs.length === 0) return;
    const result = submitTurnCricketMarks(game, segs);
    game.rawDarts.push({ segments: segs, darts: result.darts, isLegWin: !!result.isLegWin, by: game.players[game.current]?.name });
    game.cricketDarts = [];
    // Tournament sync: broadcast to peers.
    if (game._tournamentHost) {
      game._tournamentHost.broadcastEvent(
        game._tournamentEventSeq = (game._tournamentEventSeq || 0) + 1,
        { type: 'cricket-turn', segments: segs, darts: result.darts, isLegWin: !!result.isLegWin, by: game.players[game.current]?.name }
      );
    }
    // If this turn ended the match, broadcast match-end too.
    if (game.winner != null && game._tournamentHost) {
      game._tournamentHost.broadcastEvent(
        game._tournamentEventSeq = (game._tournamentEventSeq || 0) + 1,
        { type: 'match-end', winner: game.winner, by: game.players[game.winner]?.name }
      );
    }
    afterThrow();
  }

  function computeLegRunningTotal(g) {
    // For 01: sum of negative deltas in the current leg (since last bust or start)
    // For Cricket/Shanghai: not applicable — show 0.
    if (g.type !== 'x01') return 0;
    const player = g.players[g.current];
    let total = 0;
    // Walk history from the end backwards until a BUST entry or start.
    for (let i = player.history.length - 1; i >= 0; i--) {
      const h = player.history[i];
      if (typeof h.what === 'string' && h.what.startsWith('BUST')) break;
      if (h.delta < 0) total += -h.delta;
    }
    return total;
  }

  function buildHint(g) {
    const player = g.players[g.current];
    if (g.type === 'x01') {
      const need = player.score;
      const opts = g.opts || {};
      // With double-in/triple-in we don't know whether the opening dart has
      // already happened, so checkout hints are unreliable; skip them.
      const canHint = game.opts.in === 'single' && g.showCheckout;
      const capDarts = g.opts.maxDarts > 0 ? Math.min(g.opts.maxDarts, 3) : 3;
      if (canHint) {
        const sug = checkoutSuggestions(need, { in: g.opts.in, out: g.opts.out }, capDarts);
        if (sug.length) {
          if (need === 170) {
            return `🎯 170 — ${CHECKOUT_170.description}`;
          }
          return `🎯 ${sug[0].description}`;
        }
      }
      if (need <= MAX_TURN_TOTAL) {
        return `Score ≤ ${need} to avoid bust. Max legal total: ${MAX_TURN_TOTAL}.`;
      }
      return `Need ${need} to win. Max turn total: ${MAX_TURN_TOTAL}. (Bust if you go over.)`;
    }
    if (g.type === 'shanghai') {
      const target = Math.min(g.round, g.opts.n);
      return `Round ${target}/${g.opts.n} · target ${target}. Type the points you scored this turn (${target}, ${target * 2}, or ${target * 3}), or 0 to miss.`;
    }
    return '';
  }

  function undo() {
    if (!game.rawDarts || game.rawDarts.length === 0) { toast('Nothing to undo'); return; }
    const all = game.rawDarts.slice(0, -1);
    const names = game.players.map(p => p.name);
    let fresh;
    const opts = { ...game.opts, legsToWin: game.legsToWin };
    if (game.type === 'x01') fresh = new01(names, opts);
    else if (game.type === 'cricket') fresh = newCricket(names, opts);
    else fresh = newShanghai(names, opts);
    fresh.rawDarts = [];
    for (const entry of all) {
      if (fresh.winner != null) break;
      if (entry.dartsData && entry.dartsData.length) {
        throwDarts01(fresh, entry.dartsData);
        fresh.rawDarts.push(entry);
      } else if (entry.total != null) {
        if (game.type === 'x01') submitTurnTotal01(fresh, entry.total);
        else if (game.type === 'shanghai') submitTurnTotalShanghai(fresh, entry.total);
        fresh.rawDarts.push(entry);
      } else if (entry.segments) {
        submitTurnCricketMarks(fresh, entry.segments);
        fresh.rawDarts.push(entry);
      }
    }
    fresh.players.forEach((p, i) => { p.legsWon = game.players[i].legsWon; });
    game = fresh;
    x01DartBuffer.length = 0;
    afterThrow(false);
    toast('Undone');
  }

  function confirmQuit() {
    confirmExit();
  }

  // ----- Calc action row callbacks -----
  // Set the current player's score to the entered value (skip dart math).
  function confirmSetScore(value) {
    const player = game.players[game.current];
    const prev = player.score;
    showModal({
      title: 'Set score to ' + value + '?',
      body: `${player.name}'s score will be changed from ${prev} to ${value}. This will end your turn.`,
      actions: [
        { label: 'Cancel' },
        { label: 'Set score', class: 'btn primary', onclick: () => doSetScore(value) },
      ],
    });
  }
  function doSetScore(value) {
    const player = game.players[game.current];
    player.score = value;
    game.rawDarts.push({ total: 0, override: value });
    advanceTurn();
  }
  function advanceTurn() {
    // Same turn-advancement as commitTurnTotal, minus the dart math.
    game.current = (game.current + 1) % game.players.length;
    // For 01: a turn that didn't bust resets the running total. Since
    // we set the score directly, treat it as a clean end-of-turn.
    game.turnStarted = false;
    // Check for winner
    if (game.type === 'x01' && player_won_01(game)) game.winner = game.current === 0 ? game.players.length - 1 : game.current - 1;
    afterThrow();
  }
  function player_won_01(g) {
    return g.players.some(p => p.score === 0);
  }

  // Exit game: confirmation depends on whether the game is finished.
  function confirmExit() {
    window.removeEventListener('gindarts:game-state-changed', stateChangeHandler);
    if (game.winner != null) {
      // Finished game: save to history
      showModal({
        title: 'Save game?',
        body: `Save the result to history${game.matchMode ? ' and update the competition' : ''}?`,
        actions: [
          { label: 'Discard', class: 'btn danger', onclick: () => router.go(game.matchMode ? 'competitions' : 'menu') },
          { label: 'Save & exit', class: 'btn primary', onclick: () => { endMatch(); router.go(game.matchMode ? 'competitions' : 'menu'); } },
        ],
      });
    } else {
      // Unfinished game: progress was already auto-saved on every turn.
      // Offer to save stats (for DNF) or just leave.
      showModal({
        title: 'Exit game?',
        body: 'Your progress is auto-saved on every turn. You can resume this game from the main menu.',
        actions: [
          { label: 'Cancel', onclick: () => window.addEventListener('gindarts:game-state-changed', stateChangeHandler) },
          { label: 'Save progress & exit', class: 'btn primary', onclick: () => { saveLastGame(game); router.go(game.matchMode ? 'competitions' : 'menu'); } },
          { label: 'Discard progress', class: 'btn danger', onclick: () => { store.remove('lastGame'); router.go(game.matchMode ? 'competitions' : 'menu'); } },
        ],
      });
    }
  }

  // More commands submenu (modal panel with 6 options).
  function showMoreCommands() {
    const body = el('div', { class: 'cmd-list' });
    const cmds = [
      { key: 'undo', label: '↶ Undo last turn', desc: 'Reverse the most recent turn' },
      { key: 'endleg', label: '🏁 End leg', desc: 'Pick the leg winner; score updates and next leg starts' },
      { key: 'swap', label: '⇄ Exchange scores', desc: 'Swap scores (use when a player threw out of order)' },
      { key: 'switch', label: '→ Next player', desc: 'Pass the turn without scoring' },
      { key: 'stats', label: 'ⓘ Show stats', desc: 'Per-player score and legs won' },
      { key: 'end', label: '⏹ End match early', desc: 'Finish the match and save stats' },
    ];
    for (const c of cmds) {
      const row = el('button', { class: 'cmd-row', onclick: () => { closeModal(); runCommand(c.key); } },
        el('div', { class: 'cmd-label' }, c.label),
        el('div', { class: 'cmd-desc muted' }, c.desc),
      );
      body.appendChild(row);
    }
    showModal({ title: 'More commands', body });
  }
  function runCommand(key) {
    switch (key) {
      case 'undo': undo(); break;
      case 'endleg': confirmEndLeg(); break;
      case 'swap': exchangeScores(); break;
      case 'switch': advanceTurn(); break;
      case 'stats': showStatsPanel(); break;
      case 'end': confirmEndEarly(); break;
    }
  }
  // End the current leg by picking a winner. The engine functions
  // award the leg and set the next leg's opening player. For 01 the
  // chosen player's score stays; for Cricket/Shanghai the highest
  // score wins (tie → ask or pick leading).
  function confirmEndLeg() {
    if (game.winner != null) return;
    const actions = game.players.map((p, i) => ({
      label: `${p.name} (${p.score})`,
      class: 'btn',
      onclick: () => doEndLeg(i),
    }));
    actions.push({ label: 'Cancel' });
    showModal({
      title: 'End leg — pick the winner',
      body: 'Choose who won this leg. Their score carries over and a new leg begins.',
      actions,
    });
  }
  function doEndLeg(winnerIdx) {
    if (game.winner != null) return;
    if (game.type === 'x01') {
      // Use the engine's submitTurnTotal01 with a no-op (0) so the
      // leg-end bookkeeping runs, then mark the chosen player as the
      // leg winner. Simpler: just bump legsWon and reset scores.
      const w = game.players[winnerIdx];
      const legStart = game.legStart ?? game.current;
      w.legsWon = (w.legsWon || 0) + 1;
      // Reset opening scores for next leg
      game.players.forEach(p => { p.score = game.opts.start; p.dartsThisLeg = 0; });
      // Check for match winner
      if (w.legsWon >= game.opts.legsToWin) {
        game.winner = winnerIdx;
        game.rawDarts.push({ endLeg: w.name, legStart });
        endMatch();
        return;
      }
      // New leg: starting player is the one AFTER the leg winner
      game.current = (winnerIdx + 1) % game.players.length;
      game.legStart = game.current;
      game.rawDarts.push({ endLeg: w.name, legStart });
      afterThrow();
      toast(`${w.name} wins the leg`);
    } else if (game.type === 'cricket' || game.type === 'shanghai') {
      const w = game.players[winnerIdx];
      const legStart = game.legStart ?? game.current;
      w.legsWon = (w.legsWon || 0) + 1;
      if (w.legsWon >= (game.opts.legsToWin || 1)) {
        game.winner = winnerIdx;
        game.rawDarts.push({ endLeg: w.name, legStart });
        endMatch();
        return;
      }
      // Reset leg state
      game.players.forEach(p => {
        if (game.type === 'cricket') { p.marks = {}; p.score = 0; p.dartsThisLeg = 0; }
        else { p.score = 0; p.dartsThisLeg = 0; }
      });
      game.round = 1;
      game.current = (winnerIdx + 1) % game.players.length;
      game.legStart = game.current;
      game.rawDarts.push({ endLeg: w.name, legStart });
      afterThrow();
      toast(`${w.name} wins the leg`);
    }
  }
  function exchangeScores() {
    if (game.winner != null) return;
    if (game.players.length < 2) { toast('Need at least 2 players'); return; }
    if (game.players.length > 2) {
      showModal({
        title: 'Exchange which two?',
        body: 'This game has ' + game.players.length + ' players. Pick the two to swap.',
        actions: game.players.map((p, i) => ({
          label: 'Swap ' + p.name + ' with…', keepOpen: true,
          onclick: () => pickSecondPlayer(i),
        })),
      });
    } else {
      const [a, b] = game.players;
      const tmp = a.score; a.score = b.score; b.score = tmp;
      game.rawDarts.push({ exchange: [a.name, b.name] });
      afterThrow();
      toast(`Swapped ${a.name} ↔ ${b.name}`);
    }
  }
  function pickSecondPlayer(firstIdx) {
    closeModal();
    const others = game.players.filter((_, i) => i !== firstIdx);
    showModal({
      title: 'Swap with…',
      actions: others.map((p, j) => ({
        label: p.name,
        onclick: () => {
          const idx2 = game.players.indexOf(p);
          const a = game.players[firstIdx], b = game.players[idx2];
          const tmp = a.score; a.score = b.score; b.score = tmp;
          game.rawDarts.push({ exchange: [a.name, b.name] });
          afterThrow();
          toast(`Swapped ${a.name} ↔ ${b.name}`);
        },
      })),
    });
  }
  function showStatsPanel() {
    const body = el('div', { class: 'stats-panel' });
    for (const p of game.players) {
      const card = el('div', { class: 'stats-card' },
        el('h4', {}, p.name),
        el('div', { class: 'muted' }, `Score: ${p.score}`),
        el('div', { class: 'muted' }, `Legs won: ${p.legsWon}`),
      );
      body.appendChild(card);
    }
    showModal({ title: 'Game stats', body, actions: [{ label: 'Close' }] });
  }
  function confirmEndEarly() {
    showModal({
      title: 'End match early?',
      body: 'The current match will be saved to history with the leading player marked as the winner (or as DNF if tied).',
      actions: [
        { label: 'Cancel' },
        { label: 'End match', class: 'btn danger', onclick: () => { game.winner = leadingPlayerIndex(); endMatch(); } },
      ],
    });
  }
  function leadingPlayerIndex() {
    if (game.type === 'x01') {
      // Lowest score leads
      let best = Infinity, idx = 0;
      game.players.forEach((p, i) => { if (p.score < best) { best = p.score; idx = i; } });
      return idx;
    }
    // Cricket/Shanghai: highest score leads
    let best = -Infinity, idx = 0;
    game.players.forEach((p, i) => { if ((p.score || 0) > best) { best = p.score || 0; idx = i; } });
    return idx;
  }

  function endMatch() {
    recordGameResult(game);
    saveLastGame({ ...game, rawDarts: game.rawDarts.slice(-50) });
    window.removeEventListener('gindarts:game-state-changed', stateChangeHandler);
    if (game.matchMode && game.matchId) {
      // Persist match result, advance bracket, etc.
      (async () => {
        const m = await get('matches', game.matchId);
        const c = await get('competitions', game.competitionId);
        const winnerPlayer = game.players[game.winner];
        // Determine which side (p1/p2) the winner is in the match
        const userMap = await auth.listUsers();
        const nameToId = new Map(userMap.map(u => [u.displayName, u.id]));
        const winnerId = nameToId.get(winnerPlayer.name) || null;
        const winnerKey = winnerId === m.p1 ? 'p1' : 'p2';
        m.score[winnerKey] = (m.score[winnerKey] || 0) + 1;
        m.status = 'complete';
        m.winner = winnerKey;
        await put('matches', m);

        // Advance bracket
        const allMatches = (await getAll('matches')).filter(x => x.competitionId === c.id);
        comp.completeMatch(allMatches, m.id, winnerKey);
        for (const updated of allMatches) {
          if (updated.id !== m.id) await put('matches', updated);
        }
        // Detect overall competition winner
        const champ = comp.detectCompetitionWinner(c, allMatches);
        if (champ) {
          c.winner = champ;
          c.status = 'complete';
        }
        await put('competitions', c);
        // Push the updated competition + all its matches + this match's
        // dart history to Drive if signed in. Same best-effort pattern
        // as competition creation — local is authoritative, Drive
        // catches up on next sign-in if push fails.
        if (await googleAuth.isSignedIn()) {
          try {
            await driveSync.pushCompetition(c, allMatches, [
              { id: `${m.id}`, rawDarts: game.rawDarts, players: game.players.map(p => p.name), winner: game.players[game.winner]?.name },
            ]);
            driveSync.clearDirty(`match:${game.matchId}`);
          } catch (e) {
            driveSync.markDirty(`match:${game.matchId}`);
            console.warn('Drive push failed for match', game.matchId, e);
          }
        }
        toast(champ ? 'Match saved · tournament complete!' : 'Match saved');
        router.go(c.type === 'league' ? 'league-view' : 'bracket-view', { id: c.id });
      })();
      return;
    }
    router.go('menu');
  }

  function afterThrow() {
    saveLastGame(game);
    render();
    if (game.winner != null) {
      // The match-end broadcast happens earlier in commitTurnTotal
      // (right after the engine sets winner) so the peer's UI
      // learns the match is over before we navigate.
      endMatch();
    }
  }

  // Back-to-admin link. Shows when the game was started from a
  // competition — admin can step out of the game without quitting
  // it (the engine keeps running, peers stay connected).
  if (game.competitionId) {
    const backToAdmin = el('button', {
      class: 'btn ghost small',
      style: 'margin: 16px auto 8px; display: block;',
      onclick: () => {
        saveLastGame(game);
        const ctype = game.competitionType;
        const id = game.competitionId;
        router.go(ctype === 'league' ? 'league' : 'bracket', { id });
      },
    }, '← Back to admin view');
    screen.appendChild(backToAdmin);
  }

  render();

  // Auto-fullscreen on first user gesture inside the game screen.
  // `requestFullscreen()` MUST be called from a user-gesture handler
  // or the browser silently rejects it. We attach a one-shot listener
  // to the screen so the very first click / tap / key the user makes
  // (e.g. taps a numpad button, hits Undo, anything) goes to
  // fullscreen. After that, fullscreen follows the existing toggle
  // button in the toolbar.
  if (typeof screen.addEventListener === 'function') {
    const tryFullscreen = () => {
      const el = document.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
      if (req && !document.fullscreenElement) {
        req.call(el).catch(() => { /* user denied or not supported — silently ignore */ });
      }
      // Run only once per game screen.
      screen.removeEventListener('click', tryFullscreen, true);
      screen.removeEventListener('keydown', tryFullscreen, true);
      screen.removeEventListener('touchstart', tryFullscreen, true);
    };
    screen.addEventListener('click', tryFullscreen, true);
    screen.addEventListener('keydown', tryFullscreen, true);
    screen.addEventListener('touchstart', tryFullscreen, true);
  }

  return screen;
}

function gameLabel(g) {
  if (g.type === 'x01') return `Throw ${g.current + 1}/${g.players.length}`;
  if (g.type === 'cricket') return `Throw ${g.current + 1}/${g.players.length}`;
  if (g.type === 'shanghai') return `Round ${Math.min(g.round, g.opts.n)}/${g.opts.n} · P${g.current + 1}`;
  return '';
}

/* Format a single rawDarts entry as human-readable text. */
function formatTurnLabel(entry, game) {
  const player = entry.by || (game.players[entry.playerIndex]?.name) || '?';
  let detail = '';
  if (entry.dartsData && entry.dartsData.length) {
    detail = entry.dartsData.map(d => dartLabel(d)).join(' · ') + ` = ${entry.total}`;
  } else if (entry.segments) {
    detail = entry.segments.map(s => s === 0 ? 'MISS' : String(s)).join(' · ');
  } else if (entry.total != null) {
    detail = String(entry.total);
  }
  let badges = '';
  if (entry.bust) badges += ' 💥';
  if (entry.isCheckout) badges += ' 🔥';
  else if (entry.isLegWin) badges += ' 🎯';
  return `${player}: ${detail}${badges}`;
}

function renderPlayerCard(player, idx, game, onClick) {
  const isActive = game.winner == null && idx === game.current;
  const isWinner = game.winner === idx;
  // Card is clickable when:
  //   - onClick callback is provided (host enabled this feature)
  //   - game is still in progress
  //   - this card is NOT the currently active one (no point clicking yourself)
  const clickable = typeof onClick === 'function' && game.winner == null && idx !== game.current;
  const card = el('div', {
    class: 'player-card'
      + (isActive ? ' active' : '')
      + (isWinner ? ' winner' : '')
      + (clickable ? ' clickable' : ''),
    role: clickable ? 'button' : undefined,
    tabindex: clickable ? '0' : undefined,
    'aria-label': clickable ? `Switch thrower to ${player.name}` : undefined,
    title: clickable ? `Switch thrower to ${player.name} (only at the start of a turn)` : undefined,
    onclick: clickable ? () => onClick(idx) : undefined,
    onkeydown: clickable ? (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick(idx);
      }
    } : undefined,
  });

  // Header row: player name + winner badge (when applicable). The
  // active-thrower cue is communicated through the green border on
  // the card itself, so we don't print "Throwing" text here.
  card.appendChild(el('div', { class: 'who' },
    el('h3', {}, player.name),
    isWinner ? el('span', { class: 'badge-active' }, 'Winner') : null,
  ));

  // The big score. Add .long class when ≥1000 so it shrinks to fit.
  const scoreStr = String(player.score);
  const scoreClass = 'score' + (scoreStr.length >= 4 ? ' long' : '');
  card.appendChild(el('div', { class: scoreClass }, scoreStr));

  // Cricket gets a compact one-row mark grid below the score; other
  // modes have nothing more to show (the toolbar already shows legs/
  // sets/darts-this-leg, so we don't duplicate it here).
  if (game.type === 'cricket') {
    const grid = el('div', { class: 'cricket-grid' });
    [20, 19, 18, 17, 16, 15, 25].forEach(n => {
      const marks = player.marks[n] || 0;
      const closed = marks >= 3 || (n === 25 && marks >= 2);
      const cell = el('div', { class: 'cricket-cell' + (closed ? ' closed' : '') },
        el('div', { class: 'num' }, n === 25 ? 'BULL' : String(n)),
        el('div', { class: 'marks' }, marks > 0 ? el('span', {}, '/'.repeat(Math.min(marks, 3))) : el('span', { class: 'muted' }, '·')),
      );
      grid.appendChild(cell);
    });
    card.appendChild(grid);
  }
  return card;
}

/* ----- Join tournament (player side) ----- */
function renderJoinTournament(router) {
  const screen = el('section', { class: 'screen active' });
  screen.appendChild(el('h2', {}, 'Join tournament'));
  screen.appendChild(el('p', { class: 'muted' },
    'The competition admin shows a code on their device. Scan the QR with your phone camera, or paste the base64 code below.'));

  const statusPill = el('span', { class: 'status-pill' }, el('span', { class: 'dot' }), 'Idle');

  const input = el('textarea', {
    placeholder: 'Paste the base64 code from the host here, or scan with your camera',
    style: 'width:100%; min-height: 100px; padding:10px 12px; border-radius:10px; background:var(--bg-2); border:1px solid var(--line); color:var(--text); margin-bottom:8px; font-family: ui-monospace, monospace;',
  });
  const nameInput = el('input', { type: 'text', placeholder: 'Your name',
    style: 'width:100%; padding:10px 12px; border-radius:10px; background:var(--bg-2); border:1px solid var(--line); color:var(--text); margin-bottom:8px;' });
  const joinBtn = el('button', { class: 'btn primary big block' }, 'Join');
  const output = el('div', { class: 'online-grid' });
  output.style.display = 'none';
  const playArea = el('div', { id: 'tournament-play-area' });
  playArea.style.display = 'none';
  screen.appendChild(nameInput);
  screen.appendChild(input);
  screen.appendChild(joinBtn);
  screen.appendChild(output);
  screen.appendChild(playArea);
  screen.appendChild(el('button', { class: 'btn ghost', style: 'margin-top:8px;', onclick: () => router.go('menu') }, '← Back'));
  screen.appendChild(statusPill);

  // Try to read a code from the URL hash, e.g. #join=eyJ...
  // (Useful when a player opens a link shared via a chat app.)
  try {
    const m = location.hash.match(/[#&]join=([^&]+)/);
    if (m) {
      input.value = decodeURIComponent(m[1]);
    }
  } catch (_) { /* ignore */ }

  let peer = null;
  let myName = 'Player';

  function enterPlayMode(state) {
    // Hide the join UI; show the live game.
    nameInput.style.display = 'none';
    input.style.display = 'none';
    joinBtn.style.display = 'none';
    output.style.display = 'none';
    playArea.style.display = 'block';
    playArea.innerHTML = '';

    const s = state;
    const you = (s.players || []).find(p => p.name === myName);
    const opp = (s.players || []).find(p => p.name !== myName);
    const gameOver = s.winner != null;
    const isMyTurn = s.current != null && s.players[s.current]?.name === myName;

    playArea.appendChild(el('h3', {}, '🎯 ' + (you?.name || myName) + ' vs ' + (opp?.name || '?')));
    const scoreCard = el('div', { class: 'card', style: 'margin-bottom: 12px;' });
    const scoreLine = el('p', { style: 'font-size: 18px; margin: 8px 0;' });
    scoreLine.append(`You: ${you?.score ?? '?'}  ·  ${opp?.name || '?'}: ${opp?.score ?? '?'}`);
    scoreCard.appendChild(scoreLine);
    scoreCard.appendChild(el('p', { class: 'small muted' },
      `${s.opts?.start || 501}${s.opts?.in !== 'single' || s.opts?.out !== 'single' ? ' · ' + [(X01_IN_OPTIONS[s.opts?.in]?.label || ''), (X01_OUT_OPTIONS[s.opts?.out]?.label || '')].filter(Boolean).join('') : ''}`));
    if (gameOver) {
      scoreCard.appendChild(el('p', { class: 'muted', style: 'margin-top: 8px; color: var(--accent);' },
        `🏆 Winner: ${s.players[s.winner]?.name || '?'}`));
    } else {
      scoreCard.appendChild(el('p', { class: 'small', style: 'margin-top: 8px; font-weight: bold;' },
        isMyTurn ? '🎯 Your turn!' : `⏳ ${s.players[s.current]?.name || '?'} throwing`));
    }
    playArea.appendChild(scoreCard);

    // Calculator (only when it's my turn and game isn't over)
    if (isMyTurn && !gameOver) {
      const calcHost = el('div', { style: 'margin-top: 14px;' });
      playArea.appendChild(calcHost);
      const calc = renderCalculator({
        onCommit: (total) => {
          if (total === 0) return;
          peer.sendEvent({ type: 'turn', total, by: myName });
          statusPill.className = 'status-pill connecting';
          statusPill.lastChild.textContent = '⏳ Sent to host…';
        },
        legRunningTotal: (you?.score || 0),
      });
      calcHost.appendChild(calc);
    }

    // Recent turns (last 8)
    const recent = (s.rawDarts || []).slice(-8).reverse();
    if (recent.length) {
      const recentCard = el('div', { class: 'card', style: 'margin-top: 12px;' });
      recentCard.appendChild(el('h4', { style: 'margin: 0 0 8px;' }, 'Recent'));
      const list = el('ul', { style: 'margin: 0; padding-left: 18px; font-size: 14px;' });
      for (const r of recent) {
        const li = el('li', {});
        li.append(`${r.by || '?'}: ${r.total}${r.bust ? ' (bust)' : ''}${r.isLegWin ? ' 🏆' : ''}`);
        list.appendChild(li);
      }
      recentCard.appendChild(list);
      playArea.appendChild(recentCard);
    }
  }

  joinBtn.addEventListener('click', async () => {
    const code = input.value.trim();
    myName = nameInput.value.trim() || 'Player';
    if (!code) { toast('Paste a code first'); return; }
    joinBtn.disabled = true; joinBtn.textContent = 'Joining…';
    statusPill.className = 'status-pill connecting'; statusPill.lastChild.textContent = 'Connecting…';
    peer = new TournamentPeer({
      onLog: (m) => console.log('[tournament-peer]', m),
      onState: (msg) => {
        statusPill.className = 'status-pill online';
        statusPill.lastChild.textContent = 'Connected';
        if (msg.state) {
          // Replace the join UI with the live game view.
          enterPlayMode(msg.state);
        } else {
          // No game yet — show a waiting view.
          nameInput.style.display = 'none';
          input.style.display = 'none';
          joinBtn.style.display = 'none';
          output.style.display = 'none';
          playArea.style.display = 'block';
          playArea.innerHTML = '';
          playArea.appendChild(el('p', { class: 'muted' }, msg.message || 'Connected. Waiting for admin to start the match.'));
        }
      },
      onEvent: (msg) => {
        // Host sent a protocol-level event. For v0.0.0.9+ we use
        // these for match-end notifications.
        if (msg.event?.type === 'match-end') {
          statusPill.className = 'status-pill online';
          statusPill.lastChild.textContent = '🏆 Match over';
          // We don't have a state here, but the next state broadcast
          // will refresh the UI. Show a placeholder.
          playArea.innerHTML = '';
          playArea.appendChild(el('p', { class: 'muted' }, `🏆 Winner: ${msg.event.by}`));
        } else if (msg.event) {
          console.log('[peer event]', msg.event);
        }
      },
    });
    try {
      const offerStr = decodeURIComponent(escape(atob(code)));
      const offer = JSON.parse(offerStr);
      const { answer } = await peer.join(offer, { name: myName });
      const answerStr = JSON.stringify(answer);
      const answerCode = btoa(unescape(encodeURIComponent(answerStr)));
      output.innerHTML = '';
      const left = el('div', {});
      left.appendChild(el('p', { class: 'small muted' }, 'Share this code with the host:'));
      const codeBox = el('div', { class: 'copy', style: 'max-height:120px; overflow:auto; word-break: break-all;' }, answerCode);
      left.appendChild(codeBox);
      const copyBtn = el('button', { class: 'btn block', style: 'margin-top:8px;',
        onclick: () => {
          try {
            navigator.clipboard.writeText(answerCode);
            toast('Code copied');
          } catch (e) { toast('Copy failed'); }
        } }, 'Copy code for host');
      left.appendChild(copyBtn);
      const qr = document.createElement('canvas');
      // eslint-disable-next-line no-undef
      new QRious({ element: qr, value: answerCode, size: 180, background: '#fff', foreground: '#0b0f17' });
      const qrDiv = el('div', { style: 'text-align: center; margin-top: 12px;' }, qr);
      left.appendChild(qrDiv);
      output.appendChild(left);
      output.style.display = 'block';
      statusPill.className = 'status-pill connecting';
      statusPill.lastChild.textContent = 'Waiting for host to accept your code…';
    } catch (e) {
      toast('Could not join: ' + e.message);
      joinBtn.disabled = false; joinBtn.textContent = 'Join';
      statusPill.className = 'status-pill offline';
      statusPill.lastChild.textContent = 'Failed';
    }
  });

  return screen;
}

/* ----- Online (kept from v1) ----- */
function renderOnline(router) {
  const screen = el('section', { class: 'screen active' });
  screen.appendChild(el('h2', {}, 'Online room'));
  screen.appendChild(el('p', { class: 'muted' }, 'No accounts, no servers. The host creates a room; the guest scans a QR to join. State syncs peer-to-peer.'));

  const statusPill = el('span', { class: 'status-pill' }, el('span', { class: 'dot' }), 'Idle');

  const hostPanel = el('div', { class: 'card' });
  hostPanel.appendChild(el('h3', {}, 'Host a game'));
  const hostBtn = el('button', { class: 'btn primary big block' }, 'Create room');
  const hostOutput = el('div', { class: 'online-grid' }); hostOutput.style.display = 'none';
  hostPanel.appendChild(hostBtn); hostPanel.appendChild(hostOutput);

  const guestPanel = el('div', { class: 'card' });
  guestPanel.appendChild(el('h3', {}, 'Join a game'));
  const guestInput = el('input', { type: 'text', placeholder: 'Paste room code (base64)', style: 'width:100%; padding:10px 12px; border-radius:10px; background:var(--bg-2); border:1px solid var(--line); color:var(--text); margin-bottom:8px;' });
  const guestBtn = el('button', { class: 'btn primary big block' }, 'Join room');
  const guestOutput = el('div', { class: 'online-grid' }); guestOutput.style.display = 'none';
  guestPanel.appendChild(guestInput); guestPanel.appendChild(guestBtn); guestPanel.appendChild(guestOutput);

  screen.appendChild(el('div', { class: 'online-grid' }, hostPanel, guestPanel));
  screen.appendChild(el('div', { style: 'height:12px' }));
  screen.appendChild(el('button', { class: 'btn ghost', onclick: () => router.go('menu') }, '← Back'));
  screen.appendChild(statusPill);

  let hostRoom = null;
  hostBtn.addEventListener('click', async () => {
    hostBtn.disabled = true; hostBtn.textContent = 'Creating…';
    hostRoom = new HostRoom({
      onLog: m => console.log('[host]', m),
      onPeerJoin: () => { statusPill.className = 'status-pill online'; statusPill.lastChild.textContent = 'Peer connected'; },
      onPeerLeave: () => { statusPill.className = 'status-pill offline'; statusPill.lastChild.textContent = 'Peer disconnected'; },
    });
    try {
      const { roomId, offer } = await hostRoom.create();
      const offerStr = JSON.stringify(offer);
      const roomCode = btoa(unescape(encodeURIComponent(offerStr)));
      hostOutput.innerHTML = '';
      const left = el('div', {});
      left.appendChild(el('p', { class: 'small muted' }, 'Room ID'));
      left.appendChild(el('div', { class: 'copy' }, roomId));
      const qr = el('canvas'); left.appendChild(el('div', { class: 'qr' }, qr));
      left.appendChild(el('button', { class: 'btn block', onclick: () => copyToClipboard(roomCode).then(() => toast('Room code copied')) }, 'Copy room code'));
      const right = el('div', {});
      right.appendChild(el('p', { class: 'small muted' }, 'Waiting for answer from guest…'));
      const ansTa = el('textarea', { placeholder: 'Paste answer JSON from guest here', style: 'width:100%; height:120px; background:var(--bg-2); border:1px solid var(--line); border-radius:10px; padding:10px; color:var(--text); font-family:ui-monospace,monospace;' });
      right.appendChild(ansTa);
      const applyAns = el('button', { class: 'btn primary block', onclick: async () => {
        try { const answer = JSON.parse(ansTa.value); await hostRoom.acceptAnswer(answer); statusPill.className = 'status-pill connecting'; statusPill.lastChild.textContent = 'Connecting…'; }
        catch (e) { toast('Bad answer JSON'); }
      }}, 'Accept answer');
      right.appendChild(applyAns);
      hostOutput.appendChild(left); hostOutput.appendChild(right);
      hostOutput.style.display = 'grid';
      /* global QRious */
      // eslint-disable-next-line no-undef
      new QRious({ element: qr, value: roomCode, size: 200, background: '#fff', foreground: '#0b0f17' });
    } catch (e) { toast('Could not create room: ' + e.message); hostBtn.disabled = false; hostBtn.textContent = 'Create room'; }
  });

  let guestRoom = null;
  guestBtn.addEventListener('click', async () => {
    const code = guestInput.value.trim();
    if (!code) { toast('Paste a room code first'); return; }
    guestBtn.disabled = true; guestBtn.textContent = 'Joining…';
    guestRoom = new GuestRoom({ onLog: m => console.log('[guest]', m) });
    try {
      const offerStr = decodeURIComponent(escape(atob(code)));
      const offer = JSON.parse(offerStr);
      const { room, answer } = await guestRoom.join(offer);
      const answerStr = JSON.stringify(answer);
      const answerCode = btoa(unescape(encodeURIComponent(answerStr)));
      statusPill.className = 'status-pill connecting'; statusPill.lastChild.textContent = 'Returning answer…';
      guestOutput.innerHTML = '';
      const left = el('div', {});
      left.appendChild(el('p', { class: 'small muted' }, 'Room')); left.appendChild(el('div', { class: 'copy' }, room));
      const qr = el('canvas'); left.appendChild(el('div', { class: 'qr' }, qr));
      left.appendChild(el('button', { class: 'btn block', onclick: () => copyToClipboard(answerCode).then(() => toast('Answer copied')) }, 'Copy answer for host'));
      const right = el('div', {});
      right.appendChild(el('p', { class: 'small muted' }, 'Share this answer with the host.'));
      right.appendChild(el('div', { class: 'copy', style: 'max-height:120px; overflow:auto;' }, answerCode));
      guestOutput.appendChild(left); guestOutput.appendChild(right); guestOutput.style.display = 'grid';
      // eslint-disable-next-line no-undef
      new QRious({ element: qr, value: answerCode, size: 200, background: '#fff', foreground: '#0b0f17' });
    } catch (e) { toast('Could not join: ' + e.message); guestBtn.disabled = false; guestBtn.textContent = 'Join room'; }
  });

  return screen;
}

/* ----- Stats screen (per-player stats grouped by scope) ----- */
async function renderStatsScreen(router) {
  const screen = el('section', { class: 'screen active' });
  screen.appendChild(el('h2', {}, 'Stats'));

  const history = getGameHistory();
  const players = listPlayers(history);

  if (players.length === 0) {
    screen.appendChild(el('p', { class: 'muted' }, 'No games played yet. Stats are saved on this device.'));
    screen.appendChild(el('div', { style: 'height:10px' }));
    screen.appendChild(el('button', { class: 'btn ghost', onclick: () => router.go('menu') }, '← Back'));
    return screen;
  }

  // Persist which player is selected across re-renders in this session.
  if (!renderStatsScreen._selected) renderStatsScreen._selected = players[0];

  // ----- Player picker -----
  const playerRow = el('div', { class: 'stats-player-row' });
  players.forEach(p => {
    const btn = el('button', {
      class: 'stats-player-chip' + (p === renderStatsScreen._selected ? ' selected' : ''),
      onclick: () => {
        renderStatsScreen._selected = p;
        router.go('stats');
      },
    }, p);
    playerRow.appendChild(btn);
  });
  screen.appendChild(playerRow);

  const playerName = renderStatsScreen._selected;
  screen.appendChild(el('h3', { class: 'stats-heading' }, `Player: ${playerName}`));

  // ----- Per-scope stat blocks -----
  const scopes = listScopes(history);
  const allScope = { type: 'all-time' };

  // Helper: render one stat block for a scope.
  function renderBlock(label, scope) {
    const s = computeStats(playerName, history, scope);
    if (s.games === 0) {
      // Skip empty scopes (except all-time which always shows)
      if (scope.type === 'all-time') {
        const empty = el('div', { class: 'card stats-block' });
        empty.appendChild(el('h4', {}, label));
        empty.appendChild(el('p', { class: 'muted' }, 'No games yet.'));
        return empty;
      }
      return null;
    }
    const block = el('div', { class: 'card stats-block' });
    block.appendChild(el('h4', {}, label));
    block.appendChild(el('div', { class: 'stats-summary' },
      `${s.games} game${s.games === 1 ? '' : 's'} · ` +
      `${s.matchesWon} match${s.matchesWon === 1 ? '' : 'es'} won · ` +
      `${s.legsWon}/${s.legsPlayed} legs won`
    ));

    // The stat table — 2 columns, metric name | value
    const tbl = el('table', { class: 'stats-table' });
    const tbody = el('tbody');

    const rows = [
      // Averages
      { section: 'Averages' },
      ['Average', fmt(s.average)],
      ['First 3 Average', fmt(s.first3Average)],
      ['First 9 Average', fmt(s.first9Average)],
      ['With Throw Average', fmt(s.withThrowAverage)],
      ['Against Throw Average', fmt(s.againstThrowAverage)],
      ['Max Average', fmt(s.maxAverage)],

      // High turns
      { section: 'High Turns' },
      ['180s', fmt(s.count180, { integer: true })],
      ['171s', fmt(s.count171, { integer: true })],
      ['170+', fmt(s.count170Plus, { integer: true })],
      ['140+', fmt(s.count140Plus, { integer: true })],
      ['100+', fmt(s.count100Plus, { integer: true })],

      // Checkouts
      { section: 'Checkouts' },
      ['Highest Checkout', fmt(s.highestCheckout, { integer: true })],
      ['Checkout 100+', fmt(s.checkout100Plus, { integer: true })],
      ['Checkout %', `${fmt(s.legsWonCheckoutPcnt)}%`],

      // Leg stats
      { section: 'Legs' },
      ['Legs Won %', `${fmt(s.legsWonPcnt)}%`],
      ['Best Leg (darts)', s.bestLegDarts > 0 ? fmt(s.bestLegDarts, { integer: true }) : '–'],
      ['Legs to 9', fmt(s.legsTo9, { integer: true })],
      ['Legs to 12', fmt(s.legsTo12, { integer: true })],
      ['Legs to 15', fmt(s.legsTo15, { integer: true })],
      ['Legs to 18', fmt(s.legsTo18, { integer: true })],
      ['Legs to 21', fmt(s.legsTo21, { integer: true })],

      // Throwing order
      { section: 'Throwing Order' },
      ['Legs Throwing First', fmt(s.legsThrowingFirst, { integer: true })],
      ['Legs Throwing Second', fmt(s.legsThrowingSecond, { integer: true })],
      ['% Legs Won Throwing First', `${fmt(s.legsWonFirstPcnt)}%`],
      ['% Legs Won Throwing Second', `${fmt(s.legsWonSecondPcnt)}%`],

      // Totals
      { section: 'Totals' },
      ['Number of Darts', fmt(s.numberOfDarts, { integer: true })],
      ['Total Points', fmt(s.totalPoints, { integer: true })],
      ['Nights Won', fmt(s.matchesWon, { integer: true })],
      ['Max Average of Matches', fmt(s.maxAverage)],
    ];

    for (const r of rows) {
      if (r.section) {
        const tr = el('tr', { class: 'stats-section-row' });
        tr.appendChild(el('th', { colspan: '2' }, r.section));
        tbody.appendChild(tr);
        continue;
      }
      const [label, value] = r;
      const tr = el('tr', {});
      tr.appendChild(el('td', {}, label));
      tr.appendChild(el('td', { class: 'stats-value' }, String(value)));
      tbody.appendChild(tr);
    }
    tbl.appendChild(tbody);
    block.appendChild(tbl);
    return block;
  }

  // All-time
  screen.appendChild(renderBlock('All-time', allScope));

  // Standalone games
  const standaloneBlock = renderBlock('Standalone games', { type: 'standalone' });
  if (standaloneBlock) screen.appendChild(standaloneBlock);

  // Leagues
  if (scopes.leagues.length) {
    screen.appendChild(el('h3', { class: 'stats-heading' }, 'Leagues'));
    scopes.leagues.forEach(ls => {
      const b = renderBlock(ls.name, { type: 'league', id: ls.id, name: ls.name });
      if (b) screen.appendChild(b);
    });
  }

  // Tournaments
  if (scopes.tournaments.length) {
    screen.appendChild(el('h3', { class: 'stats-heading' }, 'Tournaments'));
    scopes.tournaments.forEach(ts => {
      const b = renderBlock(ts.name, { type: 'tournament', id: ts.id, name: ts.name });
      if (b) screen.appendChild(b);
    });
  }

  // Matches (individual best-of-N contests outside of leagues/tournaments)
  if (scopes.matches.length) {
    screen.appendChild(el('h3', { class: 'stats-heading' }, 'Matches'));
    scopes.matches.forEach(ms => {
      const b = renderBlock(`Match ${ms.id}`, { type: 'match', id: ms.id });
      if (b) screen.appendChild(b);
    });
  }

  screen.appendChild(el('div', { style: 'height:10px' }));
  const back = el('button', { class: 'btn ghost', onclick: () => router.go('menu') }, '← Back');
  screen.appendChild(back);
  return screen;
}
