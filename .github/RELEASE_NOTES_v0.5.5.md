## v0.5.5 — 2026-06-30

Compact one-line setup form, column-aligned strip header, removed Best-of/To-win mode toggles.

### Compact one-line setup form
Each option now renders as `Label: Value` on a single horizontal line (label muted small caps, value white big text) instead of a vertical label + button group. Examples: `LEGS TO WIN: First to 1`, `MODE: 501 · SI/SO`, `CHECKOUT HINTS: On`. Saves ~5 vertical lines per option group on the setup screen. All font sizes use `vh` units (1.5vh label, 2.4vh value) — no px values.

### Column-aligned strip header
The shared-history header row uses a 5-column grid (1fr × 5) matching the data rows below, with each label (`Scored` / `To go` / `Dart`) sitting directly above its corresponding data value with pixel-perfect x alignment. Labels changed from `${p1.name} scored` to just `Scored` since player names live in the scoreboard above.

### Responsive `vh` font sizes
Strip header cells use `1.2vh`, data cells use `4vh` (no `cqh` resolving to px, no JS measurement). Scales linearly with viewport:
- 800×600: header ~10px / data ~24px
- 1264×625: header ~7.5px / data ~25px
- 1920×1080: header ~13px / data ~43px

### Removed Best-of / To-win mode toggles
Only the "first to" (to-win) mode is supported. Sets / Legs labels simplified to "Sets, First to" / "Legs, First to" so the user knows the value means "first player to win N". The `setsMode` / `legsMode` state fields and their toggle buttons are removed from the form.

### Internal cleanup
- Strip cell selector changed from player-suffixed (`.sh-thrown-p1`, etc.) to base (`.sh-thrown`, `.sh-remain`, `.sh-round`) so the same font rule covers both header and data cells.
- Header rule added with `text-align: center` to match the data row alignment.
- `container-type: size` removed from `.shared-history-row` (no longer needed for `cqh`).
