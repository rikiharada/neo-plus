/**
 * activities 向け Supabase 同期ヘルパー（db-sync / chat から利用）
 */
import { normalizeProjectIdForInsert } from './Common-Validator.js';

/**
 * insertTransaction と同じルールで DB 向け project_id を解決し、必ず normalizeProjectIdForInsert 通過。
 * @param {unknown} projectId
 * @param {object|null} projForSync
 * @returns {string|number|null}
 */
export function resolveDbProjectIdForActivity(projectId, projForSync) {
    if (projectId == null || projectId === '') return null;
    const s = String(projectId).trim();
    if (!/^\d+$/.test(s)) return normalizeProjectIdForInsert(projectId);
    if (projForSync && projForSync._dbSafeId != null) {
        return normalizeProjectIdForInsert(projForSync._dbSafeId);
    }
    if (typeof window !== 'undefined' && typeof window._toDbSafeId === 'function') {
        return normalizeProjectIdForInsert(window._toDbSafeId(projectId));
    }
    return normalizeProjectIdForInsert(projectId);
}

/**
 * @param {object} opts
 * @param {object} opts.normalized insertTransaction の normalized 行
 * @param {string} opts.remoteUid
 * @param {string|number|null} opts.dbProjectId
 * @param {(d: unknown) => string} opts.toISODate
 * @returns {object}
 */
export function buildActivityInsertPayload({ normalized, remoteUid, dbProjectId, toISODate }) {
    const dbAmount = Number(normalized.amount);
    return {
        project_id: dbProjectId,
        type: normalized.type,
        category: normalized.category,
        title: normalized.title,
        amount: Number.isFinite(dbAmount) && !isNaN(dbAmount) ? dbAmount : 0,
        date: toISODate(normalized.date),
        user_id: remoteUid
    };
}

/**
 * @param {{ _notifyAuthRequiredDbSync: Function, _emitNeoDataUpdated: Function }} deps
 */
export function registerUpdateTransaction(deps) {
    const { _notifyAuthRequiredDbSync, _emitNeoDataUpdated } = deps;

    window.updateTransaction = async (txId, updates) => {
        const tx = window.mockDB.activities.find((t) => t.id === txId);
        if (!tx) return;

        const originalTitle = tx.title;
        const originalAmount = tx.amount;

        if (updates.category) tx.category = updates.category;
        if (updates.title) tx.title = updates.title;
        if (updates.amount !== undefined) tx.amount = Number(updates.amount);

        tx.is_user_corrected = true;
        window.persistLocalBody?.();

        if (window.supabaseClient) {
            try {
                await window._resolveSupabaseAuthUid();
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
                console.log('Supabase updateTransaction success:', tx.title, 'updates:', updates);
            } catch (e) {
                if (e?.message === 'AUTH_REQUIRED') {
                    console.warn('[updateTransaction] No auth session; skipping Supabase update.');
                    _notifyAuthRequiredDbSync();
                } else {
                    console.error('Supabase Update Error:', e);
                }
            }
        }
        window._refreshCockpitActivityFeed?.();
        _emitNeoDataUpdated({ kind: 'activity', projectId: tx.projectId, txId });
    };
}
