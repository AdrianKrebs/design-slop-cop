import { chromium } from 'playwright';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto('http://localhost:7799/index.html#all', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);  // let images settle
await page.screenshot({ path: '/Users/adriankrebs/Projects/design-slop-cop/docs/report.png', fullPage: false, clip: { x: 0, y: 0, width: 1280, height: 900 } });
await browser.close();
console.log('done');
