const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Listen to console
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(`[Browser ${msg.type().toUpperCase()}]: ${msg.text()}`);
    }
  });

  page.on('pageerror', error => {
    console.log(`[Browser UNCAUGHT ERROR]: ${error.message}`);
  });

  await page.goto('http://localhost:8000');
  
  // Wait for loading
  await page.waitForTimeout(1000);
  
  console.log('Testing: Clicking Projects Tab...');
  const projTab = await page.$('button[data-target="view-sites"]');
  if (projTab) {
      await projTab.click();
      await page.waitForTimeout(500);
  }

  console.log('Testing: Opening first project detail...');
  // Find first project card
  const cards = await page.$$('.dash-card-item');
  if (cards.length > 0) {
      await cards[0].click();
      await page.waitForTimeout(1000);
  }

  console.log('Testing: Clicking Create Document button...');
  const docBtn = await page.$('#btn-open-doc-gen');
  if (docBtn) {
      await docBtn.click();
      await page.waitForTimeout(500);
  } else {
      console.log('Error: Could not find #btn-open-doc-gen button');
  }

  console.log('Testing: Clicking Edit Menu ...');
  const menuToggle = await page.$('#btn-project-menu-toggle');
  if (menuToggle) {
      await menuToggle.click();
      await page.waitForTimeout(500);
  }

  console.log('Testing: Clicking Edit Button...');
  const editBtn = await page.$('#btn-project-edit');
  if (editBtn) {
      await editBtn.click();
      await page.waitForTimeout(500);
  } else {
      console.log('Error: Could not find #btn-project-edit button');
  }

  await browser.close();
  console.log('Test complete.');
})();
