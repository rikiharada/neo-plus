/**
 * Neo+ isolated Database Sync Layer
 */

import {
    resolveDbProjectIdForActivity,
    buildActivityInsertPayload,
    registerUpdateTransaction
} from '../lib/Logic-ActivitySync.js';
import { registerInsertProject } from '../lib/Logic-ProjectSync.js';

// app.js が公開する前のフォールバック（モジュール評価時点で未定義の場合に備える）
const _parseActivityAmount = window._parseActivityAmount
    ?? ((v) => { if (!v) return 0; const n = parseFloat(String(v).replace(/,/g, '').trim()); return Number.isFinite(n) ? n : 0; });

/**
 * 日付文字列を ISO 8601 文字列へ安全変換（cockpit / intent の 2026/04/20 等を Supabase timestamptz に渡す）
 * @param {string|number|Date|null} raw
 * @returns {string} ISO 8601 文字列
 */
function _toISODate(raw) {
    if (raw == null || raw === '') return new Date().toISOString();
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        const d = new Date(raw);
        return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
    }
    if (raw instanceof Date) {
        return isNaN(raw.getTime()) ? new Date().toISOString() : raw.toISOString();
    }
    const str = String(raw).trim();
    const jp = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (jp) {
        const y = jp[1];
        const m = jp[2].padStart(2, '0');
        const day = jp[3].padStart(2, '0');
        const d = new Date(`${y}-${m}-${day}T12:00:00.000Z`);
        return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
    }
    const normalized = str.replace(/\//g, '-');
    const d = new Date(normalized);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function _rollbackActivityRow(normalized) {
    const idx = window.mockDB.activities.findIndex((row) => row === normalized);
    if (idx !== -1) {
        window.mockDB.activities.splice(idx, 1);
        window.persistLocalBody();
    }
}

function _notifyAuthRequiredDbSync() {
    if (typeof window._notifyAuthRequired === 'function') {
        window._notifyAuthRequired('再ログインが必要です。ログイン画面からサインインし直してください。');
    } else {
        alert('再ログインが必要です。ログイン画面からサインインし直してください。');
    }
}

/** UID 解決は js/app.js の window._resolveSupabaseAuthUid に集約（projectdetail より先に利用可） */

/**
 * Supabase 書き込み完了・localBody 確定「後」にのみ呼ぶ（UI は NEO_DATA_UPDATED で同期）
 */
function _emitNeoDataUpdated(payload = {}) {
    try {
        if (window.NeoBus && typeof window.NeoBus.emit === 'function') {
            window.NeoBus.emit('NEO_DATA_UPDATED', { source: 'db-sync', ts: Date.now(), ...payload });
        }
    } catch (e) {
        console.warn('[NeoBus] NEO_DATA_UPDATED emit failed:', e);
    }
}
window._emitNeoDataUpdated = _emitNeoDataUpdated;

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

    let neoEmitted = false;

    window.mockDB.activities.push(normalized);
    window.persistLocalBody();

    if (window.supabaseClient) {
        if (projectId == null || projectId === '') {
            console.warn('[insertTransaction] projectId missing; local activity saved but Supabase activities row skipped (FK).');
            window._refreshCockpitActivityFeed?.();
            _emitNeoDataUpdated({ kind: 'activity', projectId: null, localOnly: true });
            return Promise.resolve(normalized);
        }

        let remoteUid = null;
        try {
            remoteUid = await window._resolveSupabaseAuthUid();
        } catch (e) {
            console.error('[insertTransaction] Skipping Supabase INSERT: could not resolve auth UID', e?.message || e);
        }
        if (
            remoteUid == null ||
            (typeof window._isValidSupabaseAuthUid === 'function' && !window._isValidSupabaseAuthUid(remoteUid))
        ) {
            console.error('[insertTransaction] Skipping Supabase INSERT: invalid or missing user_id (local row kept)');
        } else {
            try {
                window._attachDbSafeIdIfNeeded?.(projForSync);

                // FK Safety: 親プロジェクトの INSERT が飛んでいる間は待つ
                const pendingIns = window._getPendingProjectInsertPromise?.(projectId);
                if (pendingIns) {
                    await pendingIns.catch(() => {});
                }

                const dbProjectId = resolveDbProjectIdForActivity(projectId, projForSync);

                const ensured = window._ensureSupabaseProjectRowForActivity
                    ? await window._ensureSupabaseProjectRowForActivity(projForSync, dbProjectId)
                    : { ok: true };
                if (!ensured.ok) {
                    console.warn('[insertTransaction] Remote activity skipped: could not ensure projects row for FK.');
                } else {
                    /** activities.id は DB 側 DEFAULT（UUID）— クライアント送信しない */
                    const basePayload = buildActivityInsertPayload({
                        normalized,
                        remoteUid,
                        dbProjectId,
                        toISODate: _toISODate
                    });
                    const dbDate = basePayload.date;

                    console.log('[insertTransaction] Supabase INSERT', {
                        user_id: remoteUid,
                        project_id: dbProjectId,
                        project_id_type: typeof dbProjectId,
                        local_projectId: projectId,
                        local_projectId_type: typeof projectId,
                        date_iso: dbDate
                    });

                    const { data: inserted, error: syncErr } = await window.supabaseClient
                        .from('activities')
                        .insert([basePayload])
                        .select();

                    if (syncErr) {
                        console.error('Ledger Sync Error (Activity):', JSON.stringify(syncErr));
                    } else {
                        const insCount = Array.isArray(inserted) ? inserted.length : inserted ? 1 : 0;
                        const rowsFromDb = Array.isArray(inserted) ? inserted : inserted ? [inserted] : [];
                        console.log('[insertTransaction] DB returned row(s) after INSERT:', {
                            count: insCount,
                            rows: rowsFromDb.map((r) => ({
                                id: r.id,
                                project_id: r.project_id,
                                project_id_type: typeof r.project_id,
                                user_id: r.user_id,
                                user_id_type: typeof r.user_id
                            }))
                        });
                        console.log(
                            `[Insert Success] user_id = ${remoteUid} | project_id = ${dbProjectId} | rows inserted = ${insCount}`
                        );
                        console.log('Ledger Sync OK (Activity) user_id=', remoteUid);
                        if (inserted?.[0]?.id != null) {
                            const idx = window.mockDB.activities.findIndex((row) => row === normalized);
                            if (idx !== -1) {
                                window.mockDB.activities[idx] = { ...normalized, id: inserted[0].id };
                                window.persistLocalBody();
                            }
                        }
                        _emitNeoDataUpdated({ kind: 'activity', projectId, remoteInsertOk: true });
                        neoEmitted = true;
                    }
                }
            } catch (e) {
                console.error('Brain Sync Error (Activity async logic):', e);
            }
        }
    }
    window._refreshCockpitActivityFeed?.();
    if (!neoEmitted) {
        _emitNeoDataUpdated({ kind: 'activity', projectId });
    }
    return Promise.resolve(normalized);
};

registerInsertProject({ _emitNeoDataUpdated, _notifyAuthRequiredDbSync });
registerUpdateTransaction({ _notifyAuthRequiredDbSync, _emitNeoDataUpdated });

