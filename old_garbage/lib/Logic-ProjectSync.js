/**
 * projects 行のローカル + Supabase 同期（db-sync から登録）
 */

/**
 * @param {{ _emitNeoDataUpdated: Function, _notifyAuthRequiredDbSync: Function }} deps
 */
export function registerInsertProject(deps) {
    const { _emitNeoDataUpdated, _notifyAuthRequiredDbSync } = deps;

    window.insertProject = async (proj) => {
        if (window.supabaseClient) {
            try {
                const u = await window._resolveSupabaseAuthUid();
                if (typeof window._isValidSupabaseAuthUid === 'function' && window._isValidSupabaseAuthUid(u)) {
                    proj.user_id = u;
                }
            } catch {
                /* ローカルフォールバック */
            }
        }

        const scoped =
            typeof window._getProjectsScopedToCurrentUser === 'function'
                ? window._getProjectsScopedToCurrentUser()
                : window.mockDB.projects || [];
        const dup = scoped.find((p) => p.name && proj.name && p.name.trim() === proj.name.trim());
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
                const uid = await window._resolveSupabaseAuthUid();
                if (typeof window._isValidSupabaseAuthUid === 'function' && !window._isValidSupabaseAuthUid(uid)) {
                    throw new Error('AUTH_REQUIRED');
                }
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
                else {
                    console.log('Brain Sync OK (Project)');
                    _emitNeoDataUpdated({ kind: 'project', projectId: proj.id, remote: true });
                }
                delete window.pendingProjectInserts[pidKey];
                delete window.pendingProjectInserts[String(pidKey)];
            }).catch((err) => {
                console.error('Brain Sync Fatal (Project):', err);
                if (err && (err.message === 'AUTH_REQUIRED' || String(err.message || '').includes('AUTH_REQUIRED'))) {
                    _notifyAuthRequiredDbSync();
                }
                delete window.pendingProjectInserts[pidKey];
                delete window.pendingProjectInserts[String(pidKey)];
                throw err;
            });
        } else {
            _emitNeoDataUpdated({ kind: 'project', projectId: proj.id, localOnly: true });
        }
        return Promise.resolve(proj);
    };
}
