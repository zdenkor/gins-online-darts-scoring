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
// =================================================================
let _openModal = null;
function dismissOnBackdrop(e) {
  if (e.target === e.currentTarget) closeModal();
}
function dismissOnKey(e) {
  if (e.key === 'Escape') closeModal();
}
export function showModal({ title = '', body = '', actions = [] } = {}) {
  closeModal(); // only one modal at a time
  const backdrop = el('div', { class: 'modal-backdrop', onclick: dismissOnBackdrop, role: 'dialog', 'aria-modal': 'true' });
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
  document.addEventListener('keydown', dismissOnKey);
  _openModal = backdrop;
  // Focus the first button so Enter confirms
  setTimeout(() => {
    const firstBtn = actionRow.querySelector('button');
    if (firstBtn) firstBtn.focus();
  }, 0);
  return closeModal;
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
  if (_openModal) {
    _openModal.remove();
    _openModal = null;
    document.removeEventListener('keydown', dismissOnKey);
  }
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
//   start, in, out, setsToWin, setsMode, legsToWin, legsMode,
//   maxDartsPerLeg, showCheckout
// where `setsMode`/`legsMode` are 'best' | 'toWin'.
//
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
      'The score each player begins with. Lower numbers make games faster; 501 is the classic start.',
      helpVisible),
    [
      { value: '301', label: '301' },
      { value: '501', label: '501' },
      { value: '701', label: '701' },
      { value: '901', label: '901' },
    ],
    v => { state.start = +v; },
    String(state.start));

  // In/Out rules
  const inOptions = Object.entries(X01_IN_OPTIONS).map(([value, { label }]) => ({ value, label }));
  const inRow = toggleRow(
    labelWithHelp('In', 'In rule',
      'SI = any dart opens scoring. DI/TI/MI = double/triple/master required to start scoring. Tap again to turn off.',
      helpVisible),
    inOptions,
    state.in,
    v => { state.in = v; });

  const outOptions = Object.entries(X01_OUT_OPTIONS).map(([value, { label }]) => ({ value, label }));
  const outRow = toggleRow(
    labelWithHelp('Out', 'Out rule',
      'SO = any dart can finish. DO/TO/MO = double/triple/master required to finish. Tap again to turn off.',
      helpVisible),
    outOptions,
    state.out,
    v => { state.out = v; });

  // Sets / Legs — each has a mode toggle (Best of / To win) and a
  // numeric row whose presets swap with the mode. `state.setsMode`
  // / `state.legsMode` default to 'best' (added by the caller).
  // The numeric rows are built AFTER the mode rows because the mode
  // toggles need to call `.refresh()` on them.
  const sets = capButtonRow({
    label: labelWithHelp('Sets', 'Sets',
      'How many sets determine the match. Best of / To win mode (above) decides how the number is read.',
      helpVisible),
    presets: x01PresetsForMode(state.setsMode),
    value: x01WinCountToPreset(state.setsToWin, state.setsMode),
    onChange: v => {
    state.setsToWin = x01PresetToWinCount(v, state.setsMode);
    },
  });
  const setsModeRow = buttonRow(
    labelWithHelp('Sets mode', 'Sets mode',
      'How to count sets. "Best of N" plays up to N sets and the higher score wins. "To win N" stops as soon as one player reaches N sets.',
      helpVisible),
    [{ value: 'best', label: 'Best of' }, { value: 'toWin', label: 'To win' }],
    v => {
      state.setsMode = v;
      sets.wrap.setPresets(x01PresetsForMode(v));
      sets.wrap.refresh(x01WinCountToPreset(state.setsToWin, v));
      },
    state.setsMode);

  const legs = capButtonRow({
    label: labelWithHelp('Legs', 'Legs',
      'How many legs determine the set. Best of / To win mode (above) decides how the number is read.',
      helpVisible),
    presets: x01PresetsForMode(state.legsMode),
    value: x01WinCountToPreset(state.legsToWin, state.legsMode),
    onChange: v => {
      state.legsToWin = x01PresetToWinCount(v, state.legsMode);
    },
  });
  const legsModeRow = buttonRow(
    labelWithHelp('Legs mode', 'Legs mode',
      'How to count legs. "Best of N" plays up to N legs and the higher score wins. "To win N" stops as soon as one player reaches N legs.',
      helpVisible),
    [{ value: 'best', label: 'Best of' }, { value: 'toWin', label: 'To win' }],
    v => {
      state.legsMode = v;
      legs.wrap.setPresets(x01PresetsForMode(v));
      legs.wrap.refresh(x01WinCountToPreset(state.legsToWin, v));
      },
    state.legsMode);

  // Max darts per leg
  const capRow = capButtonRow({
    label: labelWithHelp('Max darts per leg', 'Max darts per leg',
      'Limit how many darts each player may throw in one leg. 0 means no limit. Useful for speed variants.',
      helpVisible),
    presets: [
      { value: 20, label: '20' },
      { value: 30, label: '30' },
      { value: 45, label: '45' },
      { value: 50, label: '50' },
      { value: 100, label: '100' },
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
    setsModeRow, sets, legsModeRow, legs,
    capRow, checkoutRow,
  };
}
