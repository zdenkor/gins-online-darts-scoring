// =================================================================
// Debug overlay — when enabled, hovering any element on the page
// shows a small floating label with the element's tag, class names,
// id, and a few computed properties (width × height, font-size).
// Like a lightweight version of the browser's DevTools "Inspect"
// tooltip — useful when the user is hunting for the right CSS
// selector to override.
//
// Toggle: settings screen → "Show element labels on hover"
// Persisted in localStorage under `debugOverlay` so the choice
// survives reload.
//
// Usage:
//   import { enableDebugOverlay, disableDebugOverlay, isDebugOverlayOn }
//   from './util/debug-overlay.js';
//   if (isDebugOverlayOn()) enableDebugOverlay();
// =================================================================

const STORAGE_KEY = 'debugOverlay';

// Single label element reused for performance (no GC churn on mousemove).
let label = null;
let pendingFrame = null;
let lastEvent = null;

function ensureLabel() {
  if (label) return label;
  label = document.createElement('div');
  label.className = 'debug-overlay-label';
  label.setAttribute('aria-hidden', 'true');
  document.body.appendChild(label);
  return label;
}

function describePath(el, maxDepth = 3) {
  if (!el || el === document.body || el === document.documentElement) return '';
  const tag = el.tagName ? el.tagName.toLowerCase() : '';
  const id = el.id ? `#${el.id}` : '';
  const cls = el.className && typeof el.className === 'string'
    ? '.' + el.className.trim().split(/\s+/).join('.')
    : '';
  return `${tag}${id}${cls}`;
}

function describe(el) {
  if (!el || el === document.body || el === document.documentElement) return '';
  // Walk up the ancestor chain (up to maxDepth=3 parents) so the
  // user sees the DOM context — useful for figuring out which CSS
  // selector targets the hovered element. The closest parent is shown
  // on the line just above the hovered element's own row.
  const parents = [];
  let p = el.parentElement;
  while (p && p !== document.body && parents.length < 3) {
    const path = describePath(p);
    if (path) parents.unshift('↑ ' + path);
    p = p.parentElement;
  }
  const rect = el.getBoundingClientRect();
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  const fs = getComputedStyle(el).fontSize;
  const selfLine = describePath(el);
  const parentsBlock = parents.length ? parents.join('\n') + '\n' : '';
  return `${parentsBlock}${selfLine}\n${w}×${h}  font-size: ${fs}`;
}

function positionLabel(e) {
  const lbl = ensureLabel();
  // Anchor the label below-right of the cursor. Pad from viewport edges
  // so the label never sits under the cursor or off-screen.
  const offset = 14;
  const lblW = lbl.offsetWidth;
  const lblH = lbl.offsetHeight;
  let x = e.clientX + offset;
  let y = e.clientY + offset;
  if (x + lblW > window.innerWidth - 4) x = e.clientX - lblW - offset;
  if (y + lblH > window.innerHeight - 4) y = e.clientY - lblH - offset;
  lbl.style.transform = `translate(${x}px, ${y}px)`;
}

function onMove(e) {
  // Use requestAnimationFrame to coalesce mousemove events — mousemove
  // fires faster than the browser paints, so we only update the label
  // once per frame.
  lastEvent = e;
  if (pendingFrame != null) return;
  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = null;
    if (!lastEvent) return;
    const desc = describe(lastEvent.target);
    if (!desc) return;
    const lbl = ensureLabel();
    lbl.textContent = desc;
    // Defensive: keep the label visible whenever the cursor is over
    // the document. mouseenter/mouseleave don't always fire on the
    // first interaction (the cursor can already be over the doc when
    // listeners attach), so we set opacity on every move to avoid a
    // "I turned it on but nothing appears" dead state.
    lbl.style.opacity = '1';
    positionLabel(lastEvent);
  });
}

function onLeave() {
  // Hide the label only when the cursor leaves the document/window
  // entirely — not when it crosses element boundaries inside the page
  // (mouseenter/mouseleave don't bubble but fire on every element;
  // using mouseleave at document level catches the page-exit case).
  if (label) label.style.opacity = '0';
}

export function enableDebugOverlay() {
  document.addEventListener('mousemove', onMove, { passive: true });
  document.addEventListener('mouseleave', onLeave);
  localStorage.setItem(STORAGE_KEY, 'true');
  // If the label already exists from a previous session, make it
  // visible right away — the next mousemove will keep it visible.
  if (label) label.style.opacity = '1';
}

export function disableDebugOverlay() {
  document.removeEventListener('mousemove', onMove);
  document.removeEventListener('mouseleave', onLeave);
  if (label) {
    label.style.opacity = '0';
  }
  localStorage.setItem(STORAGE_KEY, 'false');
}

export function isDebugOverlayOn() {
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

export function initDebugOverlay() {
  // Restore from localStorage; this runs at app boot.
  if (isDebugOverlayOn()) enableDebugOverlay();
}
