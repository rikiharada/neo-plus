import { supabase } from '../lib/supabase-client.js';

const NEO_DASH_WELCOME_DATE_KEY = 'neo_dash_welcome_last_date';

function _neoLocalDateKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function _shouldShowNeoCockpitWelcome() {
    try {
        return localStorage.getItem(NEO_DASH_WELCOME_DATE_KEY) !== _neoLocalDateKey();
    } catch {
        return true;
    }
}

function _markNeoCockpitWelcomeDay() {
    try {
        localStorage.setItem(NEO_DASH_WELCOME_DATE_KEY, _neoLocalDateKey());
    } catch {
        /* ignore */
    }
}

/** 初回アクセス or 毎朝（ローカル日付の初回ホーム表示）に一度だけ大きな吹き出しを出す */
function initNeoCockpitWelcomeBanner() {
    const root = document.getElementById('neo-cockpit-welcome');
    if (!root) return;

    if (!_shouldShowNeoCockpitWelcome()) return;

    _markNeoCockpitWelcomeDay();
    root.setAttribute('aria-hidden', 'false');
    root.classList.remove('hidden');
    requestAnimationFrame(() => {
        root.classList.add('neo-cockpit-welcome--visible');
    });

    if (window.lucide?.createIcons) {
        window.lucide.createIcons();
    }

    const hide = () => {
        root.setAttribute('aria-hidden', 'true');
        root.classList.remove('neo-cockpit-welcome--visible');
        root.classList.add('hidden');
        delete root.dataset.neoWelcomeBound;
    };

    if (!root.dataset.neoWelcomeBound) {
        root.dataset.neoWelcomeBound = '1';
        document.getElementById('neo-cockpit-welcome-dismiss')?.addEventListener('click', hide);
        const ta = document.getElementById('main-instruction-input');
        ta?.addEventListener('focus', hide, { once: true });
    }
}

export function initHomeView() {
    checkLatestBusinessTrends();
    setupHomeListeners();
    initNeoCockpitWelcomeBanner();
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

    // 送信は js/app.js bindCockpitInputs で一元バインド（重複送信防止）

    // Ensure Lucide icons render in the newly loaded template
    if (window.lucide) {
        window.lucide.createIcons();
    }

    // 初期フィードをmockDBからレンダリング
    window.renderCockpitFeed();
}

// ────────────────────────────────────────────────────────────
//  フィードシステム
// ────────────────────────────────────────────────────────────

/** 相対時刻ラベル（「今」「3分前」「2時間前」等） */
function _feedTimeLabel(dateStr) {
    try {
        const d = new Date(dateStr?.replace(/\//g, '-') ?? Date.now());
        const diff = Math.floor((Date.now() - d.getTime()) / 1000);
        if (diff < 10)  return '今';
        if (diff < 60)  return `${diff}秒前`;
        if (diff < 3600) return `${Math.floor(diff/60)}分前`;
        if (diff < 86400) return `${Math.floor(diff/3600)}時間前`;
        return `${Math.floor(diff/86400)}日前`;
    } catch { return ''; }
}

/** カテゴリ → lucide アイコン名 */
function _feedIcon(type, category) {
    if (type === 'revenue') return 'trending-up';
    if (type === 'project') return 'folder-plus';
    const c = category || '';
    if (/材料|資材/.test(c))       return 'package';
    if (/人件|労務|外注/.test(c))  return 'users';
    if (/交通|旅費/.test(c))       return 'car';
    if (/接待|食事|飲食/.test(c))  return 'coffee';
    if (/消耗品/.test(c))          return 'shopping-bag';
    if (/通信|電話/.test(c))       return 'smartphone';
    if (/光熱|電気|水道|ガス/.test(c)) return 'zap';
    if (/広告|宣伝/.test(c))       return 'megaphone';
    if (/雑費/.test(c))            return 'layers';
    return 'receipt';
}

/**
 * カテゴリ・タイプ → アイコン背景色／文字色
 * 同カテゴリは同色、異カテゴリは必ず異なる色を返す
 */
function _categoryColor(type, category) {
    if (type === 'revenue')  return { bg: 'rgba(16,185,129,0.13)',  color: '#10b981' }; // 緑
    if (type === 'project')  return { bg: 'rgba(99,102,241,0.13)',  color: '#6366f1' }; // インディゴ
    const c = category || '';
    if (/材料|資材/.test(c))           return { bg: 'rgba(249,115,22,0.13)',  color: '#f97316' }; // オレンジ
    if (/人件|労務|外注/.test(c))      return { bg: 'rgba(59,130,246,0.13)',  color: '#3b82f6' }; // ブルー
    if (/交通|旅費/.test(c))           return { bg: 'rgba(6,182,212,0.13)',   color: '#06b6d4' }; // シアン
    if (/接待|食事|飲食/.test(c))      return { bg: 'rgba(244,63,94,0.13)',   color: '#f43f5e' }; // ローズ
    if (/消耗品/.test(c))              return { bg: 'rgba(245,158,11,0.13)',  color: '#f59e0b' }; // アンバー
    if (/通信|電話/.test(c))           return { bg: 'rgba(139,92,246,0.13)',  color: '#8b5cf6' }; // バイオレット
    if (/光熱|電気|水道|ガス/.test(c)) return { bg: 'rgba(20,184,166,0.13)',  color: '#14b8a6' }; // ティール
    if (/広告|宣伝/.test(c))           return { bg: 'rgba(239,68,68,0.13)',   color: '#ef4444' }; // レッド
    if (/雑費/.test(c))                return { bg: 'rgba(100,116,139,0.13)', color: '#64748b' }; // スレート
    // 経費（汎用）
    return { bg: 'rgba(239,68,68,0.10)', color: '#ef4444' };
}

/** フィードアイテム1件のHTMLを生成 */
function _buildFeedItemHTML(item) {
    // item: { type, title, sub, amount, date, projectName, category }
    const timeLabel = _feedTimeLabel(item.date);
    const iconName  = _feedIcon(item.type, item.category);
    const col       = _categoryColor(item.type, item.category);

    const amountStr = item.amount
        ? `<span class="feed-amount ${item.type === 'revenue' ? 'revenue' : 'expense'}">` +
          (item.type === 'revenue' ? '+' : '-') + `¥${Number(item.amount).toLocaleString()}</span>`
        : '';

    // カテゴリバッジ（経費種別）
    const catLabel = item.category
        ? `<span style="font-size:10px;font-weight:600;color:${col.color};background:${col.bg};padding:1px 6px;border-radius:6px;margin-right:4px;">${item.category}</span>`
        : '';

    // プロジェクトタグ（カテゴリバッジとは別）
    const projectTag = item.projectName
        ? `<span style="font-size:11px;color:var(--text-muted);background:var(--btn-secondary-bg);padding:2px 7px;border-radius:8px;margin-right:4px;">📁 ${item.projectName}</span>`
        : '';

    // sub は projectName と重複しない場合のみ表示
    const subText = (item.sub && item.sub !== item.projectName) ? item.sub : '';

    return `
    <div class="feed-item" data-feed-id="${item.id || ''}">
        <div class="feed-icon" style="background:${col.bg};color:${col.color};">
            <i data-lucide="${iconName}" style="width:18px;height:18px;"></i>
        </div>
        <div class="feed-body">
            <div class="feed-header">
                <span class="feed-title">${item.title || '無題'}</span>
                <span class="feed-time">${timeLabel}</span>
            </div>
            <div class="feed-sub">${projectTag}${catLabel}${subText}</div>
            ${amountStr}
        </div>
    </div>`;
}

/** Neoの確認メッセージをフィードに追加 */
function _buildNeoMsgHTML(text) {
    const timeStr = new Date().toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit', hour12:false });
    return `
    <div class="feed-item neo-msg">
        <img src="/img/neo_avatar.jpg" class="feed-neo-avatar" alt="Neo"
             onerror="this.style.background='#6366f1';this.src='';this.alt='N';">
        <div class="feed-neo-bubble">
            ${text}
            <span class="feed-time">${timeStr}</span>
        </div>
    </div>`;
}

/**
 * フィードの先頭にアイテムを追加する（アニメーション付き）
 * @param {'expense'|'revenue'|'project'|'neo'} type
 * @param {object} data  - title, amount, projectName, category, sub, date, id
 */
window.pushFeedMessage = function(type, data) {
    const feed = document.getElementById('cockpit-timeline-feed');
    if (!feed) return;

    // 空プレースホルダーを消す
    const empty = feed.querySelector('.feed-empty');
    if (empty) empty.remove();

    let html = '';
    if (type === 'neo') {
        html = _buildNeoMsgHTML(data.text || '');
    } else {
        html = _buildFeedItemHTML({ type, ...data });
    }

    // データ系アイテムの場合はページをリセットして先頭に表示
    // (neo メッセージはページをまたいで最上部に挿入するため除外)
    if (type !== 'neo') {
        window._feedCurrentPage = 0;
        // ページネーションUIを除去して先頭挿入が正しい位置になるよう整理
        const pagination = feed.querySelector('.feed-pagination');
        if (pagination) pagination.remove();
    }

    // 先頭に挿入
    feed.insertAdjacentHTML('afterbegin', html);

    // Lucide アイコン再適用
    if (window.lucide) window.lucide.createIcons();

    // 50件超えたら古いものを削除
    const items = feed.querySelectorAll('.feed-item');
    if (items.length > 50) items[items.length - 1].remove();
};

// ─── ページネーション設定 ───────────────────────────────────────
const _FEED_PAGE_SIZE = 10;
window._feedCurrentPage = 0;

/** ページネーションUIのHTMLを生成 */
function _buildPaginationHTML(page, totalPages, total) {
    const start = page * _FEED_PAGE_SIZE + 1;
    const end   = Math.min((page + 1) * _FEED_PAGE_SIZE, total);

    // ページ番号ボタン (最大5個表示)
    const WINDOW = 2; // 現在ページ前後に表示するページ数
    const pageButtons = [];
    for (let i = 0; i < totalPages; i++) {
        if (
            i === 0 ||
            i === totalPages - 1 ||
            (i >= page - WINDOW && i <= page + WINDOW)
        ) {
            if (pageButtons.length > 0 && i - pageButtons[pageButtons.length - 1].i > 1) {
                pageButtons.push({ ellipsis: true, i });
            }
            pageButtons.push({ i, ellipsis: false });
        }
    }

    const btnHTML = pageButtons.map(pb => {
        if (pb.ellipsis) return `<span class="feed-page-ellipsis">…</span>`;
        const active = pb.i === page ? 'active' : '';
        return `<button class="feed-page-num ${active}" onclick="window.renderCockpitFeed(${pb.i})" aria-label="${pb.i + 1}ページ">${pb.i + 1}</button>`;
    }).join('');

    return `
    <div class="feed-pagination" role="navigation" aria-label="ページ切り替え">
        <button class="feed-page-arrow" ${page === 0 ? 'disabled' : ''}
            onclick="window.renderCockpitFeed(${page - 1})" aria-label="前のページ">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="feed-page-nums">${btnHTML}</div>
        <button class="feed-page-arrow" ${page >= totalPages - 1 ? 'disabled' : ''}
            onclick="window.renderCockpitFeed(${page + 1})" aria-label="次のページ">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <span class="feed-page-info">${start}–${end} / ${total}件</span>
    </div>`;
}

/**
 * mockDB から既存データを読み込んでフィードをレンダリング
 * @param {number} [page=0] - 表示するページ番号（0始まり）
 */
window.renderCockpitFeed = function(page = 0) {
    const feed = document.getElementById('cockpit-timeline-feed');
    if (!feed) return;

    const activities = window.mockDB?.activities || [];
    const txs        = window.mockDB?.transactions || [];
    const projects   = window.mockDB?.projects || [];

    // 全アクティビティをマージして日時降順にソート（件数制限なし）
    const all = [...activities, ...txs.filter(t => !activities.find(a => a.id === t.id))]
        .filter(t => !t.is_deleted)
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    // プロジェクトIDマップ
    const projMap = {};
    projects.forEach(p => { projMap[p.id] = p.name; });

    if (all.length === 0) {
        feed.innerHTML = `
        <div class="feed-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            <p>まだアクティビティがありません。<br>コックピットから入力して始めましょう。</p>
        </div>`;
        return;
    }

    // ページ範囲を計算
    const total      = all.length;
    const totalPages = Math.ceil(total / _FEED_PAGE_SIZE);
    const safePage   = Math.max(0, Math.min(page, totalPages - 1));
    window._feedCurrentPage = safePage;

    const pageItems = all.slice(safePage * _FEED_PAGE_SIZE, (safePage + 1) * _FEED_PAGE_SIZE);

    feed.innerHTML = pageItems.map(t => {
        const projName = t.projectName || projMap[t.projectId] || '';
        return _buildFeedItemHTML({
            id:          t.id,
            type:        t.type === 'income' ? 'revenue' : (t.type || 'expense'),
            title:       t.title || t.category || '経費',
            sub:         '',
            projectName: projName,
            amount:      t.amount,
            date:        t.date,
            category:    t.category
        });
    }).join('');

    // 複数ページある場合のみページネーションUIを追加
    if (totalPages > 1) {
        feed.insertAdjacentHTML('beforeend', _buildPaginationHTML(safePage, totalPages, total));
    }

    if (window.lucide) window.lucide.createIcons();

    // ページ切り替え時はフィード先頭までスクロール
    if (page > 0) {
        setTimeout(() => {
            feed.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 40);
    }
};

// neo-render-projects イベントでフィードも更新
window.addEventListener('neo-render-projects', () => {
    window.renderCockpitFeed?.();
});
