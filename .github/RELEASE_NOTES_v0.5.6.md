v0.5.6 — auto-fullscreen on game start, redo action, restructured settings
==========================================================================

This release consolidates the previous session's incremental changes
and adds a new umbrella "Settings" section on the settings page.

Auto-fullscreen on game start
-----------------------------

Clicking "Start game" on the setup screen now auto-enters fullscreen
via `requestFullscreen()` in a microtask. The click counts as a
user-gesture so the browser allows the call. The router's DOM update
runs first (microtask delay) so the toolbar's Fullscreen icon stays
in sync. Browser blocks are silently caught — the user can still
click the toolbar's Fullscreen button to retry.

Redo (↷) action in the calculator
---------------------------------

A 4th action button right of Undo (↶). The most recently undone
dart is pushed to a `__gindartsRedoStack` and can be re-applied
with one tap. A new dart commit clears the redo stack (you can't
redo something past the current state).

Restructured settings page
--------------------------

The settings page now has a single "Settings" umbrella card with
two sub-sections:

- **Display settings** (h4) → **Cursor** (h5) — button that opens
  the existing quick-cursor-settings modal.
- **Assistance settings** (h4) → **Help icons** (h5, On/Off) and
  **Debug overlay** (h5, On/Off).

The Help icons toggle is a first-class setting now — it persists
via `saveUiHelpSettings({ show })` and updates the app header so
the gear icon stays in sync.

Next step will be to fold ALL settings (sign-in, SVK, about)
under the same umbrella card.

Other changes
-------------

- 80% icon fill for toolbar and dashboard buttons (icons render
  with the same visual prominence everywhere).
- Exit button uses unicode ⏻ (U+23FB) at 2em — not an inline SVG.
- Calculator total-entry for all in/out modes (no more segment-tap
  even with DI/DO).
- Modal title ~30% larger (clamp 20-24px → 26-31px).
- Cmd-row label/description ~30% larger.
- MoreCmds gets a 1.15× font-size boost in `fitFontToFrame()`.
- Max darts presets changed to 21, 36, 45, 51, 99, Custom.
- Toolbar info labels shortened to Sets: N | Legs: N | Game: 501 · DI/DO.
- Auth buttons fully responsive (em/vh/% — no px in icon-btn rules).

Tests
-----

93/93 pass. No breaking changes. The settings page's id (still
`renderSettings()` in `js/ui/screens.js`) is unchanged, so any
deep-link / settings-router code that referenced it by name still
works.
