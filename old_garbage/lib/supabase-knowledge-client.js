/**
 * 知識系専用 Supabase クライアント（neo_global_lexicon / 将来の neo_knowledge・semantic_cache 等）
 * ユーザーデータ用の window.supabaseClient と接続先を分けられる。
 *
 * 既定: メインと同一 URL/キー（単一プロジェクト運用）。
 * 分離: localStorage に両方セット
 *   neo_knowledge_supabase_url
 *   neo_knowledge_supabase_anon_key
 * 開発でメインだけローカルにしたい場合は neo_dev_* のみ（知識も同じ DB を参照）。
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// 既定はメインSupabaseにフォールバック（知識専用接続が未設定/不正でも動作継続）
const DEFAULT_KNOWLEDGE_URL = 'https://nvnwnefqdsaecczpemkc.supabase.co';
const DEFAULT_KNOWLEDGE_KEY = 'sb_publishable_-HXdEPTx-rOM6rcRt5IyjQ_K33EQ-Bl';

function maskKnowledgeKey(raw) {
    const key = String(raw || '').trim();
    if (!key) return '(empty)';
    if (key.length <= 12) return `${key.slice(0, 4)}...(${key.length})`;
    return `${key.slice(0, 6)}...${key.slice(-4)} (len=${key.length})`;
}

function isLikelyAnonOrPublishableKey(raw) {
    const key = String(raw || '').trim();
    if (!key) return false;
    // Supabase publishable key / legacy anon JWT
    if (key.startsWith('sb_publishable_')) return true;
    if (key.startsWith('eyJ')) return true;
    // 明示的に secret/service_role は拒否（ブラウザ利用不可）
    if (/service[_-]?role|sb_secret_/i.test(key)) return false;
    return true;
}

/** ドキュメント用プレースホルダーや誤入力を弾く（xxxx.supabase.co 等） */
function isValidKnowledgeSupabaseUrl(raw) {
    if (!raw || typeof raw !== 'string') return false;
    let u;
    try {
        u = new URL(raw.trim());
    } catch {
        return false;
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (/xxxx|placeholder|your-project|your[_-]?ref|example\.com|test\.invalid|\.invalid$/i.test(host)) {
        return false;
    }
    if (host === 'localhost' || host === '127.0.0.1') return true;
    if (host.endsWith('.supabase.co')) return true;
    return false;
}

function resolveDevMainEndpoint() {
    try {
        const ou = localStorage.getItem('neo_dev_supabase_url');
        const ok = localStorage.getItem('neo_dev_supabase_anon_key');
        if (ou && ok && isValidKnowledgeSupabaseUrl(ou)) return { supabaseUrl: ou.trim(), supabaseKey: ok.trim() };
    } catch {
        /* ignore */
    }
    return null;
}

function resolveKnowledgeEndpoint() {
    let debugLocalKnowledgeUrl = '';
    let debugLocalKnowledgeKey = '';
    try {
        const ku = localStorage.getItem('neo_knowledge_supabase_url');
        const kk = localStorage.getItem('neo_knowledge_supabase_anon_key');
        debugLocalKnowledgeUrl = (ku || '').trim();
        debugLocalKnowledgeKey = (kk || '').trim();
        if (ku && kk) {
            if (!isValidKnowledgeSupabaseUrl(ku)) {
                console.warn(
                    '[Neo][Knowledge] neo_knowledge_supabase_url が無効です（プレースホルダーや誤字の可能性）。専用接続をスキップし、既定または neo_dev_* にフォールバックします:',
                    ku.trim()
                );
            } else if (!isLikelyAnonOrPublishableKey(kk)) {
                console.warn(
                    '[Neo][Knowledge] neo_knowledge_supabase_anon_key が anon/publishable 形式ではありません。secret key の可能性があるため専用接続をスキップします。'
                );
            } else {
                console.warn('[Neo][Knowledge] 専用 Supabase に接続しています:', ku.trim());
                return { supabaseUrl: ku.trim(), supabaseKey: kk.trim(), mode: 'dedicated' };
            }
        }
    } catch {
        /* ignore */
    }

    try {
        if (typeof process !== 'undefined' && process.env) {
            const envUrl = process.env.NEXT_PUBLIC_KNOWLEDGE_SUPABASE_URL;
            const envKey = process.env.NEXT_PUBLIC_KNOWLEDGE_SUPABASE_ANON_KEY;
            if (envUrl && envKey && isValidKnowledgeSupabaseUrl(envUrl)) {
                return { supabaseUrl: envUrl.trim(), supabaseKey: envKey.trim(), mode: 'vercel_env' };
            }
        }
    } catch {
        /* ignore */
    }

    const dev = resolveDevMainEndpoint();
    if (dev) {
        return { ...dev, mode: 'dev_shared' };
    }

    const fallback = {
        supabaseUrl: DEFAULT_KNOWLEDGE_URL,
        supabaseKey: DEFAULT_KNOWLEDGE_KEY,
        mode: 'main_default_fallback'
    };
    try {
        console.log('[Neo][Knowledge][Debug] localStorage neo_knowledge_supabase_url =', debugLocalKnowledgeUrl || '(empty)');
        console.log('[Neo][Knowledge][Debug] localStorage neo_knowledge_supabase_anon_key =', maskKnowledgeKey(debugLocalKnowledgeKey));
        console.log('[Neo][Knowledge][Debug] fallback endpoint =', fallback.supabaseUrl);
    } catch {
        /* ignore */
    }
    return fallback;
}

const { supabaseUrl, supabaseKey, mode } = resolveKnowledgeEndpoint();

export const supabaseKnowledge = createClient(supabaseUrl, supabaseKey);

if (typeof window !== 'undefined') {
    window.supabaseKnowledgeClient = supabaseKnowledge;
    window.neoKnowledgeSupabaseUrl = supabaseUrl;
    window.neoKnowledgeSupabaseMode = mode;
    window.neoKnowledgeSupabaseKeyMasked = maskKnowledgeKey(supabaseKey);
}

try {
    console.log('[Neo][Knowledge] 接続先:', new URL(supabaseUrl).hostname, `(${mode})`);
    console.log('[Neo][Knowledge] key(masked):', maskKnowledgeKey(supabaseKey));
} catch {
    console.log('[Neo][Knowledge] URL:', supabaseUrl);
}
