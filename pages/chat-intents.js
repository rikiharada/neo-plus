/** Extracted Chat Intents helpers — 複合経路の project 解決（handleInstruction は chat.js） */
window.resolveProjectIdForExpenseIntent = function resolveProjectIdForExpenseIntent(intent, userText = '') {
    if (typeof window.resolveExpenseProjectId === 'function') {
        return window.resolveExpenseProjectId(intent, userText || '');
    }
    const projects =
        typeof window._getProjectsScopedToCurrentUser === 'function'
            ? window._getProjectsScopedToCurrentUser()
            : window.mockDB?.projects || [];
    if (!projects.length) return null;
    const matches = (id) => id != null && id !== '' && projects.some((p) => String(p.id) === String(id));
    if (intent.project_id != null && matches(intent.project_id)) {
        return projects.find((p) => String(p.id) === String(intent.project_id)).id;
    }
    const byName = (intent.project_name || intent.projectName || '').trim();
    if (byName && typeof window.findProjectIdByName === 'function') {
        const pid = window.findProjectIdByName(byName);
        if (pid != null && matches(pid)) return pid;
    }
    if (window.currentOpenProjectId != null && matches(window.currentOpenProjectId)) {
        return projects.find((p) => String(p.id) === String(window.currentOpenProjectId)).id;
    }
    if (projects.length === 1) return projects[0].id;
    return null;
};
