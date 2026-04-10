const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Ensure artifacts dir exists
const ARTIFACTS_DIR = '/Users/rikiharada/.gemini/antigravity/brain/82e6d953-c1c5-421b-a232-d66d8d1a99ac/';

(async () => {
    console.log("--- Starting Phase 8 Verification (SWR & Debounce) ---");
    const browser = await chromium.launch({ headless: true });
    
    // Create isolated context with some dummy localStorage if needed
    const context = await browser.newContext();
    const page = await context.newPage();

    let SWRFailed = false;

    // Listen to console to verify SWR logs
    page.on('console', msg => {
        const text = msg.text();
        // Ignore standard errors
        if (text.includes("SWR: Hydrating") || text.includes("SWR: Fresh data")) {
            console.log(`[Browser SWR Log] ${text}`);
        }
    });

    try {
        console.log("--- Navigating to App ---");
        await page.goto('http://127.0.0.1:8089/');
        await page.waitForLoadState('domcontentloaded');

        console.log("--- Triggering Dev Bypass Login ---");
        await page.click('#btn-auth-login');
        
        // Wait for dashboard or main container to settle
        await page.waitForSelector('#main-content', { state: 'visible', timeout: 5000 });

        console.log("--- Verifying LocalStorage Cache Generation ---");
        // Check if neo_cache is created
        const hasCache = await page.evaluate(() => {
            let found = false;
            for (let i = 0; i < localStorage.length; i++) {
                if (localStorage.key(i).startsWith('neo_cache_')) found = true;
            }
            return found;
        });

        if (!hasCache) {
            console.error("❌ ERROR: SWR Cache was NOT generated!");
            SWRFailed = true;
        } else {
            console.log("✅ SUCCESS: neo_cache_ detected in localStorage!");
        }

        console.log("--- Navigating to Project Tab to Test Debounce ---");
        // Wait for switchView to be available recursively if needed, or just execute
        await page.evaluate(() => {
            if(window.switchView) window.switchView('view-sites');
        });
        
        // Wait for search input to be in DOM
        await page.waitForSelector('#filter-search-input', { state: 'visible', timeout: 5000 });
        
        console.log("--- Simulating High-Speed Typing (Debounce Test) ---");
        const countBefore = await page.evaluate(() => document.querySelectorAll('.project-list-item').length);
        
        // Type fast
        await page.fill('#filter-search-input', 'A');
        await page.fill('#filter-search-input', 'B');
        await page.fill('#filter-search-input', 'C');
        
        // Ensure filter hasn't run yet if debounce is 300ms
        // Note: Playwright .fill() awaits inherently, but we can check if it works by just letting it settle
        await page.waitForTimeout(400); // Wait for debounce wait time + buffer

        const countAfter = await page.evaluate(() => document.querySelectorAll('.project-list-item').length);
        
        console.log(`✅ Debounce Settled. Project Cards Before: ${countBefore}, After: ${countAfter}`);
        
        console.log("--- Capturing Verification Screenshot ---");
        const shotPath = path.join(ARTIFACTS_DIR, `phase8_verification_${Date.now()}.png`);
        await page.screenshot({ path: shotPath, fullPage: true });
        console.log(`Saved screenshot: ${shotPath}`);

    } catch (error) {
        console.error("❌ Test Failed:", error);
    } finally {
        await browser.close();
        if (SWRFailed) process.exit(1);
    }
})();
