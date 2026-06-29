// Measure all elements + their margins to find the real available space
import { chromium } from 'playwright';
const VIEWPORTS = [['1280x800', 1280, 800], ['1024x600', 1024, 600], ['600x1024', 600, 1024]];
const browser = await chromium.launch();
for (const [name, w, h] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:5500', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.tile');
  await page.locator('.tile', { hasText: '01 Games' }).first().click();
  await page.locator('button', { hasText: 'Start game' }).first().click();
  await page.waitForSelector('.calc');
  const r = await page.evaluate(() => {
    const sels = ['header', '.game-toolbar', '.scoreboard', '.turn-info', '.calc', '.app-footer'];
    const out = [];
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el) {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        out.push({ s, top: r.top, bottom: r.bottom, height: r.height, mb: cs.marginBottom, mt: cs.marginTop });
      }
    }
    const main = document.querySelector('main');
    const mainCs = getComputedStyle(main);
    out.push({ s: 'main', top: main.getBoundingClientRect().top, bottom: main.getBoundingClientRect().bottom, height: main.getBoundingClientRect().height, pt: mainCs.paddingTop, pb: mainCs.paddingBottom });
    return { vh: window.innerHeight, items: out };
  });
  console.log(`\n=== ${name} ===`);
  for (const i of r.items) console.log(`  ${i.s.padEnd(20)} top=${i.top.toFixed(1).padStart(6)} bottom=${i.bottom.toFixed(1).padStart(6)} h=${i.height.toFixed(1).padStart(6)} mb=${i.mb||'-'} mt=${i.mt||'-'} pt=${i.pt||'-'} pb=${i.pb||'-'}`);
  await ctx.close();
}
await browser.close();