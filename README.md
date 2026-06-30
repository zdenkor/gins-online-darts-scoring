# Gin's Online Dart's Scoring System

A serverless, decentralized dart scoring web app. Three roles:
**Guest** plays standalone games. **Admin** signs in with Google and
manages competitions synced to their personal Drive. **Player** joins
a tournament on a separate device via QR code or password and plays
live against the admin's host.

No central server. No accounts. No tracking. Each admin's competitions
live in their own Google Drive `appDataFolder`. Peers connect peer-to-peer
via WebRTC.

- **Live**: https://zdenkor.github.io/gins-online-darts-scoring/
- **Latest**: v0.5.5 (compact one-line setup form, column-aligned strip header, removed Best-of mode toggles)
- **Repo**: https://github.com/zdenkor/gins-online-darts-scoring

---

## What's new in v0.5.5

- **Compact one-line setup form** — each option now renders as `Label: Value` on a single horizontal line (label muted small caps, value white big text) instead of a vertical label + button group. Examples: `LEGS TO WIN: First to 1`, `MODE: 501 · SI/SO`, `CHECKOUT HINTS: On`. Saves ~5 vertical lines per option group on the setup screen.
- **Column-aligned strip header** — the shared-history header row uses a 5-column grid (1fr × 5) matching the data rows below, with each label (`Scored` / `To go` / `Dart`) sitting directly above its corresponding data value with pixel-perfect x alignment. Labels changed from `${p1.name} scored` to just `Scored` since player names live in the scoreboard above.
- **Responsive `vh` font sizes** — strip header cells use `1.2vh`, data cells use `4vh` (no `cqh` resolving to px, no JS measurement). Scales linearly with viewport.
- **Removed Best-of / To-win mode toggles** — only the "first to" (to-win) mode is supported. Sets / Legs labels simplified to "Sets, First to" / "Legs, First to".

See `CHANGELOG.md` for the full release notes and prior versions.

---

## Game modes

- **01** (301 / 401 / 501 / 701 / 1001) with optional Double-Out, configurable legs and sets
- **Cricket** (15–20 + bull) with optional Cut-Throat
- **Shanghai** (1–N numbers in order, configurable target)
- **Online Room** (existing 1v1 WebRTC peer-to-peer room, no admin needed)
- **Tournament** (admin-driven, multi-peer, cross-device)

---

## Roles

### Guest (no sign-in)

- Play any game mode locally
- View Stats (local-only)
- "Join tournament" via QR / password — play in an admin's tournament from your phone
- All data stored locally on the device

### Admin (signed in with Google)

Everything a Guest can do, plus:

- Create / edit / copy / delete Competitions
- All competitions sync to your personal Google Drive `appDataFolder`
- Show a QR / 6-char code on your device; players scan / paste to join
- Start matches, finish matches, edit results from the bracket view
- Stats per player (across all competitions)
- Admin's device runs the game engine — peers see live state updates

### Player (joined via tournament)

- Receive game state from admin's device
- Enter turns via the calculator on your phone
- See your score, opponent's score, recent turns
- No sign-in required — fully anonymous

---

## Tournament flow

1. **Admin** creates a competition (single-elim, double-elim, or league)
2. **Admin** clicks "Player join" on the competition detail page → QR + 6-char code appears
3. **Player** taps "Join tournament" on the menu, enters their name, scans the QR (or pastes the code)
4. **Player** gets an answer code. Sends it back to admin via chat, voice, etc.
5. **Admin** pastes the answer in the join modal, clicks "Accept answer". Connection established.
6. **Admin** clicks "Play" on a specific match in the bracket → game starts on host device
7. **Player** sees live game state on their phone (scores, whose turn, recent turns)
8. **When it's the player's turn**, the calculator appears. Enter score → tap commit → event sent to admin's device.
9. **Admin's device** processes the event through its engine, broadcasts the new state to all peers.
10. **Player's phone** re-renders with the updated state.
11. **Match ends** → admin's host broadcasts `match-end` event → both sides see the winner.

Admin can also play on their own device (no QR needed for the admin). They click "Play" → game runs on host. They use the calculator on their own turns. They see the player's perspective for their slot.

---

## Project structure

```
index.html                       single-page app
manifest.webmanifest             PWA manifest
sw.js                            offline cache
lib/qrious.min.js                QR rendering (vendored from jsDelivr)
assets/dart.svg                  app icon
styles/main.css                  all styles

js/
  app.js                         bootstrap
  config.js                      OAuth client ID, Drive folder constants
  auth/
    auth.js                      local user accounts (admin)
    google.js                    Google Identity Services + PKCE
    sync.js                      Drive sync (push/pull, dirty queue)
  db/
    index.js                     IndexedDB + localStorage wrapper
  game/
    engine.js                    pure scoring engine (no DOM, deterministic)
    stats.js                     per-player stats aggregation
  competition/
    engine.js                    bracket / league generation + advancement
  net/
    rtc.js                       WebRTC HostRoom / GuestRoom (Online Room)
    tournament.js                TournamentHost / TournamentPeer
  ui/
    app.js                       bootstrap
    screens.js                   menu / setup / game / online / stats / competition views
    competition.js               competition list / bracket / league views
    calculator.js                calculator UI

tests/                           node:test unit + integration tests
  *.test.mjs                     test files (engine, stats, tournament, etc.)
  responsive-check.mjs           Playwright responsive validation (10 viewports)

release-notes/                   one .md per release
CHANGELOG.md                     cumulative changelog
VERSION                          current version (single source of truth)
```

---

## Running locally

Static site — no build step, no backend.

**Option 1: open `index.html` directly**

Works in any modern browser (Chrome, Edge, Firefox, Safari). PWA install + service worker + WebRTC ICE work best over HTTP.

**Option 2: serve over HTTP** (recommended)

```
cd "C:\Temp\Gin's Online Dart's Scoring System"
python -m http.server 5500
```

Then open <http://127.0.0.1:5500>.

**Option 3: VS Code Live Server**

Install the Live Server extension and click "Go Live" on `index.html`.

**Option 4: live deployment**

The repo is auto-deployed to GitHub Pages on every push to `main`. Visit the live URL above.

---

## Tests

```
npm test
```

Runs the Node test suite. 87+ unit tests covering:

- 01 scoring engine (legs, sets, double-out, bust rules)
- Cricket (mark accumulation, extra-mark scoring, win conditions, cut-throat)
- Shanghai (round progression, target filtering, winner selection)
- Calculator (state machine, fast-score buttons, undo)
- Stats (per-player aggregation across scope filters)
- Tournament flow (host + peer + engine integration via stubbed RTCPeerConnection)
- Competition bracket / league engine

**Responsive check:**

```
node tests/responsive-check.mjs
```

Uses Playwright to verify the menu / game UI fits across 10 representative viewports (iPhone SE, iPad, 1024×600, 1280×800, FHD, 4K, etc.).

---

## Tournament architecture

The tournament layer is fully decentralized:

- **Host** = admin's device. Runs the scoring engine. Manages N peer connections (one per player).
- **Peer** = player's device. Receives state from the host. Sends turn events to the host.
- **Connection** = WebRTC over a single reliable data channel per peer.
- **Signaling** = QR code + 6-char base64 code, exchanged manually between host and peer. No signaling server.
- **Replication** = engine is deterministic. Both sides run the same engine. Events flow host → peer and peer → host. State broadcasts reconcile divergence.
- **Storage** = admin's competitions live in admin's Google Drive `appDataFolder`. Player's local stats live on player's device.

```
   Admin's device (host)            Player's device (peer)
   ┌─────────────────┐               ┌─────────────────┐
   │ Running engine  │               │ Running engine  │
   │ ┌─────────────┐ │               │ ┌─────────────┐ │
   │ │ Submit turn │ │               │ │ Submit turn │ │
   │ └──────┬──────┘ │               │ └──────┬──────┘ │
   │        │        │               │        │        │
   │        ▼        │               │        ▼        │
   │ ┌─────────────┐ │               │ ┌─────────────┐ │
   │ │  Broadcast  │─┼──WebRTC event─┼─▶│   Replay    │ │
   │ └─────────────┘ │               │ └─────────────┘ │
   │                 │               │                 │
   │ ┌─────────────┐ │ ◀─WebRTC event─┼─┐  Calc       │ │
   │ │   Replay    │ │               │ │ commitTurn() │ │
   │ └─────────────┘ │               │ └─────────────┘ │
   └─────────────────┘               └─────────────────┘
```

---

## Google sign-in setup (for the admin)

The OAuth flow is lazy — only triggers when an admin tries to create a competition. Anonymous play (local games, online room, joining tournaments) works without any setup.

**How the admin sets up their Client ID:**

1. Open the app, tap "Set up Google sign-in" on the menu (or tap "Sign in with Google" — it auto-routes to setup if no ID is configured).
2. Visit https://console.cloud.google.com/ (one-time, ~10 minutes).
3. Create a project (or pick existing).
4. **Enable Google Drive API** on the project: APIs & Services → Library → search "Google Drive API" → Enable. (This is required for the `drive.file` scope to work — without it, sign-in fails with `access_denied` or `restricted_client` at the token exchange step.)
5. Configure the OAuth consent screen (External, add yourself as a test user, scope: `https://www.googleapis.com/auth/drive.file`).
6. Create OAuth client ID:
   - Application type: **Web application**
   - Authorized JavaScript origins: `https://zdenkor.github.io` (the deployed URL only — do NOT add localhost; sign-in is restricted to the production deployment)
7. Copy the resulting `xxx.apps.googleusercontent.com` string.
8. Paste it into the in-app setup screen, tap "Save and test".
9. The standard Google "Sign in with Google" consent popup appears. Approve.

The Client ID is stored in `localStorage` on that device only — it's not synced across devices. Each device where you want admin access needs the ID set once.

**Pre-configuring a Client ID for deployment** (optional):

Set `window.GOOGLE_CLIENT_ID = '...'` in `index.html` before the app boots. The auth module checks this before falling back to localStorage.

**Note on PKCE:** we don't use PKCE (no `code_verifier`/`code_challenge` exchange). Google Identity Services' CodeClient flow uses `redirect_uri: 'postmessage'` with a secure iframe, which provides equivalent security for SPA clients.

---

## Releases

See [GitHub releases](https://github.com/zdenkor/gins-online-darts-scoring/releases) for the full version history.

---

## License

Personal project. No license declared.