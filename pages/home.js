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
        // Real-time local parsing UI
        dashInput.addEventListener('input', (e) => {
            if (!e.target.value) return;
            const parsed = window.parseCommand ? window.parseCommand(e.target.value) : null;
            if (parsed) {
                const previewContainer = document.getElementById('trinity-preview');
                const pTitle = document.getElementById('preview-title');
                const pLoc = document.getElementById('preview-loc');
                const pLocBadge = document.getElementById('preview-loc-badge');
                const pDate = document.getElementById('preview-date');
                const pDateBadge = document.getElementById('preview-date-badge');

                if (previewContainer && pTitle) {
                    previewContainer.style.opacity = '1';
                    pTitle.textContent = parsed.title || '-';

                    if (parsed.location) {
                        pLoc.textContent = parsed.location;
                        pLocBadge.style.display = 'inline-block';
                    } else {
                        pLocBadge.style.display = 'none';
                    }

                    if (parsed.date) {
                        pDate.textContent = parsed.date;
                        pDateBadge.style.display = 'inline-block';
                    } else {
                        pDateBadge.style.display = 'none';
                    }
                }
            }
        });

        // Trigger command with Enter key
        dashInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const textValue = dashInput.value.trim();
                dashInput.value = '';
                if (textValue && window.handleInstruction) {
                    window.handleInstruction(textValue);
                }
            }
        });
    }

    const btnSend = document.getElementById('btn-send');
    if (btnSend && dashInput) {
        btnSend.addEventListener('click', () => {
            const textValue = dashInput.value.trim();
            dashInput.value = '';
            if (textValue && window.handleInstruction) {
                window.handleInstruction(textValue);
            }
        });
    }

    // Ensure Lucide icons render in the newly loaded template
    if (window.lucide) {
        window.lucide.createIcons();
    }
}
