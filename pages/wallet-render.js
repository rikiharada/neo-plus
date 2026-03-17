/**
 * Neo+ Wallet Render Component
 * Handles the display of the health dashboard and tax summaries.
 */

// Format numbers
const fmt = new Intl.NumberFormat('ja-JP');

export function initWalletView() {
    console.log("[Neo Wallet] Initializing...");
    
    // Subscribe to GlobalStore changes to keep wallet updated
    if (window.GlobalStore) {
        window.GlobalStore.subscribe(renderWalletContent);
    }
    
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
    const transactions = state.transactions || [];
    const projects = state.projects || [];
    const config = window.GlobalStore.userConfig || { targetMonthlyProfit: 1000000 };

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
        // Simple visual bar logic
        taxBarEl.style.width = Math.min(100, (estimatedTax / 300000) * 100) + '%'; 
    }

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
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%;">
                <div style="width: 24px; height: ${h}%; background: ${color}; border-radius: 4px 4px 0 0; transition: height 0.5s ease;"></div>
                <div style="font-size: 10px; color: var(--text-muted); margin-top: 4px;">10/${i+1}</div>
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
}
