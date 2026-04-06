import { supabase } from '../lib/supabase-client.js';

export function initProjectView() {
    console.log("[Neo Router] Initialized Project View");

    // ---- 1. データ読み込み & レンダリング ----
    const container = document.getElementById('project-list-container');
    if (container) {
        container.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 16px;gap:16px;color:var(--text-muted);">
                <i data-lucide="loader-2" style="width:28px;height:28px;animation:spin 1s linear infinite;color:var(--accent-neo-blue);"></i>
                <span style="font-size:14px;">プロジェクトを読み込み中...</span>
            </div>`;
        if (window.lucide) window.lucide.createIcons();
    }

    const doRender = (projects) => {
        if (window.renderProjects) {
            window.renderProjects(projects);
        } else {
            window.dispatchEvent(new CustomEvent('neo-render-projects', { detail: { projects } }));
        }
    };

    const cached = window.GlobalStore?.state?.projects ?? [];
    if (cached.length > 0) doRender(cached);

    if (window.GlobalStore?.subscribe) {
        if (window._projectViewUnsub) { window._projectViewUnsub(); window._projectViewUnsub = null; }
        window._projectViewUnsub = window.GlobalStore.subscribe((state) => {
            const isActive = !document.getElementById('view-sites')?.classList.contains('hidden');
            if (isActive) doRender(state.projects ?? []);
        });
    }

    const mapProjectRowToMock = (p) => ({
        id: p.id,
        name: p.name,
        user_id: p.user_id,
        customerName: p.customer_name || '-',
        location: p.location || '-',
        note: p.note || '',
        category: p.category,
        color: p.color,
        unit: p.unit || '-',
        hasUnpaid: p.has_unpaid,
        revenue: parseFloat(p.revenue) || 0,
        status: p.status,
        clientName: p.client_name,
        paymentDeadline: p.payment_deadline,
        bankInfo: p.bank_info,
        lastUpdated: p.last_updated,
        currency: p.currency,
        startDate: p.created_at ? p.created_at.split('T')[0].replace(/-/g, '/') : null
    });

    const fetchFromSupabase = async () => {
        if (!window.supabaseClient) { doRender(window.mockDB?.projects ?? []); return; }
        try {
            let uid = null;
            try {
                uid = await window._resolveSupabaseAuthUid();
            } catch {
                doRender(window.mockDB?.projects ?? []);
                return;
            }
            if (typeof window._isValidSupabaseAuthUid === 'function' && !window._isValidSupabaseAuthUid(uid)) {
                doRender(window.mockDB?.projects ?? []);
                return;
            }
            const { data: projects, error } = await window.supabaseClient
                .from('projects')
                .select('*')
                .eq('user_id', uid)
                .order('created_at', { ascending: false });
            if (error) throw error;
            const list = (projects ?? []).map(mapProjectRowToMock);
            if (window.GlobalStore?.updateState) window.GlobalStore.updateState({ projects: list });
            if (window.mockDB) window.mockDB.projects = list;
            doRender(list);
        } catch (err) {
            console.warn("[Neo Projects] Supabase fetch failed:", err.message);
            doRender(window.mockDB?.projects ?? []);
        }
    };
    fetchFromSupabase();

    // ---- 2. モーダルボタン バインド ----
    // project.html がDOMに存在するこのタイミングで初めてバインドする
    bindProjectModals();
}

function bindProjectModals() {
    const modalNew     = document.getElementById('modal-new-project');
    const btnCreate    = document.getElementById('btn-create-project');
    const btnClose     = document.getElementById('btn-close-modal');
    const btnSave      = document.getElementById('btn-save-project');

    // ── "..." アクションメニュー ──────────────────────────────────────
    // app.js のバインドはビューロード前に実行されるため null になる。
    // project.html がDOMに挿入されたこのタイミングで正しくバインドする。
    const menuToggle      = document.getElementById('btn-project-menu-toggle');
    const actionMenu      = document.getElementById('project-action-menu');

    if (menuToggle && actionMenu) {
        // ボタンをクリックでメニュー表示／非表示
        menuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            actionMenu.classList.toggle('hidden');
        });

        // メニュー外クリックで閉じる
        document.addEventListener('click', (e) => {
            if (!actionMenu.contains(e.target) && e.target !== menuToggle) {
                actionMenu.classList.add('hidden');
            }
        }, { capture: false });
    }
    // ─────────────────────────────────────────────────────────────────

    let selectedColor  = '#FF3B30';

    // カラーピッカー
    document.querySelectorAll('.color-picker-drop').forEach(drop => {
        drop.addEventListener('click', (e) => {
            document.querySelectorAll('.color-picker-drop').forEach(d => d.classList.remove('selected'));
            e.currentTarget.classList.add('selected');
            selectedColor = e.currentTarget.getAttribute('data-color');
        });
    });

    // ＋ボタン → モーダルを開く
    if (btnCreate && modalNew) {
        btnCreate.addEventListener('click', () => {
            modalNew.classList.add('show');

            // 今日の日付をデフォルトセット
            const today = new Date();
            const fmt = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
            const dStart = document.getElementById('new-proj-start-date');
            const dEnd   = document.getElementById('new-proj-end-date');
            if (dStart) dStart.value = fmt;
            if (dEnd)   dEnd.value   = fmt;

            // カラーをデフォルトにリセット
            selectedColor = '#FF3B30';
            document.querySelectorAll('.color-picker-drop').forEach(d => {
                d.classList.toggle('selected', d.getAttribute('data-color') === selectedColor);
            });
        });
    }

    // 閉じるボタン
    if (btnClose && modalNew) {
        btnClose.addEventListener('click', () => modalNew.classList.remove('show'));
    }

    // 保存ボタン
    if (btnSave && modalNew) {
        btnSave.addEventListener('click', async () => {
            const name     = document.getElementById('new-proj-name')?.value?.trim();
            const location = document.getElementById('new-proj-location')?.value?.trim() || '';
            const note     = document.getElementById('new-proj-note')?.value?.trim()     || '';
            const dStartVal = document.getElementById('new-proj-start-date')?.value || '';
            const dEndVal   = document.getElementById('new-proj-end-date')?.value   || '';

            if (!name) { alert('プロジェクト名を入力してください'); return; }

            let dateStr = '';
            if (dStartVal && dEndVal) dateStr = `${dStartVal.replace(/-/g,'/')} - ${dEndVal.replace(/-/g,'/')}`;
            else if (dStartVal)       dateStr = dStartVal.replace(/-/g,'/');

            const newProjId = Math.floor(Date.now() / 1000);
            let startDateStr = '';
            if (dStartVal) startDateStr = dStartVal.replace(/\//g, '-');
            else startDateStr = new Date().toLocaleDateString('ja-JP').replace(/\//g, '-');

            const newProj = {
                id: newProjId,
                name,
                customerName: '-',
                location: location || '-',
                note,
                category: 'other',
                color: selectedColor,
                unit: '-',
                hasUnpaid: false,
                revenue: 0,
                status: 'planning',
                startDate: startDateStr,
                lastUpdated: new Date().toLocaleDateString('ja-JP').replace(/\//g, '-'),
                last_updated: dateStr,
                created_at: new Date().toISOString()
            };

            // db-sync の insertProject: user_id 付与・RLS 整合・重複名は既存行を返す
            if (typeof window.insertProject === 'function') {
                try {
                    await window.insertProject(newProj);
                } catch (err) {
                    console.warn('[Neo Projects] insertProject failed:', err?.message || err);
                    if (!window.mockDB) window.mockDB = { projects: [], activities: [], documents: [] };
                    if (!window.mockDB.projects) window.mockDB.projects = [];
                    window.mockDB.projects.unshift(newProj);
                    window.persistLocalBody?.();
                }
            } else if (window.mockDB) {
                window.mockDB.projects.unshift(newProj);
                window.persistLocalBody?.();
            }

            if (window.GlobalStore?.updateState) {
                window.GlobalStore.updateState({ projects: [...(window.mockDB?.projects ?? [])] });
            }

            // プロジェクト一覧を再描画
            const list = window.mockDB?.projects ?? [];
            if (window.renderProjects) window.renderProjects(list);

            // モーダルを閉じてフォームをリセット
            modalNew.classList.remove('show');
            ['new-proj-name','new-proj-location','new-proj-note','new-proj-start-date','new-proj-end-date'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });

            // Neo フィードバック
            const bubble = document.getElementById('neo-fab-bubble');
            if (bubble) {
                bubble.textContent = '新しいプロジェクト、追加しといたよ！🔥';
                bubble.classList.add('show');
                setTimeout(() => bubble.classList.remove('show'), 3500);
            }
        });
    }

    // モーダル外クリックで閉じる
    if (modalNew) {
        modalNew.addEventListener('click', (e) => {
            if (e.target === modalNew) modalNew.classList.remove('show');
        });
    }
}
