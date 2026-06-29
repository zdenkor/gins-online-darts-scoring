## v0.5.2 — 2026-06-29

Responsive layout fixes, debug overlay, and frame-aware font sizing.

### Calc buttons size to 60% of their own frame

Every calc button (`.calc-btn`, `.calc-action-btn`, `.calc-fast-btn`) now scales its `font-size` to exactly **60% of the smaller of its own width and height** — "60 percent is the size to the nearest frame border".

JS measures the button with a single `ResizeObserver` on the calc root and a one-shot `requestAnimationFrame` initial measurement (with a jsdom-safe fallback for the test environment). CSS `clamp()` is the fallback for the first frame before JS runs.

Verified ratios at 1264×625:
- Action buttons (345×38) → 23px font (61%)
- Fast buttons (96×38) → 23px
- Numpad (274×36) → 22px

Layout changes (orientation flip, side-columns toggling, viewport resize) automatically recompute.

### Debug overlay — DevTools-style element inspector

New settings card (Settings tile → Debug) with an **On/Off** segmented toggle (replaces the prototype checkbox — consistent with the rest of the app's touch-friendly toggle style).

When enabled, hovering any element shows a floating dark-tinted label with:
- the hovered element's `tag.class#id`
- up to 3 ancestor rows prefixed with `↑` (DevTools breadcrumb style)
- `width × height` and computed `font-size` on the last line

Persisted in `localStorage.debugOverlay`. Pointer-events disabled on the label so it doesn't interfere with clicks. `mousemove` listener is throttled via `requestAnimationFrame`.

### Small-tablet fix (800×600, 1024×600)

The calc favorites chips (26, 41, 45, 60, 81, 85, 100, 140) used to render in two side columns flanking the numpad at any viewport ≥ 500px. At small-tablet widths (800×600, 1024×600) this made the calc wider than the screen and clipped the strip and scoreboard.

Bumped the breakpoint to **≥ 1000px** for the side-by-side layout. Below 1000px the favorites drop to the `phoneRow` of 8 chips below the numpad, which fits any width.

### Housekeeping

- Service worker cache bumped (`gin-darts-v0.5.1-debug2` → `gin-darts-v0.5.2`) so users pick up the new code without manual cache clearing.