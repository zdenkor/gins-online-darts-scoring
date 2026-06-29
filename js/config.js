// =================================================================
// App-wide configuration.
//
// The Google OAuth Client ID is NOT configured here. It's set at
// runtime via the in-app setup screen (see js/auth/google.js +
// renderGoogleSetup in js/ui/screens.js). The Client ID is stored
// in localStorage and survives reloads but is per-device.
//
// Why? The Client ID is deployment-specific (different for GitHub
// Pages vs local dev vs a future custom domain). Letting the admin
// paste it via UI is friendlier than editing source + redeploying.
//
// To pre-configure a Client ID for a deployment (optional), set
// `window.GOOGLE_CLIENT_ID = '...'` in index.html before the app
// boots. The auth module checks this before falling back to
// localStorage.
// =================================================================

// OAuth scope. drive.file = access only to files the app itself creates
// in the user's Drive (incl. appDataFolder). User can revoke anytime.
export const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive.file openid email profile';

// Storage keys for tokens (stored in IndexedDB so they survive reload).
// Per Google's recommendation, do NOT put refresh tokens in localStorage
// or sessionStorage — IndexedDB is more durable and not readable by
// other origins.
export const GOOGLE_TOKEN_KEY = 'google-auth-tokens';
export const GOOGLE_USER_KEY = 'google-auth-user';

// Folder under appDataFolder where competitions live.
// (appDataFolder is a hidden Drive folder per user — only your app
// can read it. Standard pattern for PWAs that sync.)
export const DRIVE_FOLDER_COMPETITIONS = 'competitions';
export const DRIVE_FOLDER_MATCHES = 'matches';
export const DRIVE_FOLDER_HISTORY = 'game-history';
export const DRIVE_MANIFEST_FILE = 'manifest.json';

// Manifest schema version — bump when changing the JSON shape.
export const DRIVE_SCHEMA_VERSION = 1;