import { chromium } from 'playwright';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 920 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto('http://localhost:7799/index.html#all', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.screenshot({ path: '/Users/adriankrebs/Projects/adriankrebs.ch/public/ai-design-scorer-report.png', fullPage: false, clip: { x: 0, y: 0, width: 1280, height: 920 } });
await browser.close();
console.log('done');
