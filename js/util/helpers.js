// Tiny utility helpers.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === false || v == null) continue;
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function toast(msg, opts = {}) {
  // Backwards-compat: `toast(msg, ms)` still works.
  let ms = 1800, kind = 'info';
  if (typeof opts === 'number') ms = opts;
  else if (opts && typeof opts === 'object') { ms = opts.ms || 1800; kind = opts.kind || 'info'; }
  let t = document.querySelector('.toast');
  if (!t) {
    t = el('div', { class: 'toast' });
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.remove('show', 'error');
  if (kind === 'error') {
    t.classList.add('error');
    ms = Math.max(ms, 6000); // errors stay visible for at least 6s
  }
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), ms);
  // Also log to console so the error is visible in DevTools.
  if (kind === 'error') console.error('[toast]', msg);
  return t;
}

export function shortId(len = 6) {
  const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  for (let i = 0; i < len; i++) s += a[buf[i] % a.length];
  return s;
}

export function copyToClipboard(text) {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(text).catch(() => fallback());
  }
  return fallback();
  function fallback() {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch {}
    document.body.removeChild(ta);
  }
}

export function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

// =================================================================
// Modal dialog helpers — used for confirmations and the More Commands
// submenu. showModal returns a close() function. Closes on backdrop
// click or Escape key.
//
// Stack semantics (v0.6.2+): showModal pushes onto a stack rather
// than closing any prior modal. This lets a sub-modal (e.g. History /
// Stats opened from the end-of-match panel) layer on top, and the
// parent modal comes back when the child closes. The Escape key and
// backdrop click close ONLY the topmost modal — the parent's
// listeners are re-attached when it becomes top again.
//
// `dismissable: false` on a modal opts it out of backdrop + Escape
// dismissal (used for the end-of-match panel, where the user must
// pick Finish / History / Stats explicitly).
// =================================================================
let _modalStack = []; // each entry: { backdrop, onKey, dismissable }

function _dismissOnBackdrop(e) {
  if (e.target !== e.currentTarget) return;
  if (!_modalStack.length) return;
  const top = _modalStack[_modalStack.length - 1];
  if (top.dismissable === false) return;
  closeModal();
}
function _dismissOnKey(e) {
  if (e.key !== 'Escape') return;
  if (!_modalStack.length) return;
  const top = _modalStack[_modalStack.length - 1];
  if (top.dismissable === false) return;
  closeModal();
}

export function showModal({ title = '', body = '', actions = [], dismissable = true } = {}) {
  const backdrop = el('div', { class: 'modal-backdrop', onclick: _dismissOnBackdrop, role: 'dialog', 'aria-modal': 'true' });
  const panel = el('div', { class: 'modal-panel' });
  if (title) panel.appendChild(el('h3', { class: 'modal-title' }, title));
  if (body) {
    if (typeof body === 'string') panel.appendChild(el('div', { class: 'modal-body' }, body));
    else panel.appendChild(body);
  }
  const actionRow = el('div', { class: 'modal-actions' });
  for (const a of actions) {
    actionRow.appendChild(el('button', {
      class: a.class || 'btn',
      // If there's no onclick, treat it as a Cancel button (close the
      // modal). Otherwise call the handler, and close after unless
      // `keepOpen: true` is set.
      onclick: () => {
        if (a.onclick) {
          try { a.onclick(); } catch (e) { console.error('modal action error', e); }
        }
        if (!a.keepOpen) closeModal();
      },
    }, a.label));
  }
  panel.appendChild(actionRow);
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);

  // Detach the previous modal's keydown listener (if any) and
  // attach our own — the listener always acts on the top of the
  // stack, so only the topmost modal can be dismissed by key.
  if (_modalStack.length) {
    const prev = _modalStack[_modalStack.length - 1];
    document.removeEventListener('keydown', prev.onKey);
  }
  document.addEventListener('keydown', _dismissOnKey);

  const entry = { backdrop, onKey: _dismissOnKey, dismissable };
  _modalStack.push(entry);

  // Focus the first button so Enter confirms
  setTimeout(() => {
    const firstBtn = actionRow.querySelector('button');
    if (firstBtn) firstBtn.focus();
  }, 0);
  return closeModal;
}

// =================================================================
// Fullscreen button — used in the header of every top-level screen
// (menu, setup, settings, stats). The game screen has its own
// fullscreen button inside the game-toolbar, so it does NOT use
// this helper.
//
// The button is an inline-SVG icon (Font Awesome 6 Free `expand` /
// `compress`, CC BY 4.0). The icon switches based on the current
// fullscreen state so the user can see the action at a glance.
// The global `fullscreenchange` listener (attached once at the
// bottom of this file) walks every `.fullscreen-icon-btn` and
// updates its SVG, so every button on the page stays in sync
// regardless of which screen mounted it.
// =================================================================
const EXPAND_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor"><path d="M32 32C14.3 32 0 46.3 0 64l0 96c0 17.7 14.3 32 32 32s32-14.3 32-32l0-64 64 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L32 32zM64 352c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 96c0 17.7 14.3 32 32 32l96 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-64 0 0-64zM320 32c-17.7 0-32 14.3-32 32s14.3 32 32 32l64 0 0 64c0 17.7 14.3 32 32 32s32-14.3 32-32l0-96c0-17.7-14.3-32-32-32l-96 0zM448 352c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 64-64 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l96 0c17.7 0 32-14.3 32-32l0-96z"/></svg>';
const COMPRESS_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor"><path d="M160 64c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 64-64 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l96 0c17.7 0 32-14.3 32-32l0-96zM32 320c-17.7 0-32 14.3-32 32s14.3 32 32 32l64 0 0 64c0 17.7 14.3 32 32 32s32-14.3 32-32l0-96c0-17.7-14.3-32-32-32l-96 0zM352 64c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 96c0 17.7 14.3 32 32 32l96 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-64 0 0-64zM320 320c-17.7 0-32 14.3-32 32l0 96c0 17.7 14.3 32 32 32s32-14.3 32-32l0-64 64 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-96 0z"/></svg>';

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {
      // Silent fail — the button is still there for the user to retry.
      // (Modal/screen contexts may already have their own toast.)
    });
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
}

export function fullscreenButton() {
  const btn = el('button', {
    class: 'btn ghost icon-btn fullscreen-icon-btn',
    title: 'Toggle full screen',
    'aria-label': 'Toggle full screen',
    type: 'button',
    onclick: toggleFullscreen,
  });
  btn.innerHTML = EXPAND_SVG;
  // Mark with the current state so the global fullscreenchange
  // listener can flip the SVG without a second lookup.
  btn.dataset.fsState = document.fullscreenElement ? 'on' : 'off';
  return btn;
}

// Global listener: when the user enters/exits fullscreen via Esc
// or a browser shortcut (not the button), update every fullscreen
// button on the page. Attached once on module load.
if (typeof document !== 'undefined') {
  document.addEventListener('fullscreenchange', () => {
    const on = !!document.fullscreenElement;
    for (const b of document.querySelectorAll('.fullscreen-icon-btn')) {
      b.innerHTML = on ? COMPRESS_SVG : EXPAND_SVG;
      b.dataset.fsState = on ? 'on' : 'off';
    }
  });
}

/**
 * Touch-button row with a Custom option at the end that reveals a
 * free-form number input. Use for fields like "Max darts per leg"
 * where the user mostly picks from a small set but occasionally
 * wants a different number.
 */
export function capButtonRow({ label, presets: initialPresets, value, onChange }) {
  // Use a `let` binding so `wrap.setPresets()` can swap the list at
  // runtime (used by the best-of/to-win mode toggles for sets/legs).
  let presets = initialPresets;
  const wrap = el('div', { class: 'field button-row-field' });
  if (label) wrap.appendChild(label.nodeType ? label : el('label', {}, label));
  const row = el('div', { class: 'btn-row segmented', style: 'flex-wrap:wrap' });
  const buttons = {};
  const numberInput = el('input', {
    type: 'number', min: '0', step: '1', placeholder: 'Custom number',
    style: 'display:none; margin-top:8px; width:100%; background:#1a212c; color:#e6ecf5; border:1px solid var(--line); border-radius:10px; padding:10px 12px; font-size:15px;',
    oninput: e => onChange(Math.max(0, +e.target.value || 0)),
  });
  // Hold the current value in a mutable holder so paint() always
  // reads the latest value, even after onChange updates it. The
  // initial value comes from the `value` parameter but can be
  // refreshed later via `wrap.refresh(newValue)`.
  const current = { v: value };
  function matchedPreset() {
    return presets.find(p => p.value === current.v && p.value !== 'custom');
  }
  function paint() {
    const m = matchedPreset();
    Object.values(buttons).forEach(x => x.classList.remove('segmented-selected'));
    if (m) {
      buttons[String(m.value)].classList.add('segmented-selected');
      numberInput.style.display = 'none';
    } else {
      const customBtn = buttons['__custom__'];
      if (customBtn) customBtn.classList.add('segmented-selected');
      numberInput.style.display = '';
      numberInput.value = String(current.v ?? '');
    }
  }
  presets.forEach(p => {
    const isCustom = p.value === 'custom';
    const b = el('button', {
      type: 'button',
      class: 'btn segmented-btn',
      'data-value': isCustom ? '__custom__' : String(p.value),
    }, p.label);
    b.addEventListener('click', () => {
      if (isCustom) {
        if (!matchedPreset()) { numberInput.focus(); return; }
        current.v = 0;
        onChange(0);
        numberInput.focus();
      } else {
        current.v = p.value;
        onChange(p.value);
      }
      paint();
    });
    buttons[isCustom ? '__custom__' : String(p.value)] = b;
    row.appendChild(b);
  });
  wrap.appendChild(row);
  wrap.appendChild(numberInput);
  // Caller can call wrap.refresh(v) after updating its own state
  // outside the onChange callback (e.g. when preloading state).
  wrap.refresh = (v) => { current.v = v; paint(); };
  // Replace the preset buttons with a new set. Used by the
  // best-of/to-win mode toggles for sets/legs so the labels stay
  // meaningful in each mode. Preserves the current value if it
  // matches a new preset; otherwise drops back to "custom" with
  // the numeric input visible.
  wrap.setPresets = (newPresets) => {
    Object.values(buttons).forEach(b => b.remove());
    Object.keys(buttons).forEach(k => delete buttons[k]);
    presets = newPresets;
    newPresets.forEach(p => {
    const isCustom = p.value === 'custom';
    const b = el('button', {
      type: 'button',
      class: 'btn segmented-btn',
      'data-value': isCustom ? '__custom__' : String(p.value),
    }, p.label);
    b.addEventListener('click', () => {
      if (isCustom) {
        if (!matchedPreset()) { numberInput.focus(); return; }
        current.v = 0;
        onChange(0);
        numberInput.focus();
      } else {
        current.v = p.value;
        onChange(p.value);
      }
      paint();
    });
    buttons[isCustom ? '__custom__' : String(p.value)] = b;
    row.appendChild(b);
    });
    paint();
  };
  paint();
  return { wrap };
}

/**
 * Segmented control — a label + a row of touch-friendly buttons.
 * Each button is at least 44px tall with rounded corners and a
 * clearly visible selected state. Use for short option lists (≤ ~10).
 * For long lists (player picker, etc.) use a scrollable grid instead.
 */
export function buttonRow(label, options, onChange, selected) {
  const wrap = el('div', { class: 'field button-row-field' });
  if (label) wrap.appendChild(label.nodeType ? label : el('label', {}, label));
  const row = el('div', { class: 'btn-row segmented' });
  const buttons = {};
  const selectedValue = String(selected ?? '');
  options.forEach(o => {
    const value = typeof o === 'object' ? String(o.value) : String(o);
    const text = typeof o === 'object' ? o.label : o;
    const isSel = value === selectedValue;
    const b = el('button', {
      type: 'button',
      class: 'btn segmented-btn' + (isSel ? ' segmented-selected' : ''),
      'data-value': value,
    }, text);
    b.addEventListener('click', () => {
      Object.values(buttons).forEach(x => x.classList.remove('segmented-selected'));
      b.classList.add('segmented-selected');
      onChange(value);
    });
    buttons[value] = b;
    row.appendChild(b);
  });
  wrap.appendChild(row);
  return { wrap, value: selectedValue };
}

export function toggleRow(label, options, selected, onChange) {
  const wrap = el('div', { class: 'field button-row-field' });
  if (label) wrap.appendChild(label.nodeType ? label : el('label', {}, label));
  const row = el('div', { class: 'btn-row segmented' });
  const buttons = {};
  const selectedValue = selected ?? '';
  options.forEach(o => {
    const value = typeof o === 'object' ? String(o.value) : String(o);
    const text = typeof o === 'object' ? o.label : o;
    const isSel = value === selectedValue;
    const b = el('button', {
      type: 'button',
      class: 'btn segmented-btn' + (isSel ? ' segmented-selected' : ''),
      'data-value': value,
    }, text);
    b.addEventListener('click', () => {
      const wasSel = b.classList.contains('segmented-selected');
      Object.values(buttons).forEach(x => x.classList.remove('segmented-selected'));
      if (wasSel) {
        onChange(null);
      } else {
        b.classList.add('segmented-selected');
        onChange(value);
      }
    });
    buttons[value] = b;
    row.appendChild(b);
  });
  wrap.appendChild(row);
  return { wrap };
}

export function closeModal() {
  if (!_modalStack.length) return;
  const top = _modalStack.pop();
  top.backdrop.remove();
  document.removeEventListener('keydown', top.onKey);
  // If there's a parent modal underneath, re-attach its keydown
  // listener so Escape / arrow keys can dismiss it.
  if (_modalStack.length) {
    const parent = _modalStack[_modalStack.length - 1];
    document.addEventListener('keydown', parent.onKey);
  }
}

// Close every modal on the stack, in top-down order. Use when
// leaving a screen (e.g. router.go() in endMatch) so no orphan
// modal stays attached to a screen that's about to be replaced.
export function closeAllModals() {
  while (_modalStack.length) closeModal();
}

// =================================================================
// Shared x01 game-options form
// =================================================================
//
// Both the standalone "x01 Games" setup screen and the
// competition-setup "Game options" block render the same x01
// controls (start, in/out rules, sets/legs mode + count, max
// darts, checkout hints). This helper builds them once so the
// two screens can never drift apart.
//
// Pass `state` (a mutable bag that the controls will read/write),
// `helpVisible` (whether the help icons are shown), and
// `X01_IN_OPTIONS` / `X01_OUT_OPTIONS` (from engine.js). Returns
// an object with the row wraps so the caller can append them in
// any order they want.
//
// `state` is expected to expose at least:
//   start, in, out, setsToWin, legsToWin, maxDartsPerLeg, showCheckout.
//   maxDartsPerLeg, showCheckout
// x01GameOptionsControls expects a state object with at least:
// Two conversions keep the displayed preset values consistent
// across modes:
//   best-of-N → win-count = ceil(N/2)
//   to-win-N  → best-of-(2N-1)
const X01_BEST_OF_PRESETS = [1, 3, 5, 7, 9];
const X01_TO_WIN_PRESETS = [1, 2, 3, 5, 7];
function bestOfToWin(bestOf) {
  return Math.ceil(Number(bestOf) / 2);
}
function toWinToBestOf(toWin) {
  return Math.max(1, Number(toWin) * 2 - 1);
}
function x01PresetsForMode(mode) {
  const list = mode === 'best' ? X01_BEST_OF_PRESETS : X01_TO_WIN_PRESETS;
  return [
    ...list.map(v => ({ value: v, label: String(v) })),
    { value: 'custom', label: 'Custom…' },
  ];
}
function x01PresetToWinCount(value, mode) {
  if (value === 'custom' || value == null) return value;
  return mode === 'best' ? bestOfToWin(value) : value;
}
function x01WinCountToPreset(value, mode) {
  if (value == null) return value;
  return mode === 'best' ? toWinToBestOf(value) : value;
}

export function x01GameOptionsControls({ state, helpVisible, X01_IN_OPTIONS, X01_OUT_OPTIONS, labelWithHelp }) {
  // Starting score
  const startRow = buttonRow(
    labelWithHelp('Starting score', 'Starting score',
      'The score each player begins with. Lower numbers make games faster; 501 is the classic start. 170 is a single-dart training preset (one max-dart throw to check out). 1001 is a long format.',
      helpVisible),
    [
      { value: '121',  label: '121'  },
      { value: '170',  label: '170'  },
      { value: '301',  label: '301'  },
      { value: '501',  label: '501'  },
      { value: '701',  label: '701'  },
      { value: '901',  label: '901'  },
      { value: '1001', label: '1001' },
    ],
    v => { state.start = +v; },
    String(state.start));

  // In/Out rules — Single (SI/SO) is hidden from the setup UI per
  // the user's product decision. Engine still falls back to
  // single in x01InOutFlags() if in/out is null, so legacy saved
  // games continue to work.
  const inOptions = Object.entries(X01_IN_OPTIONS)
    .filter(([value]) => value !== 'single')
    .map(([value, { label }]) => ({ value, label }));
  const inHelpEl = el('div', { class: 'small' });
  inHelpEl.appendChild(el('p', { style: 'margin: 0 0 4px;' }, 'In rule — what dart must land to start scoring:'));
  inHelpEl.appendChild(el('p', { style: 'margin: 0 0 4px;' }, '• DI = Double In — a double segment (D1..D20, D-Bull) opens scoring.'));
  inHelpEl.appendChild(el('p', { style: 'margin: 0 0 4px;' }, '• TI = Triple In — a triple segment (T1..T20) opens scoring.'));
  inHelpEl.appendChild(el('p', { style: 'margin: 0 0 4px;' }, '• MI = Master In — a double or bull opens scoring.'));
  inHelpEl.appendChild(el('p', { style: 'margin: 0 0 4px; color: var(--muted);' }, 'SI (Single In) is the default if nothing is selected — any dart opens scoring. (Hidden from the picker; legacy saved games still work.)'));
  const inRow = toggleRow(
    labelWithHelp('In', 'In rule', inHelpEl, helpVisible),
    inOptions,
    state.in,
    v => { state.in = v; });

  const outOptions = Object.entries(X01_OUT_OPTIONS)
    .filter(([value]) => value !== 'single')
    .map(([value, { label }]) => ({ value, label }));
  const outHelpEl = el('div', { class: 'small' });
  outHelpEl.appendChild(el('p', { style: 'margin: 0 0 4px;' }, 'Out rule — what dart must land to finish (reach 0):'));
  outHelpEl.appendChild(el('p', { style: 'margin: 0 0 4px;' }, '• DO = Double Out — finish on a double (D1..D20, D-Bull). Standard x01 rule.'));
  outHelpEl.appendChild(el('p', { style: 'margin: 0 0 4px;' }, '• TO = Triple Out — finish on a triple (T1..T20) or D-Bull.'));
  outHelpEl.appendChild(el('p', { style: 'margin: 0 0 4px;' }, '• MO = Master Out — finish on a double, triple, or D-Bull (any non-single except S-Bull).'));
  outHelpEl.appendChild(el('p', { style: 'margin: 0 0 4px; color: var(--muted);' }, 'SO (Single Out) is the default if nothing is selected — any dart can finish. (Hidden from the picker; DO is pre-selected as the standard x01 default.)'));
  const outRow = toggleRow(
    labelWithHelp('Out', 'Out rule', outHelpEl, helpVisible),
    outOptions,
    state.out,
    v => { state.out = v; });

  // Sets / Legs — only the "first to" (to-win) mode is supported, so
    // each row is just a numeric cap with the mode baked in. The label
    // says so explicitly ("Sets, First to" / "Legs, First to") so the
    // user knows the value means "first player to win N takes the
    // match / set".
    const sets = capButtonRow({
      label: labelWithHelp('Sets, First to', 'Sets, First to',
        'How many sets a player must win to take the match. The first to reach this count wins.',
        helpVisible),
      presets: x01PresetsForMode('toWin'),
      value: x01WinCountToPreset(state.setsToWin, 'toWin'),
      onChange: v => {
        state.setsToWin = x01PresetToWinCount(v, 'toWin');
      },
    });

    const legs = capButtonRow({
      label: labelWithHelp('Legs, First to', 'Legs, First to',
        'How many legs a player must win to take the set. The first to reach this count wins.',
        helpVisible),
      presets: x01PresetsForMode('toWin'),
      value: x01WinCountToPreset(state.legsToWin, 'toWin'),
      onChange: v => {
        state.legsToWin = x01PresetToWinCount(v, 'toWin');
      },
    });

  // Max darts per leg
  const capRow = capButtonRow({
    label: labelWithHelp('Max darts per leg', 'Max darts per leg',
      'Limit how many darts each player may throw in one leg. 0 means no limit (infinite darts). Useful for speed variants — set a low cap (e.g. 21) to force a fast finish.',
      helpVisible),
    presets: [
      { value: 0,  label: '0 (∞)' },
      { value: 21, label: '21' },
      { value: 36, label: '36' },
      { value: 45, label: '45' },
      { value: 51, label: '51' },
      { value: 99, label: '99' },
      { value: 'custom', label: 'Custom…' },
    ],
    value: state.maxDartsPerLeg,
    onChange: v => { state.maxDartsPerLeg = v; },
  });

  // Checkout hints
  const checkoutRow = buttonRow(
    labelWithHelp('Checkout hints', 'Checkout hints',
      'Shows the best checkout path for your remaining score and highlights 170, 167 and other common finishes.',
      helpVisible),
    [{ value: true, label: 'On' }, { value: false, label: 'Off' }],
    v => { state.showCheckout = (v === true || v === 'true'); },
    String(state.showCheckout));

  return {
      startRow, inRow, outRow,
      sets, legs,
      capRow, checkoutRow,
    };
  }
