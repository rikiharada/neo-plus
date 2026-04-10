/**
 * Neo+ User Profile Module
 * ──────────────────────────────────────────────────────────────────
 * マルチユーザー対応: Supabase auth を優先し、なければ localStorage にフォールバック。
 * window.neoUserProfile にグローバル公開し、システムプロンプト・挨拶・UI全体で使用する。
 *
 * プロフィール項目:
 *   name        - 表示名 (例: "田中 太郎")
 *   email       - メールアドレス
 *   occupation  - 職業・業種 (例: "フリーランスエンジニア")
 *   company     - 屋号・会社名 (例: "田中デザイン事務所")
 *   address     - 事業所住所
 *   tel         - 電話番号
 */

// ── localStorage キー定義 ────────────────────────────────────────
const _KEYS = {
    name:       'neo_user_name',
    occupation: 'neo_user_occupation',
    company:    'neo_company_name',      // 書類エンジンと共用
    address:    'neo_company_address',   // 書類エンジンと共用
    tel:        'neo_company_tel',       // 書類エンジンと共用
};

/**
 * プロフィールを読み込み、window.neoUserProfile を更新する。
 * Supabase セッションがあればメタデータを優先して使用する。
 */
export async function loadUserProfile() {
    let profile = _loadFromLocalStorage();

    // Supabase から追加情報を取得（ログイン済みの場合）
    try {
        const supabase = window.supabaseClient || window.supabase;
        if (supabase?.auth?.getUser) {
            const { data, error } = await supabase.auth.getUser();
            if (!error && data?.user) {
                const meta = data.user.user_metadata || {};
                // Supabase の値が存在すれば上書き（ただし localStorage 側が明示的に設定されていれば localStorage 優先）
                profile.email    = data.user.email || profile.email;
                profile.name     = localStorage.getItem(_KEYS.name) || meta.full_name || meta.name || profile.name;
            }
        }
    } catch (_) {
        // Supabase 未接続時は無視
    }

    window.neoUserProfile = profile;
    console.log('[NeoProfile] Loaded:', profile.name || '(anonymous)', '/', profile.occupation || 'no occupation');
    return profile;
}

/**
 * localStorage からプロフィールを読み込む（同期）。
 */
function _loadFromLocalStorage() {
    return {
        name:       localStorage.getItem(_KEYS.name)       || '',
        occupation: localStorage.getItem(_KEYS.occupation) || 'フリーランス',
        company:    localStorage.getItem(_KEYS.company)    || '',
        address:    localStorage.getItem(_KEYS.address)    || '',
        tel:        localStorage.getItem(_KEYS.tel)        || '',
        email:      '',
    };
}

/**
 * プロフィールを localStorage に保存し、window.neoUserProfile を更新する。
 * 設定画面などから呼び出す。
 */
export function saveUserProfile(updates = {}) {
    Object.entries(updates).forEach(([key, value]) => {
        if (_KEYS[key]) localStorage.setItem(_KEYS[key], value);
    });
    // キャッシュを更新
    window.neoUserProfile = { ...(window.neoUserProfile || {}), ...updates };
}

/**
 * ユーザーへの呼びかけ文を返す。
 * 名前が設定されていれば「田中さん」、なければ「オーナー」。
 */
export function getUserSalutation() {
    const name = window.neoUserProfile?.name;
    if (name) {
        // 姓だけ取り出す（スペースで分割して最初の単語）
        const familyName = name.split(/[\s　]/)[0];
        return `${familyName}さん`;
    }
    return 'オーナー';
}

/**
 * システムプロンプト用のユーザーコンテキスト文字列を返す。
 * gemini.js / geminiClient.js から参照する。
 */
export function getUserContextForPrompt() {
    const p = window.neoUserProfile || {};
    const lines = [];
    if (p.name)       lines.push(`ユーザー名: ${p.name}`);
    if (p.occupation) lines.push(`職業・業種: ${p.occupation}`);
    if (p.company)    lines.push(`屋号・会社名: ${p.company}`);
    return lines.length ? lines.join('\n') : '（プロフィール未設定）';
}

// ── グローバル公開 ──────────────────────────────────────────────
window.loadUserProfile   = loadUserProfile;
window.saveUserProfile   = saveUserProfile;
window.getUserSalutation = getUserSalutation;

// 即時ロード（同期: localStorage のみ。非同期 Supabase は loadUserProfile() で行う）
window.neoUserProfile = _loadFromLocalStorage();
