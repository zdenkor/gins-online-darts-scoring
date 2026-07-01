// =================================================================
// Calculator-style score entry — single-number total per turn.
// 4 rows × 3 columns:
//   Row 1: 1   2   3
//   Row 2: 4   5   6
//   Row 3: 7   8   9
//   Row 4: ⌫   0  ↵   (Enter as the return-arrow icon, not text)
//
// On wider screens (tablets, landscape) the fast-score buttons flank
// the numpad as two vertical columns:
//   [26]  [ 4×3 numpad ]  [81]
//   [41]                 [85]
//   [45]                 [100]
//   [60]                 [140]
// Four smaller numbers on the LEFT, four larger numbers on the RIGHT.
// Each side is a single column of 4 buttons (not a horizontal row).
//
// On narrow screens (phones) the side columns are hidden and the
// fast-score buttons collapse to a row UNDER the pad (8 in one row,
// or 4 + 4 if it doesn't fit).
//
// Between the display and the numpad there's a half-height row of 3
// icon-only buttons (Exit / Enter as Remaining Score / More Commands).
// Each is half the height of a numpad tile.
//
// Fast scores are common 3-dart X01 totals. Every value here is
// achievable with a plausible single/double/triple combination.
// =================================================================

import { el } from '../util/helpers.js';

// Single row-major tile list (12 tiles, 4×3).
const TILES = [
  '1', '2', '3',
  '4', '5', '6',
  '7', '8', '9',
  '⌫', '0', '↵',
];

// Common 3-dart X01 totals. Only totals achievable with three
// realistic darts are listed — every value here corresponds to a
// plausible single, double, or triple combination.
const FAST_SCORES = [26, 41, 45, 60, 81, 85, 100, 140];
// Split point: the first FOUR go on the LEFT (smaller numbers), the
// remaining FOUR go on the RIGHT (larger numbers). 4 + 4 keeps the
// side columns balanced and visually symmetrical.
const FAST_SPLIT_INDEX = 4;

// =================================================================
// Icon-only button labels for the half-height action row.
// Undo      → ↶ (leftwards arrow, "undo last dart")
// Redo      → ↷ (rightwards arrow, "redo last undone dart")
// SetScore  → ＝ (equals, "set score to entered value")
// Zero      → 00 SVG (two zeros in rounded squares, "BUST / no score")
// MoreCmds  → ⋯ (horizontal ellipsis, "more commands")
//
// The Exit button (⏻) used to live in this row but was moved to
// the game toolbar (most-right side). The Undo button used to
// live in the toolbar but was moved back here — Undo is a
// per-turn action (like SetScore and MoreCmds) so it fits with
// the other turn-level commands in this row. Keeping Undo here
// also frees up toolbar space for the more screen-level
// controls (Fullscreen, Exit). The Redo button sits right of
// Undo as the symmetric counterpart. Zero sits between
// SetScore and MoreCmds as the "no score / BUST" quick
// action: one tap commits a 0-point turn.
// =================================================================
const ACTION_ICONS = {
  Undo:     '\u21B6',
  Redo:     '\u21B7',
  SetScore: '\uff1d',
  Zero:     '00',
  MoreCmds: '\u22ef',
};

export function renderCalculator({
  onCommit,
  onSetScore,        // (enteredValue) — open confirmation; parent handles the override
  onUndo,            // () — parent undoes the last dart/turn
  onRedo,            // () — parent redoes the last undone dart/turn
  onMoreCommands,    // () — parent opens the commands submenu
  onChange,          // () — fires on every buffer change (digit, backspace, fast score)
  legRunningTotal = 0,
}) {
  const root = el('div', { class: 'calc' });

  // Display area: just the big entered value. The "Running leg total"
  // hint line that used to sit below the entered number was removed —
  // the player cards already show who's throwing and how much they have
  // left, so the running-total hint was redundant.
  const display = el('div', { class: 'calc-display' });
  const entered = el('div', { class: 'calc-entered' }, '0');
  display.appendChild(entered);
  root.appendChild(display);

  // Half-height action row: 5 icon-only buttons.
  // (Undo, Redo, SetScore, Zero, MoreCmds). Each is sized to
  // half the height of a numpad tile. Undo sits in the
  // leftmost position (the same slot the old Exit button used
  // to occupy) so its placement is consistent with the
  // per-turn command area. Redo is the immediate right of
  // Undo. Zero is the "BUST / no score" quick-action, sits
  // between SetScore and MoreCmds.
  const actions = el('div', { class: 'calc-actions' });
  for (const key of ['Undo', 'Redo', 'SetScore', 'Zero', 'MoreCmds']) {
    const btn = el('button', {
      class: 'calc-action-btn calc-action-' + key.toLowerCase(),
      'aria-label': ariaLabelFor(key),
      title: ariaLabelFor(key),
      onclick: () => handleAction(key),
    }, ACTION_ICONS[key]);
    actions.appendChild(btn);
  }
  root.appendChild(actions);

  // 4×3 pad.
  const pad = el('div', { class: 'calc-pad' });
  for (const label of TILES) {
    const cls = labelClass(label);
    const btn = el('button', {
      class: 'calc-btn ' + cls,
      'aria-label': label === '↵' ? 'Commit turn' : (label === '⌫' ? 'Backspace' : label),
      title: label === '↵' ? 'Commit turn' : (label === '⌫' ? 'Backspace' : label),
      onclick: () => handle(label),
    }, label);
    pad.appendChild(btn);
  }

  // Every calc button (action / numpad / fast-score) scales its font
  // to exactly 60% of its own frame's NEAREST-BORDER distance — i.e.
  // min(width, height) of the button. CSS cqh doesn't behave inside
  // flex/grid containers cleanly, so we measure each button with a
  // ResizeObserver and apply font-size inline. The CSS `clamp(...)` on
  // each button class is the fallback for the first frame before JS
  // measures.
  //
  // "60% to the nearest frame border" = the text is sized so it
  // comfortably fits inside the smaller of the button's two
  // dimensions. Tall+wide buttons: constrained by height. Wide+short
  // buttons: constrained by height. Narrow+tall buttons (rare):
  // constrained by width.
  function fitFontToFrame(btn) {
    const w = btn.offsetWidth;
    const h = btn.offsetHeight;
    if (!w || !h) return; // hidden / not yet laid out
    // Per-button font-size multiplier. The numpad and fast-score
    // buttons use 0.6 (60% of nearest frame border) — the
    // numbers are small glyphs and the user can read them at
    // 60% of the button without strain.
    //
    // The action-row icons (Undo, Redo, SetScore, Zero,
    // MoreCmds) use 1.0 (100%) — the .calc-action-btn CSS
    // locks the button height with max-height: 4vh !important,
    // so pushing font-size up to 100% of the frame does NOT
    // inflate the button. The visible glyph (cap-height) then
    // fills the locked frame.
    // MoreCmds also gets an additional 1.15× boost because its
    // three-dot ellipsis (⋯) reads visually smaller than the
    // arrow characters (↶ ↷ ＝) and the double-zero SVG.
    let mult = 0.6;
    if (btn.classList && btn.classList.contains('calc-action-btn')) {
      mult = 1.0;
    }
    if (btn.classList && btn.classList.contains('calc-action-morecmds')) {
      mult = 1.0 * 1.15;
    }
    const target = Math.min(w, h) * mult;
    btn.style.fontSize = Math.round(target) + 'px';
  }
  // Fast-score columns: LEFT gets the first 4 (smaller numbers), RIGHT
  // gets the last 4 (larger numbers). On narrow screens the columns
  // are hidden and the buttons move to a row below the pad — see CSS.
  const leftFast = el('div', { class: 'calc-fast calc-fast-left' });
  const rightFast = el('div', { class: 'calc-fast calc-fast-right' });
  FAST_SCORES.forEach((n, i) => {
    const btn = el('button', { class: 'calc-fast-btn', onclick: () => quickCommit(n) }, String(n));
    (i < FAST_SPLIT_INDEX ? leftFast : rightFast).appendChild(btn);
  });

  // Phone fallback row: shown only when the side columns are hidden.
  const phoneRow = el('div', { class: 'calc-fast-row' });
  FAST_SCORES.forEach(n => {
    phoneRow.appendChild(el('button', { class: 'calc-fast-btn', onclick: () => quickCommit(n) }, String(n)));
  });

  // Wrap pad + side columns so the side-by-side layout works.
  const padWrap = el('div', { class: 'calc-pad-wrap' });
  padWrap.appendChild(leftFast);
  padWrap.appendChild(pad);
  padWrap.appendChild(rightFast);
  root.appendChild(padWrap);
  root.appendChild(phoneRow);

  // Every button-like calc child gets sized via the same rule, so the
  // action row, numpad, and fast columns all share one visual scale.
  const calcButtonSelector = '.calc-btn, .calc-action-btn, .calc-fast-btn';

  // Single ResizeObserver on the calc root measures every matching
  // button whenever its size changes (orientation flip, side-columns
  // toggling, viewport resize). Cheaper than one observer per button.
  //
  // Guard against the "ResizeObserver loop completed with undelivered
  // notifications" warning. When font-size is set inline on a button
  // it can change the button's measured size, which re-fires the
  // observer in the same frame, which sets font-size again, etc.
  // Coalesce all callbacks scheduled in a single frame into one
  // measurement pass.
  if (typeof ResizeObserver !== 'undefined') {
    let scheduled = false;
    const ro = new ResizeObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        root.querySelectorAll(calcButtonSelector).forEach(fitFontToFrame);
      });
    });
    ro.observe(root);
  } else {
    // Fallback: remeasure on window resize only.
    window.addEventListener('resize', () => {
      root.querySelectorAll(calcButtonSelector).forEach(fitFontToFrame);
    });
  }
  // Measure once on the next frame so the first paint already has
  // the right size (offsets are 0 during initial layout).
  // requestAnimationFrame may be missing in test environments (jsdom);
  // fall back to a microtask so the measurement still happens.
  const raf = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (cb) => Promise.resolve().then(cb);
  raf(() => {
    root.querySelectorAll(calcButtonSelector).forEach(fitFontToFrame);
  });

  // Numeric buffer (string of digits; max 3 chars = up to 180).
  let buffer = '0';

  const refresh = () => {
    entered.textContent = buffer;
    if (onChange) onChange();
  };
  refresh();

  function handle(label) {
    if (/^[0-9]$/.test(label)) {
      if (label === '0' && buffer === '0') return; // ignore leading zeros
      if (buffer === '0') buffer = label;
      else if (buffer.length >= 3) return;          // cap at 3 digits (180 max)
      else buffer += label;
      refresh();
      return;
    }
    switch (label) {
      case '⌫':
        if (buffer.length <= 1) buffer = '0';
        else buffer = buffer.slice(0, -1);
        refresh();
        break;
      case '↵':
        commit();
        break;
    }
  }

  function handleAction(key) {
    const v = parseInt(buffer, 10);
    switch (key) {
      case 'Undo':
        if (onUndo) onUndo();
        break;
      case 'Redo':
        if (onRedo) onRedo();
        break;
      case 'SetScore':
        if (!Number.isFinite(v)) return;
        if (onSetScore) onSetScore(v);
        break;
      case 'Zero':
        // BUST / no-score quick action: commit a 0-point turn
        // directly, bypassing the entered buffer. The engine
        // treats total=0 as a no-op turn (no score change, turn
        // advances), which is the right behaviour for "I
        // threw and missed" or "I deliberately recorded 0".
        if (onCommit) onCommit(0);
        buffer = '0';
        refresh();
        break;
      case 'MoreCmds':
        if (onMoreCommands) onMoreCommands();
        break;
    }
  }

  function commit() {
    const v = parseInt(buffer, 10);
    if (!Number.isFinite(v)) return;
    if (onCommit) onCommit(v);
    buffer = '0';
    refresh();
  }

  // Fast-score button: set the buffer to the chosen value, refresh the
  // display so the player can see what's about to be entered, then
  // commit immediately.
  function quickCommit(n) {
    buffer = String(n);
    refresh();
    commit();
  }

  // Allow the host to update the running leg total after each commit.
  root.updateRunningTotal = (newTotal) => {
    legRunningTotal = newTotal;
    refresh();
  };

  // True when the player hasn't entered any darts yet this turn. The
  // game screen uses this to decide whether clicking a different
  // player card is allowed (only legal at the start of a turn).
  root.isEmpty = () => buffer === '0';

  return root;
}

function labelClass(label) {
  if (label === '↵') return 'enter';
  if (label === '⌫') return 'back';
  return 'num';
}

function ariaLabelFor(key) {
  switch (key) {
    case 'Undo':     return 'Undo last dart';
    case 'Redo':     return 'Redo last undone dart';
    case 'SetScore': return 'Set score to entered value';
    case 'Zero':     return 'BUST / no score (commit 0)';
    case 'MoreCmds': return 'More commands';
    default:         return key;
  }
}
