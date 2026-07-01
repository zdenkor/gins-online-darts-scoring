# Changelog

All notable changes to Gin's Online Dart's Scoring System are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.7] - 2026-06-30

### Changed
- Settings icon (header): FontAwesome Classic Solid gear (CC BY 4.0).
- More-commands submenu: explanations hidden in help icons.
- Cursor-settings header button renamed to Settings, hosts full screen.
- Settings → Statistics: new "Checkout Statistic" toggle.
- Checkout-attempt modal: asks for darts aimed at close-out (gated by out rule).
- Old release notes: trimmed to short bullets.


Source of truth for the current version: `VERSION` and `package.json`.

## [0.5.6] - 2026-06-30

### Added
- Auto-fullscreen on game start.
- Redo action in the calculator.
- Restructured settings page (Display / Assistance sub-sections).
- Per-button font-size multiplier in `fitFontToFrame()`.

### Changed
- Calculator action row: 4 columns (Undo, Redo, SetScore, MoreCmds).
- Calc grid now uses total-entry for all in/out modes.
- Exit button glyph changed to ⏻ (U+23FB), font-size 2em.
- Max darts presets: 21, 36, 45, 51, 99, Custom.
- Toolbar info labels shortened.
- Auth buttons: all sizes responsive (em/vh/%, no px).
- Auth button SVGs sized to 80% of the button.

### Fixed
- Exit button font-size no longer scales the button itself.
- Auth button background / hover restored.
- Modal title ~30% larger; cmd-row label and description ~30% larger.

## [0.5.5] - 2026-06-30

### Changed
- Compact one-line setup form (label + value per row).
- Responsive strip header (column-aligned 5-column grid).
- Removed "Best of" / "To win" mode toggles.
- Sets / Legs labels simplified to "Sets, First to" / "Legs, First to".
- vh-based responsive fonts (no `cqh` resolving to px).
- Shared-history header aligned to data columns.

## [0.5.4] - 2026-06-30

Edit-history highlight, sticky history header, no row padding.

### Edit-history highlight
- Clicking a thrown value in the shared history strip now lights up the **editable cell** (column 1 = P1 thrown, column 4 = P2 thrown) with a green pulsing background and inset border. The remaining cells (column 2 = P1 remaining, column 3 = round dart-count, column 5 = P2 remaining) stay unchanged — only the cells that hold values the user is about to overwrite light up.
- Green uses the existing `--accent` token (`rgb(28, 194, 139)`) so the highlight fits the app's accent colour.
- Highlight is re-applied on every render so navigating back to the game after closing / opening a modal keeps the right cell lit.

### Sticky history header
- `.sh-header` is now `position: sticky; top: 0` inside the history strip — the column labels stay pinned at the top while the user scrolls through older rounds. Without this, the header scrolls off-screen together with the data rows and the user loses their reference for which number means what.
- `z-index: 1` keeps the header visually above the (borderless) data rows below.

### History row layout
- `.shared-history-row` lost its `padding: 0.4vh 2%`. Cells now span the full row width and rely on their own `text-align` (left / center / right) to position content within their column. The row's vertical sizing still comes from `min-height: 4vh` so the row never collapses below ~4% of the viewport.

### Auto-scroll for shared history
- After every render, the strip either pins to the bottom (if the user was already there) or preserves the user's scroll position (if they had scrolled up to read older rounds). This way new rounds auto-scroll into view without yanking the user away from their reading position.

## [0.5.3] - 2026-06-30

Calc compression, history natural order, shared-history scrolling, and auto-fullscreen.

### Calc compression
- Action buttons, numpad buttons and entered-display now share the same height (4.5vh floor) so the action row and numpad rows visually align. Heights are driven by `grid-auto-rows: 4.5vh` on `.calc-pad` and `.calc-actions`, plus matching `min-height: 4.5vh; max-height: 4.5vh` on the buttons themselves.
- The 10 % calc compression on short viewports is now applied via `vh` and `%` units only — no `px` in any layout rule. Button `font-size` uses `125%` (relative to parent) so it scales with the root font-size.
- `calc-pad gap` is tightened from `clamp(6px, 1.5vw, 10px)` to `4px` on `<640px` viewports so the bottom row clears the screen on 600-620px-tall displays.

### Shared history
- Round order is now oldest-at-the-top, newest-at-the-bottom (DOM order = visual order, `flex-direction: column`). The header row stays pinned at the top of the strip. Scroll-down reveals newer rounds, matching natural reading order.
- `max-height: min(45vh, 360px)` is the single cap across all viewports. The previous 30vh / 24vh media-query overrides are removed. `flex: 1 1 auto` lets the strip grow into any free space inside the game-screen grid, then scroll internally when its content overflows the cap.
- Scrollbar is hidden (`scrollbar-width: none` + `::-webkit-scrollbar { display: none }`) so the live-feed look is preserved.

### Responsive CSS conventions (documented)
- New `RESPONSIVE DESIGN CONVENTIONS` comment block at the top of `styles/main.css` documents the project rules: no hardcoded `px` for layout (use `%`, `vh`, `vw`, `min(vh, px)`, `clamp()`), exceptions for borders and touch-target min-heights, container queries over `@media (orientation)`, fluid font-scaling via container-relative units.
- Notes added at `.calc` and `.shared-history` rules reference the top-of-file conventions so future edits don't accidentally break them.

### Auto-fullscreen on game start
- `renderGame` attaches a one-shot listener to the game screen that captures the first user gesture (click, keypress, touch) and calls `requestFullscreen()` (with webkit/moz/ms prefixes). Browsers only allow `requestFullscreen` from a user-gesture handler, so the request happens silently on the first input.

### Toolbar compression
- `.game-toolbar` shrinks by ~10 % at every viewport: `padding` and `margin` switched from `px` to `0.55vh` / `1%`, `gap` from `8px` to `1.5%`, `font-size` from `100%` to `90%`. Toolbar height drops from ~64px to ~59px on a 620-tall viewport.

### Misc
- `.shared-history-row` no longer uses `font-size: 80%; padding: 1% 2%; min-height: 4vh` only — `font-size` is back to `100%` (relative to parent) so the row text reads at the same size as the rest of the UI; `min-height: 4vh` and `padding: 0.4vh 2%` keep the row compact.
- Header (`.sh-header`) uses `font-size: 70%` (smaller than data rows) and `padding: 0.8% 2%` so the column labels stay muted without competing with the data.

## [0.5.2] - 2026-06-29

Responsive layout fixes, debug overlay, and frame-aware font sizing.

### Calc button font — fits any frame
- Every calc button (`.calc-btn`, `.calc-action-btn`, `.calc-fast-btn`) now scales its `font-size` to exactly **60% of the smaller of its own width and height** ("60 percent is the size to the nearest frame border"). JS measures the button with a single `ResizeObserver` on the calc root and a one-shot `requestAnimationFrame` initial measurement (with a jsdom-safe fallback for the test environment). CSS `clamp()` is the fallback for the first frame before JS runs.
- Verified ratios at 1264×625: action buttons 345×38 → 23px font (61%), fast buttons 96×38 → 23px, numpad 274×36 → 22px. Layout changes (orientation flip, side-columns toggling, viewport resize) automatically recompute.

### Debug overlay — DevTools-style element inspector
- New settings card (Settings tile → Debug) with an **On/Off** segmented toggle (replaces the prototype checkbox — consistent with the rest of the app's touch-friendly toggle style).
- When enabled, hovering any element shows a floating dark-tinted label with:
  - the hovered element's `tag.class#id`
  - up to 3 ancestor rows prefixed with `↑` (DevTools breadcrumb style)
  - `width × height` and computed `font-size` on the last line
- Persisted in `localStorage.debugOverlay`. Pointer-events disabled on the label so it doesn't interfere with clicks. `mousemove` listener is throttled via `requestAnimationFrame`.

### Small-tablet fix (800×600, 1024×600)
- The calc favorites chips (26, 41, 45, 60, 81, 85, 100, 140) used to render in two side columns flanking the numpad at any viewport ≥ 500px. At small-tablet widths (800×600, 1024×600) this made the calc wider than the screen and clipped the strip and scoreboard.
- Bumped the breakpoint to **≥ 1000px** for the side-by-side layout. Below 1000px the favorites drop to the `phoneRow` of 8 chips below the numpad, which fits any width.

### Housekeeping
- Service worker cache bumped (`gin-darts-v0.5.1-debug2` → `gin-darts-v0.5.2`) so users pick up the new code without manual cache clearing.


## [0.5.1] - 2026-06-29

Shared-history strip hoisted to screen level, dartboard.svg external-file
cursor, cricket scorecard table, responsive strip columns (quintile 0/25/50/75/100),
and tablet/touch-friendly sizing.

### Added
- **Dartboard cursor from `assets/dartboard.svg`**: `js/ui/cursor.js` now reads the file URL directly into the CSS cursor value; no more inline hand-drawn SVG. Service worker (`sw.js`) caches the new asset.
- **Cricket scorecard table** on the Cricket game screen — a 4-column `Scored / To Go / × / Scored / To Go` grid with one row per cricket target (20, 19, 18, 17, 16, 15, BULL). Mirrors the shared-history strip layout for visual consistency. Active rows get the same green highlight. Implemented via `renderCricketScorecard()` in `js/ui/screens.js`.

### Changed
- **Shared-history strip relocated** from the scoreboard's middle column to a screen-level strip between the toolbar and the scoreboard. The scoreboard is now a clean 2-column grid (`1fr 1fr`) and the strip lives in the layout flow with the calc.
- **Strip column positions** use a `25fr 15fr 20fr 15fr 25fr` ratio so the data sits at the 0% / 25% / 50% / 75% / 100% quintile points — symmetric around the centered DART column at 50%. Replaces the previous `1fr auto auto auto 1fr` asymmetric layout.
- **Strip is larger and tablet-friendly**: `font-size: clamp(17px, 3.2vw, 24px)`, `padding: clamp(12px, 1.8vw, 20px) clamp(10px, 1.6vw, 18px)`, `min-height: 52px` touch target floor, and `max-width: var(--content-max)` so it matches the calc width.
- **Active-round highlight** in the strip: most recently played round (or first round when no throws yet) gets `rgba(28, 194, 139, 0.18)` background and the round dart-count cell uses `--accent` green.
- **Header row** in the strip: a `sh-header` row renders `"<P1> SCORED | TO GO | DART | <P2> SCORED | TO GO"` with the player names dynamically injected.
- **Calculator side columns** show the fast-score chips BESIDE the numpad at viewport widths ≥ 500px (was ≥ 721px). At 500-720px the chips render as proper flanking columns; at < 500px the phoneRow of 8 chips shows below the pad.
- **Short-viewport media queries** (max-height 850px and 700px) cap the strip height so the scoreboard and calc still fit on 600×800 portrait phones.


## [0.5.0] - 2026-06-28

Best-of / To-win mode toggle for sets & legs, shared x01 setup form
across single-game and competition, and history rendering fixes.

### Added
- **Best-of / To-win mode toggle** for both sets and legs in the
  x01 setup screen (single game + competition). Selecting "To win"
  swaps the preset list from {1, 3, 5, 7, 9} to {1, 2, 3, 5, 7};
  selecting "Best of" restores it. The engine always receives a
  consistent `legsToWin` / `setsToWin` count — the toggle only
  changes how the number is read on screen.
- **`x01GameOptionsControls()`** in `js/util/helpers.js` — shared
  builder used by both the standalone x01 setup screen and the
  competition-setup "Game options" block. Single source of truth
  so the two forms stay in sync.
- **`capButtonRow.wrap.setPresets(newPresets)`** — runtime preset
  swap, used by the Best-of / To-win toggles.
- **Per-column click handlers in history rows** — clicking a
  thrown value in the left column now edits that player's entry,
  not always the first thrower (previously always edited P1).

### Changed
- **Sets/Legs labels**: `Sets to Win` / `Legs to Win` (was `Sets/Match`
  / `Legs/Set`). Sets row is hidden when the count is 1; Legs row
  is always shown (`Best of (legsToWin × 2 - 1)`).
- **History rows now mirror scoreboard layout**: P1 (left) | P1
  remaining | round (center) | P2 (right) | P2 remaining, with
  numbers pointing outward toward the round indicator.

### Fixed
- **`computeRemaining()`** in `renderSharedHistory` was iterating
  over the raw round-pair (`[entry, entry?]`) but reading `e.by`
  directly — `e.by` on an Array is `undefined`, so the score was
  never applied and the remaining column always showed the starting
  score. Now extracts the per-player entry via
  `pair.find(e => e.by === playerName)`.
- **History `by` field was assigned to the wrong player** —
  `by: game.players[game.current]?.name` ran after
  `submitTurnTotal01` / `throwDarts01`, which had already advanced
  `current` to the next thrower. Captures the thrower's name BEFORE
  the engine call now.
- **Setup screen player-remove (✕)** — `state.players.forEach((name,
  i) => onclick = () => splice(i, 1))` shared a single `i` reference
  across all ✕ handlers; clicking any ✕ always removed the last
  player. Captured `i` into a per-iteration `const idx`.
- **`redrawPlayers()` was called outside its IIFE**, leaving
  `state` out of scope (latent ReferenceError). Moved inside.
- **`legs.setPresets` is not a function** — `capButtonRow` returns
  `{ wrap }`, so `setPresets` lives on `wrap`, not on the wrapper
  object. Fixed at both call sites in `x01GameOptionsControls`.

## [0.4.1] - 2026-06-27

Reworked x01 variations into independent In/Out toggle rows.

### Changed
- Replaced the single Game Variation toggle with separate **In** and
  **Out** toggle rows (SI/DI/TI/MI and SO/DO/TO/MO). Tapping a selected
  button turns it off — with nothing selected the game is free (any in,
  any out).
- `submitTurnTotal01()` allows total-entry for free play and double-out;
  other combinations require per-dart input.

## [0.4.0] - 2026-06-27

Added full x01 in/out game variations and per-dart input support.

### Added
- **x01 in/out rules:** two independent toggle rows for **In** (SI, DI,
  TI, MI) and **Out** (SO, DO, TO, MO). Tap a selected button again to
  turn it off — with nothing selected you can use anything.
- **Per-dart x01 grid** for any variant that requires dart-level
  validation (DI/TI/MI in, DO/TO/MO out).
- **`X01_IN_OPTIONS`, `X01_OUT_OPTIONS`, and `x01InOutFlags()`** in
  `js/game/engine.js` to centralize in/out metadata and rule flags.
- **Variation-aware checkout hints** in `checkoutSuggestions()` that
  respect DO/TO/MO rules and hide hints while a player still needs to
  open scoring in DI/TI/MI modes.
- Engine tests for double-in, master-out, triple-out, and ignored
  total-entry in per-dart-only variants.

### Changed
- Replaced the old "Double-out required" checkbox on the standalone
  x01 setup screen (`js/ui/screens.js`) and the competition setup form
  (`js/ui/competition.js`) with **In / Out toggle rows**.
- Moved the reusable `toggleRow` segmented control into
  `js/util/helpers.js`.
- Scoreboard now shows the selected variation label next to the start
  score (e.g. `501 · DIDO`).
- `submitTurnTotal01()` now rejects total-entry turns for per-dart-only
  variations; DO and Straight still allow total entry.

### Internal
- Bumped version stamps to 0.4.0 across all project files.

## [0.3.4] - 2026-06-27

Added inline help icons to the game setup screen and made the help system
usable across the app.

### Added
- **Help icons on the setup screen.** Each main option now has a small
  inline ⓘ icon that opens a modal explanation when tapped:
  Players, Starting score, Double-out, Legs to win, Max darts per leg,
  Checkout hints, Cut-throat Cricket, and Shanghai rounds.
- **`helpIcon()` helper in `js/ui/help.js`.** Builds a small help-icon
  button that opens a modal with the provided topic and text/HTML.

### Changed
- `buttonRow()` and `capButtonRow()` in `js/util/helpers.js` now accept
  a DOM node as a label, enabling labels that contain inline help icons.

### Internal
- Bumped version stamps to 0.3.4 across all project files.

## [0.3.3] - 2026-06-27

Removed the Dart custom cursor style and fixed the default pointer so
it stays consistent over text and interactive elements.

### Removed
- **Dart cursor style** from `js/ui/cursor.js` and the cursor settings
  modal. Only Default, Target, and Crosshair remain.

### Changed
- Default cursor style is now the system **default** pointer instead
  of the Dart SVG.
- Default cursor value is set to `default` so the pointer does not
  switch to the text caret when hovering over text.

### Internal
- Updated version stamps across `VERSION`, `package.json`,
  `package-lock.json`, `index.html`, `sw.js`, and `README.md`.

## [0.3.2] - 2026-06-26

Custom cursor with responsive sizing and per-user settings synced to
Google Drive.

### Added
- **Custom cursor module `js/ui/cursor.js`.** Inline SVG cursors with
  three styles (Default, Dart, Crosshair) and five sizes (Auto,
  Small 20px, Medium 28px, Large 40px, XL 56px). Auto size selects a
  size based on the smaller of viewport width/height.
- **Header settings icon.** A gear icon sits next to the sign-in /
  sign-out icons and opens a quick "Cursor settings" modal.
- **Cursor settings modal.** Style and Size rows use the existing
  touch-friendly `buttonRow()` segmented control. Changes apply
  immediately to the live cursor.
- **Local persistence.** Cursor settings are saved to the existing
  IndexedDB `settings` store under the key `cursor`, so they survive
  reloads even when not signed in.
- **Google Drive sync.** When signed in, settings are uploaded to
  `gins-darts/settings/cursor.json` in the user's hidden
  `appDataFolder`. On app boot (after Google session restore), the
  latest settings are pulled from Drive so the cursor stays
  consistent across devices.

### Changed
- **Default body cursor is now the Dart style** with responsive
  breakpoints (24 / 32 / 40px) in `styles/main.css`. JavaScript
  overrides it once the cursor module loads.

### Internal
- `js/app.js` now calls `initCursor()` early during boot and pulls
  cursor settings from Drive after the app shell mounts.
- `js/ui/screens.js` exports a new `openCursorSettings()` flow and
  adds the settings gear icon in `updateHeader()`.

## [0.3.1] - 2026-06-26

Touch-friendly segmented controls, flexible registration numbers,
local SVK license cache, and DB field for name suffixes.

### Added
- **`buttonRow()` helper in `js/util/helpers.js`.** Segmented control
  with 44px+ tap targets, rounded corners, and a clearly visible
  selected state. Used wherever the user picks one of a few options.
- **Touch-friendly button rows replace native `<select>`** across
  the project for short lists: Elimination Format, Game mode,
  Starting score, Legs to win, Max darts per leg, Rounds (Shanghai),
  Seeding, Number of groups, Players advancing per group, Number
  of teams, Legs per set, Sets per match.
- **x01 starting scores 121 and 170.** The available scores are now
  121 / 170 / 301 / 501 / 701 / 901 (was 301 / 401 / 501 / 701 /
  1001).
- **Local `svk_players` IndexedDB store.** The admin can paste the
  full SVK license list once into Settings → Import SVK license
  list and the app stores it locally so player-picker lookups work
  offline + no CORS. Schema: `{ svkId, setDartsId, name, surname,
  firstName, town, club }`. `DB_VERSION` bumped 3 → 4.
- **Online SVK lookup via CORS proxy chain.** `lookupPlayerOnSVK`
  in `js/auth/svk.js` now tries a fallback chain (corsproxy.io →
  api.allorigins.win → cors-anywhere.herokuapp.com). If a proxy
  succeeds, the portal HTML is parsed and rows returned. If all
  proxies fail, the local cache is used.
- **Name suffixes field on `players` schema.** `savePlayer({
  ..., nameSuffixes })`. `formatPlayerName` now appends the suffix
  after middle name (e.g. "Slovák, Ján ml. Jr.").
- **`parseRegNumber(input)` returns `{ clubCode, separator, serial,
  full }`.** `separator` can be `#`, `.`, `-`, `?`, or `""`.

### Changed
- **Game mode `'01'` renamed to `'x01'`** across the project (engine,
  stats, screens, store, tests, competition.js). Matches the dart
  community's "x01" convention for 301/501/etc.
- **regNumber accepts any non-alphanumeric separator or none.**
  Pattern changed from `^[A-Z]+#\d{6}$` to `^[A-Z]+[^A-Z0-9]?\d{6}$`.
  Examples accepted: `NR#100298`, `NR.100298`, `NR-100298`,
  `NR100298`, `SVK003112`.
- **New-competition form refactored to three orthogonal dimensions:**
  1. **Type** — Tournament | League
  2. **Participant Format** — Singles | Doubles | Teams
  3. **Elimination Format** — Single elim | Double elim | Round
     robin | Double RR | RR → KO
- **Form order:** Name → Elimination Format → Season → Round →
  Notes → Type → Participant Format (Type + Participant Format
  moved below Notes per user feedback).
- **Selected button gets green text** in Type / Participant Format /
  Elimination Format rows (`.btn.kind-selected` CSS).
- **Dropdowns now use dark background + light text** for readability
  (`.dropdown-readable` CSS rule). Selected option inside the
  dropdown also gets the dark theme.

### Fixed
- **Player picker is a scrollable grid** (`max-height: 360px;
  overflow-y: auto`) with **substring search** (case-insensitive
  across surname + firstName + middle + nameSuffixes). Typing
  "eme" matches all surnames containing "eme".
- **Participants grid** for picked players. Each card has a red ✕
  delete button (`.participant-delete` CSS, color `#ff5577`).
- **Copy competition** prompts for new season and copies all
  metadata (kind/season/round/volume/notes → new fields).
- **`select()` helper in `js/ui/competition.js`** now accepts
  `{ value, label }` objects for option lists (was strings only).

### Internal
- **`showFatalError` no longer fires for SVK lookup fetch failures.**
  A one-shot capture-phase listener suppresses the red banner
  specifically during SVK proxy chain attempts.

## [0.1.2.0] - 2026-06-24

Add Settings screen, superadmin role, pre-configurable
Client ID. New admin experience: open app, use it.

### Added
- **`window.GOOGLE_CLIENT_ID` and `window.SUPERADMIN_EMAILS`
  in `index.html`.** Pre-configure these at deploy time to skip
  the setup screen and gate admin tools to specific Google
  accounts.
- **Settings screen** (`/settings` route). One place for sign-in,
  Client ID setup, app info, sign-out. Replaces the two tiles
  that used to clutter the main menu.
- **Superadmin role.** `googleAuth.isSuperadmin()` returns true
  if the signed-in email matches `window.SUPERADMIN_EMAILS`.
  Used to gate the Client ID setup section in Settings.
- **`getSuperadminEmails()` and `isSuperadmin()` exports**
  in `js/auth/google.js`.

### Changed
- **Removed "Sign in with Google" and "Set up Google sign-in"
  tiles from the main menu.** The Settings tile replaces them.
- **Updated README** with the new deploy-time configuration
  pattern.

## [0.1.1.0] - 2026-06-24

Rewrite Google Drive sync to use a flat file layout.

The previous code tried to create subfolders under
`appDataFolder`, but Drive API v3 doesn't support that:
`parents: ['appDataFolder']` is only valid when creating FILES,
not folders. The 403 errors at the token exchange step and the
404 / "undefined in parents" errors at sign-in came from this.

### Changed
- **Flat file layout.** All files live directly in
  `appDataFolder`. Names use a `scope__id.json` convention:
    - `competitions__<id>.json`
    - `matches__<competitionId>__<matchId>.json`
    - `game-history__<competitionId>__<matchId>.json`
    - `manifest.json`
- **Removed `getOrCreateFolder`** entirely. Subfolders aren't
  needed; the name prefix is enough to identify the scope.
- **`listByPrefix`** uses `name >= 'X' and name < 'X~'` query
  (Drive's range query) — same effect as `startsWith` but a
  proper Drive query.
- **Better error messages** on every Drive call: includes the
  response body when the request fails.
- **Added `pushMatch(competitionId, match, history)`** for
  per-match updates (vs pushing the whole competition).

## [0.1.0.9] - 2026-06-24

Add visible error banner so users see the actual JS error
instead of a black screen.

### Added
- **`showFatalError` in `js/app.js`.** Catches uncaught errors
  and unhandled promise rejections, renders a fixed red banner
  at the top of the page with the error message + stack trace.
- **`mountApp` wrapped in try/catch.** Boot errors that escaped
  the previous error-swallowing try/catch blocks are now
  displayed instead of silently failing.

If you're seeing a black screen, hard-reload (Ctrl+Shift+R)
and you'll see the actual error message at the top of the
page. Paste it back to me so I can fix it.

## [0.1.0.8] - 2026-06-24

Make IDB openDB() resilient to failures.

If a user's IDB upgrade fails (e.g. corrupt DB from a previous
version), the cached promise was failing forever. Now we clear
the cache on error so the next call can retry, and log a clear
warning to the console.

If your browser is showing a black screen after upgrading, the
fix is: open DevTools (F12) → Application → Storage → "Clear
site data" → reload. The app will boot fresh.

## [0.1.0.7] - 2026-06-24

Add google-auth-tokens store to the IndexedDB schema.

The previous version (v0.1.0.6) tried to read/write Google
OAuth tokens to IndexedDB on every page load, but the DB schema
(version 1) didn't define a `google-auth-tokens` object store.
This produced a console error on every page load:

    NotFoundError: Failed to execute 'transaction' on 'IDBDatabase':
    One of the specified object stores was not found.

Sign-in still worked (the error was caught and swallowed by
`restoreSession`), but the error polluted the console and
looked scary.

### Fixed
- **Added `google-auth-tokens` store to the IndexedDB schema.**
  Bumped `DB_VERSION` from 1 to 2. Existing users get an
  `onupgradeneeded` event that creates the new store.
- **Store has no inline keyPath.** The auth code passes
  `GOOGLE_TOKEN_KEY` as the explicit key when calling `put`/`get`/
  `del`. This keeps the stored value a plain object (no synthetic
  `key` property).
- **`put(storeName, value, key)`** now accepts an optional key
  for stores without keyPath. Existing callers (with keyPath) are
  unaffected.

## [0.1.0.6] - 2026-06-24

Switch Google sign-in from code flow to implicit flow.

The previous code-flow approach (`initCodeClient`) required a
`client_secret` in the token-exchange POST, but the OAuth client
Google Cloud Console creates for SPAs is missing that secret.
This made sign-in fail with:

    {error: "invalid_request", error_description: "client_secret is missing."}

### Changed
- **`initCodeClient` → `initTokenClient`.** The implicit flow
  returns the access token directly in the popup callback. No
  token-exchange POST, no client_secret, no refresh token.
- **No more refresh token.** Access tokens are valid for 1 hour.
  When they expire, the user has to sign in again. Acceptable
  for a personal-use app.
- **`isSignedIn` simplified.** Loads the stored access token,
  checks expiry, returns true/false. No silent refresh attempt.
- **`getAccessToken` throws on expiry** instead of trying to
  refresh. The UI catches this and re-prompts for sign-in.
- **Toast errors** (`js/util/helpers.js`) now support a `kind:
  'error'` option that makes them stay visible for at least 6s
  and adds a red color. Used by the sign-in error toasts so the
  full message is readable.

### Trade-offs
- Pro: works with the OAuth client Google Cloud Console gives
  you out of the box, no secret in source.
- Pro: simpler code, fewer moving parts.
- Con: re-auth every hour (or whenever the token expires).
- Con: Google has marked implicit flow as "legacy" since 2023
  but it still works as of 2026.

## [0.1.0.5] - 2026-06-24

Better setup instructions. Most common cause of token exchange
failure is forgetting to enable Google Drive API.

### Changed
- **Setup screen and README** now explicitly call out: enable
  Google Drive API on the project before configuring OAuth.
  Without it, the token exchange fails with `restricted_client`
  or `access_denied`.

## [0.1.0.4] - 2026-06-24

Fix Google sign-in token exchange by removing broken PKCE code.

### Fixed
- **Token exchange failed** on Google sign-in. The previous code
  computed a `code_verifier` and sent it in the token-exchange
  POST body, but the `initCodeClient` doesn't let you pass a
  matching `code_challenge` to the authorize URL. So Google's
  token endpoint saw the verifier but no matching challenge
  existed → rejected with `invalid_grant`.
- Dropped PKCE entirely. GIS's CodeClient uses
  `redirect_uri: 'postmessage'` with a secure iframe, which
  provides equivalent security for SPA clients. The verifier /
  challenge helpers are kept in the file (prefixed with `_`) for
  future non-GIS providers.
- **Better error messages.** The token-exchange failure now
  includes the response body from Google's token endpoint, not
  just the HTTP status code.

### Files
- `js/auth/google.js` — removed broken PKCE, expanded error
  messages on token exchange and refresh failures.
- `README.md` — note on PKCE.

## [0.1.0.3] - 2026-06-24

In-app Google Client ID setup screen. The consent popup now
shows every time.

### Added
- **`renderGoogleSetup` screen** at `/google-setup`. Lets the admin
  paste their Google OAuth Client ID via UI instead of editing
  source. The Client ID is stored in `localStorage` (per-device,
  survives reloads).
- **`getClientId` / `setClientId` / `clearClientId`** in
  `js/auth/google.js`. Resolves the Client ID at runtime in this
  order: localStorage → `window.GOOGLE_CLIENT_ID` → empty.
- **`prompt: 'consent'`** on the OAuth init. Forces Google to show
  the consent popup every time AND ensures a refresh_token is
  returned every time (without it, Google only issues refresh
  tokens on first auth).
- **"Set up Google sign-in" tile on the menu.** Sits alongside the
  existing "Sign in with Google" tile. If the user clicks "Sign in
  with Google" but no Client ID is configured, they get
  auto-routed to the setup screen.
- **README updated** with the new setup flow.

### Files
- `js/auth/google.js` — runtime Client ID resolution, prompt=consent.
- `js/ui/screens.js` — `renderGoogleSetup`, "Set up Google sign-in"
  tile on the menu, auto-route on missing Client ID.
- `js/ui/competition.js` — "+ New competition" sign-in modal
  also auto-routes to setup if missing.
- `js/config.js` — removed the `GOOGLE_CLIENT_ID` placeholder
  export (it's no longer used).
- `README.md` — new setup flow documented.

## [0.1.0.2] - 2026-06-24

Fix menu sign-in to use Google OAuth (was routing to legacy
username + password form).

### Fixed
- **Menu's "Sign in" tile now triggers Google sign-in directly**
  instead of navigating to the legacy username + password form.
  Previously the menu showed a "Sign in" tile that took users to
  `renderLogin` — a local username + password screen with a default
  `admin / admin` account. That was the old app's sign-in, not the
  Google OAuth sign-in added in v0.0.0.6.
- The "+ New competition" button on the competitions screen still
  shows the Google sign-in modal (unchanged).

### Files
- `js/ui/screens.js` — the menu's Sign in tile now calls
  `googleAuth.signIn()` directly.

## [0.1.0.1] - 2026-06-24

Admin can finish / edit matches, and admin's device works as a player device.

### Added
- **Finish match button.** On the bracket and league views, in-progress
  matches have a "Finish" button that opens a dialog asking for the
  winner. The match is marked complete with the chosen result, the
  bracket is advanced, and (if signed in) the match is pushed to Drive.
- **Edit result button.** Completed matches have an "Edit result" button
  that lets the admin override the winner — useful when the engine
  recorded the wrong result or the players disagree on the outcome.
- **Back to admin link.** When the admin is in a game started from a
  competition, a small "← Back to admin view" link at the bottom of
  the game view navigates back to the bracket / league view without
  quitting the game (the engine keeps running, peers stay connected).
- **`game.competitionType` on the engine state.** Was missing —
  needed for the back-to-admin navigation to know whether to route
  to `bracket` or `league`.
- **Comprehensive project README** at the repo root. Covers roles
  (Guest / Admin / Player), tournament flow, project structure,
  Google sign-in setup, and the release history.

### Files
- `js/ui/competition.js` — `openMatchResultDialog` for bracket +
  league (group + KO) matches. Renders Finish / Edit buttons on
  each match card.
- `js/ui/screens.js` — back-to-admin link + `game.competitionType`.
- `README.md` — full project documentation.

## [0.1.0.0] - 2026-06-24

**Major release.** Decentralized tournament play end-to-end.
Players on their phones can now play a full match against the
host on another device. Stats, sign-in, and tournament
management are all in production. 87/87 unit + 10/10 viewports
pass.

### Added (cumulative since v0.0.0.5)
- **Per-player stats screen** with 20+ metrics, scope filters
  (all-time / standalone / per-league / per-tournament /
  per-match). 8 new tests.
- **Google sign-in + Drive sync** for competition management.
  Admin signs in with Google; their competitions live in
  their Drive `appDataFolder`. Edit / Copy / Delete buttons
  on the competition list. Best-effort sync on every write.
- **Tournament WebRTC layer** (`js/net/tournament.js`):
  new `TournamentHost` and `TournamentPeer` classes for
  multi-peer serverless connection. 4 new tests.
- **Player join UI**: admin's "Player join" button on
  competition detail page opens a modal with QR + 6-char
  code. Player's "Join tournament" tile on the menu. URL-hash
  auto-fill for shareable links.
- **Live engine event sync** during play. Both sides run the
  same engine (verified deterministic by tests); events are
  exchanged over WebRTC. The host broadcasts state updates
  on every peer-driven mutation.
- **Match-end broadcast**: when the engine sets a winner, the
  host broadcasts `{ type: 'match-end' }` so all peers
  immediately see the winner on their UI.
- **Reconnect support**: a peer that disconnects can rejoin
  via the same flow; the host sends them the current state.
- **Player's live game view**: scores, whose turn, recent
  turns (last 8), calculator on their turn.
- **17 new tests**: 4 engine-replication + 4 tournament-net
  + 7 tournament-flow + 2 stats-screen. The tournament-flow
  tests pair a real `TournamentHost` and `TournamentPeer` via
  a stubbed `RTCPeerConnection` and verify that turn events
  flow through, the engine applies them, state broadcasts
  reach the peer, and both engines stay in sync.

### Files changed (cumulative since v0.0.0.5)
- `js/app.js` — Google session restore on boot
- `js/auth/google.js` — new (GIS + PKCE)
- `js/auth/sync.js` — new (Drive sync + dirty queue)
- `js/config.js` — new (OAuth client + Drive folder constants)
- `js/game/engine.js` — engine returns `{ darts, isLegWin,
  isCheckout }` from each `submitTurn*` call
- `js/game/stats.js` — new (per-player stats module)
- `js/net/tournament.js` — new (TournamentHost + TournamentPeer)
- `js/ui/competition.js` — `openTournamentJoinModal`,
  `attachGameToTournamentHost`, Edit/Copy buttons, Drive push
- `js/ui/screens.js` — Stats screen rewrite, tournament
  broadcast in `commitTurnTotal` / `endCricketTurn`, match-end
  broadcast, player's live game view, `renderJoinTournament`
- `js/util/store.js` — `recordGameHistory`, `getGameHistory`
- `styles/main.css` — stats screen + auth row styles
- `tests/engine-replication.test.mjs` — new
- `tests/tournament-net.test.mjs` — new
- `tests/tournament-flow.test.mjs` — new

### Limitations
- **1v1 only** — single-elim 2-player matches work. Leagues
  with 3+ players per match aren't supported.
- **No per-dart entry on player** — they enter a per-turn
  total. Cricket per-dart entry only works on the host.
- **Player can only submit turns** — no undo, no end-leg,
  no switch-thrower from the player side. The host has
  full control.
- **No reconnect UI** — if a peer's connection drops, they
  need to rejoin manually. Once they rejoin, they get the
  current state.
- **STUN only** — same-network works great; cross-network
  may have issues without a TURN server.

## [0.0.0.9] - 2026-06-24

Wire the engine to the tournament net layer. Players can now
actually play together across devices — not just connect.

### Added
- **Engine event broadcast on host.** `commitTurnTotal` (X01 /
  Shanghai) and `endCricketTurn` (Cricket) now broadcast each
  action to all connected tournament peers via the host's
  `broadcastEvent` method.
- **Engine event application on host.** When a peer sends a
  turn event, the host's `onEvent` callback applies the same
  action to its local engine via `submitTurnTotal01` /
  `submitTurnCricketMarks`. Both sides' engines stay in sync
  because the engine is deterministic (verified by
  `tests/engine-replication.test.mjs`).
- **Game state broadcast.** When a peer event mutates the
  engine, the host broadcasts the new full state to all peers
  via `host.broadcast({ type: 'state', ... })`.
- **Initial state on join.** When a peer joins, the host sends
  them the current game state. If the game hasn't started yet,
  the host sends a "no game" state with a waiting message.
- **Player's live game view.** When the player receives a
  state message, their UI transitions from the join form to a
  live game view that shows: their opponent's name, both
  scores, whose turn it is, recent turns (last 8), and — if
  it's their turn — a calculator.
- **Player's calculator.** When it's the player's turn, the
  calculator is shown. On commit, the player sends
  `{ type: 'turn', total, by: myName }` to the host.
- **`onJoinRequest` hook in `TournamentHost`.** Fires when a
  peer sends a `join-request`; the host's UI uses it to push
  the current game state to the new peer.

### Files
- `js/net/tournament.js` — adds `onJoinRequest` hook + the
  "no game running" fallback message.
- `js/ui/competition.js` — adds `attachGameToTournamentHost`
  that wires the host's `onJoinRequest` and `onEvent` to the
  active game.
- `js/ui/screens.js` — adds tournament broadcast in
  `commitTurnTotal` / `endCricketTurn`, attaches the
  tournament host in `renderGame`, and the player's live
  game view in `renderJoinTournament`.

### Limitations
- 1v1 only. The single-elim bracket has 2-player matches,
  so this works for the common case. League/group play with
  3+ players per match isn't supported.
- No reconnect on disconnect. If a peer's connection drops,
  they need to rejoin from the start.
- No per-dart entry on the player device — they enter a
  per-turn total like the existing calculator. Cricket
  per-dart entry only works on the host.
- Player can't undo, end leg, or switch thrower — only
  submit a turn. The host has full control.
- The host's `_handlePeerMessage` for `event` messages
  applies the action then re-broadcasts the full state. If
  the host's engine rejects the event (e.g. bust), the
  rejection state IS sent to peers (the engines diverge
  in the same way, so they stay in sync).

## [0.0.0.8] - 2026-06-24

Tournament player-join UI: connect players' devices to a host
via WebRTC. Players on their phones can join a competition
hosted on another device.

**Connection flow works end-to-end. In-game score sync is
in v0.0.0.9.**

### Added
- **"Player join" button** on the bracket view and league view.
  Opens a modal showing the 6-character room code, a QR code,
  and a paste-box for the SDP answer returned by the player.
  One player joins at a time. Each "Player join" click
  generates a fresh SDP offer for the next player.
- **"Join tournament" tile on the menu** — for players on
  their phones. They enter their name, paste the host's code
  (or scan the QR), and get back an answer code to share with
  the host. The host pastes it into the "Player join" modal
  to complete the connection.
- **Auto-fill from URL hash** — `#join=eyJ...` in the URL
  pre-fills the code field. Lets admins share a link to
  players via chat.
- **Singleton `TournamentHost` per competition** — stays alive
  across screen navigations. Re-used if the admin re-opens
  the same competition; replaced if they switch competitions.
- **QRious** for QR rendering (already vendored in
  `lib/qrious.min.js` for the existing Online Room).

### Files
- `js/ui/competition.js` — adds `openTournamentJoinModal`
  + the bracket/league "Player join" buttons + helper
  `renderQRCode` wrapper around the global `QRious`.
- `js/ui/screens.js` — adds `renderJoinTournament` screen
  and the `join-tournament` route on the menu.

### What's still in v0.0.0.9
- Wire the engine: when a player sends a turn event, the
  host applies it to its engine and broadcasts state back.
- The "Your turn" indicator on the player side will become
  real (currently just shows "Connected — waiting").
- Reconnect on disconnect.
- More than 1 player per match (in single-elim bracket
  flow, the player-side is currently designed for 1v1).

## [0.0.0.7] - 2026-06-24

Tournament WebRTC infrastructure: rebuild the player-join layer
from scratch with multi-peer support and deterministic engine
replication. **No user-visible changes yet** — the UI for player
join / game view lands in the next release.

### Added
- **`js/net/tournament.js`** — new module. Two classes:
  - `TournamentHost` — runs on the admin's device. Manages N
    peer connections (one per player joining). Generates a
    6-character room code; creates an SDP offer for each new
    player; broadcasts events to all peers; sends full state
    on demand.
  - `TournamentPeer` — runs on a player's device. Connects to
    one host via the offer/answer dance. Receives events and
    state; sends player actions back.
- **Deterministic engine replication** — verified by tests.
  Two independent `new01` engines given the same sequence of
  turn totals produce byte-identical state (modulo the
  `startedAt` timestamp). This is the foundation of Option B
  multiplayer: both sides run the same engine; the network
  carries the events, not the state.
- **8 new tests**:
  - `tests/engine-replication.test.mjs` — 4 tests covering
    same-turns, bust, per-dart input, initial state.
  - `tests/tournament-net.test.mjs` — 4 tests covering room
    code generation, host→peer state, peer→host events,
    broadcast to multiple peers (using a stubbed
    `RTCPeerConnection` since real WebRTC isn't available in
    Node).

### Why a separate net layer

The existing `js/net/rtc.js` Online Room is one-to-one (host +
one peer) and protocol-asymmetric (host sends state, guest is
read-only). Tournaments need many-to-one with symmetric events
(peers send turn events back to host). Reusing the old code
would require workarounds; the new module is purpose-built
for tournaments.

### Notes
- Real browser WebRTC still uses Google's public STUN
  (`stun:stun.l.google.com:19302`) for ICE. No TURN server
  — players on the same network will work fine, players on
  different networks may have connectivity issues (the same
  limitation as the existing Online Room).
- Player-join UI (admin's "Player join" button, player's
  "Join tournament" tile) is coming in v0.0.0.8.

## [0.0.0.6] - 2026-06-24

Decentralized competition management: admin signs in with Google, all competition data syncs to their Google Drive `appDataFolder`. Roles: **Guest** (no sign-in, plays standalone games locally) and **Admin** (signed in, manages their own competitions in their Drive).

### Added
- **Google OAuth 2.0 sign-in** via Google Identity Services (GIS) +
  Authorization Code with PKCE. No client secret; works in a pure SPA.
  Tokens stored in IndexedDB; refresh token survives across sessions.
- **Google Drive sync for competitions.** Admin's `appDataFolder` becomes
  the source of truth for their tournaments. Folder layout:
  - `competitions/<id>.json` — competition metadata
  - `matches/<competitionId>/<matchId>.json` — per-match results
  - `game-history/<competitionId>/<matchId>.json` — per-game dart logs
- **Sign-in pulled at the start** of the Competitions screen. After
  sign-in, all existing admin competitions are pulled from Drive into
  the local IndexedDB cache.
- **Competition management UI** (Edit, Copy, Delete) — visible to signed-in
  admins on the competition list:
  - **Edit** opens the new-competition form pre-filled with the
    existing values (name, format, game opts). Updates metadata only;
    bracket / matches stay as-is.
  - **Copy** clones metadata + rebuilds the bracket with a new ID. Name
    is suffixed with "(copy)".
  - **Delete** removes the competition locally + best-effort Drive
    delete (file + subfolders).
- **Signed-in user badge** on the Competitions screen: name + avatar
  from Google profile.
- **"Sign in with Google" modal** appears when a guest clicks "+ New
  competition".
- **Dirty-queue retry.** Failed Drive pushes (offline, token expired)
  are queued and replayed on next sign-in.
- **New config module** (`js/config.js`) — `GOOGLE_CLIENT_ID` placeholder
  + Drive folder constants.

### Files
- New: `js/config.js`, `js/auth/google.js`, `js/auth/sync.js`
- Modified: `js/app.js` (silent session restore on boot), `js/ui/competition.js`
  (Edit/Copy/Delete UI + auth row), `js/ui/screens.js` (Drive push on
  match end), `styles/main.css` (auth row styles)

### Notes
- Sign-in will fail until you set a real `GOOGLE_CLIENT_ID` in
  `js/config.js`. Get one from Google Cloud Console (free, ~15 min).
- Test users must be added in OAuth consent screen (max 100 in
  development mode). Submit for verification to allow unlimited users.
- Drive API uses `drive.file` scope — the app can only see its own
  files in `appDataFolder`, never your other Drive files.
- Players who join a match do NOT need to sign in. They play on the
  admin's device (or via the Online Room's WebRTC pairing). The admin
  is the one whose Drive holds the competition.

## [0.0.0.5] - 2026-06-23

Per-player Stats screen + Max darts per leg = 45.

### Added
- **Per-player Stats screen.** New "Stats" tile on the menu opens a
  full-screen stats view. Pick a player from a chip row, then see all
  their stats grouped by scope (All-time, Standalone, per-League,
  per-Tournament, per-Match). Each stat block is a table grouped by
  category: Averages, High Turns, Checkouts, Legs, Throwing Order,
  Totals.
- **Stats coverage** (X01 / Cricket / Shanghai-aware):
  - Average, First 3 Average, First 9 Average, With Throw Average,
    Against Throw Average, Max Average of matches.
  - 180s, 171s, 170+, 140+, 100+ counts.
  - Highest Checkout, Checkout 100+ count, Checkout %.
  - Legs Won %, Best Leg (darts), Legs to 9 / 12 / 15 / 18 / 21 counts.
  - Legs Throwing First / Second, % Legs Won Throwing First / Second.
  - Total Darts, Total Points, Matches Won.
- **Max darts per leg = 45** added to both the X01 setup and the
  Competition setup dropdowns (alongside 0/20/30/50/100).
- **Per-game dart history storage.** Every finished game is appended to
  `localStorage.gindarts:gameHistory` with the full `rawDarts` array
  (per-turn totals + dart counts + leg boundaries + who threw) plus
  scope metadata (league / tournament / match / standalone). Capped at
  the last 500 games.
- **Game scope metadata.** When a game starts from a league/tournament
  match, `game.scope` is set to `{ type, id, matchId, name }`. Standalone
  games stay as `{ type: 'standalone' }`. Stats filter by this scope.
- **Pure-function stats module** (`js/game/stats.js`) — computes all
  stats from the per-game history. Unit-tested with synthetic data.

### Changed
- **Engine returns `{ darts, isLegWin, isCheckout }`** from
  `submitTurnTotal01`, `submitTurnTotalShanghai`, `submitTurnCricketMarks`.
  This is what makes the dart-count tracking work without per-dart entry.
- **`rawDarts` entries** now include `darts` (1..3), `isLegWin`,
  `isCheckout`, `bust`, `by` (player name) so stats can walk the
  history accurately.
- **`renderStatsScreen`** rewritten from a per-game-type summary into
  a per-player / per-scope view.

### Notes
- Stats work for X01 out of the box; the high-turn counters (180/171/etc.)
  are 0 for Cricket/Shanghai by design (turn totals aren't the right
  metric there). Checkout counters are X01-only.
- Per-turn dart count for X01 / Shanghai is always 3 (the calc takes a
  per-turn total, not per-dart). Per-leg dart totals are therefore
  multiples of 3 unless the user used "End leg" mid-turn.

## [0.0.0.4] - 2026-06-23

Click a player card to switch the active thrower (only at the start of a turn).

### Added
- **Click-to-switch on player cards.** When the calc buffer is empty
  (no darts entered yet this turn), inactive player cards get a
  dashed border + cursor: pointer. Clicking (or pressing Enter / Space
  when focused) switches the active thrower. The active card is not
  clickable (no point clicking yourself). The visual state updates
  live via the new `onChange` callback on the calculator — the moment
  you tap a digit the cards stop looking clickable, and after
  backspacing back to 0 they re-activate.
- **Calculator API additions** in `js/ui/calculator.js`:
  - `root.isEmpty()` returns `true` when the buffer is `'0'`.
  - `onChange` callback fires on every buffer change (digit, backspace,
    fast-score).
- **Player card accessibility**: clickable cards get `role="button"`,
  `tabindex="0"`, an aria-label, and a title hint. Keyboard users can
  Tab to a card and press Enter / Space to switch.
- **New test file** `tests/calculator-ui.test.mjs` with 4 tests for
  `isEmpty()` and `onChange`. Uses jsdom (dev only, `--no-save`).
- **Live URL** is now also available at
  https://zdenkor.github.io/gins-online-darts-scoring/ (GitHub Pages
  enabled in v0.0.0.3).

### Notes
- Switching at the start of a turn is a "pass" — no points are scored
  for the previous player, no turn is added to history. The new
  active thrower's leg continues from the existing leg running total.
- Cards are not clickable mid-turn (after any dart is in the buffer).
  The defensive check in `switchThrower` itself also bails out if the
  buffer is non-empty, so the behavior matches the visual.


### Added
- **Half-height action row** above the numpad, replacing the
  "Need 501 to win. Max turn total: 180. (Bust if you go over.)" hint
  line. Three icon-only buttons:
  - ⏻ **Exit** (red) — opens Save / Discard dialog. For a finished
    game: save to history vs. discard. For an unfinished game: save
    progress vs. discard progress.
  - ＝ **Set score** (green) — opens a confirm dialog ("Set score to
    N?"), then overrides the current player's score to the entered
    value and ends the turn. Use for corrections when dart math went
    wrong.
  - ⋯ **More commands** (white) — opens a submenu with 6 commands:
    Undo last turn, End leg, Exchange scores, Next player, Show
    stats, End match early.
- **End Leg** command: opens a modal asking "Who won the leg?",
  shows each player with their current score as a button. Pick one →
  their `legsWon` bumps, scores reset, next leg starts. If the chosen
  player has reached `legsToWin`, the match ends via the normal
  `endMatch()` path (stats + history).
- **Exchange Scores** command: prompts to pick the first player, then
  the second, then swaps their scores. Used when players throw out
  of order.
- **Show Stats** command: modal with each player's current score and
  legs won.
- **End Match Early** command: confirms, sets `game.winner` to the
  leading player (lowest score for X01, highest for Cricket/Shanghai,
  first player on tie), and saves.
- **Resume banner on menu** — surfaces auto-saved unfinished games on
  the next app start, with a Discard button.
- **`showModal` / `closeModal` helpers** in `js/util/helpers.js` —
  shared modal dialog component with backdrop-click + Escape dismiss.

### Changed
- **Calculator Enter button** is now the ↵ return-arrow icon instead
  of the text "Enter".
- **Active player card border**: 2px solid green, **no box-shadow
  halo** (was `box-shadow: 0 0 0 2px #1ec28b22`). Padding compensated
  by 1px so the card size stays the same.
- **Toolbar font size bumped** from 12/14px to `clamp(12px, 1.5vw,
  14px)` / `clamp(14px, 1.9vw, 18px)` so the meta strip is more
  readable on tablets.
- **Toolbar mode value** says `DO` instead of `D-Out` ("501 · DO").
- **Long toolbar labels** truncate with "…" via `text-overflow:
  ellipsis` instead of overflowing.
- **Hint line removed** (was the "Need 501 to win..." text). Cricket
  still uses `.calc-hint` for its per-dart instructions.
- **Container queries** drive responsive sizing (calc + scoreboard
  scale with container width, not viewport). Two breakpoints:
  `≥720px` (comfortable) and `≥1080px` (generous on 4K). Same
  selectors as the old @media rules would have used.

### Fixed
- **1024×600 landscape** with the new action row: bottom numpad row
  was clipped. Bumped the `100dvh - 310` height budget to `100dvh -
  335` so the action row + 4-row numpad fit in 600px height.

## [0.0.0.2] - 2026-06-22

Responsive layout overhaul + scoreboard redesign.

### Added
- **Container queries** on `main` (named `app`). Components (calculator,
  scoreboard, player cards) now scale based on the space they're given,
  not just the viewport. Two breakpoints: ≥720px for comfortable layout,
  ≥1080px for generous 4K/desktop layout.
- **`tests/responsive-check.mjs`**: Playwright test that verifies the
  calculator fits in the viewport at 9 representative resolutions
  (1024×600, 600×1024, 768×1024, 820×1180, 1024×1366, 1280×800,
  1920×1080, 2560×1440, 3840×2160). Catches clipping and overflow bugs.
- **`tests/layout-measure.mjs`**: diagnostic that dumps per-section
  heights for 4 key viewports.

### Changed
- **Scoreboard redesign**: always 2 columns, width matches the calculator
  via shared `--content-max` custom property, bigger player name (up to
  30px) and score (up to 130px on 4K), `.long` class auto-shrinks 4-digit
  scores so they fit the card frame.
- **Calculator width scales fluidly**: from ~280px on phones to 1100px
  on desktop/4K (was a fixed 460px).
- **Calculator height is viewport-aware**: shrinks on short viewports
  (1024×600 landscape) so the bottom numpad row stays tappable. On
  viewports shorter than 640px the display is hidden to free up vertical
  space.
- **Removed redundant UI**:
  - "Now throwing: X / Leg N / Dart M/N" line (was duplicated info from
    scoreboard + toolbar)
  - "to 0 · double-out / Legs: 0/1 (this set) · Sets: 0/1 · Darts this
    leg: 0/no limit" lines under each player card (same info already
    in the toolbar)
- **Calculator buttons** have `min-height: 0` so grid rows can shrink
  below content height on short viewports.
- **Removed the deprecated max-width: 980px on `main`** so the container
  query can see the full viewport width.

### Fixed
- **1024×600 landscape**: bottom numpad row was clipped off-screen
  before — now fits.
- **600×1024 portrait, 1280×800**: same clipping bug, now fits.
- **4K displays (2560×1440, 3840×2160, iPad Pro 13" 2064×2752, Surface
  Studio 4500×3000)**: calc now uses 1100px instead of a fixed 460px,
  so the UI scales with the device instead of staying cramped.

## [0.0.0.1] - 2026-06-22

Initial public release.

### Added
- **Game modes**: X01 (301/401/501/701/1001) with optional double-out,
  Cricket (standard + cut-throat), Shanghai (1–N numbers in order).
- **Calculator-style score entry**: 4×3 numpad with green fast-score
  buttons flanking it on both sides (26/41/45/60 on the left,
  81/85/100/140 on the right); on narrow screens the side columns
  collapse to a single row under the pad.
- **Match options (X01)**: legs per set, sets per match, max darts per
  leg (with "No limit" default = 0), checkout hints (170 / per-score
  suggestions via the engine's solver).
- **Multiplayer**: local pass-the-device scoring for any number of
  players, with full legs / sets / match progression.
- **Competitions**: single-elim and double-elim tournament brackets with
  bye handling, automatic bracket advancement, grand final; round-robin
  leagues with configurable groups, advance per group, knockout stage;
  single matches.
- **Authentication & persistence**: IndexedDB, local user accounts,
  default admin (admin/admin), role-based admin panel.
- **Online rooms (WebRTC)**: serverless peer-to-peer play via QR / base64
  room code, no accounts required for guests.
- **Stats**: per-mode wins and best scores, stored on device.
- **PWA assets**: web manifest + service worker (offline-capable).
- **Tests**: 60 unit tests across engine, calculator, competition,
  and X01 options (Node.js native test runner).
- **CI**: GitHub Actions runs the full test suite on push and PR
  against Node 22 and 24.

### Notes
- Throw order is the order players were entered on the setup screen
  (no bull-to-start tie-breaker).
- Default X01 progression: 501 / double-out on / single leg /
  single set / no max-darts cap / checkout hints on.