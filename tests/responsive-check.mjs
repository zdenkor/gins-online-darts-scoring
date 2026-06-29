// Responsive sanity check for the calculator.
import { chromium } from 'playwright';

const VIEWPORTS = [
  ['1024×600 landscape',  1024, 600],
  ['600×1024 portrait',     600, 1024],
  ['600×800 small tablet',  600,  800],
  ['768×1024 portrait',     768, 1024],
  ['820×1180 portrait',     820, 1180],
  ['1024×1366 portrait',   1024, 1366],
  ['1280×800 landscape',   1280,  800],
  ['1920×1080 FHD',        1920, 1080],
  ['2560×1440 2K',         2560, 1440],
  ['3840×2160 4K',         3840, 2160],
];

const BASE = 'http://127.0.0.1:5500';
const failures = [];
const ok = (s) => console.log('  ✓ ' + s);
const fail = (msg) => { console.error('  ✗ ' + msg); failures.push(msg); };

async function run() {
  const browser = await chromium.launch();
  for (const [name, w, h] of VIEWPORTS) {
    console.log(`\n=== ${name} (${w}×${h}) ===`);
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.setDefaultTimeout(6000);
    try {
      await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 8000 });
      await page.waitForSelector('.tile', { timeout: 5000 });
      await page.locator('.tile', { hasText: '01 Games' }).first().click();
      await page.waitForSelector('button', { hasText: 'Start game', timeout: 5000 });
      await page.locator('button', { hasText: 'Start game' }).first().click();
      await page.waitForSelector('.calc', { timeout: 5000 });
      const report = await page.evaluate(() => {
        const vw = window.innerWidth, vh = window.innerHeight;
        const docW = document.documentElement.scrollWidth;
        const calc = document.querySelector('.calc');
        const pad = document.querySelector('.calc-pad');
        const calcBox = calc?.getBoundingClientRect();
        const padBox = pad?.getBoundingClientRect();
        const overflowing = [];
        const clipped = [];
        const all = document.querySelectorAll('.calc-btn, .calc-fast-btn, .player-card');
        for (const el of all) {
          const r = el.getBoundingClientRect();
          if (r.right > vw + 0.5) overflowing.push({ cls: el.className, txt: (el.textContent||'').trim().slice(0,30), right: +r.right.toFixed(1) });
          if (r.bottom > vh + 0.5 && el.classList.contains('calc-btn')) clipped.push({ cls: el.className, txt: (el.textContent||'').trim().slice(0,30), bottom: +r.bottom.toFixed(1) });
        }
        return {
          vw, vh, docW, calcBox: calcBox ? { w: +calcBox.width.toFixed(1), h: +calcBox.height.toFixed(1) } : null,
          padBox: padBox ? { w: +padBox.width.toFixed(1), h: +padBox.height.toFixed(1) } : null,
          overflowing, clipped,
          fastVisible: document.querySelectorAll('.calc-fast:not([style*="display: none"]) .calc-fast-btn').length,
          fastRowVisible: document.querySelectorAll('.calc-fast-row:not([style*="display: none"]) .calc-fast-btn').length,
          btnCount: document.querySelectorAll('.calc-btn').length,
        };
      });

      console.log(`  vw=${report.vw} docW=${report.docW} calc=${report.calcBox.w}×${report.calcBox.h} pad=${report.padBox.w}×${report.padBox.h}`);
      console.log(`  numpad btns=${report.btnCount}  side fast=${report.fastVisible}  phone-row fast=${report.fastRowVisible}`);

      if (report.docW > report.vw + 0.5) fail(`horizontal scroll: docW=${report.docW} > vw=${report.vw}`);
      else ok(`no horizontal scroll`);

      if (report.overflowing.length) {
        for (const o of report.overflowing.slice(0, 3)) fail(`overflow right: ${o.cls} "${o.txt}" right=${o.right} vw=${report.vw}`);
      } else ok('no right-edge overflow');

      if (report.clipped.length) {
        for (const c of report.clipped.slice(0, 3)) fail(`numpad clipped bottom: ${c.cls} "${c.txt}" bottom=${c.bottom} vh=${report.vh}`);
      } else ok('numpad fits in viewport height');

      if (w >= 721 && report.fastVisible !== 8) fail(`expected 8 side fast buttons visible on ${w}px wide, got ${report.fastVisible}`);
      if (w < 721 && report.fastRowVisible !== 8) fail(`expected 8 phone-row fast buttons visible on ${w}px wide, got ${report.fastRowVisible}`);
    } catch (e) {
      fail(`error: ${e.message}`);
    } finally {
      await ctx.close();
    }
  }
  await browser.close();
  console.log('\n=== Summary ===');
  if (failures.length === 0) console.log(`✓ All ${VIEWPORTS.length} viewports pass.`);
  else { console.log(`✗ ${failures.length} failures:`); failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
}

run().catch(e => { console.error(e); process.exit(2); });