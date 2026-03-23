/**
 * Neo+ Day 1 / データリセット
 * ─ 知識系テーブルは一切触れない。
 * ─ ユーザーデータ（projects, activities, transactions, documents + ローカルボディ）を空に近づける。
 *
 * 注意: `documents` は環境によって user_id 列が無い（project_id のみ）。user_id での DELETE は発行しない。
 *       レガシー行は project 列挙 → project_id で子削除。
 */

const LOCAL_KNOWLEDGE_KEYS = [
    'neo_long_term_soul',
    'neo_long_term_soul_extracted',
    'neo_ai_corrections',
    'neo_feedback_memory'
];

/** 知識系 localStorage のみ削除 */
export function clearLocalKnowledgeLayer() {
    LOCAL_KNOWLEDGE_KEYS.forEach((k) => {
        try {
            localStorage.removeItem(k);
        } catch {
            /* ignore */
        }
    });
    try {
        window.aiCorrectionLog = [];
    } catch {
        /* ignore */
    }
    try {
        window.globalLexicon = [];
    } catch {
        /* ignore */
    }
    console.log('[Neo][Knowledge] ローカル学習キャッシュをクリアしました（DB の neo_knowledge 等は未変更）。');
}

function clearDriveFolderCacheKeys() {
    try {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('neo_drive_folder_')) keys.push(k);
        }
        keys.forEach((k) => localStorage.removeItem(k));
        if (keys.length) console.log(`[Neo][LocalBody] Drive フォルダキャッシュ ${keys.length} キーを削除しました。`);
    } catch {
        /* ignore */
    }
}

/** PostgREST: 存在しない列を指定したとき */
function isMissingColumnError(err) {
    const m = String(err?.message || err?.details || '');
    return /column .* does not exist|42703/i.test(m);
}

/**
 * Day 1: ユーザーデータのみ削除。
 */
export async function neoHardResetKnowledge() {
    const label = '[Neo][DayOne]';
    console.log(
        `%c${label}`,
        'color:#2563eb;font-weight:800;',
        'ユーザーデータのみ消去（知識テーブルは保護）。documents は user_id 列が無い環境があるため project_id のみで削除します。'
    );

    const client = typeof window !== 'undefined' ? window.supabaseClient : null;
    if (!client) {
        console.warn(`${label} Supabase なし → ローカルのみ`);
        neoDangerZoneWipeUserLocalBody({ context: 'no_supabase' });
        return { ok: true, mode: 'local_only' };
    }

    try {
        const { data: { session } } = await client.auth.getSession();
        const uid = session?.user?.id || null;

        if (!uid) {
            console.warn(`${label} 未ログイン → ローカルのみ`);
            neoDangerZoneWipeUserLocalBody({ context: 'no_session' });
            return { ok: true, mode: 'local_only_no_session' };
        }

        const { data: projs, error: projErr } = await client.from('projects').select('id');
        if (projErr) console.warn(`${label} projects 一覧:`, projErr.message);
        const projectIds = (projs || []).map((p) => p.id).filter((id) => id != null);

        console.log(`${label} カスケード削除（projects 見えている件数: ${projectIds.length}）`);

        for (const pid of projectIds) {
            const { error: e1 } = await client.from('activities').delete().eq('project_id', pid);
            if (e1) console.warn(`${label} activities project_id=${pid}:`, e1.message);
            const { error: e1b } = await client.from('transactions').delete().eq('project_id', pid);
            if (e1b && !isMissingColumnError(e1b)) console.warn(`${label} transactions project_id=${pid}:`, e1b.message);
            const { error: e2 } = await client.from('documents').delete().eq('project_id', pid);
            if (e2) console.warn(`${label} documents project_id=${pid}:`, e2.message);
        }

        const { error: e3 } = await client.from('activities').delete().eq('user_id', uid);
        if (e3 && !isMissingColumnError(e3)) console.warn(`${label} activities user_id:`, e3.message);

        const { error: e4 } = await client.from('transactions').delete().eq('user_id', uid);
        if (e4 && !isMissingColumnError(e4)) console.warn(`${label} transactions user_id:`, e4.message);

        /* documents: user_id 列が無い DB が多い — project_id カスケードのみ。user_id は使わない。 */

        for (const pid of projectIds) {
            const { error: e6 } = await client.from('projects').delete().eq('id', pid);
            if (e6) console.warn(`${label} projects id=${pid}:`, e6.message);
        }

        const { error: e7 } = await client.from('projects').delete().eq('user_id', uid);
        if (e7 && !isMissingColumnError(e7)) console.warn(`${label} projects user_id:`, e7.message);

        const { data: rpcData, error: rpcErr } = await client.rpc('day_one_wipe_user_data_via_owner');
        if (!rpcErr && rpcData) {
            console.log(`${label} RPC 補助:`, rpcData);
        } else if (rpcErr && !isMissingColumnError(rpcErr) && !/function|does not exist|schema cache|PGRST202/i.test(String(rpcErr.message || ''))) {
            console.warn(`${label} RPC:`, rpcErr.message);
        }

        neoDangerZoneWipeUserLocalBody({ context: 'after_remote_delete' });

        if (typeof window.refreshNeoUserDataFromRemote === 'function') {
            await window.refreshNeoUserDataFromRemote();
            console.log(`${label} 再同期しました。Activities merged の remote= を確認してください。`);
        } else {
            console.warn(`${label} refreshNeoUserDataFromRemote 未定義 — 再読み込みしてください。`);
        }

        return { ok: true, mode: 'day_one_user_data', projectIdsTouched: projectIds.length };
    } catch (e) {
        console.warn(`${label} エラー:`, e?.message || e);
        neoDangerZoneWipeUserLocalBody({ context: 'error_fallback' });
        return { ok: false, mode: 'error', error: String(e?.message || e) };
    }
}

/**
 * ローカルのユーザーボディのみ削除。
 */
export function neoDangerZoneWipeUserLocalBody(opts = {}) {
    const ctx = opts.context || 'manual';
    console.warn(
        '%c[Neo][LocalBody]',
        'color:#f59e0b;font-weight:800;',
        `ユーザーローカルボディを削除します (${ctx})`
    );
    try {
        localStorage.removeItem('neo_local_body_activities');
        localStorage.removeItem('neo_local_body_projects');
        localStorage.removeItem('neo_transactions');
        localStorage.removeItem('neo_deleted_projects');
        clearDriveFolderCacheKeys();

        if (window.GlobalStore && typeof window.GlobalStore.updateState === 'function') {
            window.GlobalStore.updateState({ activities: [], projects: [] });
        }

        if (window.mockDB) {
            window.mockDB.projects = [];
            window.mockDB.activities = [];
            window.mockDB.transactions = [];
            window.mockDB.documents = [];
        }
        if (typeof window.persistLocalBody === 'function') window.persistLocalBody();
        if (typeof window.renderProjects === 'function') window.renderProjects([]);
        window.dispatchEvent(new CustomEvent('neo-render-projects', { detail: { projects: [] } }));
        window.renderCockpitFeed?.();
        if (opts.context === 'after_remote_delete' || opts.context === 'no_supabase' || opts.context === 'no_session') {
            console.log('[Neo][LocalBody] ローカルキャッシュを空にしました。');
        } else {
            console.warn('[Neo][LocalBody] ローカルのみ空です。リモートに行が残っていれば再同期で戻ります。');
        }
    } catch (e) {
        console.error('[Neo][LocalBody] 失敗:', e);
    }
}
