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

    const fetchFromSupabase = async () => {
        if (!window.supabaseClient) { doRender(window.mockDB?.projects ?? []); return; }
        try {
            const { data: projects, error } = await window.supabaseClient
                .from('projects').select('*').order('created_at', { ascending: false });
            if (error) throw error;
            const list = projects ?? [];
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

            const newProj = {
                name,
                location,
                note,
                color:        selectedColor,
                status:       'planning',
                revenue:      0,
                last_updated: dateStr,
                created_at:   new Date().toISOString(),
            };

            // Supabase に保存（接続している場合）
            if (window.supabaseClient) {
                try {
                    const { data, error } = await window.supabaseClient
                        .from('projects').insert([newProj]).select().single();
                    if (error) throw error;
                    newProj.id = data.id ?? Date.now();
                } catch (err) {
                    console.warn("[Neo Projects] Supabase insert failed, saving locally:", err.message);
                    newProj.id = Date.now();
                }
            } else {
                newProj.id = Date.now();
            }

            // ローカルDBに反映（mockDB と GlobalStore が同じ配列参照を持つケースがあるため
            // unshift は mockDB 側の1回だけに限定し、二重追加を防ぐ）
            if (window.mockDB) {
                window.mockDB.projects.unshift(newProj);
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
