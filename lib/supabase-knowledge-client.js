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

const DEFAULT_SUPABASE_URL = 'https://nvnwnefqdsaecczpemkc.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_-HXdEPTx-rOM6rcRt5IyjQ_K33EQ-Bl';

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
    try {
        const ku = localStorage.getItem('neo_knowledge_supabase_url');
        const kk = localStorage.getItem('neo_knowledge_supabase_anon_key');
        if (ku && kk) {
            if (!isValidKnowledgeSupabaseUrl(ku)) {
                console.warn(
                    '[Neo][Knowledge] neo_knowledge_supabase_url が無効です（プレースホルダーや誤字の可能性）。専用接続をスキップし、既定または neo_dev_* にフォールバックします:',
                    ku.trim()
                );
            } else {
                console.warn('[Neo][Knowledge] 専用 Supabase に接続しています:', ku.trim());
                return { supabaseUrl: ku.trim(), supabaseKey: kk.trim(), mode: 'dedicated' };
            }
        }
    } catch {
        /* ignore */
    }

    const dev = resolveDevMainEndpoint();
    if (dev) {
        return { ...dev, mode: 'dev_shared' };
    }

    return {
        supabaseUrl: DEFAULT_SUPABASE_URL,
        supabaseKey: DEFAULT_SUPABASE_KEY,
        mode: 'default_shared'
    };
}

const { supabaseUrl, supabaseKey, mode } = resolveKnowledgeEndpoint();

export const supabaseKnowledge = createClient(supabaseUrl, supabaseKey);

if (typeof window !== 'undefined') {
    window.supabaseKnowledgeClient = supabaseKnowledge;
    window.neoKnowledgeSupabaseUrl = supabaseUrl;
    window.neoKnowledgeSupabaseMode = mode;
}

try {
    console.log('[Neo][Knowledge] 接続先:', new URL(supabaseUrl).hostname, `(${mode})`);
} catch {
    console.log('[Neo][Knowledge] URL:', supabaseUrl);
}
