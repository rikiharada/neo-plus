/**
 * Neo+ isolated Database Sync Layer
 */

// app.js が公開する前のフォールバック（モジュール評価時点で未定義の場合に備える）
const _parseActivityAmount = window._parseActivityAmount
    ?? ((v) => { if (!v) return 0; const n = parseFloat(String(v).replace(/,/g, '').trim()); return Number.isFinite(n) ? n : 0; });

/**
 * 日付文字列を ISO 8601 文字列へ安全変換（仕様2補助）。
 * 不正な日付や null は現在時刻にフォールバックする。
 * @param {string|number|Date|null} raw
 * @returns {string} ISO 8601 文字列
 */
function _toISODate(raw) {
    if (raw == null || raw === '') return new Date().toISOString();
    const normalized = typeof raw === 'string' ? raw.replace(/\//g, '-') : raw;
    const d = new Date(normalized);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/**
 * 共通 UID 解決関数（仕様1）。
 * 取得成功時は uid 文字列、失敗時は Error('AUTH_REQUIRED') を投げる。
 *
 * 解決順序:
 *   1. GlobalStore.state.user.id（同期・最速）
 *   2. GlobalStore.ready を最大 5 秒待機 → 再チェック（認証レースコンディション対策）
 *   3. supabaseClient.auth.getSession()
 *   4. supabaseClient.auth.getUser()（セッションキャッシュ切れ時フォールバック）
 *   5. 全失敗 → throw Error('AUTH_REQUIRED') で NULL 挿入を阻止
 */
window._resolveSupabaseAuthUid = async function _resolveSupabaseAuthUid() {
    if (!window.supabaseClient) throw new Error('AUTH_REQUIRED');

    // 1. GlobalStore に確定済みユーザーがある場合は即返す
    const storeUid = window.GlobalStore?.state?.user?.id ?? null;
    if (storeUid) return storeUid;

    // 2. GlobalStore.ready を最大 5 秒待機（認証確定を待つ）
    if (window.GlobalStore?.ready) {
        await Promise.race([
            window.GlobalStore.ready,
            new Promise(resolve => setTimeout(resolve, 5000))
        ]);
        const uid2 = window.GlobalStore?.state?.user?.id ?? null;
        if (uid2) return uid2;
    }

    // 3. Supabase セッションから取得
    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (session?.user?.id) return session.user.id;
    } catch { /* ignore */ }

    // 4. getUser() フォールバック
    try {
        const { data: gu } = await window.supabaseClient.auth.getUser();
        if (gu?.user?.id) return gu.user.id;
    } catch { /* ignore */ }

    // 5. 全手段で UID 取得不可 → RLS 違反（NULL 挿入）を防ぐために例外
    throw new Error('AUTH_REQUIRED');
};

window._backfillActivitiesNullUserIdForProjects = async function _backfillActivitiesNullUserIdForProjects(
    client,
    uid,
    projectIds
) {
    if (!client || !uid || !Array.isArray(projectIds) || projectIds.length === 0) {
        return { updated: 0 };
    }
    const uniq = [...new Set(projectIds.filter((x) => x != null && x !== ''))];
    if (uniq.length === 0) return { updated: 0 };
    const { data, error } = await client
        .from('activities')
        .update({ user_id: uid })
        .in('project_id', uniq)
        .is('user_id', null)
        .select('id');
    if (error) {
        console.warn('[Neo] backfill activities.user_id (NULL → current uid) failed:', error);
        return { updated: 0, error };
    }
    const n = Array.isArray(data) ? data.length : 0;
    if (n > 0) {
        console.log(
            `[Neo] backfilled user_id on ${n} activity row(s) where user_id was NULL (project_id in candidates)`
        );
    }
    return { updated: n };
};

window.mapActivityRowToMock = function mapActivityRowToMock(a) {
    const rawPid = a.project_id ?? a.projectId;
    const localPid = window.resolveLocalProjectId ? window.resolveLocalProjectId(rawPid) : rawPid;
    let dateStr = null;
    if (a.date != null && a.date !== '') {
        if (typeof a.date === 'string') {
            dateStr = a.date.includes('T') ? a.date.split('T')[0].replace(/-/g, '/') : String(a.date).replace(/-/g, '/');
        } else if (typeof a.date === 'number') {
            dateStr = new Date(a.date).toLocaleDateString('ja-JP').replace(/\//g, '/');
        } else if (a.date instanceof Date) {
            dateStr = a.date.toLocaleDateString('ja-JP').replace(/\//g, '/');
        }
    }
    return {
        id: a.id,
        projectId: localPid,
        type: a.type,
        category: a.category,
        title: a.title,
        amount: _parseActivityAmount(a.amount),
        date: dateStr,
        receiptUrl: a.receipt_url,
        isBookkeeping: a.is_bookkeeping,
        is_deleted: a.is_deleted || false
    };
};

window.insertProject = async (proj) => {
    // 同名フォルダが既にある場合は挿入せず、その既存レコードを返す（currentOpenProjectId が幽霊IDになるのを防ぐ）
    const dup = window.mockDB.projects.find(
        (p) => p.name && proj.name && p.name.trim() === proj.name.trim()
    );
    if (dup) {
        console.warn('[insertProject] Duplicate name — using existing folder:', proj.name);
        window._attachDbSafeIdIfNeeded(dup);
        return Promise.resolve(dup);
    }
    window.mockDB.projects.unshift(proj);
    window.persistLocalBody();

    window.pendingProjectInserts = window.pendingProjectInserts || {};
    if (window.supabaseClient) {
        const safeId = window._toDbSafeId(proj.id);
        proj._dbSafeId = safeId;
        const pidKey = proj.id;
        window.pendingProjectInserts[pidKey] = (async () => {
            // _resolveSupabaseAuthUid は uid 取得不可時に Error('AUTH_REQUIRED') を投げる
            const uid = await window._resolveSupabaseAuthUid();
            return window.supabaseClient.from('projects').insert([{
                id: safeId,
                name: proj.name,
                category: proj.category || 'other',
                color: proj.color || '#8E8E93',
                status: proj.status || 'active',
                location: proj.location || '-',
                user_id: uid,
                created_at: proj.startDate ? new Date(proj.startDate.replace(/-/g, '/')).toISOString() : new Date().toISOString()
            }]);
        })().then(({ error }) => {
            if (error) console.error('Brain Sync Error (Project):', JSON.stringify(error));
            else console.log('Brain Sync OK (Project)');
            delete window.pendingProjectInserts[pidKey];
            delete window.pendingProjectInserts[String(pidKey)];
        }).catch((err) => {
            console.error('Brain Sync Fatal (Project):', err);
            delete window.pendingProjectInserts[pidKey];
            delete window.pendingProjectInserts[String(pidKey)];
            throw err;
        });
    }
    return Promise.resolve(proj);
};

window.insertTransaction = async (tx) => {
    if (!window.mockDB.activities) window.mockDB.activities = [];

    let projectId = tx.projectId ?? tx.project_id;
    if (projectId == null || projectId === '') {
        const name = tx.projectName || tx.project_name;
        if (name && typeof window.findProjectIdByName === 'function') {
            projectId = window.findProjectIdByName(name);
        }
    }
    if ((projectId == null || projectId === '') && typeof window.resolveExpenseProjectId === 'function') {
        projectId = window.resolveExpenseProjectId(tx, tx.originalInput || '');
    }
    if (projectId == null || projectId === '') {
        const projs = window.mockDB?.projects || [];
        if (window.currentOpenProjectId != null && projs.some((p) => String(p.id) === String(window.currentOpenProjectId))) {
            projectId = window.currentOpenProjectId;
        }
    }
    if (projectId == null || projectId === '') {
        const projs = window.mockDB?.projects || [];
        if (projs.length === 1) projectId = projs[0].id;
    }

    const plist = window.mockDB?.projects || [];
    const canonProj = plist.find((p) => String(p.id) === String(projectId));
    if (canonProj) projectId = canonProj.id;

    const projForSync = canonProj || {
        id: projectId,
        name: tx.projectName || tx.project_name || 'プロジェクト',
        category: 'other',
        color: '#8E8E93',
        status: 'active',
        location: '-'
    };

    const normalized = { ...tx, projectId };
    if (normalized.id == null || normalized.id === '') delete normalized.id;

    window.mockDB.activities.push(normalized);
    window.persistLocalBody();

    if (window.supabaseClient) {
        if (projectId == null || projectId === '') {
            console.warn('[insertTransaction] projectId missing; local activity saved but Supabase activities row skipped (FK).');
            window._refreshCockpitActivityFeed?.();
            return Promise.resolve(normalized);
        }

        try {
            window._attachDbSafeIdIfNeeded?.(projForSync);

            // FK Safety: 親プロジェクトの INSERT が飛んでいる間は待つ
            const pendingIns = window._getPendingProjectInsertPromise?.(projectId);
            if (pendingIns) {
                await pendingIns.catch(() => {});
            }

            const dbProjectId = (() => {
                const s = String(projectId).trim();
                if (!/^\d+$/.test(s)) return projectId;
                if (projForSync && projForSync._dbSafeId != null) return projForSync._dbSafeId;
                return window._toDbSafeId ? window._toDbSafeId(projectId) : Number(projectId);
            })();

            const ensured = window._ensureSupabaseProjectRowForActivity
                ? await window._ensureSupabaseProjectRowForActivity(projForSync, dbProjectId)
                : { ok: true };
            if (!ensured.ok) {
                console.warn('[insertTransaction] Remote activity skipped: could not ensure projects row for FK.');
            } else {
                // _resolveSupabaseAuthUid throws Error('AUTH_REQUIRED') if no uid — no null check needed
                const uid = await window._resolveSupabaseAuthUid();

                /** activities.id は DB 自動採番（int4 serial 等）— INSERT に id は含めない。user_id は RLS と一致させる */
                const dbDate = _toISODate(normalized.date);
                const dbAmount = Number(normalized.amount);
                const basePayload = {
                    project_id: dbProjectId,
                    type: normalized.type,
                    category: normalized.category,
                    title: normalized.title,
                    amount: isNaN(dbAmount) ? 0 : dbAmount,
                    date: dbDate,
                    user_id: uid
                };

                console.log('[insertTransaction] Inserting with user_id:', uid, '| project_id:', dbProjectId);

                const { data: inserted, error: syncErr } = await window.supabaseClient
                    .from('activities')
                    .insert([basePayload])
                    .select();

                if (syncErr) {
                    console.error('Ledger Sync Error (Activity):', JSON.stringify(syncErr));
                } else {
                    const insCount = Array.isArray(inserted) ? inserted.length : inserted ? 1 : 0;
                    console.log(
                        `[Insert Success] user_id = ${uid} | project_id = ${dbProjectId} | rows inserted = ${insCount}`
                    );
                    console.log('Ledger Sync OK (Activity) user_id=', uid);
                    if (inserted?.[0]?.id != null) {
                        const idx = window.mockDB.activities.findIndex((row) => row === normalized);
                        if (idx !== -1) {
                            window.mockDB.activities[idx] = { ...normalized, id: inserted[0].id };
                            window.persistLocalBody();
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Brain Sync Error (Activity async logic):', e);
        }
    }
    window._refreshCockpitActivityFeed?.();
    if (projectId != null && projectId !== '') window._refreshProjectDetailIfOpen?.(projectId);
    return Promise.resolve(normalized);
};

window.updateTransaction = async (txId, updates) => {
    // Local Update
    const tx = window.mockDB.activities.find(t => t.id === txId);
    if (!tx) return;

    // Merge updates
    const originalTitle = tx.title;
    const originalAmount = tx.amount;

    if (updates.category) tx.category = updates.category;
    if (updates.title) tx.title = updates.title;
    if (updates.amount !== undefined) tx.amount = Number(updates.amount);

    tx.is_user_corrected = true; // Flag for Ground Truth Cache Priority

    // Sync to Supabase if exists
    if (window.supabaseClient) {
        try {
            // _resolveSupabaseAuthUid throws Error('AUTH_REQUIRED') if no uid — no null check needed
            await window._resolveSupabaseAuthUid();

            // Note: Since our MVP frontend doesn't strictly pull unique Postgres UUIDs back to window.mockDB.id on insert,
            // we will search and update by original title and amount as a composite fallback for the prototype.
            // In a production app, the insertTransaction should return the actual DB UUID to keep them synced.
            await window.supabaseClient.from('activities').update({
                category: tx.category,
                title: tx.title,
                amount: tx.amount,
                is_user_corrected: true
            }).match({
                title: originalTitle,
                amount: originalAmount,
                date: tx.date
            });
            console.log("Supabase updateTransaction success:", tx.title, "updates:", updates);
        } catch (e) {
            if (e?.message === 'AUTH_REQUIRED') {
                console.warn('[updateTransaction] No auth session; skipping Supabase update.');
            } else {
                console.error('Supabase Update Error:', e);
            }
        }
    }
    window._refreshCockpitActivityFeed?.();
};

