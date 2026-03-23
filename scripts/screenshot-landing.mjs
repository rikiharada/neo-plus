import { chromium } from 'playwright';

const base = process.argv[2] || 'http://127.0.0.1:8765/';
const out = process.argv[3] || 'screenshots/landing-auth-demo.png';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
    viewport: { width: 420, height: 900 },
    deviceScaleFactor: 2,
});
const page = await context.newPage();
await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log('Wrote', out);
