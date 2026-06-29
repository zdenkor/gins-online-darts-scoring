// Tests for the calculator UI module (js/ui/calculator.js).
// We import the module under test, render a calculator, and drive it
// by querying the resulting DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderCalculator } from '../js/ui/calculator.js';

let dom;
let originalDocument;
let originalWindow;

function setup() {
  // Provide a fresh DOM for each test so we don't leak state.
  dom = new JSDOM('<!doctype html><html><body></body></html>');
  originalDocument = global.document;
  originalWindow = global.window;
  global.document = dom.window.document;
  global.window = dom.window;
}

function teardown() {
  global.document = originalDocument;
  global.window = originalWindow;
}

test('isEmpty: returns true on a fresh calculator', () => {
  setup();
  try {
    const calc = renderCalculator({});
    dom.window.document.body.appendChild(calc);
    assert.equal(calc.isEmpty(), true, 'fresh calc should be empty');
  } finally {
    teardown();
  }
});

test('isEmpty: returns false after a digit is entered', () => {
  setup();
  try {
    const calc = renderCalculator({});
    dom.window.document.body.appendChild(calc);
    // Click the '6' button
    const btn = [...dom.window.document.querySelectorAll('.calc-btn')].find(b => b.textContent.trim() === '6');
    assert.ok(btn, 'expected to find the 6 button');
    btn.click();
    assert.equal(calc.isEmpty(), false, 'calc should not be empty after entering 6');
    // Click backspace, should go back to 0
    const back = [...dom.window.document.querySelectorAll('.calc-btn')].find(b => b.textContent.trim() === '⌫');
    back.click();
    assert.equal(calc.isEmpty(), true, 'calc should be empty after backspace to 0');
  } finally {
    teardown();
  }
});

test('isEmpty: ignores leading-zero taps (clicks on 0 when buffer is 0)', () => {
  setup();
  try {
    const calc = renderCalculator({});
    dom.window.document.body.appendChild(calc);
    const btn = [...dom.window.document.querySelectorAll('.calc-btn')].find(b => b.textContent.trim() === '0');
    btn.click();
    assert.equal(calc.isEmpty(), true, 'calc should still be empty after a no-op 0 click');
  } finally {
    teardown();
  }
});

test('onChange: fires on every buffer change', () => {
  setup();
  try {
    let calls = 0;
    const calc = renderCalculator({ onChange: () => calls++ });
    dom.window.document.body.appendChild(calc);
    // Initial render fires onChange once
    const initial = calls;
    // Click 6
    [...dom.window.document.querySelectorAll('.calc-btn')].find(b => b.textContent.trim() === '6').click();
    assert.equal(calls, initial + 1, 'onChange fires on digit click');
    // Click backspace
    [...dom.window.document.querySelectorAll('.calc-btn')].find(b => b.textContent.trim() === '⌫').click();
    assert.equal(calls, initial + 2, 'onChange fires on backspace');
    // Click fast-score 100
    [...dom.window.document.querySelectorAll('.calc-fast-btn')].find(b => b.textContent.trim() === '100').click();
    // quickCommit sets buffer + calls commit() which calls onCommit (not onChange directly),
    // but the buffer-change refresh also calls onChange. So expect one more fire.
    assert.ok(calls >= initial + 3, 'onChange fires on fast score');
  } finally {
    teardown();
  }
});
