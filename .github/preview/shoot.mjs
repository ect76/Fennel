// Opens the town in a real browser and takes screenshots for checking the visuals.
import { chromium } from 'playwright';
const [base, out, tag] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [name, opts] of [['desktop', { viewport: { width: 1440, height: 860 } }], ['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${tag}/${name}] console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', e => console.log(`[${tag}/${name}] PAGE ERROR: ${e.message}`));
  await page.goto(base, { waitUntil: 'load' }); await page.waitForTimeout(14000);
  const stage = page.locator('#stage');
  await stage.screenshot({ path: `${out}/${tag}-${name}-1-percy.png` });
  await page.click('[data-mode=overview]'); await page.waitForTimeout(5000);
  await stage.screenshot({ path: `${out}/${tag}-${name}-2-town.png` });
  await page.click('[data-mode=explore]'); await page.waitForTimeout(1500);
  if (name === 'desktop') { await page.keyboard.down('w'); await page.waitForTimeout(1800); await page.keyboard.up('w'); await page.waitForTimeout(800); }
  await stage.screenshot({ path: `${out}/${tag}-${name}-3-explore.png` });
  await page.click('[data-mode=follow]'); await page.click('#zoomIn'); await page.click('#zoomIn'); await page.waitForTimeout(2500);
  await stage.screenshot({ path: `${out}/${tag}-${name}-4-close.png` });
  if (tag === 'day') await page.screenshot({ path: `${out}/${tag}-${name}-5-page.png`, fullPage: true });
  await ctx.close();
}
await browser.close();
