/**
 * Neo+ Wallet Render Component
 * Handles the display of the health dashboard and tax summaries.
 */

// Format numbers
const fmt = new Intl.NumberFormat('ja-JP');

// ── localStorage keys for user-configurable wallet targets ──────────
const _WALLET_KEYS = {
    targetProfit: 'neo_wallet_target_profit',
    fixedCosts:   'neo_wallet_fixed_costs',
    investment:   'neo_wallet_investment',
};

function _loadWalletConfig() {
    return {
        targetMonthlyProfit: Number(localStorage.getItem(_WALLET_KEYS.targetProfit)) || 1000000,
        fixedCosts:          Number(localStorage.getItem(_WALLET_KEYS.fixedCosts))   || 120000,
        investment:          Number(localStorage.getItem(_WALLET_KEYS.investment))   || 475000,
    };
}

function _saveWalletConfig(cfg) {
    localStorage.setItem(_WALLET_KEYS.targetProfit, cfg.targetMonthlyProfit);
    localStorage.setItem(_WALLET_KEYS.fixedCosts,   cfg.fixedCosts);
    localStorage.setItem(_WALLET_KEYS.investment,   cfg.investment);
}

/** Populate the edit inputs with current saved values */
function _populateConfigInputs(cfg) {
    const tp = document.getElementById('input-target-profit');
    const fc = document.getElementById('input-fixed-costs');
    const iv = document.getElementById('input-investment');
    if (tp) tp.value = cfg.targetMonthlyProfit;
    if (fc) fc.value = cfg.fixedCosts;
    if (iv) iv.value = cfg.investment;
}

/** Compact display helper: ¥1,200,000 → ¥1.2M / ¥120k */
function _fmtShort(n) {
    if (n >= 1_000_000) return `¥${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (n >= 1_000)     return `¥${Math.round(n / 1000)}k`;
    return `¥${fmt.format(n)}`;
}

export function initWalletView() {
    console.log("[Neo Wallet] Initializing...");

    // Subscribe to GlobalStore changes to keep wallet updated
    if (window.GlobalStore) {
        window.GlobalStore.subscribe(renderWalletContent);
    }

    // Populate edit inputs with saved config BEFORE render
    _populateConfigInputs(_loadWalletConfig());

    // Initial Render
    renderWalletContent();

    // Re-initialize icons
    if (window.lucide) {
        window.lucide.createIcons();
    }

    bindWalletEvents();
}

function renderWalletContent() {
    if (!window.GlobalStore) return;
    const state = window.GlobalStore.getState();
    const transactions = state.activities || [];
    const projects = state.projects || [];
    const config = _loadWalletConfig();

    // Anti-Hardcoding: Use user's actual data for calculations
    let totalRevenue = 0;
    let totalExpenses = 0;

    // Calculate from Projects
    projects.forEach(p => {
        if (p.revenue) totalRevenue += Number(p.revenue);
    });

    // Calculate from Transactions
    transactions.forEach(t => {
        if (t.type === 'expense') totalExpenses += Number(t.amount);
        if (t.type === 'sales') totalRevenue += Number(t.amount);
    });

    const currentProfit = totalRevenue - totalExpenses;
    
    // 1. Update Global Profit Display
    const profitEls = document.querySelectorAll('#wallet-global-profit');
    profitEls.forEach(el => {
        el.textContent = `¥${fmt.format(currentProfit)}`;
        el.style.color = currentProfit < 0 ? '#FF3B30' : 'var(--text-main)';
    });

    // 2. Update Profit Ring
    const profitProgress = document.getElementById('wallet-ring-progress');
    if (profitProgress) {
        // Circumference of r=100 is approx 628
        const target = config.targetMonthlyProfit;
        let percentage = (currentProfit / target);
        if (percentage < 0) percentage = 0;
        if (percentage > 1) percentage = 1;
        
        // Dashoffset: 628 is 0%, 0 is 100%
        const offset = Math.max(0, 628 - (628 * percentage));
        profitProgress.style.strokeDashoffset = offset;
    }

    // 3. Update Tax Prep (Simple estimate: 30% of profit if positive)
    const taxPrepEl = document.getElementById('wallet-tax-prep');
    const taxBarEl = document.getElementById('wallet-tax-bar');
    if (taxPrepEl && taxBarEl) {
        const estimatedTax = currentProfit > 0 ? currentProfit * 0.30 : 0;
        taxPrepEl.textContent = `¥${fmt.format(Math.floor(estimatedTax))}`;
        taxBarEl.style.width = Math.min(100, (estimatedTax / 300000) * 100) + '%';
    }

    // 3b. Update Fixed Costs & Investment displays (from config)
    const fixedCostsEl = document.getElementById('wallet-fixed-costs-display');
    const fixedBarEl   = document.getElementById('wallet-fixed-bar');
    if (fixedCostsEl) fixedCostsEl.textContent = _fmtShort(config.fixedCosts);
    if (fixedBarEl)   fixedBarEl.style.width = Math.min(100, (config.fixedCosts / totalRevenue) * 100 || 40) + '%';

    const investmentEl  = document.getElementById('wallet-investment-display');
    const investBarEl   = document.getElementById('wallet-investment-bar');
    if (investmentEl) investmentEl.textContent = _fmtShort(config.investment);
    if (investBarEl)  investBarEl.style.width = Math.min(100, (config.investment / config.targetMonthlyProfit) * 100 || 85) + '%';

    // 4. Update Summary Text
    const summaryEl = document.getElementById('wallet-tax-summary');
    if (summaryEl) {
        const userName = state.user?.user_metadata?.name || '社長';
        const estimatedTax = currentProfit > 0 ? currentProfit * 0.30 : 0;
        
        summaryEl.innerHTML = `
            ${userName}、現在の売上合計は <strong>¥${fmt.format(totalRevenue)}</strong>、
            経費合計は <strong>¥${fmt.format(totalExpenses)}</strong> です。<br>
            予測される申告所得（税引前）は <strong>¥${fmt.format(currentProfit)}</strong>、
            概算納税額は約 <strong>¥${fmt.format(Math.floor(estimatedTax))}</strong> となります。
        `;
    }

    // 5. Render Cashflow Bars (Mock Data for UI design consistency)
    renderCashflowChart();
}

function renderCashflowChart() {
    const cfContainer = document.getElementById('wallet-cf-container');
    if (!cfContainer) return;
    
    // Generate 6 sample bars for aesthetic
    cfContainer.innerHTML = '';
    const heights = [30, 50, 45, 80, 60, 100]; // percentages
    
    heights.forEach((h, i) => {
        const isFuture = i > 2;
        const color = isFuture ? 'rgba(29, 155, 240, 0.4)' : 'var(--accent-neo-blue)';
        
        cfContainer.innerHTML += `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; width: 100%; margin: 0 4px;">
                <div style="width: 100%; max-width: 24px; height: calc(${h}% - 24px); background: ${color}; border-radius: 4px 4px 0 0; transition: height 0.5s ease;"></div>
                <div style="font-size: 11px; font-weight: 500; color: var(--text-muted); margin-top: 8px; line-height: 1;">10/${i+1}</div>
            </div>
        `;
    });
}

function bindWalletEvents() {
    const btnCsv = document.getElementById('btn-export-csv');
    if (btnCsv) {
        btnCsv.addEventListener('click', () => {
            if (window.showNeoToast) window.showNeoToast('success', 'CSVエクスポート準備完了');
        });
    }

    const btnPdf = document.getElementById('btn-export-pdf-grid');
    if (btnPdf) {
        btnPdf.addEventListener('click', () => {
            if (window.showNeoToast) window.showNeoToast('success', 'PDFエクスポート準備完了');
        });
    }

    // Save wallet config from edit inputs
    const btnSave = document.getElementById('btn-save-wallet-config');
    if (btnSave) {
        btnSave.addEventListener('click', () => {
            const tp = Number(document.getElementById('input-target-profit')?.value) || 1000000;
            const fc = Number(document.getElementById('input-fixed-costs')?.value)   || 120000;
            const iv = Number(document.getElementById('input-investment')?.value)    || 475000;

            _saveWalletConfig({ targetMonthlyProfit: tp, fixedCosts: fc, investment: iv });

            // Re-render with new values
            renderWalletContent();

            if (window.showNeoToast) window.showNeoToast('success', '設定を保存しました');
        });
    }
}

// Expose globally for direct HTML use if needed
window.saveWalletConfig = () => document.getElementById('btn-save-wallet-config')?.click();
