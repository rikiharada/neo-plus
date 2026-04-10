/**
 * 共通バリデーション（activities / projects の ID・UUID 正規化）
 */

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @param {unknown} v
 * @returns {boolean}
 */
export function isUuidString(v) {
    if (v == null || typeof v !== 'string') return false;
    return UUID_RE.test(String(v).trim());
}

/**
 * activities.project_id 等へ渡す直前に呼ぶ。UUID は小文字化、数値ローカルIDは _toDbSafeId 経由で型を安定化。
 * @param {unknown} raw
 * @returns {string|number|null}
 */
export function normalizeProjectIdForInsert(raw) {
    if (raw == null || raw === '') return null;
    const s = String(raw).trim();
    if (s === '' || s === 'undefined' || s === 'null') return null;
    if (UUID_RE.test(s)) return s.toLowerCase();
    if (typeof window !== 'undefined' && typeof window._toDbSafeId === 'function' && /^\d+$/.test(s)) {
        return window._toDbSafeId(Number(s));
    }
    return s;
}
