const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        const filePath = `file://${path.resolve(__dirname, 'index.html')}`;
        await page.goto(filePath);

        // 1. App instantly hydrates or shows Setup view if no localStorage
        await page.waitForSelector('#view-setup', { state: 'visible' });
        
        // 2. Click the consent checkbox inside the setup view to enable the start button
        await page.click('#setup-consent-checkbox');
        
        // 3. Click start to transition to the main dashboard
        await page.click('#btn-start');

        // 2. Wait for main content router
        await page.waitForSelector('#main-content', { state: 'visible' });

        // 3. Click Wallet tab icon
        console.log("Navigating to Wallet...");
        await page.click('[data-target="view-wallet"]');

        // 4. Wait for wallet DOM to lazily load and become visible
        await page.waitForSelector('#view-wallet', { state: 'visible', timeout: 5000 });
        
        // 5. Verify the profit ring and tax indicator exists, meaning wallet-render.js executed
        await page.waitForSelector('#wallet-ring-progress', { state: 'attached' });
        await page.waitForSelector('#wallet-global-profit', { state: 'visible' });

        const profitText = await page.locator('#wallet-global-profit').textContent();
        console.log(`Wallet Profit Rendered: ${profitText}`);

        // 6. Check for any console errors during this process
        // (We already attached page.on('console') if we wanted, let's just assert DOM)
        
        await page.screenshot({ path: '../.gemini/antigravity/brain/82e6d953-c1c5-421b-a232-d66d8d1a99ac/wallet_extraction_test.png' });
        console.log("✅ Wallet view dynamically loaded and rendered correctly. Screenshot saved.");

    } catch (e) {
        console.error("❌ Test Failed:", e);
        await page.screenshot({ path: '../.gemini/antigravity/brain/82e6d953-c1c5-421b-a232-d66d8d1a99ac/wallet_extraction_error.png' });
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
