// =================================================================
// Google authentication using Google Identity Services (GIS).
// IMPLICIT FLOW (initTokenClient) — the access token is returned
// directly in the URL fragment. No token-exchange POST, no
// client_secret needed, no refresh token.
//
// Trade-offs vs. the Code Flow (initCodeClient):
//   + No client_secret required (works with "Web application"
//     OAuth clients without exposing a secret).
//   + Simpler — one step instead of two.
//   - Access tokens expire in 1 hour, no automatic refresh.
//     User has to sign in again when the token expires.
//   - Google has marked the implicit flow as "legacy" /
//     "deprecated" since 2023 but it still works as of 2026.
//
// For our use case (personal-use dart scoring app) the implicit
// flow is the simplest path that works with the OAuth client the
// admin can create in Google Cloud Console.
// =================================================================

import { GOOGLE_SCOPES, GOOGLE_TOKEN_KEY } from '../config.js';
import { put, get, del } from '../db/index.js';

// Client ID is resolved at runtime in this order:
//   1. localStorage `gindarts:google-client-id` (set by the admin via
//      the in-app setup modal — survives reloads, per-device only)
//   2. window.GOOGLE_CLIENT_ID (set by the deployment, optional)
//   3. Empty (signIn() throws, setup screen is shown)
const CLIENT_ID_STORAGE_KEY = 'gindarts:google-client-id';
export function getClientId() {
  try {
    const ls = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
    if (ls && ls.length > 0 && !ls.startsWith('REPLACE_ME')) return ls;
  } catch (_) { /* localStorage may be blocked */ }
  if (typeof window !== 'undefined' && window.GOOGLE_CLIENT_ID && !window.GOOGLE_CLIENT_ID.startsWith('REPLACE_ME')) {
    return window.GOOGLE_CLIENT_ID;
  }
  return '';
}
export function setClientId(id) {
  try {
    localStorage.setItem(CLIENT_ID_STORAGE_KEY, (id || '').trim());
  } catch (_) { /* ignore */ }
}
export function clearClientId() {
  try { localStorage.removeItem(CLIENT_ID_STORAGE_KEY); } catch (_) { /* ignore */ }
}

// Superadmin emails — configured at deploy time. Used to gate
// dev/admin tools (like the "Set up Google sign-in" screen) to
// specific Google accounts. Empty array = no superadmin.
export function getSuperadminEmails() {
  if (typeof window === 'undefined') return [];
  const list = window.SUPERADMIN_EMAILS;
  if (Array.isArray(list)) return list.map(s => String(s).toLowerCase().trim());
  return [];
}
export function isSuperadmin() {
  const me = _user?.email;
  if (!me) return false;
  const admins = getSuperadminEmails();
  return admins.includes(me.toLowerCase().trim());
}

// Lazy-load the GIS script so the page doesn't block on it.
let _gisPromise = null;
function loadGIS() {
  if (_gisPromise) return _gisPromise;
  _gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve(window.google);
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true; s.defer = true;
    s.onload = () => window.google?.accounts?.oauth2 ? resolve(window.google) : reject(new Error('GIS loaded but oauth2 missing'));
    s.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(s);
  });
  return _gisPromise;
}

// Token store — IndexedDB-backed (see db/index.js for the helpers).
async function saveTokens(t) { await put(GOOGLE_TOKEN_KEY, t, GOOGLE_TOKEN_KEY); }
async function loadTokens() { return await get(GOOGLE_TOKEN_KEY, GOOGLE_TOKEN_KEY); }
async function clearTokens() { await del(GOOGLE_TOKEN_KEY, GOOGLE_TOKEN_KEY); }

// Internal state. With the implicit flow, we only have an access
// token — no refresh token. When it expires, the user has to sign
// in again.
let _accessToken = null;
let _accessTokenExpiresAt = 0;
let _user = null;          // { id, email, name, picture } from Google
let _ready = null;         // promise resolving to whether the user is signed in

// Public: returns true when a Google session is active (and the
// access token is fresh). Await this once on app boot.
export async function isSignedIn() {
  if (_ready) return _ready;
  _ready = (async () => {
    const t = await loadTokens();
    if (!t || !t.access_token) return false;
    // Token not yet expired?
    if (t.expires_at && Date.now() < t.expires_at) {
      _accessToken = t.access_token;
      _accessTokenExpiresAt = t.expires_at;
      _user = t.user || null;
      return !!_user;
    }
    // Expired — clear and require re-auth.
    await clearTokens();
    return false;
  })();
  return _ready;
}

// Public: returns the current user profile (null if not signed in).
export function currentUser() { return _user; }

// Public: returns a fresh access token, throwing 'not-signed-in' if
// none is available. With the implicit flow we can't refresh; if
// the token is expired, the caller must re-trigger sign-in.
export async function getAccessToken() {
  if (!_accessToken || Date.now() >= _accessTokenExpiresAt) {
    throw new Error('not-signed-in');
  }
  return _accessToken;
}

// Public: trigger the GIS implicit-flow OAuth popup. Resolves once
// the user has a valid access token + profile. Rejects if the user
// closes the popup or the config is missing.
export async function signIn() {
  const clientId = getClientId();
  if (!clientId) {
    throw new Error('Google sign-in not configured. Tap "Set up Google sign-in" on the menu to paste your Client ID.');
  }
  const gis = await loadGIS();
  const client = gis.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: GOOGLE_SCOPES,
    callback: '', // set below — TokenClient requires a callback at init
  });

  // Implicit flow: the access token arrives in the callback's `resp`
  // object directly. No code, no token exchange POST, no secret.
  const tokenResp = await new Promise((resolve, reject) => {
    client.callback = (resp) => {
      if (resp.error) return reject(new Error(resp.error + (resp.error_description ? ': ' + resp.error_description : '')));
      if (!resp.access_token) return reject(new Error('no access token in response'));
      resolve(resp);
    };
    // No `prompt: 'consent'` here. With the implicit flow, that
    // would force the consent screen to show on EVERY sign-in.
    // Without it, Google shows consent the FIRST time the user
    // grants the scopes, and is silent on subsequent sign-ins
    // (just the account picker if needed).
    client.requestAccessToken();
  });

  _accessToken = tokenResp.access_token;
  // Implicit flow tokens are valid for ~1 hour. Set expiry to 1h - 1min
  // to be safe. If Google's expires_in isn't in the response, default
  // to 1 hour.
  const expiresIn = tokenResp.expires_in || 3600;
  _accessTokenExpiresAt = Date.now() + expiresIn * 1000 - 60_000;

  // Fetch the user profile.
  const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${_accessToken}` },
  });
  if (!profileRes.ok) {
    const text = await profileRes.text();
    throw new Error('profile fetch failed: ' + profileRes.status + ' — ' + text);
  }
  const profile = await profileRes.json();
  _user = { id: profile.id, email: profile.email, name: profile.name, picture: profile.picture };

  // Persist the access token + profile so we can restore on next
  // visit. Note: with implicit flow, there's no refresh token —
  // when the access token expires (in 1 hour), the user has to
  // sign in again.
  await saveTokens({
    access_token: _accessToken,
    expires_at: _accessTokenExpiresAt,
    user: _user,
  });

  _ready = Promise.resolve(true);

  // Notify the rest of the app so it can pull Drive data into the
  // local cache. Imported lazily to avoid a circular dep at module
  // load time (sync.js imports google.js which imports this).
  try {
    const sync = await import('./sync.js');
    const counts = await sync.pullAll();
    window.dispatchEvent(new CustomEvent('gindarts:drive-pulled', { detail: counts }));
  } catch (e) {
    console.warn('Drive pull after sign-in failed', e);
  }

  return _user;
}

// Public: sign out. Revokes the access token best-effort and clears
// local storage.
export async function signOut() {
  try {
    if (_accessToken) {
      await fetch('https://oauth2.googleapis.com/revoke?token=' + _accessToken, { method: 'POST' });
    }
  } catch (e) { console.warn('revoke failed', e); }
  _accessToken = null;
  _accessTokenExpiresAt = 0;
  _user = null;
  _ready = Promise.resolve(false);
  await clearTokens();
}

// Public helper: wrap a fetch call with the current access token.
// Throws 'not-signed-in' if there's no valid token.
export async function authedFetch(url, opts = {}) {
  const token = await getAccessToken();
  const headers = new Headers(opts.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...opts, headers });
}