import { supabase } from '../lib/supabase-client.js';

export function initHomeView() {
    checkLatestBusinessTrends();
    setupHomeListeners();
}

function checkLatestBusinessTrends() {
    const marqueeText = document.getElementById('trend-marquee-text');
    const mockTrendNews = [
        "【IT導入補助金】令和8年度のスケジュールが更新されました。",
        "【インボイス制度】免税事業者の経過措置（8割控除）に関するFAQが追加されました",
        "【確定申告】今年のe-Taxのメンテナンス予定が発表されました",
        "【Neo+稼働状況】AI監査エンジンは現在100%の精度で稼働中..."
    ];
    if (marqueeText) {
        const randomNews = mockTrendNews[Math.floor(Math.random() * mockTrendNews.length)];
        marqueeText.textContent = `SYSTEM ONLINE: ${randomNews} // Current Status: Awaiting CEO Input...`;
    }
}

// AI Cockpit Toggle (previously global)
window.toggleCockpit = () => {
    const cockpit = document.getElementById('neo-cockpit');
    if (!cockpit) return;

    if (cockpit.style.display === 'none') {
        cockpit.style.display = 'block';
        cockpit.classList.add('active'); // New class to physically push content
        cockpit.style.opacity = '0';
        setTimeout(() => cockpit.style.opacity = '1', 10);

        // Focus textarea securely
        const ta = document.getElementById('main-instruction-input');
        if (ta) setTimeout(() => ta.focus(), 200);
    } else {
        cockpit.style.opacity = '0';
        cockpit.classList.remove('active');
        setTimeout(() => cockpit.style.display = 'none', 300);
    }
};

window.openDashToCockpit = () => {
    window.switchView('view-dash');
    const cockpit = document.getElementById('neo-cockpit');
    if (cockpit) {
        cockpit.style.display = 'block';
        cockpit.classList.add('active');
        cockpit.style.opacity = '1';

        const ta = document.getElementById('main-instruction-input');
        if (ta) setTimeout(() => ta.focus(), 200);

        // Scroll to top
        const scrollContainer = document.getElementById('app-container') || document.documentElement;
        scrollContainer.scrollTop = 0;
    }
};

function setupHomeListeners() {
    const dashInput = document.getElementById('main-instruction-input');
    if (dashInput) {
        // Real-time parsing handled by bindCockpitInputs (8-category extractor via extractTags).
        // No duplicate listener needed here.

        // Trigger command with Enter key (IME-safe: skip during Japanese composition)
        // Route through handleCompoundAction — handles project+multi-expense in one input
        dashInput.addEventListener('keydown', (e) => {
            if (e.isComposing || e.keyCode === 229) return;
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const textValue = dashInput.value.trim();
                if (!textValue) return;
                dashInput.value = '';
                const handler = window.handleCompoundAction || window.handleInstruction;
                if (handler) handler(textValue);
            }
        });
    }

    const btnSend = document.getElementById('btn-send');
    if (btnSend && dashInput) {
        btnSend.addEventListener('click', () => {
            const textValue = dashInput.value.trim();
            if (!textValue) return;
            dashInput.value = '';
            const handler = window.handleCompoundAction || window.handleInstruction;
            if (handler) handler(textValue);
        });
    }

    // Ensure Lucide icons render in the newly loaded template
    if (window.lucide) {
        window.lucide.createIcons();
    }
}
