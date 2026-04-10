const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:4321/index.html?static=true&bypass=1#dashboard', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000); // let app.js init
  
  console.log('--- Triggering Dev Bypass Login ---');
  await page.click('#btn-auth-login');
  await page.waitForTimeout(2000); // let auth handle, init dashboard and mockDB

  console.log('--- Navigating to Project Tab ---');
  await page.evaluate(() => {
      if (typeof window.switchView === 'function') {
          window.switchView('view-sites');
      }
  });
  await page.waitForTimeout(2000);
  
  console.log('--- Clicking first project ---');
  try {
     const projectCard = await page.$('.project-list-item');
     if (projectCard) {
         await projectCard.click();
         await page.waitForTimeout(2000);
     } else {
         console.log('No project card found!');
     }
  } catch(e) { console.log('Project card click failed:', e); }

  console.log('--- Checking for Doc Gen Button ---');
  try {
      // Find button by specific ID since we know it
      const invoiceBtn = await page.$('#btn-open-doc-gen');
      if (invoiceBtn) {
         console.log('Found Doc Gen Button! Clicking...');
         await invoiceBtn.click();
         await page.waitForTimeout(2000);
      } else {
         console.log('Could not find Invoice button. Current page HTML snippet:', await page.content().then(h => h.substring(0, 500)));
      }
  } catch(e) { console.log('Error evaluating buttons', e); }

  await page.screenshot({ path: '/Users/rikiharada/.gemini/antigravity/brain/82e6d953-c1c5-421b-a232-d66d8d1a99ac/manual_docgen_check_v2.png' });
  await browser.close();
  console.log('Done screenshotting');
})();
