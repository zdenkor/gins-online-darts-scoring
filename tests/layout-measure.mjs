// Take a screenshot of the game screen at each viewport so we can SEE
// what's pushing the calculator below the fold.
import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:5500';
const VIEWPORTS = [
  ['1024x600', 1024, 600],
  ['600x1024',  600, 1024],
  ['768x1024',  768, 1024],
  ['1280x800', 1280, 800],
];

(async () => {
  const browser = await chromium.launch();
  for (const [name, w, h] of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.tile');
    await page.locator('.tile', { hasText: '01 Games' }).first().click();
    await page.locator('button', { hasText: 'Start game' }).first().click();
    await page.waitForSelector('.calc');
    // Measure every section's height
    const layout = await page.evaluate(() => {
      const sel = ['header', '.game-toolbar', '.scoreboard', '.turn-info', '.calc', '.calc-display', '.calc-pad', '.calc-fast', '.app-footer'];
      const out = {};
      for (const s of sel) {
        const el = document.querySelector(s);
        if (el) {
          const r = el.getBoundingClientRect();
          out[s] = { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), height: +r.height.toFixed(1) };
        }
      }
      return { vh: window.innerHeight, vw: window.innerWidth, docH: document.documentElement.scrollHeight, sections: out };
    });
    console.log(`\n=== ${name} ===`);
    console.log(`viewport=${layout.vw}×${layout.vh} docH=${layout.docH}`);
    for (const [s, b] of Object.entries(layout.sections)) {
      console.log(`  ${s.padEnd(20)} top=${String(b.top).padStart(5)} bottom=${String(b.bottom).padStart(5)} h=${String(b.height).padStart(5)}`);
    }
    await page.screenshot({ path: `tests/screenshot-${name}.png`, fullPage: false });
    console.log(`  screenshot -> tests/screenshot-${name}.png`);
    await ctx.close();
  }
  await browser.close();
})();