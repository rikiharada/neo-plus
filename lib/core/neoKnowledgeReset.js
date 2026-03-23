/**
 * Neo+ Day 1 / データリセット
 * ─ 知識系テーブル（neo_knowledge, semantic_cache, vector_embeddings, neo_global_lexicon）は一切触れない。
 * ─ ユーザーデータ（projects, activities, transactions, documents + ローカルボディ）を空に近づける。
 *
 * 注意: Supabase の行に user_id が無いレガシーデータは `.eq('user_id')` では消えない。
 *       そのため「RLS で SELECT できる project id」を列挙してから子→親の順で削除する。
 */

const LOCAL_KNOWLEDGE_KEYS = [
    'neo_long_term_soul',
    'neo_long_term_soul_extracted',
    'neo_ai_corrections',
    'neo_feedback_memory'
];

/** 知識系 localStorage のみ削除（永続ルール: Supabase の知識テーブルは呼び出し側で触らない） */
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
    console.log('[Neo][Knowledge] ローカル学習キャッシュ（soul / corrections 等）をクリアしました（DB の neo_knowledge 等は未変更）。');
}

/**
 * Day 1: ユーザーデータのみ削除。知識系 Supabase テーブルには DELETE しない。
 */
export async function neoHardResetKnowledge() {
    const label = '[Neo][DayOne]';
    console.log(
        `%c${label}`,
        'color:#2563eb;font-weight:800;',
        'ユーザーデータのみ消去します（neo_knowledge / semantic_cache / vector_embeddings / neo_global_lexicon は保護）。'
    );

    const client = typeof window !== 'undefined' ? window.supabaseClient : null;
    if (!client) {
        console.warn(`${label} Supabase なし → ローカルのみクリア`);
        neoDangerZoneWipeUserLocalBody({ context: 'no_supabase' });
        return { ok: true, mode: 'local_only' };
    }

    try {
        const { data: { session } } = await client.auth.getSession();
        if (!session?.user?.id) {
            console.warn(`${label} 未ログイン → ローカルのみクリア`);
            neoDangerZoneWipeUserLocalBody({ context: 'no_session' });
            return { ok: true, mode: 'local_only_no_session' };
        }

        const uid = session.user.id;

        const { data: projs, error: projErr } = await client.from('projects').select('id');
        if (projErr) {
            console.warn(`${label} projects 一覧取得失敗:`, projErr.message);
        }
        const projectIds = (projs || []).map((p) => p.id).filter((id) => id != null);

        for (const pid of projectIds) {
            const { error: e1 } = await client.from('activities').delete().eq('project_id', pid);
            if (e1) console.warn(`${label} activities delete project_id=${pid}:`, e1.message);
            const { error: e1b } = await client.from('transactions').delete().eq('project_id', pid);
            if (e1b) console.warn(`${label} transactions delete project_id=${pid}:`, e1b.message);
            const { error: e2 } = await client.from('documents').delete().eq('project_id', pid);
            if (e2) console.warn(`${label} documents delete project_id=${pid}:`, e2.message);
        }

        const { error: e3 } = await client.from('activities').delete().eq('user_id', uid);
        if (e3) console.warn(`${label} activities delete user_id:`, e3.message);

        const { error: e4 } = await client.from('transactions').delete().eq('user_id', uid);
        if (e4) console.warn(`${label} transactions delete user_id:`, e4.message);

        const { error: e5 } = await client.from('documents').delete().eq('user_id', uid);
        if (e5) {
            /* documents に user_id が無い環境では無視 */
        }

        for (const pid of projectIds) {
            const { error: e6 } = await client.from('projects').delete().eq('id', pid);
            if (e6) console.warn(`${label} projects delete id=${pid}:`, e6.message);
        }

        const { error: e7 } = await client.from('projects').delete().eq('user_id', uid);
        if (e7) console.warn(`${label} projects delete user_id:`, e7.message);

        console.log(
            `${label} リモート削除を試行しました（project ${projectIds.length} 件ベース）。RLS や NULL user_id で残る場合は SQL Editor で確認してください。`
        );

        neoDangerZoneWipeUserLocalBody({ context: 'after_remote_delete' });

        if (typeof window.refreshNeoUserDataFromRemote === 'function') {
            await window.refreshNeoUserDataFromRemote();
            console.log(`${label} リモートから再同期しました。`);
        } else {
            console.warn(`${label} window.refreshNeoUserDataFromRemote 未定義 — ページを再読み込みしてください。`);
        }

        return { ok: true, mode: 'day_one_user_data', projectIdsTouched: projectIds.length };
    } catch (e) {
        console.warn(`${label} エラー:`, e?.message || e);
        neoDangerZoneWipeUserLocalBody({ context: 'error_fallback' });
        return { ok: false, mode: 'error', error: String(e?.message || e) };
    }
}

/**
 * ローカルにキャッシュされたユーザーボディのみ削除。
 * @param {{ context?: string }} opts
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
            console.warn('[Neo][LocalBody] ローカルのみ空です。Supabase に行が残っていれば再同期で戻ります。`neoHardReset()` でリモートも削除してください。');
        }
    } catch (e) {
        console.error('[Neo][LocalBody] 失敗:', e);
    }
}
