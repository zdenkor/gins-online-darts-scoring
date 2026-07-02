# v0.6.0 — Checkout attempts, calculator overhaul, UI polish

This release adds the checkout-attempts stat feature, fixes the
BUST / No-Score commit path, overhauls the calculator action row,
and redoes the per-card match-score (sets / legs) display.

## Added

- **Checkout-attempts statistic** — a modal asks the player how many
  darts they had available for the close-out, only on turns at a
  closable target. The modal uses a 4-button segmented control
  (0/1/2/3 darts) with one-click commit, no Save button. Buttons
  that are mathematically impossible for the actual score thrown
  are disabled (with an aria-label tooltip). Driven by the
  `isClosableX01()` and `maxCheckoutAttemptsForX01()` engine
  helpers.
- **Triple Out (TO) engine support** — full TO out-rule coverage
  in both `isClosableX01()` (1/2/3-dart closability) and
  `maxCheckoutAttemptsForX01()` (leg-win and non-leg-win branches),
  with T + D-BULL as the legal 1-dart finisher.
- **Zero ("00") quick button** in the calculator action row.
  Sits between SetScore and MoreCmds. One tap commits a 0-point
  turn (BUST / no score) directly, bypassing the entered buffer.
- **Fullscreen toggle** in the app header (next to the settings
  gear) for menu, setup, game, settings, and stats screens.
- **Help icon for In/Out rules** — the setup In/Out toggle rows
  now show a multi-line help modal explaining each abbreviation
  (DI / TI / MI / DO / TO / MO) instead of a single-line text.
- **"0 (∞)" preset** for Max darts per leg (no-limit, infinite
  darts). Sets a UI default matching the engine's
  `maxDartsPerLeg = 0` behaviour.
- **New starting scores** in X01 setup: 121, 170, 1001. The
  picker now offers 121, 170, 301, 501, 701, 901, 1001.
- **Per-card match-score column** (sets / legs) on the player
  cards. Sets sit at name-size, legs sit at score-size, hidden
  when the count is 1 (no redundant 0/0 decoration).
- **Project knowledge base** (`docs/CHECKOUT_FORMULAS.md`) —
  per-out-rule documentation of the checkout-attempts Excel
  formulas (DO, MO, SO, TO), the modal behaviour summary, and
  cross-references to the engine helpers.

## Changed

- **X01 game setup** — Single (SI / SO) is no longer shown in the
  In/Out toggle rows. Engine still falls back to single when
  in/out is null, so legacy saved games continue to work. Out
  defaults to DO (the standard x01 rule).
- **X01 starting score picker** — ascending sort: 121, 170, 301,
  501, 701, 901, 1001.
- **Calculator action row** — 5 buttons in a single row
  (Undo, Redo, SetScore, Zero, MoreCmds). Action-row icons
  scale to 100% of the locked 4.5vh !important button frame.
  Numpad and fast-score buttons keep their 0.6 multiplier.
- **Checkout-statistic toggle** in Settings mirrors the
  Debug-overlay toggle pattern (toggleRow + onChange callback).
  The previous "click-again to reset" behaviour is gone — the
  standard toggle matches the rest of the Settings screen.
- **Master Out (MO) finisher** redefined as D + T + D-BULL
  (D1..D20, T1..T20, D25 = 50). Single Bull (S25 = 25) is NOT
  a finisher. UNCLOSABLE.master set regenerated for the new
  definition.

## Fixed

- **BUST / No-Score was unwritable in X01** — `commitTurnTotal()`
  used to silently drop `total === 0` entries, making the
  calculator's commit button do nothing for a 0-point turn. The
  engine already handles 0 as a no-op turn (no score change, turn
  advances), so the guard was removed. Players can now commit a
  0-point turn via the numpad, the new "00" quick button, or
  any existing BUST path.
- **Max-darts-per-leg default was invisible** — the engine default
  was already 0 (= infinite darts), but the picker didn't offer
  0 as a preset, so the default was hidden. Now 0 is the first
  preset (label "0 (∞)").
- **Checkout modal "minDarts" gate** — previously, the modal could
  enable a 1-dart button for a 2-dart target (or vice versa).
  Now `maxCheckoutAttemptsForX01()` returns the correct maximum
  based on the Excel formula, and buttons `n` are enabled iff
  `n <= max` (i.e. you cannot pick a count beyond what is
  physically possible for the score you threw).
- **Master Out (MO) `finishesLeg()`** — used to require a Double,
  which made the 1-dart MO target (e.g. T20, T19, …) unfinishable
  in 1 dart. Now accepts Double, Triple, or D-Bull as a finisher.
- **Checkout-attempts pre-turn score** — the modal used to read
  the player's score AFTER the engine had mutated it, so the
  "I was on 121, left 21" prompt actually said "I was on 21".
  Now the pre-turn score is captured as a primitive BEFORE
  `submitTurnTotal01()` mutates the player object.
- **Checkout-statistic closeability gate** — modal no longer
  fires for non-closable targets, and no longer offers a
  dart count that is mathematically impossible for the actual
  score thrown (e.g. 1-dart button for 50 DO when the throw
  left 7 remaining).
- **Action-row wrap on narrow phones** — the fifth icon used to
  wrap to a second row on small viewports. Action row is now
  a 5-column grid with `max-height: 4.5vh !important`, so the
  icons stay on one line.

## Removed

- **Single In / Single Out from X01 setup UI** — the picker
  no longer shows SI / SO. Engine falls back to single when
  in/out is null, so removing the UI option is a no-op for
  existing data.
- **Checkout-statistic "click-again to reset" behaviour** —
  the previous custom buttonRow with a "click the already-
  selected option to reset to default" interaction is gone.
  The toggle now behaves the same as the Debug-overlay toggle
  in Settings.

## Notes

- All sizes still use `vh` / `em` / `%` / `clamp()` only.
  No hardcoded `px` in the new CSS. The 0.5vh bump on the
  action row matches the numpad's 4.5vh cap.
- 120/120 tests pass at this release.
