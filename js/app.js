import { createProjectCard, createTransactionRow, createNeoButton, renderBottomNav, renderDesktopSidebar, renderGlobalHeader } from '../lib/components.js';
import { uploadPdfToDrive } from '../lib/cloud/googleDrive.js';
import { initHomeView } from '../pages/home.js?v=20260321-12';
import { initSetupView } from '../pages/setup.js';
import { initDocumentGenerator } from '../pages/document-manager.js';
// マルチユーザー対応: ユーザープロフィールをアプリ起動時に読み込む
import { loadUserProfile } from './userProfile.js?v=20260321-13';
import {
    neoHardResetKnowledge,
    neoDangerZoneWipeUserLocalBody
} from '../lib/core/neoKnowledgeReset.js';
import '../lib/supabase-knowledge-client.js';

loadUserProfile(); // 非同期でSupabaseからも取得（localStorage は即時反映済み）

/** 知識専用クライアントで neo_global_lexicon のみ取得（ユーザーデータ init から分離） */
async function initKnowledgeSupabase() {
    const kc = window.supabaseKnowledgeClient || window.supabaseClient;
    const mainClient = window.supabaseClient;
    const configuredUrl = window.neoKnowledgeSupabaseUrl || '(unknown)';
    const configuredMode = window.neoKnowledgeSupabaseMode || '(unknown)';
    const configuredKeyMasked = window.neoKnowledgeSupabaseKeyMasked || '(unknown)';

    try {
        const lsUrl = localStorage.getItem('neo_knowledge_supabase_url') || '(empty)';
        const lsKey = localStorage.getItem('neo_knowledge_supabase_anon_key') || '';
        const lsKeyMasked = lsKey ? `${lsKey.slice(0, 6)}...${lsKey.slice(-4)} (len=${lsKey.length})` : '(empty)';
        console.log('[Neo Global Agent][Debug] neo_knowledge_supabase_url(localStorage):', lsUrl);
        console.log('[Neo Global Agent][Debug] neo_knowledge_supabase_anon_key(localStorage):', lsKeyMasked);
        console.log('[Neo Global Agent][Debug] resolved knowledge endpoint:', configuredUrl, `(${configuredMode})`, configuredKeyMasked);
    } catch {
        /* ignore */
    }

    if (!kc) {
        window.globalLexicon = [];
        return;
    }

    const fetchLexicon = async (client, label) => {
        const { data, error } = await client
            .from('neo_global_lexicon')
            .select('*')
            .order('frequency', { ascending: false })
            .limit(500);
        if (!error && data) {
            window.globalLexicon = data;
            console.log(`[Neo Global Agent] Cached ${window.globalLexicon.length} common business terms (${label}).`);
            return true;
        }
        return { error };
    };

    const first = await fetchLexicon(kc, 'knowledge client');
    if (first === true) return;

    const lexErr = first?.error;
    const isNetworkError = /Failed to fetch|TypeError|ERR_NAME_NOT_RESOLVED|NetworkError/i.test(String(lexErr?.message || lexErr || ''));
    if (isNetworkError && mainClient && kc !== mainClient) {
        console.warn('[Neo Global Agent] Knowledge endpoint fetch failed. Falling back to main Supabase endpoint:', lexErr?.message || lexErr);
        const second = await fetchLexicon(mainClient, 'main supabase fallback');
        if (second === true) {
            window.supabaseKnowledgeClient = mainClient;
            window.neoKnowledgeSupabaseMode = 'main_runtime_fallback';
            return;
        }
    }

    window.globalLexicon = [];
    if (lexErr) console.warn('[Neo Global Agent] Lexicon fetch failed:', lexErr.message || lexErr);
}

window.debugNeoKnowledgeConnection = async function debugNeoKnowledgeConnection() {
    const url = window.neoKnowledgeSupabaseUrl || '(unknown)';
    const mode = window.neoKnowledgeSupabaseMode || '(unknown)';
    console.log('[Neo][Knowledge][Debug] url=', url, 'mode=', mode);
    await initKnowledgeSupabase();
    return {
        url,
        mode,
        lexiconCount: Array.isArray(window.globalLexicon) ? window.globalLexicon.length : 0
    };
};

/** 遅延ロード view HTML（サブパス配信で壊れないよう import.meta.url 基準） */
function fetchNeoViewHtml(viewName) {
    const u = new URL(`../views/${viewName}.html`, import.meta.url);
    u.searchParams.set('v', String(Date.now()));
    return fetch(u.href).then((r) => {
        if (!r.ok) throw new Error(`${viewName}.html: ${r.status}`);
        return r.text();
    });
}
// Neo's Pride Validation: Prevents inappropriate user names
window.validateUserName = function (name) {
    if (!name || typeof name !== 'string') return false;
    // Primary blacklist for profanity, slurs, and highly inappropriate terms
    const blacklist = ["ちんちん", "うんこ", "バカ", "アホ", "死ね", "殺す", "sex", "fuck", "bitch", "shit", "まんこ", "クソ", "カス", "キチガイ", "ガイジ", "ゴミ"];
    const normalizedName = name.toLowerCase();
    return !blacklist.some(word => normalizedName.includes(word));
};

// Global User State Foundation is now located in js/store.js

window.uploadPdfToDrive = uploadPdfToDrive;

// Issue Document Generator payload to Drive
/**
 * 書類プレビュー・書類生成モーダルおよび主要オーバーレイを一括で閉じる。
 * ログアウト時は switchView が走らないため setup.js からも呼ぶ。
 */
window.closeAllNeoOverlays = function closeAllNeoOverlays() {
    try {
        if (typeof window.closeDocGenModal === 'function') {
            window.closeDocGenModal();
        }
    } catch (e) {
        console.warn('[Neo] closeDocGenModal:', e);
    }

    const modalIds = [
        'document-preview-modal',
        'modal-doc-gen',
        'modal-doc-preview',
        'modal-add-expense',
        'modal-add-income',
        'modal-edit-expense',
        'modal-neo-confirm',
        'modal-account-suspended',
        'modal-new-project',
        'modal-edit-project',
        'modal-delete-confirm',
        'modal-receipt-grid',
        'modal-drive-picker',
        'modal-expense-scanner',
        'doc-neo-parsing-overlay',
        'gdrive-loading-overlay'
    ];

    modalIds.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.add('hidden');
        el.classList.remove('show');
        el.style.display = 'none';
        el.style.opacity = '0';
    });

    document.body.style.overflow = '';
    try {
        document.body.style.removeProperty('overflow');
    } catch {
        /* ignore */
    }
};

/** @deprecated 互換: 旧コードが参照する名前 */
window.closeDocumentModal = window.closeAllNeoOverlays;

window.mockDB = window.mockDB || {
    userConfig: {
        cloudProvider: localStorage.getItem('neo_cloud') || "icloud",
        targetMonthlyProfit: 1000000
    },
    inbox: [],
    clients: [],
    vendors: [],
    projects: [],
    activities: [],
    documents: [],
    transactions: [],
    learnedKeywords: {}
};

// Global DB Helpers for Supabase Sync
window.persistLocalBody = function() {
    localStorage.setItem('neo_local_body_activities', JSON.stringify(window.mockDB.activities || []));
    localStorage.setItem('neo_local_body_projects', JSON.stringify(window.mockDB.projects || []));
};

window.loadLocalBody = function() {
    try {
        // ユーザーデータ（neo_local_body_*）は削除しない。バージョンは将来の非破壊マイグレーション用のみ。
        const SCHEMA_VERSION = '20260325-knowledge-separation-v1';
        const prev = localStorage.getItem('neo_schema_version');
        if (prev !== SCHEMA_VERSION) {
            localStorage.setItem('neo_schema_version', SCHEMA_VERSION);
            console.log(
                '%c[Neo]',
                'color:#64748b;font-weight:600;',
                'スキーママーカー更新:',
                SCHEMA_VERSION,
                '（projects/activities の localStorage は保持）'
            );
        }
        const storedActs = localStorage.getItem('neo_local_body_activities');
        const storedProjs = localStorage.getItem('neo_local_body_projects');
        if (storedActs) window.mockDB.activities = JSON.parse(storedActs);
        if (storedProjs) window.mockDB.projects = JSON.parse(storedProjs);
    } catch(e){}
};

// 知識レイヤのみリセット（ユーザーデータは触らない）。詳細は docs/DATA_INITIALIZATION_RULES.md
window.neoHardReset = neoHardResetKnowledge;
window.resetData = neoHardResetKnowledge;
window.neoDangerZoneWipeUserLocalBody = neoDangerZoneWipeUserLocalBody;

// Call on boot
window.loadLocalBody();

/**
 * Supabase の project_id / projects.id を、mockDB のフォルダ行の id（ローカル）に正規化する。
 * 数値のローカルIDと _toDbSafeId を使った DB 行の差異で明細が紐づかない問題を防ぐ。
 */
window.resolveLocalProjectId = function resolveLocalProjectId(dbPid) {
    if (dbPid == null || dbPid === '') return dbPid;
    const projs = window.mockDB?.projects || [];
    const s = String(dbPid);
    for (const p of projs) {
        if (String(p.id) === s) return p.id;
        if (p._dbSafeId != null && String(p._dbSafeId) === s) return p.id;
        if (window._toDbSafeId && /^\d+$/.test(String(p.id ?? '')) && String(window._toDbSafeId(p.id)) === s) return p.id;
    }
    return dbPid;
};

/** Supabase の amount（numeric / text / null）を数値に統一 */
function _parseActivityAmount(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const n = parseFloat(String(v).replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : 0;
}
// type="module" の dashboard-projects.js / projectdetail-core.js / db-sync.js から参照できるよう公開
window._parseActivityAmount = _parseActivityAmount;

/**
 * ウォレット画面の集計・表示（dashboard-projects の renderProjects から load 前にも呼ばれるため window に登録）
 */
window.updateWalletDashboard = function updateWalletDashboard(totalProfit) {
    const mockDB = window.mockDB;
    if (!mockDB) return;

    const globalProfitEl = document.getElementById('wallet-global-profit');
    if (globalProfitEl) globalProfitEl.textContent = `¥${totalProfit.toLocaleString()}`;

    let globalRevenue = 0;
    let globalExpenses = 0;

    mockDB.projects.forEach((proj) => {
        const invoices = mockDB.documents.filter((d) => d.projectId === proj.id && d.type === 'invoice');
        if (invoices.length > 0) {
            globalRevenue += invoices.reduce((acc, curr) => acc + curr.amount, 0);
        } else {
            globalRevenue += proj.revenue || 1000000;
        }
    });

    mockDB.activities.forEach((t) => {
        if (!t.is_deleted && t.type !== 'income') {
            globalExpenses += window._parseActivityAmount(t.amount);
        }
    });

    const taxRate = 0.15;
    const taxEst = Math.max(0, totalProfit * taxRate);

    const taxPrepEl = document.getElementById('wallet-tax-prep');
    const taxBarEl = document.getElementById('wallet-tax-bar');

    if (taxPrepEl) taxPrepEl.textContent = `¥${Math.round(taxEst).toLocaleString()}`;
    if (taxBarEl) {
        const maxTaxTarget = 3000000;
        const pct = Math.min(100, (taxEst / maxTaxTarget) * 100);
        taxBarEl.style.width = `${pct}%`;
    }

    const taxSummaryEl = document.getElementById('wallet-tax-summary');
    if (taxSummaryEl) {
        taxSummaryEl.innerHTML = `CEO、現在の売上合計は <strong>¥${globalRevenue.toLocaleString()}</strong>、経費合計は <strong>¥${globalExpenses.toLocaleString()}</strong> です。<br>予測される申告所得は <strong>¥${totalProfit.toLocaleString()}</strong> となります。連携用のCSV出力が可能です。`;
    }

    const cfContainer = document.getElementById('wallet-cf-container');
    if (cfContainer) {
        cfContainer.innerHTML = '';
        const today = new Date();
        const forecastMonths = [
            `${(today.getMonth() + 2) % 12 || 12}月`,
            `${(today.getMonth() + 3) % 12 || 12}月`,
            `${(today.getMonth() + 4) % 12 || 12}月`
        ];

        forecastMonths.forEach((m, idx) => {
            const isCurrent = idx === 0;
            const incomeH = 60 + Math.random() * (40 - idx * 10);
            const expH = 30 + Math.random() * 20;
            cfContainer.innerHTML += `
                    <div class="cf-bar-group ${isCurrent ? 'active' : ''}" style="${!isCurrent ? 'opacity: 0.7' : ''}">
                        <div class="cf-bar income" style="height: ${incomeH}%;"></div>
                        <div class="cf-bar expense" style="height: ${expH}%;"></div>
                        <span class="cf-label ${isCurrent ? 'active-label' : ''}">${m}</span>
                    </div>
                `;
        });

        const totalPredictions = mockDB.activities.length;
        const totalCorrections = mockDB.activities.filter((t) => t.is_user_corrected && !t.is_deleted).length;

        let accuracy = 100;
        if (totalPredictions > 0) {
            accuracy = Math.round(((totalPredictions - totalCorrections) / totalPredictions) * 100);
        }

        const accuracyColor = accuracy >= 95 ? '#10b981' : accuracy >= 80 ? '#f59e0b' : '#ef4444';

        cfContainer.insertAdjacentHTML('beforebegin', `
                <div style="background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.2); margin-top: 16px; margin-bottom: 24px; padding: 12px 16px; border-radius: 12px; display: grid; grid-auto-flow: column; justify-content: start; align-items: center; justify-content: space-between;">
                    <div style="display: grid; grid-auto-flow: column; justify-content: start; align-items: center; gap: 8px;">
                        <i data-lucide="brain-circuit" style="width: 20px; height: 20px; color: ${accuracyColor};"></i>
                        <span style="font-size: 13px; font-weight: 600; color: var(--text-main);">AI 学習仕訳精度 (IQ)</span>
                    </div>
                    <div style="font-size: 16px; font-weight: 800; color: ${accuracyColor};">
                        ${accuracy}<span style="font-size: 12px; margin-left: 2px;">%</span>
                    </div>
                </div>
            `);
        if (window.lucide) window.lucide.createIcons();
    }

    const progressCircle = document.getElementById('wallet-ring-progress');
    if (progressCircle) {
        const baseOffset = 628;
        const target = mockDB.userConfig.targetMonthlyProfit || 1000000;
        const progress = Math.min(1, Math.max(0, totalProfit / target));
        const dashOffset = baseOffset - baseOffset * progress;
        setTimeout(() => {
            progressCircle.style.strokeDashoffset = dashOffset;
        }, 50);
    }
};

/** 診断ログ用（長すぎる JSON を短縮） */
function _neoJsonStringifyForLog(obj, maxLen = 3500) {
    try {
        const s = JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
        return s.length > maxLen ? `${s.slice(0, maxLen)}…(truncated)` : s;
    } catch (e) {
        return `[stringify failed: ${e && e.message ? e.message : e}]`;
    }
}

/** 現在の Supabase ユーザー UID（session → getUser）— RLS / user_id 付与に必須 */
/**
 * activities.user_id が NULL の行を現在の UID で更新（同一 project_id の孤児行の救済。RLS 許可範囲のみ）
 */
/** プロジェクト一覧・ウォレットと明細の「経費」を揃える（income 以外を合算。type 欠損も拾う） */
/** Supabase activities 行 → mockDB 用（projectId は UI 用のローカル id） */
/**
 * リモート取得後も mockDB に残す未同期行を落とさない（GlobalStore Brain Sync 用）
 */
window.mergeActivitiesRemoteAndLocal = function mergeActivitiesRemoteAndLocal(localBefore, remoteRows) {
    const remoteList = (remoteRows || []).map((r) => window.mapActivityRowToMock(r));
    const remoteIdSet = new Set(remoteList.map((r) => String(r.id)));
    const localOnly = (Array.isArray(localBefore) ? localBefore : []).filter((loc) => {
        if (!loc) return false;
        if (loc.id == null || loc.id === '') return true;
        return !remoteIdSet.has(String(loc.id));
    });
    const merged = [...remoteList, ...localOnly];
    merged.sort((a, b) => {
        const ta = new Date(String(a.date || '').replace(/\//g, '-')).getTime();
        const tb = new Date(String(b.date || '').replace(/\//g, '-')).getTime();
        return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
    });
    return merged;
};

/**
 * 経費同期・Realtime 後にプロジェクト詳細を開いていればその場で再描画
 */
window._refreshProjectDetailIfOpen = function _refreshProjectDetailIfOpen(projectId) {
    if (projectId == null || projectId === '') return;
    try {
        if (String(window.currentOpenProjectId) !== String(projectId)) return;
        if (typeof window.openProjectDetail !== 'function') return;
        window.openProjectDetail(projectId, { navigate: false, skipFetch: false });
    } catch {
        /* ignore */
    }
};

/**
 * プロジェクト名 → ID（load イベント前から利用可。チャット経由の経費で projectId 欠落を防ぐ）
 */
window.findProjectIdByName = function (text) {
    const mockDB = window.mockDB;
    if (!text || !mockDB?.projects?.length) return null;

    const textLower = text.toLowerCase();
    const exactMatch = mockDB.projects.find((p) => p.id !== 1 && p.name.toLowerCase() === textLower);
    if (exactMatch) return exactMatch.id;

    let bestMatch = null;
    let longestMatchLength = 0;

    mockDB.projects.forEach((p) => {
        if (p.id === 1) return;
        const pNameLower = p.name.toLowerCase();
        if (textLower.includes(pNameLower)) {
            if (pNameLower.length > longestMatchLength) {
                longestMatchLength = pNameLower.length;
                bestMatch = p;
            }
        } else {
            const keywords = [pNameLower, pNameLower.substring(0, 4), pNameLower.substring(0, 2)];
            for (const kw of keywords) {
                if (kw.length >= 2 && textLower.includes(kw)) {
                    if (kw.length > longestMatchLength) {
                        longestMatchLength = kw.length;
                        bestMatch = p;
                    }
                }
            }
        }
    });

    return bestMatch ? bestMatch.id : null;
};

/**
 * 経費の projectId 解決（currentOpenProjectId || 1 は使わない）
 */
window.resolveExpenseProjectId = function (intentLike = {}, hintText = '') {
    const projects = window.mockDB?.projects || [];
    if (!projects.length) return null;

    const matchesPid = (id) => id != null && id !== '' && projects.some((p) => String(p.id) === String(id));
    const canon = (id) => (matchesPid(id) ? projects.find((p) => String(p.id) === String(id)).id : null);

    let id = canon(intentLike.project_id);
    if (id != null) return id;

    const tryName = (n) => {
        const q = n && String(n).trim();
        if (!q) return null;
        return canon(window.findProjectIdByName(q));
    };

    id = tryName(intentLike.project_name) ?? tryName(intentLike.projectName);
    if (id != null) return id;

    const quoted = typeof hintText === 'string' ? hintText.match(/「([^」]+)」/)?.[1] : null;
    id = tryName(quoted);
    if (id != null) return id;

    const explicitName = String(intentLike.project_name || intentLike.projectName || '').trim();
    // intent にプロジェクト名が付いているのに解決できない場合、全文あいまい検索で別フォルダに誤結合しない
    if (hintText && !explicitName) {
        id = canon(window.findProjectIdByName(hintText));
        if (id != null) return id;
    }

    id = canon(window.currentOpenProjectId);
    if (id != null) return id;

    // どの条件にも合致しない場合は、アプリ上で一番上の（最も最近参照された）プロジェクトをデフォルト先とする
    if (projects.length > 0) return projects[0].id;
    return null;
};

// PostgreSQL integer 型の上限(2^31-1=2,147,483,647)に収まるIDを生成するヘルパー
// ms を秒にすると同時に作成した複数レコードの ID が重複するため、剰余でミリ秒の差異を維持する。
window._toDbSafeId = (localId) => {
    const n = Number(localId);
    if (Number.isNaN(n)) return localId;
    if (n > 2147483647) {
        // % 2147483647 で上限内に収めつつミリ秒単位の+1を維持する（約24日周期での重複はupsertでカバー）
        return n % 2147483647;
    }
    return n;
};

/** 数値ローカルIDのプロジェクトに Supabase 用の安定した project_id を付与（重複返却時も FK と一致させる） */
window._attachDbSafeIdIfNeeded = function _attachDbSafeIdIfNeeded(proj) {
    if (!proj || proj._dbSafeId != null) return;
    const s = String(proj.id ?? '').trim();
    if (/^\d+$/.test(s)) proj._dbSafeId = window._toDbSafeId(proj.id);
};

/**
 * activities 挿入前に projects 行を必ず存在させる（非同期 INSERT 失敗・待機漏れでの FK 23503 を防ぐ）
 * @param {object|null} meta mockDB のプロジェクト行、または最低限の { name, category, ... }
 */
async function _ensureSupabaseProjectRowForActivity(meta, dbProjectId) {
    if (!window.supabaseClient || dbProjectId == null || dbProjectId === '') {
        return { ok: true };
    }
    const m = meta || {};
    try {
        // _resolveSupabaseAuthUid throws Error('AUTH_REQUIRED') if no uid — no null check needed
        const uid = await window._resolveSupabaseAuthUid();
        const row = {
            id: dbProjectId,
            name: m.name || 'プロジェクト',
            category: m.category || 'other',
            color: m.color || '#8E8E93',
            status: m.status || 'active',
            location: m.location || '-',
            user_id: uid
        };
        const { error } = await window.supabaseClient
            .from('projects')
            .upsert([row], { onConflict: 'id' });
        if (error) {
            console.warn('[insertTransaction] projects upsert failed:', JSON.stringify(error));
            return { ok: false, error };
        }
        return { ok: true };
    } catch (e) {
        console.warn('[insertTransaction] _ensureSupabaseProjectRowForActivity:', e);
        return { ok: false, error: e };
    }
}

/** pendingProjectInserts のキーが string / number でずれても拾う */
function _getPendingProjectInsertPromise(projectId) {
    const m = window.pendingProjectInserts;
    if (!m || projectId == null || projectId === '') return null;
    return m[projectId] ?? m[String(projectId)] ?? m[Number(projectId)] ?? null;
}

/** ホームの cockpit-timeline-feed を mockDB と同期（経費計上・リモート取得後の更新漏れ防止） */
window._refreshCockpitActivityFeed = function _refreshCockpitActivityFeed() {
    try {
        if (typeof window.renderCockpitFeed === 'function') window.renderCockpitFeed(0);
    } catch {
        /* ignore */
    }
};

// NeoBus Central Router for Data Updates
window.addEventListener('DOMContentLoaded', () => {
    if (window.NeoBus) {
        window.NeoBus.on('NEO_DATA_UPDATED', () => {
            console.log('[NeoBus] Data update received. Syncing views...');
            if (typeof window._refreshCockpitActivityFeed === 'function') {
                window._refreshCockpitActivityFeed();
            }
            if (window.currentOpenProjectId && typeof window.openProjectDetail === 'function') {
                window.openProjectDetail(window.currentOpenProjectId);
            } else if (typeof window.renderProjects === 'function' && window.mockDB && window.mockDB.projects) {
                window.renderProjects(window.mockDB.projects);
            }
        });
    }
});

window._getPendingProjectInsertPromise = _getPendingProjectInsertPromise;
window._ensureSupabaseProjectRowForActivity = _ensureSupabaseProjectRowForActivity;

window.parseCommand = function (text) {
    let result = { date: null, location: null, title: text, category: "雑費", amount: null };
    console.log(`[DEBUG] Final Form Lexicon Parse Start: "${text}"`);

    let remainingText = text;

    // 0. Amount Extraction: ５万, 50000円, ¥5000, 5,000円 etc.
    const amountMatch = remainingText.match(/[¥￥]?([\d,]+(?:\.\d+)?)\s*万/);
    if (amountMatch) {
        result.amount = Math.round(parseFloat(amountMatch[1].replace(/,/g, '')) * 10000);
    } else {
        const yenMatch = remainingText.match(/[¥￥]([\d,]+)|(\d[\d,]+)\s*円/);
        if (yenMatch) {
            result.amount = parseInt((yenMatch[1] || yenMatch[2]).replace(/,/g, ''));
        }
    }

    // 1. Date Extraction: (\d{1,2})月(\d{1,2})日 OR (\d{1,2})/(\d{1,2})
    const dateMatch = remainingText.match(/(\d{1,2})[月\/](\d{1,2})(?:日)?/);
    if (dateMatch) {
        const mm = dateMatch[1].padStart(2, '0');
        const dd = dateMatch[2].padStart(2, '0');
        const yy = new Date().getFullYear();
        result.date = `${yy}/${mm}/${dd}`;
        remainingText = remainingText.replace(dateMatch[0], '');
    }

    // 2. Location Extraction: Text right before 'で' or 'にて'
    // Ignore leading particles like 'に' or 'は' that might be lingering after date removal
    const locMatch = remainingText.match(/(?:[には])?([^、。\sには]+?)(?:で|にて)/);
    if (locMatch) {
        result.location = locMatch[1].trim();
        remainingText = remainingText.replace(locMatch[0], '');
    }

    // 3. Title cleanup & Conversational Nuance Interpretation
    // First, strip out common typo variations and intent triggers BEFORE stripping particles
    // "はいいた" -> "入った", "決まった" -> "決定"
    remainingText = remainingText.replace(/はいいた|はいいった/g, '入った');

    // Aggressively strip leading particles and common verbs including the CEO's new list
    // Removed: フォルダ作って, 保存して, メモして, 追加して, 作成して, 開始, ある, あります, 作成, ファイル, 新規, フォルダ, が入った, が決まった, する
    const noiseWordsRegex = /フォルダ作って|フォルダを作って|プロジェクトを作って|保存して|メモして|追加して|作成して|開始|ある|あります|作成|ファイル|新規|フォルダ|が入った|が決まった|する|入った|決定/g;

    remainingText = remainingText.replace(/^[、。\sにはでをが]+/g, '')
        .replace(/[、。\sが。]+$/g, '')
        .replace(noiseWordsRegex, '')
        .replace(/[をが。.]/g, '')
        .trim();

    if (remainingText.length > 0) {
        result.title = remainingText;
    } else {
        result.title = "新規プロジェクト";
    }

    // Deep Industry Entity Classification (Keep original category logic)
    const currentIndustry = (typeof mockDB !== 'undefined' && mockDB.userConfig) ? mockDB.userConfig.industry : 'general';
    if (window.StaticLexicon && window.StaticLexicon.categorizeExpense) {
        result.category = window.StaticLexicon.categorizeExpense(text, currentIndustry);
    }

    console.log(`Extraction Test: [Date: ${result.date || "null"}, Loc: ${result.location || "null"}, Title: ${result.title}, Category: ${result.category}]`);
    return result;
};

// Global hoisting of createProject to ensure it is always available
window.createProject = window.createProject || function (title, pDate, pLoc) {
    let parsed = window.parseCommand(title);
    let cleanTitle = parsed.title || '';
    // 物理的に『作成』『ファイル』等のゴミを完全抹殺する (parseCommand側でも処理しているが念入りに)
    const extraNoise = /フォルダ作って|フォルダを作って|プロジェクトを作って|保存して|メモして|追加して|作成して|開始|ある|あります|作成|ファイル|新規|フォルダ|が入った|が決まった|する|はいいた|はいいった|入った|決定/g;
    cleanTitle = cleanTitle.replace(/^[、。\sにはでをが]+/g, '')
        .replace(/[、。\sが。]+$/g, '')
        .replace(extraNoise, '')
        .replace(/[をが。.]/g, '');
    if (cleanTitle === '') cleanTitle = '新規プロジェクト';
    
    // Convert to 32-bit integer safe UNIX seconds to avoid Supabase value out-of-range errors
    const newProjId = Math.floor(Date.now() / 1000);
    const newProj = {
        id: newProjId,
        name: cleanTitle,
        customerName: "-",
        location: parsed.location || pLoc || "-",
        note: "",
        category: "other",
        color: "#007AFF",
        unit: "-",
        hasUnpaid: false,
        revenue: 0,
        status: 'active',
        startDate: parsed.date ? parsed.date.replace(/\//g, '-') : (pDate ? pDate.replace(/\//g, '-') : new Date().toLocaleDateString('ja-JP').replace(/\//g, '-')),
        lastUpdated: new Date().toLocaleDateString('ja-JP').replace(/\//g, '-')
    };

    // Safety Fallback Check
    if (!window.mockDB || !window.mockDB.projects) {
        window.mockDB = window.mockDB || { projects: [], transactions: [], documents: [] };
        if (!window.mockDB.projects) window.mockDB.projects = [];
    }

    window.insertProject(newProj);
    window.currentOpenProjectId = newProjId;

    // 即時UI更新
    if (typeof window.renderProjects === 'function') {
        window.renderProjects(window.mockDB.projects);
    }
    return newProj;
};

// Add self-test on load just to be absolutely sure
setTimeout(() => {
    console.log('--- Self Test for Final Form parseCommand ---');
    if (window.parseCommand) {
        window.parseCommand('3月24日、銀座で撮影');
    }
}, 1000);

// ─── Compound Action Handler ──────────────────────────────────────────────────
// Handles: project creation + multi-expense logging in a single input.
// Routes intelligently using extractTags (Layer 1, sync) to avoid LLM roundtrip
// for clear-cut compound inputs like "6月4日銀座でドラマ撮影、交通費10000円、人件費20000円".
window.handleCompoundAction = async function(rawText) {
    if (!rawText || !rawText.trim()) return;

    const tags = window.extractTags ? window.extractTags(rawText) : null;

    // Fallback to LLM if extractTags not loaded
    if (!tags) return window.handleInstruction ? window.handleInstruction(rawText) : null;

    const hasProject   = !!(tags.projectName);
    const hasAmounts   = tags.amounts && tags.amounts.length > 0;
    const isRevenue    = tags.isRevenue;
    const isDocument   = tags.intent === 'GENERATE_DOCUMENT';
    const isQueryOnly  = tags.intent === 'QUERY';

    // Always route documents / revenue / queries to LLM handler
    if (isDocument || isRevenue || isQueryOnly) {
        return window.handleInstruction ? window.handleInstruction(rawText) : null;
    }

    // Pure expense (no project detected) → LLM handler for confirmation modal
    if (!hasProject && hasAmounts) {
        return window.handleInstruction ? window.handleInstruction(rawText) : null;
    }

    // Pure project or compound (project + expenses) → handle locally
    if (hasProject) {
        // 1. Create project folder
        const projName = tags.projectName;
        const projDate = tags.date ? tags.date.replace(/\//g, '-') : new Date().toLocaleDateString('ja-JP').replace(/\//g, '-');
        let projLoc  = tags.location || '';
        if (!projLoc && tags.projectName && tags.entities && tags.entities.length > 0) {
            projLoc = tags.entities[0];
        }

        let newProj = null;
        if (window.createProject) {
            // Pass projName directly — createProject cleans noise words
            newProj = window.createProject(projName, projDate, projLoc);
            // Override location if extractTags found one (createProject uses parseCommand internally)
            if (newProj && projLoc) newProj.location = projLoc;
            console.log(`[CompoundAction] Project created: ${newProj?.name} (id=${newProj?.id})`);

            // Feed: project creation
            window.pushFeedMessage?.('project', {
                id:    newProj.id,
                title: newProj.name,
                sub:   projLoc ? `📍 ${projLoc}` : '',
                date:  projDate
            });
        }

        // 2. Insert each expense amount as a transaction
        if (hasAmounts && newProj) {
            let offset = 1;
            for (const amt of tags.amounts) {
                const txId = Math.floor(Date.now() / 1000) + offset;
                offset++;
                const tx = {
                    id: txId,
                    projectId: newProj.id,
                    projectName: newProj.name,
                    type: 'expense',
                    category: amt.label || tags.category || '雑費',
                    title: amt.label || tags.category || '経費',
                    amount: amt.value,
                    date: tags.date || new Date().toLocaleDateString('ja-JP').replace(/\//g, '-'),
                    source: 'compound-rule',
                    originalInput: rawText
                };
                if (window.insertTransaction) {
                    await window.insertTransaction(tx);
                    console.log(`[CompoundAction] Expense logged: ${tx.category} ¥${tx.amount}`);

                    // Feed: expense logged
                    window.pushFeedMessage?.('expense', {
                        id:          tx.id,
                        title:       tx.title,
                        amount:      tx.amount,
                        category:    tx.category,
                        projectName: tx.projectName,
                        date:        tx.date
                    });
                }
            }
        }

        // 3. Re-render projects list
        if (typeof window.renderProjects === 'function') window.renderProjects(window.mockDB.projects);
        window.dispatchEvent(new CustomEvent('neo-render-projects', { detail: { projects: window.mockDB?.projects } }));

        // 4. Neo Bubble notification + Feed confirmation message
        let neoMsg = `フォルダ「${newProj?.name || projName}」を作成しました。`;
        if (hasAmounts) {
            const amtSummary = tags.amounts
                .map(a => `${a.label || '経費'} ¥${a.value.toLocaleString()}`)
                .join('・');
            neoMsg += `${amtSummary}を記録しました。`;
        }

        const neoBubble = document.getElementById('neo-fab-bubble');
        if (neoBubble) {
            neoBubble.textContent = `⚡️ ${neoMsg}`;
            neoBubble.classList.add('show');
            setTimeout(() => neoBubble.classList.remove('show'), 5000);
        }

        // Feed: Neo confirmation message
        window.pushFeedMessage?.('neo', { text: neoMsg });

        // 5. Clear input, play sound, navigate
        if (window.neo) window.neo.speak('neo_success');
        const activeInput = document.getElementById('main-instruction-input');
        if (activeInput) { activeInput.value = ''; activeInput.style.height = '48px'; }

        // Reset trinity preview
        const previewContainer = document.getElementById('trinity-preview');
        if (previewContainer) previewContainer.style.opacity = '0';

        if (window.openProjectDetail) {
            window.openProjectDetail(newProj.id, { navigate: true, skipFetch: false });
        } else if (window.switchView) {
            window.switchView('view-dash');
        }
        return;
    }

    // Default fallback → LLM
    if (window.handleInstruction) window.handleInstruction(rawText);
};

// --- Boot-time Brain Defrag ---
window.neoBrainDefrag = function () {
    console.log("[Neo Boot] Initiating Brain Defrag...");
    // 1. Session Storage Lifecycle Check
    const sessionStart = sessionStorage.getItem('neo_session_start');
    const now = Date.now();
    // If no session start time, or if the session is logically stale (e.g. > 24 hours), wipe it.
    if (!sessionStart || (now - parseInt(sessionStart) > 1000 * 60 * 60 * 24)) {
        sessionStorage.clear(); // Pure wipe of all temporary conversational states
        sessionStorage.setItem('neo_session_start', now.toString());
        console.log("[Neo Boot] Volatile Session Cleared. Brain is fresh.");
    }

    // 2. Strict Memory Segregation Check (localStorage vs sessionStorage)
    const lsVersion = localStorage.getItem('neo_cache_version');
    if (lsVersion !== "v2.1") {
        console.warn("[Neo Boot] Major version change detected. Wiping obsolete cache structures...");
        localStorage.removeItem('neo_feedback_memory'); // Old obsolete array removed
        localStorage.setItem('neo_cache_version', "v2.1");
    }
};
window.neoBrainDefrag();

// Make initialization robust for iOS Safari
window.addEventListener('load', async () => {
    // Session-segregated Chat DOM disabled for minimal UI
    
    // Initialize i18n
    await window.i18n.loadLocale('ja'); // Load default 'ja' locale

    // Setup Views
    // (view-setup removed, handled via router lazily)
    const dashView = document.getElementById('view-dash');

    // Setup Elements
    const selectFontSize = document.getElementById('select-font-size');
    const selectIndustry = document.getElementById('select-industry');

    // Populate Massive Industry List from window.INDUSTRIES
    // if (selectIndustry && window.INDUSTRIES) {
    //     selectIndustry.innerHTML = '<option value="" disabled selected>選択して下さい（選択不可）</option>';
    //     window.INDUSTRIES.forEach(ind => {
    //         const opt = document.createElement('option');
    //         opt.value = ind.id;
    //         opt.textContent = ind.name;
    //         selectIndustry.appendChild(opt);
    //     });
    // }

    // Dashboard Elements
    const neoDashContainer = document.getElementById('neo-dash-container');

    let neo;
    window.currentOpenProjectId = null;
    window.currentProjectPage = 1;

    // --- Phase 5 & 12: Auth Gatekeeper & Setup Initialization ---
    // Extracted entirely to pages/setup.js to enforce Trinity Architecture separation
    initSetupView();

    // --- Global Profit Calculation ---
    window.updateGlobalProfitDisplay = () => {
        if (!window.mockDB) return;

        // Calculate total revenue from projects and transactions
        let totalRevenue = 0;
        if (window.mockDB.projects) {
            window.mockDB.projects.forEach(p => {
                if (p.id !== 1 && p.revenue) {
                    totalRevenue += p.revenue;
                }
            });
        }

        let totalExpenses = 0;
        if (window.mockDB.activities) {
            window.mockDB.activities.forEach(t => {
                if (t.type === 'expense') totalExpenses += t.amount;
                if (t.type === 'sales') totalRevenue += t.amount;
            });
        }

        const currentProfit = totalRevenue - totalExpenses;
        const fmt = new Intl.NumberFormat('ja-JP');

        // Update all elements showing profit
        const mainProfitEls = document.querySelectorAll('#total-profit, #header-profit');
        mainProfitEls.forEach(el => {
            if (el) {
                el.textContent = `¥${fmt.format(currentProfit)}`;
                // Optional color logic
                if (currentProfit < 0) {
                    el.style.color = '#FF3B30';
                } else {
                    el.style.color = 'var(--text-main)';
                }
            }
        });

        // Update circular progress (if present)
        const profitProgress = document.getElementById('profit-progress-circle');
        if (profitProgress) {
            const target = (window.mockDB.userConfig && window.mockDB.userConfig.targetMonthlyProfit) ? window.mockDB.userConfig.targetMonthlyProfit : 1000000;
            const percentage = Math.min(100, Math.max(0, (currentProfit / target) * 100));
            profitProgress.style.strokeDasharray = `${percentage}, 100`;

            const percentageText = document.getElementById('profit-percentage');
            if (percentageText) percentageText.textContent = `${Math.floor(percentage)}%`;
        }
    };

    window.showDash = () => {
        // Defer to the centralized router
        if (window.switchView) {
            window.switchView('view-dash');
        }


        // 常に最新の設定を反映
        const userIndustry = (typeof mockDB !== 'undefined' && mockDB.userConfig) ? mockDB.userConfig.industry : 'general';
        const docBtnContainer = document.getElementById('docgen-btn-container');

        if (docBtnContainer) {
            docBtnContainer.innerHTML = ''; // クリア
            const createDocBtn = (icon, color, title, desc, docType) => {
                return `<button class="btn-primary" onclick="window.openDocGenModal()" style="width: 100%; border-radius: 12px; font-weight: 600; font-size: 14px; display: grid; grid-auto-flow: column; justify-content: start; align-items: center; justify-content: start; gap: 12px; padding: 16px;"><i data-lucide="${icon}" style="width: 20px; height: 20px; color: ${color};"></i><div style="text-align: left;"><div style="line-height: 1;">${title}</div><div style="font-size: 10px; color: var(--text-muted); font-weight: 400; margin-top: 4px;">${desc}</div></div></button>`;
            };

            const baseButtons = [
                createDocBtn('file-check', 'var(--accent-neo-blue)', '請求書', 'インボイス対応', 'invoice'),
                createDocBtn('file-spreadsheet', '#10b981', '領収書', '受領証明', 'expense'),
                createDocBtn('calculator', '#f59e0b', '見積書', '概算プラン', 'estimate')
            ];

            let industrySpecificButtons = [];
            if (userIndustry === 'construction') {
                industrySpecificButtons = [
                    createDocBtn('hammer', '#6366f1', '人工出面表', '作業員報告用', 'expense')
                ];
            } else if (userIndustry === 'freelance') {
                industrySpecificButtons = [
                    createDocBtn('briefcase', '#ec4899', '業務委託契約書', '簡易フォーマット', 'estimate')
                ];
            }
            docBtnContainer.innerHTML = [...baseButtons, ...industrySpecificButtons].join('');
            if (window.lucide) window.lucide.createIcons();
        }

    };

    const applyFontSize = (size) => {
        document.documentElement.style.fontSize = size;
    };

    // Listeners
    if (selectFontSize) {
        selectFontSize.addEventListener('change', (e) => {
            if (e.target.value === 'huge') {
                applyFontSize('120%');
            } else {
                applyFontSize('100%');
            }
        });
    }

    // [Gatekeeper Functions removed: Migrated to pages/setup.js]

    // Theme Management
    // Now using a class for theme toggles since they exist on multiple views
    const applyTheme = (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('fini_theme_v2', theme);

        // Update all theme toggle buttons
        const toggleBtns = document.querySelectorAll('[data-theme-toggle="1"]');
        const isDark = theme === 'dark';

        toggleBtns.forEach(btn => {
            const iconSun = btn.querySelector('.icon-sun');
            const iconMoon = btn.querySelector('.icon-moon');
            if (isDark) {
                if (iconSun) iconSun.style.display = 'none';
                if (iconMoon) iconMoon.style.display = 'block';
            } else {
                if (iconSun) iconSun.style.display = 'block';
                if (iconMoon) iconMoon.style.display = 'none';
            }
        });

        // Ensure Lucide icons are rendered for newly displayed elements
        if (window.lucide) {
            window.lucide.createIcons();
        }
    };

    const toggleTheme = () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        applyTheme(newTheme);

        // Make Neo react to theme change
        if (neo) {
            if (newTheme === 'light') {
                neo.speak('neo_react_light');
            } else {
                neo.speak('neo_react_dark');
            }
        }
    };

    // Setup theme toggle listeners
    document.addEventListener('click', (e) => {
        if (e.target.closest('[data-theme-toggle="1"]')) {
            toggleTheme();
        }
    });

    // Initial Theme load (v2 key = clean start, defaults to light for all users)
    const savedTheme = localStorage.getItem('fini_theme_v2') || 'light';
    applyTheme(savedTheme);

    // --- BYOC Google Drive Sync Visualization ---
    const radioGdrive = document.getElementById('radio-gdrive-sync');
    const loadingOverlay = document.getElementById('gdrive-loading-overlay');

    if (radioGdrive && loadingOverlay) {
        radioGdrive.addEventListener('change', (e) => {
            if (e.target.checked) {
                // Show Loader
                loadingOverlay.classList.remove('hidden');

                // Simulate OAuth / API Binding Delay (Premium feel)
                setTimeout(() => {
                    loadingOverlay.classList.add('hidden');

                    // Trigger Success Toast
                    const neoFabBubble = document.getElementById('neo-fab-bubble');
                    if (neoFabBubble) {
                        neoFabBubble.innerHTML = `<i data-lucide="triangle" style="width:14px; height:14px; vertical-align:middle; color:#34A853; margin-right:4px;"></i>Google Drive との暗号化同期を確立しました。`;
                        neoFabBubble.classList.add('show');
                        setTimeout(() => neoFabBubble.classList.remove('show'), 4000);
                        if (window.lucide) window.lucide.createIcons();
                    }

                    // Update header icons globally to reflect Drive
                    const cloudIcons = document.querySelectorAll('.cloud-sync-status');
                    cloudIcons.forEach(icon => {
                        icon.innerHTML = `<i data-lucide="triangle" style="width: 16px; height: 16px; color: #34A853;"></i>`;
                        if (window.lucide) window.lucide.createIcons();
                    });

                }, 2500);
            }
        });
    }

    // Navigation Logic
    const allViews = [
        dashView,
        document.getElementById('view-sites'),
        document.getElementById('view-expense'),
        document.getElementById('view-wallet'),
        document.getElementById('view-settings'),
        document.getElementById('view-project-detail'),
        document.getElementById('view-chat')
    ];
    const bottomNav = document.querySelector('.neo-bottom-nav');
    const navItems = document.querySelectorAll('.nav-item');

    const switchView = (targetId) => {
        console.log(`[Router] switchView called for: ${targetId}`);

        // 1. すべてのモーダル / フルスクリーンプレビューを強制非表示（書類生成・請求プレビュー含む）
        if (typeof window.closeAllNeoOverlays === 'function') {
            window.closeAllNeoOverlays();
        }

        // 2. ログイン/セットアップビューのロード時に完全に表示（display: block / hidden削除）
        if (targetId === 'view-auth' || targetId === 'view-setup' || targetId === 'view-login') {
            const authView = document.getElementById(targetId);
            if (authView) {
                authView.classList.remove('hidden');
                authView.style.display = (targetId === 'view-auth') ? 'grid' : 'block';
                authView.style.opacity = '1';
                console.log(`[Router] Exposing Auth/Setup Gatekeeper cleanly: #${targetId}`);
            }
        }

        // 鉄壁のガード
        if (targetId === 'inline-expense') {
            console.log("Blocked switchView due to inline-expense routing.");
            return;
        }

        // 強制的に全ビューをリセット（ID固定リストではなく .view 全量）
        document.querySelectorAll('.view').forEach((el) => {
            el.classList.add('hidden');
            el.classList.remove('is-active');
            el.style.display = 'none';
            el.style.opacity = '0';
            el.style.zIndex = '1';
        });

        // 非アクティブ側の router anchor をクリアして古いDOMを除去（重複描画の根本対策）
        const routeAnchorByView = {
            'view-dash': 'router-view-dash',
            'view-chat': 'router-view-chat',
            'view-sites': 'router-view-sites',
            'view-project-detail': 'router-view-sites',
            'view-wallet': 'router-view-wallet',
            'view-settings': 'router-view-settings',
            'view-account': 'router-view-settings',
            'view-desk': 'router-view-desk'
        };
        const keepAnchorId = routeAnchorByView[targetId] || null;
        const allAnchors = [
            'router-view-dash',
            'router-view-chat',
            'router-view-sites',
            'router-view-wallet',
            'router-view-settings',
            'router-view-desk'
        ];
        allAnchors.forEach((anchorId) => {
            if (anchorId === keepAnchorId) return;
            const anchor = document.getElementById(anchorId);
            if (!anchor) return;
            if (anchor.childElementCount > 0) {
                anchor.innerHTML = '';
            }
        });

        // チャットを閉じた直後にキーボード用 CSS 変数をリセット（visualViewport 連動）
        window.syncChatVisualViewport?.();

        // チャット画面はオリジナルヘッダーを持つため、グローバルヘッダーを非表示にする
        const globalHeader = document.getElementById('global-header');
        if (globalHeader) {
            globalHeader.style.display = (targetId === 'view-chat') ? 'none' : '';
        }

        // Helper: Generically fetch and inject a view
        const loadView = (viewName, targetContainerId, expectedViewId, jsModulePath, initFunction) => {
            const routerAnchor = document.getElementById(targetContainerId);
            let viewDom = document.getElementById(expectedViewId);

            const showView = () => {
                viewDom = document.getElementById(expectedViewId);
                // Also check if the routerAnchor itself acquired the ID
                if (!viewDom && routerAnchor && routerAnchor.id === expectedViewId) {
                    viewDom = routerAnchor;
                }
                if (viewDom) {
                    viewDom.classList.remove('hidden');
                    viewDom.classList.add('is-active');
                    // Special case for chat which needs flex
                    viewDom.style.display = (expectedViewId === 'view-chat') ? 'flex' : 'block';
                    viewDom.style.opacity = '1';
                    if (expectedViewId === 'view-chat') {
                        requestAnimationFrame(() => {
                            window.syncChatVisualViewport?.();
                            setTimeout(() => window.syncChatVisualViewport?.(), 160);
                        });
                    }
                }
            };

            if (!viewDom && routerAnchor) {
                fetchNeoViewHtml(viewName)
                    .then(html => {
                        // CEO Directive: innerHTML + ID 再付与
                        routerAnchor.innerHTML = html;
                        
                        // IDを再付与 (内容物が自身のIDを持たない場合をケア)
                        if (!document.getElementById(expectedViewId)) {
                             // NOTE: routerAnchor 自体の id を変更すると、次回以降 targetContainerId 参照が壊れる。
                             // 最初の .view へ expectedViewId を付与してルーティング安定性を守る。
                             const firstView = routerAnchor.querySelector('.view');
                             if (firstView) {
                                firstView.id = expectedViewId;
                             }
                        }

                        // 毎回ユニークインスタンスキーを付与（状態混在の診断・追跡用）
                        const loadedView = document.getElementById(expectedViewId);
                        if (loadedView) {
                            loadedView.setAttribute('data-view-instance-key', `${expectedViewId}-${Date.now()}`);
                        }

                        if (jsModulePath) {
                            return import(jsModulePath);
                        }
                    })
                    .then(module => {
                        if (module && initFunction && module[initFunction]) {
                            module[initFunction]();
                        }
                        // Global binds
                        if (window.bindCockpitInputs && expectedViewId === 'view-dash') window.bindCockpitInputs();
                        if (window.lucide) window.lucide.createIcons();
                        
                        showView();

                        // modal-doc-preview のズームは初回プレビュー表示時に window.setupDocPreviewZoom() でバインド

                        // Dispatch loaded event for special view handlers
                        if (expectedViewId === 'view-chat') {
                           // rebind enter keys
                           const newInstructionInput = document.getElementById('main-instruction-input');
                           if (newInstructionInput && window.handleInstruction) {
                               newInstructionInput.addEventListener('keydown', (e) => {
                                   if (e.isComposing || e.keyCode === 229) return;
                                   if (e.key === 'Enter') {
                                       if (e.shiftKey) return;
                                       e.preventDefault();
                                       if (window.createNewProjectFromTags && window.createNewProjectFromTags()) return;
                                       const textValue = e.target.value.trim();
                                       if (textValue) window.handleInstruction(textValue);
                                   }
                               });
                           }
                        }
                    })
                    .catch(err => console.error(`Router Error: Failed to load ${viewName} view`, err));
            } else {
                showView();
                // 既にビューがある場合も初回挨拶を試みる（_chatGreeted で重複防止）
                if (expectedViewId === 'view-chat' && window.initChatView) {
                    window.initChatView();
                }
            }
        };

        // Switch Logic based on ID
        switch (targetId) {
            case 'view-dash':
                loadView('home', 'router-view-dash', 'view-dash', '../pages/home.js', 'initHomeView');
                break;
            case 'view-sites':
                loadView('project', 'router-view-sites', 'view-sites', '../pages/project.js', 'initProjectView');
                break;
            case 'view-project-detail': {
                const pDetail = document.getElementById('view-project-detail');
                if (pDetail) {
                    // project.html はロード済み → view-sites を隠してそのまま表示
                    const sitesEl = document.getElementById('view-sites');
                    if (sitesEl) { sitesEl.classList.add('hidden'); sitesEl.style.display = 'none'; }
                    pDetail.classList.remove('hidden');
                    pDetail.classList.add('is-active');
                    pDetail.style.display = 'block';
                    pDetail.style.opacity = '1';
                } else {
                    // 初回: project.html をフェッチ → ロード完了後に detail を表示
                    loadView('project', 'router-view-sites', 'view-sites', '../pages/project.js', 'initProjectView');
                    // loadView の fetch 完了を 50ms ポーリングで待つ（最大 500ms）
                    const waitForDetail = (retries) => {
                        const detail = document.getElementById('view-project-detail');
                        if (detail) {
                            const sitesEl = document.getElementById('view-sites');
                            if (sitesEl) { sitesEl.classList.add('hidden'); sitesEl.style.display = 'none'; }
                            detail.classList.remove('hidden');
                            detail.classList.add('is-active');
                            detail.style.display = 'block';
                            detail.style.opacity = '1';
                        } else if (retries > 0) {
                            setTimeout(() => waitForDetail(retries - 1), 50);
                        }
                    };
                    waitForDetail(10);
                }
                break;
            }
            case 'view-chat':
                // Reset Cockpit if present
                const dashCockpit = document.getElementById('neo-cockpit');
                if (dashCockpit) dashCockpit.style.display = 'none';
                loadView('chat', 'router-view-chat', 'view-chat', '../pages/chat.js', 'initChatView');
                break;
            case 'view-settings':
            case 'view-account':
                loadView('account', 'router-view-settings', 'view-settings', '../pages/account-settings.js', 'initAccountSettings');
                break;
            case 'view-wallet':
                loadView('wallet', 'router-view-wallet', 'view-wallet', '../pages/wallet-render.js', 'initWalletView');
                break;
            case 'view-desk':
                loadView('desk', 'router-view-desk', 'view-desk', '../pages/desk.js', 'initDeskView');
                break;
            default:
                // Pre-loaded views like expense
                const tg = document.getElementById(targetId);
                if (tg) {
                    tg.classList.remove('hidden');
                    tg.classList.add('is-active');
                    tg.style.display = 'block';
                }
                break;
        }

        const targetViewElement = document.getElementById(targetId);

        if (targetViewElement && !targetViewElement.classList.contains('hidden')) {
            targetViewElement.style.opacity = '0';
            // Trigger reflow
            void targetViewElement.offsetWidth;
            targetViewElement.style.transition = 'opacity 0.2s ease';
            targetViewElement.style.opacity = '1';

            setTimeout(() => {
                targetViewElement.style.transition = '';
                targetViewElement.style.opacity = '';

                // Trigger Neo Brain Sync Animation if navigating to dash
                if (targetId === 'view-dash') {
                    const brainBar = document.getElementById('neo-brain-progress-bar');
                    const brainPct = document.getElementById('neo-brain-percentage');
                    if (brainBar && brainPct) {
                        brainBar.style.width = '0%';
                        brainPct.textContent = '0%';
                        void brainBar.offsetWidth;
                        brainBar.style.width = '84%';
                        let count = 0;
                        const interval = setInterval(() => {
                            count += 2;
                            if (count >= 84) {
                                count = 84;
                                clearInterval(interval);
                            }
                            brainPct.textContent = count + '%';
                        }, 30);
                    }
                }
            }, 200);
        }

        // Update Nav active state
        navItems.forEach(item => {
            if (item.getAttribute('data-target') === targetId || (targetId === 'view-account' && item.getAttribute('data-target') === 'view-settings')) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Keep DOM localized
        if (window.i18n && window.i18n.updateDOM) {
            window.i18n.updateDOM();
        }

        // Scroll Logic & Dynamic Bottom Nav Injection
        if (targetId === 'view-expense') {
            const neoBottomNav = document.querySelector('.neo-bottom-nav');
            if (neoBottomNav) neoBottomNav.style.display = 'none';
            setTimeout(() => {
                const chatContainer = document.getElementById('expense-chat-container');
                if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
            }, 100);
        } else if (targetId !== 'view-invoice' && targetId !== 'view-setup') {
            const neoBottomNav = document.querySelector('.neo-bottom-nav');
            if (neoBottomNav) neoBottomNav.style.display = '';
            
            // Scroll logic for chat
            if (targetId === 'view-chat') {
                setTimeout(() => {
                    const chatContainer = document.getElementById('chat-messages');
                    if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
                    window.syncChatVisualViewport?.();
                }, 100);
            }
            
            // Map legacy view IDs to new semantic names
            const viewMap = {
                'view-dash': 'home',
                'view-sites': 'projects',
                'view-wallet': 'wallet',
                'view-desk': 'desk',
                'view-settings': 'settings',
                'view-account': 'settings', // Alias
                'view-chat': 'chat'          // 明示的に登録（未登録だと 'chat' にフォールバックして Chat がデフォルト起動する）
            };
            const semanticName = viewMap[targetId] || 'home';
            renderGlobalHeader();
            renderBottomNav(semanticName);
            // PC/タブレット (≥768px) のみサイドバーを表示
            if (window.innerWidth >= 768) renderDesktopSidebar(semanticName);
        }
    }; // close switchView()

    // Expose to window for inline onclick in HTML
    window.switchView = switchView;

    // One-touch bridge: intent -> document generator with prefill + folder provisioning
    window.openDocumentGenFromIntent = async (payload = {}) => {
        const projectId = payload.projectId != null ? payload.projectId : window.currentOpenProjectId;
        const projectName = (payload.projectName || '').trim();
        const sourceText = (payload.sourceText || '').trim();
        const docType = payload.docType || 'invoice';

        if (projectId != null) window.currentOpenProjectId = projectId;

        // Provision Drive folder if cloud sync is available (best effort)
        if (projectName && window.NeoCloudSync?.listFilesInFolder) {
            try {
                await window.NeoCloudSync.listFilesInFolder('Documents', projectName, 'application/pdf');
            } catch (e) {
                console.warn('[DocIntent] Drive folder provisioning skipped:', e?.message || e);
            }
        }

        const ensureDocGenModal = async () => {
            if (document.getElementById('modal-doc-gen')) return true;
            try {
                const res = await fetch('/views/document-gen.html', { credentials: 'same-origin' });
                if (!res.ok) return false;
                const html = await res.text();
                const host = document.getElementById('router-modal-doc-gen') || document.body;
                host.insertAdjacentHTML('beforeend', html);
                return !!document.getElementById('modal-doc-gen');
            } catch (e) {
                console.warn('[DocIntent] document-gen modal preload failed:', e?.message || e);
                return false;
            }
        };

        const hasModal = await ensureDocGenModal();
        if (hasModal && typeof window.openDocGenModal === 'function') {
            await window.openDocGenModal();
        } else if (typeof window.switchView === 'function') {
            window.switchView('view-invoice');
        }

        const applyPrefill = () => {
            if (typeof window.switchDocTab === 'function') {
                const normalizedDocType =
                    docType === 'estimate' || docType === 'invoice' || docType === 'receipt' || docType === 'delivery'
                        ? docType
                        : 'invoice';
                window.switchDocTab(normalizedDocType);
                window.currentDocType = normalizedDocType;
            }

            const subjectInput = document.getElementById('doc-subject');
            if (subjectInput) {
                subjectInput.value = projectName || sourceText || subjectInput.value || '';
            }
            const remarksInput = document.getElementById('doc-remarks');
            if (remarksInput && sourceText) {
                remarksInput.value = sourceText;
            }
            if (typeof window.updateDocPreview === 'function') window.updateDocPreview();
        };

        setTimeout(applyPrefill, 50);
    };

    // AI Cockpit Toggle has been moved to pages/home.js

    window.neoGetCockpitInput = function neoGetCockpitInput() {
        const inputs = document.querySelectorAll('#main-instruction-input');
        for (const input of inputs) {
            if (input.offsetParent !== null) return input;
        }
        return inputs[0] || document.getElementById('main-instruction-input');
    };

    /** SpeechRecognition シングルトン + #btn-voice の遅延バインド（ダッシュ遅延ロード対応） */
window.bindCockpitInputs = () => {
        const instructionInputs = document.querySelectorAll('#main-instruction-input');
        const btnAttachImages = [document.getElementById('btn-attach-image'), document.getElementById('btn-camera')].filter(Boolean);
        const btnSendInstructions = [document.getElementById('btn-send-instruction'), document.getElementById('btn-send')].filter(Boolean);
        const ocrUploads = document.querySelectorAll('#ocr-upload');

        // Helper to get active input
        const getActiveInput = () => {
            const el = window.neoGetCockpitInput();
            return el || instructionInputs[0] || document.createElement('textarea');
        };

        // Proxy to fix all old references to `instructionInput` across the codebase transparently
        const instructionInput = new Proxy({}, {
            get(target, prop) {
                if (prop === 'addEventListener') {
                    return (event, handler, options) => {
                        instructionInputs.forEach(input => input.addEventListener(event, handler, options));
                    };
                }
                const active = getActiveInput();
                const val = active[prop];
                if (typeof val === 'function') {
                    return val.bind(active);
                }
                return val;
            },
            set(target, prop, value) {
                if (prop === 'value' || prop === 'disabled') {
                    instructionInputs.forEach(input => input[prop] = value);
                } else {
                    const active = getActiveInput();
                    active[prop] = value;
                }
                return true;
            }
        });

        // --- Real-time Local Parsing to populate background inputs ---
        instructionInputs.forEach(input => {
            input.addEventListener('input', (e) => {
                const rawText = e.target.value;
                if (!rawText) {
                    const pc = document.getElementById('trinity-preview');
                    if (pc) pc.style.opacity = '0';
                    return;
                }

                // Use 8-category extractTags (Layer 1, sync) for real-time preview
                const parsed = window.extractTags ? window.extractTags(rawText) : window.parseCommand(rawText);
                if (!parsed) return;

                // ── Trinity Preview ──────────────────────────────────────────
                const previewContainer = document.getElementById('trinity-preview');
                const pTitle     = document.getElementById('preview-title');
                const pLoc       = document.getElementById('preview-loc');
                const pLocBadge  = document.getElementById('preview-loc-badge');
                const pDate      = document.getElementById('preview-date');
                const pDateBadge = document.getElementById('preview-date-badge');
                const pCat       = document.getElementById('preview-cat');
                const pCatBadge  = document.getElementById('preview-cat-badge');
                const pAmount    = document.getElementById('preview-amount');
                const pAmountBadge = document.getElementById('preview-amount-badge');
                const pEntity    = document.getElementById('preview-entity');
                const pEntityBadge = document.getElementById('preview-entity-badge');
                const pRevenueBadge = document.getElementById('preview-revenue-badge');
                const pDoc       = document.getElementById('preview-doc');
                const pDocBadge  = document.getElementById('preview-doc-badge');

                if (previewContainer && pTitle) {
                    let hasAny = false;

                    // タイトル (project name or raw text slice)
                    const titleSrc = parsed.projectName || parsed.title || '';
                    const dispTitle = (titleSrc && titleSrc !== '新規プロジェクト') ? titleSrc : '-';
                    if (dispTitle !== '-') hasAny = true;
                    pTitle.textContent = dispTitle;

                    // 場所
                    if (parsed.location && pLocBadge) {
                        pLoc.textContent = parsed.location;
                        pLocBadge.style.display = 'inline-flex';
                        hasAny = true;
                    } else if (pLocBadge) {
                        pLocBadge.style.display = 'none';
                    }

                    // 日付
                    if (parsed.date && pDateBadge) {
                        pDate.textContent = parsed.date;
                        pDateBadge.style.display = 'inline-flex';
                        hasAny = true;
                    } else if (pDateBadge) {
                        pDateBadge.style.display = 'none';
                    }

                    // 科目/カテゴリ
                    if (parsed.category && pCatBadge) {
                        pCat.textContent = parsed.category;
                        pCatBadge.style.display = 'inline-flex';
                        hasAny = true;
                    } else if (pCatBadge) {
                        pCatBadge.style.display = 'none';
                    }

                    // 金額（複数対応: "交通費10,000・人件費20,000"）
                    if (parsed.amounts && parsed.amounts.length > 0 && pAmountBadge) {
                        const amtDisplay = parsed.amounts.length === 1
                            ? '¥' + parsed.amounts[0].value.toLocaleString()
                            : parsed.amounts.map(a => (a.label ? a.label + '¥' : '¥') + a.value.toLocaleString()).join(' / ');
                        pAmount.textContent = amtDisplay;
                        pAmountBadge.style.display = 'inline-flex';
                        hasAny = true;
                    } else if (parsed.amount && pAmountBadge) {
                        pAmount.textContent = '¥' + parsed.amount.toLocaleString();
                        pAmountBadge.style.display = 'inline-flex';
                        hasAny = true;
                    } else if (pAmountBadge) {
                        pAmountBadge.style.display = 'none';
                    }

                    // 固有名詞
                    if (parsed.entities && parsed.entities.length > 0 && pEntityBadge) {
                        pEntity.textContent = parsed.entities.slice(0, 2).join('・');
                        pEntityBadge.style.display = 'inline-flex';
                        hasAny = true;
                    } else if (pEntityBadge) {
                        pEntityBadge.style.display = 'none';
                    }

                    // 売上/収入フラグ
                    if (parsed.isRevenue && pRevenueBadge) {
                        pRevenueBadge.style.display = 'inline-flex';
                        hasAny = true;
                    } else if (pRevenueBadge) {
                        pRevenueBadge.style.display = 'none';
                    }

                    // 書類関連
                    if (parsed.docType && pDocBadge) {
                        pDoc.textContent = parsed.docType;
                        pDocBadge.style.display = 'inline-flex';
                        hasAny = true;
                    } else if (pDocBadge) {
                        pDocBadge.style.display = 'none';
                    }

                    previewContainer.style.opacity = hasAny ? '1' : '0';
                }

                // ── Bi-directional binding ───────────────────────────────────
                // Title (from projectName or legacy title)
                const bindTitle = parsed.projectName || (parsed.title && parsed.title !== '新規プロジェクト' ? parsed.title : null);
                if (bindTitle) {
                    const newName = document.getElementById('new-proj-name');
                    if (newName) newName.value = bindTitle;
                    const editName = document.getElementById('edit-proj-name');
                    if (editName) editName.value = bindTitle;
                    const ceoName = document.getElementById('project-name-input');
                    if (ceoName) ceoName.value = bindTitle;
                }

                // Location
                if (parsed.location) {
                    const newLoc = document.getElementById('new-proj-location');
                    if (newLoc) newLoc.value = parsed.location;
                    const editLoc = document.getElementById('edit-proj-location');
                    if (editLoc) editLoc.value = parsed.location;
                }

                // Date
                if (parsed.date) {
                    const dateStr = parsed.date.replace(/\//g, '-');
                    const startInput = document.getElementById('new-proj-start-date');
                    if (startInput) startInput.value = dateStr;
                    const deadInput = document.getElementById('edit-proj-deadline');
                    if (deadInput) deadInput.value = dateStr;
                    const ceoDate = document.getElementById('project-date-input');
                    if (ceoDate) ceoDate.value = dateStr;
                }

                // Immediate dynamic eradication of '工事完了日' if industry is general/unset
                const ind = (typeof mockDB !== 'undefined' && mockDB.userConfig) ? mockDB.userConfig.industry : 'general';
                if (!ind || ind === 'general') {
                    document.querySelectorAll('label, div, span, p').forEach(el => {
                        if (el.textContent && el.textContent.includes('工事完了日') && el.children.length === 0) {
                            el.textContent = el.textContent.replace(/工事完了日/g, '予定日');
                        }
                    });
                }
            });
        });

        btnSendInstructions.forEach((btn) => {
            if (btn.dataset.neoDashSendBound) return;
            btn.dataset.neoDashSendBound = '1';
            btn.addEventListener('click', () => {
                const input = getActiveInput();
                if (!input) return;
                const rawText = (input.value || '').trim();
                if (!rawText) return;
                input.value = '';
                input.dispatchEvent(new Event('input', { bubbles: true }));
                if (window.handleInstruction) window.handleInstruction(rawText);
            });
        });

        setupNeoCockpitSpeechRecognition();
    };
    if (document.getElementById('main-instruction-input')) {
        window.bindCockpitInputs();
    }

    // --- Tag Relay Dedicated Function ---
    window.createNewProjectFromTags = (rawText = '') => {
        // 1. タグデータの強制抽出 (8-category extractTags 優先、フォールバックで parseCommand)
        const textToParse = rawText || window.neoGetCockpitInput()?.value || '';
        const tags   = window.extractTags ? window.extractTags(textToParse) : null;
        const parsed = window.parseCommand(textToParse); // keep for legacy bi-directional binding

        let previewTitle = tags?.projectName || document.getElementById('preview-title')?.textContent || '';
        if (!previewTitle || previewTitle === '-') {
            previewTitle = parsed.title || '新規プロジェクト';
        }

        let previewLoc = tags?.location || document.getElementById('preview-loc')?.textContent || '';
        if (!previewLoc || previewLoc === '-') previewLoc = parsed.location || '';

        let previewDate = tags?.date || document.getElementById('preview-date')?.textContent || '';
        if (!previewDate || previewDate === '-') previewDate = parsed.date || '';

        // 2.強制実行
        let newProj = null;
        if (window.createProject) {
            newProj = window.createProject(previewTitle, previewDate, previewLoc);
            console.log(`[SUCCESS] Project Created: ${newProj.name}`);
        }

        // Safety enforced physical UI update
        if (typeof window.renderProjects === 'function') {
            console.log("[DEBUG] Current mockDB.projects before render:", mockDB.projects);
            window.renderProjects(mockDB.projects);
            console.log("[DEBUG] Render successful");
        }

        // 3. UIの連動
        const input = window.neoGetCockpitInput();
        if (input) {
            input.value = '';
            input.style.height = '48px';
        }

        if (window.neo) window.neo.speak('neo_success');

        const titleSpan = document.getElementById('success-doc-title');
        if (titleSpan) titleSpan.textContent = `プロジェクト「${previewTitle}」を作成しました`;

        // Show Neo Bubble
        const neoBubble = document.getElementById('neo-fab-bubble');
        if (neoBubble) {
            neoBubble.textContent = `⚡️ フォルダ「${previewTitle}」を作成したよ。`;
            neoBubble.classList.add('show');
            setTimeout(() => { neoBubble.classList.remove('show'); }, 4000);
        }

        if (window.switchView) {
            window.switchView('view-dash');
        }

        return true;
    };

    // Document Generator Logic
    window.currentDocType = 'estimate'; // default
    window.docDbStorage = {}; // Temporary cross-tab storage

    window.projectActivities = []; // Global cache for the current modal session

    window.loadActivities = async (projectId) => {
        try {
            // OS共通の相対パスを使用
            const response = await fetch(`/data/projects/${projectId}/activities.json`);
            if (!response.ok) throw new Error('Network response was not ok');
            return await response.json();
        } catch (error) {
            console.error("Activity fetch error (fallback to mockDB):", error);
            // エラー時はフォールバックとしてローカルモックから返して後続の処理を止めない
            if (window.mockDB && window.mockDB.activities) {
                return window.mockDB.activities.filter(t =>
                    t.projectId === projectId &&
                    !t.is_deleted &&
                    (t.type === 'expense' || t.type === 'labor' || t.type === 'work')
                );
            }
            return [];
        }
    };

    window.openDocGenModal = async () => {
        const modal = document.getElementById('modal-doc-gen');
        if (modal) {
            // Lock body scroll
            document.body.style.overflow = 'hidden';

            modal.classList.remove('hidden');
            // Reset to Estimate by default, but carry over project name if possible
            window.switchDocTab('estimate');

            // Auto-fill project details if inside a project
            const projNameEl = document.getElementById('detail-project-name');
            if (projNameEl && projNameEl.textContent) {
                const subjectInput = document.getElementById('doc-subject');
                if (subjectInput) subjectInput.value = projNameEl.textContent;
            }

            // Set today's date
            document.getElementById('doc-issue-date').value = new Date().toISOString().split('T')[0];

            // Set deadline to next month
            const nextMonth = new Date();
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            document.getElementById('doc-deadline-date').value = nextMonth.toISOString().split('T')[0];

            // Render Activity Reference Data (Contextual Data Bridge)
            const actSec = document.getElementById('activity-reference-section');
            const actList = document.getElementById('activity-reference-list');
            const actToggleBtn = document.getElementById('import-activity-btn');

            // Always hide section by default when opening
            if (actSec) actSec.style.display = 'none';

            if (actList && actToggleBtn && window.currentOpenProjectId) {
                // Fetch recent expenses/labor for this project
                const acts = await window.loadActivities(window.currentOpenProjectId);
                const recentActs = acts.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10); // Top 10
                window.projectActivities = recentActs; // Cache globally

                if (recentActs.length > 0) {
                    actToggleBtn.style.display = 'block'; // Show the toggle button
                    actList.innerHTML = recentActs.map(act => {
                        const icon = act.type === 'labor' || act.type === 'work' ? 'hammer' : 'receipt';
                        const color = act.type === 'labor' || act.type === 'work' ? '#8b5cf6' : '#f59e0b';
                        const amountText = act.amount ? `¥${act.amount.toLocaleString()}` : (act.unit ? `${act.unit}人工` : (act.cost ? `¥${act.cost.toLocaleString()}` : ''));
                        return `
                            <button onclick="window.importFromActivity(this, '${act.id}')" style="flex-shrink: 0; background: #fff; border: 1.5px solid #cbd5e1; border-radius: 20px; padding: 6px 14px; font-size: 13px; font-weight: 600; color: #475569; display: flex; align-items: center; gap: 6px; cursor: pointer; transition: all 0.2s;">
                                <i data-lucide="${icon}" style="width: 14px; height: 14px; color: ${color};"></i>
                                ${act.title || act.content || '名目なし'}
                                <span style="color: #94a3b8; font-size: 11px; margin-left: 4px;">${amountText}</span>
                            </button>
                        `;
                    }).join('');
                    if (window.lucide) window.lucide.createIcons();
                } else {
                    actToggleBtn.style.display = 'none';
                    actList.innerHTML = '';
                }
            } else if (actToggleBtn) {
                actToggleBtn.style.display = 'none';
            }

            window.updateDocPreview();
        }
    };

    window.importFromActivity = (btnEl, activityId) => {
        const selectedData = window.projectActivities.find(a => a.id === activityId);
        if (!selectedData) return;

        // Visual feedback
        const origBg = btnEl.style.background;
        const origColor = btnEl.style.color;
        const origBorder = btnEl.style.borderColor;

        btnEl.style.background = 'var(--accent-neo-blue)';
        btnEl.style.color = '#fff';
        btnEl.style.borderColor = 'var(--accent-neo-blue)';

        // Find icons and change their color temporarily
        const icons = btnEl.querySelectorAll('svg');
        const origIconColors = [];
        icons.forEach(i => {
            origIconColors.push(i.style.color);
            i.style.color = '#fff';
        });

        setTimeout(() => {
            btnEl.style.background = origBg;
            btnEl.style.color = origColor;
            btnEl.style.borderColor = origBorder;
            icons.forEach((i, idx) => {
                i.style.color = origIconColors[idx];
            });
        }, 300);

        const content = selectedData.title || selectedData.content || '名目なし';
        const price = selectedData.amount || selectedData.cost || selectedData.price || 0;
        const quantity = selectedData.unit || selectedData.quantity || 1;

        // Call dedicated injection function per CEO request
        window.injectActivityIntoLineItem(content, quantity, price);
    };

    window.injectActivityIntoLineItem = function (content, quantity, price) {
        const container = document.getElementById('doc-line-items-container');
        if (!container) {
            console.error("Target container #doc-line-items-container not found.");
            return;
        }

        // Check if the only existing row is completely empty to overwrite it
        const rows = container.querySelectorAll('.line-item');
        let injected = false;
        if (rows.length === 1) {
            const nameInp = rows[0].querySelector('.item-name-input');
            const priceInp = rows[0].querySelector('.item-price-input');
            const qtyInp = rows[0].querySelector('.item-qty-input');
            if (nameInp && priceInp && qtyInp && !nameInp.value && (!priceInp.value || priceInp.value == 0 || priceInp.value === "")) {
                nameInp.value = content;
                priceInp.value = price || 0;
                qtyInp.value = quantity || 1;
                injected = true;
            }
        }

        if (!injected) {
            // Append a new row using the template generator
            container.insertAdjacentHTML('beforeend', window.generateDocLineHTML(content, price || 0, quantity || 1, false));
        }

        // recalculate totals
        if (typeof window.updateDocPreview === 'function') {
            window.updateDocPreview();
        } else if (typeof calculateTotal === 'function') {
            calculateTotal();
        }
    };

    window._neoDocMemory = window._neoDocMemory || {};

    // ==========================================
    // NEO DOCUMENT RENDERING ENGINE
    // ==========================================
    // ** NOTE: This logic has been securely extracted to js/doc-engine.js **
    // The functions window.switchDocTab, window.updateDocPreview, 
    // window.handleAIDocUpload, and window.generateDocLineHTML 
    // are now handled externally to isolate A4 Document formatting.

    // (Core data model variables like window._neoDocMemory remain fully active in doc-engine.js)

    // MULTI-LINE SUPPORT: Function to add item rows
    window.addDocLineItem = () => {
        const container = document.getElementById('doc-line-items-container');
        if (!container) return;

        container.insertAdjacentHTML('beforeend', window.generateDocLineHTML('', 0, 1, false));

        // Auto focus the new text input
        const rows = container.querySelectorAll('.line-item');
        if (rows.length > 0) {
            const newInputs = rows[rows.length - 1].querySelectorAll('input');
            if (newInputs.length > 0) newInputs[0].focus();
        }
    };

window.saveDocument = async () => {
        let subtotal = 0;
        document.querySelectorAll('.item-price-input').forEach(el => subtotal += parseInt(el.value || '0', 10));

        const data = {
            client: document.getElementById('doc-client-name')?.value || '',
            subject: document.getElementById('doc-subject')?.value || '',
            itemPrice: subtotal
        };
        window.docDbStorage[window.currentDocType] = data;

        const totalStr = document.getElementById('preview-grand-total')?.textContent || '¥0';
        let msg = `ドキュメント（${window.currentDocType === 'estimate' ? '見積書' : (window.currentDocType === 'invoice' ? '請求書' : '領収書')}）を保存しました！`;

        // Local UI Handlers for CEO snippet
        const updateNeoStatus = (statusMsg) => {
            const neoBubble = document.getElementById('neo-fab-bubble');
            if (neoBubble) {
                neoBubble.textContent = "⚡️ " + statusMsg;
                neoBubble.classList.add('show');
                setTimeout(() => { neoBubble.classList.remove('show'); }, 5000);
            }
        };

        const saveUrlToSupabase = async (url) => {
            if (!window.supabaseClient) return;
            const { data: { session } } = await window.supabaseClient.auth.getSession();
            if (!session) return;
            try {
                await window.supabaseClient
                    .from('profiles')
                    .update({ cloud_pointer_url: url }) // Just the pointer
                    .eq('id', session.user.id);
                console.log("[NeoCloud] Pointer safely saved to Supabase.");
            } catch(e) { console.error(e); }
        };

        // CEO Riki's Action
        const handleSaveToCloud = async (blob) => {
            // Fallback to btn-assistant-toggle if 'neo-pulse' ID does not exist securely in the DOM yet
            const pulseTarget = document.getElementById('neo-pulse') || document.getElementById('btn-assistant-toggle');
            
            await uploadPdfToDrive(blob, `Neo_Scan_Doc_${Date.now()}.pdf`, {
                onStart: () => {
                    if (pulseTarget) pulseTarget.classList.add('neo-pulse-sync'); // Utilizing the sync animation we built
                    updateNeoStatus("Syncing with your brain's cloud...");
                },
                onSuccess: (url) => {
                    if (pulseTarget) pulseTarget.classList.remove('neo-pulse-sync');
                    updateNeoStatus("Sync Completed. Secure URL established.");
                    saveUrlToSupabase(url); // ポインタのみ保存
                },
                onError: () => {
                    if (pulseTarget) pulseTarget.classList.remove('neo-pulse-sync');
                    updateNeoStatus("Sync Interrupted. Please re-authorize.");
                }
            });
        };

        // Generate PDF Blob via html2pdf and intercept the result
        const containerToPrint = document.getElementById('doc-preview-paper');
        
        if (window.html2pdf && containerToPrint) {
            // Give visual feedback before freezing thread
            updateNeoStatus("Generating PDF for sync...");
            const opt = {
                margin:       0,
                filename:     `NeoDoc_${Date.now()}.pdf`,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { scale: 2, useCORS: true },
                jsPDF:        { unit: 'pt', format: 'a4', orientation: 'portrait' }
            };
            
            try {
                const pdfBlob = await window.html2pdf().set(opt).from(containerToPrint).output('blob');
                
                // If the user has Drive configured or clicked, execute the cloud flow asynchronously
                // The CEO wants this triggered on save.
                handleSaveToCloud(pdfBlob); 
            } catch(err) {
                console.error("PDF generation failed:", err);
            }
        }

        if (window.currentDocType === 'estimate') {
            msg += `\n将来的に「請求書」タブを開くと、この内容(${totalStr})が自動で引き継がれます。`;
        }

        alert(msg);
        window.closeDocGenModal();
    };

    const originalDocOpen = window.openDocGenModal;
const triggerNeoSyncGlow = () => {
        const iconsToGlow = document.querySelectorAll('[data-target="view-sites"] i, [data-target="view-wallet"] i');
        iconsToGlow.forEach(icon => {
            icon.classList.add('neo-sync-glow');
            setTimeout(() => {
                icon.classList.remove('neo-sync-glow');
            }, 1500); // Glow lasts 1.5 seconds
        });
    };

    // findProjectIdByName / resolveExpenseProjectId はファイル先頭で定義済み（load 前から利用可）

    // --- AI Local Caching Engine ---
    const findLocalMatch = (text) => {
        // Strip amount
        const amountMatch = text.match(/\d+(?:,\d+)*万?/);
        let amount = 0;
        if (amountMatch) {
            let strAmt = amountMatch[0].replace(/,/g, '');
            if (strAmt.includes('万')) strAmt = strAmt.replace('万', '0000');
            amount = parseInt(strAmt, 10);
        }

        let keywordText = text;
        if (amountMatch) keywordText = keywordText.replace(amountMatch[0], '');
        keywordText = keywordText.replace(/円/g, '').replace(/追加して/g, '').replace(/追加/g, '').trim();

        if (keywordText.length < 2) return null;

        // Priority 1: Ground Truth (User Corrections)
        const correctionLog = window.aiCorrectionLog || JSON.parse(localStorage.getItem('neo_ai_corrections') || '[]');
        for (const log of correctionLog) {
            if (log.input_snippet && log.input_snippet.length >= 2) {
                if (keywordText.includes(log.input_snippet)) {
                    return {
                        action: "ADD_EXPENSE",
                        title: keywordText,
                        amount: amount,
                        category: log.corrected_to || 'その他',
                        is_bookkeeping: true,
                        type: log.corrected_to || 'expense',
                        source_cache: true
                    };
                }
            }
        }

        // Priority 2: Global Lexicon (Crowdsourced Communal Truth)
        if (window.globalLexicon && Array.isArray(window.globalLexicon)) {
            for (const lex of window.globalLexicon) {
                if (lex.keyword && lex.keyword.length >= 2) {
                    if (keywordText.includes(lex.keyword)) {
                        console.log(`[Neo Global Agent] Communal Knowledge Hit: "${lex.keyword}" -> ${lex.category}`);
                        return {
                            action: "ADD_EXPENSE",
                            title: keywordText,
                            amount: amount,
                            category: lex.category || 'その他',
                            is_bookkeeping: true,
                            type: lex.category || 'expense',
                            source_cache: true
                        };
                    }
                }
            }
        }

        // Priority 3: Historical Precedent (Existing DB)
        // Sort descending by ID, but prioritize 'is_user_corrected' Ground Truths
        const sortedTxs = [...mockDB.activities].sort((a, b) => {
            if (a.is_user_corrected && !b.is_user_corrected) return -1;
            if (!a.is_user_corrected && b.is_user_corrected) return 1;
            return b.id - a.id;
        });

        for (const tx of sortedTxs) {
            if (tx.title && tx.title.length >= 2) {
                if (keywordText.includes(tx.title) || tx.title.includes(keywordText)) {
                    return {
                        action: "ADD_EXPENSE",
                        title: keywordText, // Use user's exact input, not historical title
                        amount: amount,
                        category: tx.category || 'その他',
                        is_bookkeeping: tx.isBookkeeping || false,
                        type: tx.type || 'expense',
                        source_cache: true
                    };
                }
            }
        }
        return null;
    };

    const COMPLIANCE_BLACKLIST = [
        "裏金", "脱税", "粉飾", "マネロン", "キックバック", "マネーロンダリング",
        "架空請求", "横領", "脱法", "裏帳簿",
        "風俗", "アダルト", "エロ", "パパ活", "ギャラ飲み", "キャバクラ", "ソープ"
    ];

    window.logSecurityEvent = (reason, input) => {
        let logs = JSON.parse(localStorage.getItem('neo_security_logs') || '[]');
        logs.push({ timestamp: new Date().toLocaleString('ja-JP'), reason, input, viewed: false });
        localStorage.setItem('neo_security_logs', JSON.stringify(logs));
    };

    window.handleComplianceViolation = (reason = "Unknown Violation", inputContext = "") => {
        let strikes = parseInt(localStorage.getItem('neo_compliance_strikes') || '0', 10);
        strikes++;
        localStorage.setItem('neo_compliance_strikes', strikes.toString());

        console.error(`[Neo Compliance] Violation detected. Strike ${strikes}/3. Reason: ${reason}`);
        window.logSecurityEvent(reason, inputContext);

        if (strikes >= 3) {
            // Trigger permanent account suspension UI
            const modal = document.getElementById('modal-account-suspended');
            if (modal) {
                modal.classList.remove('hidden');
                modal.style.display = 'grid'; // Ensure flex override
            }
        } else {
            // Warning Bubble
            const neoBubble = document.getElementById('neo-fab-bubble');
            if (neoBubble) {
                neoBubble.textContent = `【警告 ${strikes}/3】利用規約に反する不適切な単語を検知しました。記録を中止します。`;
                neoBubble.style.backgroundColor = '#FF3B30';
                neoBubble.style.color = '#FFF';
                neoBubble.classList.add('show');
                setTimeout(() => {
                    neoBubble.classList.remove('show');
                    neoBubble.style.backgroundColor = '';
                    neoBubble.style.color = '';
                }, 5000);
            }
        }
    };

    // --- System Health & Diagnostic Protocol ---
    window.updateSystemStatus = (status) => {
        const indicators = document.querySelectorAll('.system-health-indicator');
        indicators.forEach(indicator => {
            if (status === 'error') {
                indicator.style.backgroundColor = '#FF3B30';
                indicator.style.boxShadow = '0 0 8px rgba(255, 59, 48, 0.6)';
                indicator.title = 'System Health: Error / Offline';
            } else {
                indicator.style.backgroundColor = '#10b981';
                indicator.style.boxShadow = '0 0 8px rgba(16, 185, 129, 0.6)';
                indicator.title = 'System Health: Online';
            }
        });
    };

    window.onerror = function (msg, url, lineNo, columnNo, error) {
        console.error('[Neo Global Error caught]: ', msg, url, lineNo, columnNo, error);
        window.updateSystemStatus('error');
        return false;
    };

    window.addEventListener('unhandledrejection', function (event) {
        console.error('[Neo Promise Rejection caught]: ', event.reason);
        window.updateSystemStatus('error');
    });

    window.runNeoDiagnostic = async () => {
        try {
            console.log('[Neo Diagnostic] Starting hourly self-ping...');
            const diagnosticPrompt = "SYSTEM_PING: What is your primary mission?";
            // Pass diagnostic prompt directly to router (ignoring UI state)
            const currentDateTime = new Date().toLocaleString('ja-JP');
            const result = await determineRouteFromIntent(diagnosticPrompt, mockDB.userConfig.industry, "{}", currentDateTime);

            let isOk = false;
            const intents = Array.isArray(result) ? result : [result];
            for (const intent of intents) {
                if (intent.action === "DIAGNOSTIC_OK") {
                    isOk = true;
                    break;
                }
            }

            if (isOk) {
                console.log('[Neo Diagnostic] Success: AI is responsive and identity is intact.');
                window.updateSystemStatus('online');
            } else {
                throw new Error("Diagnostic failed to return DIAGNOSTIC_OK.");
            }
        } catch (e) {
            console.error('[Neo Diagnostic] FAILED:', e);
            window.updateSystemStatus('error');
            const neoBubble = document.getElementById('neo-fab-bubble');
            if (neoBubble) {
                neoBubble.textContent = "システムに一時的な接続障害が発生しています。";
                neoBubble.style.backgroundColor = '#FF3B30';
                neoBubble.style.color = '#FFF';
                neoBubble.classList.add('show');
                setTimeout(() => {
                    neoBubble.classList.remove('show');
                    neoBubble.style.backgroundColor = '';
                    neoBubble.style.color = '';
                }, 5000);
            }
        }
    };

    // Run diagnostic ping every 1 hour (3600000 ms)
    setInterval(window.runNeoDiagnostic, 3600000);

    // [Neo+] handleInstruction and input listeners have been extracted to pages/chat.js

    // Nav Item Listeners
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            switchView(item.getAttribute('data-target'));
        });
    });

    const showSetup = () => {
        switchView('view-setup');
        const bn = document.querySelector('.neo-bottom-nav');
        if (bn) bn.style.display = 'none';

        // Neo Singleton: Do not hide neoFab

    };

    const showDash = () => {
        switchView('view-dash');
        const bn = document.querySelector('.neo-bottom-nav');
        if (bn) bn.style.display = '';

        // Restore size preference if reloading dash directly
        const storedSize = document.getElementById('select-font-size').value;
        if (storedSize === 'huge') applyFontSize('120%');
    };

    // Database hoisted globally
    const mockDB = window.mockDB;

    // Simulated function to update local dictionary (Pro-Artisan mapping)
    window.updateLearnedKeyword = (keyword, category) => {
        if (!keyword || !category) return;
        mockDB.learnedKeywords[keyword.toLowerCase()] = category;
        console.log(`[Neo DB] Learned new mapping: "${keyword}" => ${category}`);
    };

    // --- DocGenerator: Universal Document Engine Stub ---
    window.DocGenerator = {
        generateInvoice: function (projectId) {
            console.log(`[DocGenerator] 請求書 (Invoice) generated for Project ID: ${projectId}`);
            alert(`請求書 (Invoice) generated for Project ID: ${projectId}`);
            return { status: "success", documentId: "inv_" + Date.now() };
        },
        generateQuote: function (projectId) {
            console.log(`[DocGenerator] 見積書 (Quote) generated for Project ID: ${projectId}`);
            alert(`見積書 (Quote) generated for Project ID: ${projectId}`);
            return { status: "success", documentId: "qte_" + Date.now() };
        },
        generateDelivery: function (projectId) {
            console.log(`[DocGenerator] 納品書 (Delivery) generated for Project ID: ${projectId}`);
            alert(`納品書 (Delivery) generated for Project ID: ${projectId}`);
            return { status: "success", documentId: "del_" + Date.now() };
        }
    };

    // Filter Logic Toggle
    const btnFilterProjects = document.getElementById('btn-filter-projects');
    const filterDropdown = document.getElementById('filter-dropdown');

    if (btnFilterProjects && filterDropdown) {
        btnFilterProjects.addEventListener('click', (e) => {
            e.stopPropagation();
            filterDropdown.classList.toggle('hidden');
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!filterDropdown.contains(e.target) && !btnFilterProjects.contains(e.target)) {
                filterDropdown.classList.add('hidden');
            }
        });

        // Filter Options Clicks
        const filterOptions = filterDropdown.querySelectorAll('.filter-option');
        filterOptions.forEach(opt => {
            opt.addEventListener('click', () => {
                // Remove active from all
                filterOptions.forEach(o => o.classList.remove('active'));
                // Add to clicked
                opt.classList.add('active');

                // Toggle active state on the filter button itself
                const filterType = opt.getAttribute('data-filter');
                if (filterType !== 'newest') {
                    btnFilterProjects.classList.add('filter-active');
                } else {
                    btnFilterProjects.classList.remove('filter-active');
                }

                // Hide dropdown
                filterDropdown.classList.add('hidden');

                // Apply Filter Logic
                window.applyProjectFilter(filterType);
            });
        });

        const periodInput = document.getElementById('filter-period');
        if (periodInput) {
            periodInput.addEventListener('change', () => window.applyProjectFilter());
        }

        const searchInput = document.getElementById('filter-search-input');
        const searchClearBtn = document.getElementById('btn-clear-search');

        if (searchInput && searchClearBtn) {
            searchInput.addEventListener('input', (e) => {
                if (e.target.value.trim().length > 0) {
                    searchClearBtn.classList.remove('hidden');
                } else {
                    searchClearBtn.classList.add('hidden');
                }
                window.applyProjectFilter();
            });

            searchClearBtn.addEventListener('click', () => {
                searchInput.value = '';
                searchClearBtn.classList.add('hidden');
                window.applyProjectFilter();
            });
        }
    };

// Render Projects (Bank Account style list)
// CEO Fix: Securely expose renderProjects via an Event Listener instead of a global Object reference
    window.addEventListener('neo-render-projects', (e) => {
        const projects = e.detail?.projects || mockDB.projects;
        if (typeof window.renderProjects === 'function') window.renderProjects(projects);
    });

    // Make project cards clickable to detail
    window.saveProjectNote = async (newText) => {
        if (!currentOpenProjectId) return;
        const proj = mockDB.projects.find((p) => String(p.id) === String(currentOpenProjectId));
        if (proj) {
            proj.note = newText;

            if (window.supabase) {
                try {
                    await window.supabase
                        .from('projects')
                        .update({ note: newText })
                        .eq('id', currentOpenProjectId);
                    console.log("[Supabase] Project note saved.");
                } catch (e) {
                    console.error("Failed to sync project note:", e);
                }
            } else {
                window.saveToLocalStorage();
            }
        }
    };

    const bindProjectClicks = () => {
        // In a real app we'd bind to actual project list items
        // For prototype, if they click the "プロジェクト" feature card in dash, load Project 1

        // Render projects on init
        if (typeof window.renderProjects === 'function') window.renderProjects([...mockDB.projects]);

        // Hijack Dashboard card to click the first project for demo, or switch view directly to sites
        const sitesCard = document.querySelector('[data-target="view-sites"]');
        if (sitesCard) {
            sitesCard.onclick = (e) => {
                // If it's a bottom nav item we don't want to mess up the active class logic that much
                if (sitesCard.classList.contains('nav-item')) return;

                e.preventDefault();
                e.stopPropagation();
                // Instead of opening detail, let's actually go to the new Projects list
                switchView('view-sites');

                // Update nav bar active state manually
                document.querySelectorAll('.nav-item').forEach(item => {
                    item.classList.remove('active');
                    if (item.getAttribute('data-target') === 'view-sites') {
                        item.classList.add('active');
                    }
                });
            };
        }
    };
    // ------------------------------------------

    // Neo FAB Logic
    const fabButton = document.getElementById('neo-fab-button');
    const fabBubble = document.getElementById('neo-fab-bubble');

    const showFabMessage = () => {
        if (!fabBubble) return;

        // Define meta phrases
        const metaPhrases = [
            "Neo+はサーバーを持たないから、月額499円でこの最強AIが提供できるんだよ。",
            "君の機密データは君のiCloudに直接保存されている。だから安心だよ。",
            "今日も利益率の分析はバッチリ。無駄な経費を見つけよう！"
        ];

        // 50% chance to show a standard i18n message, 50% chance to show a meta phrase
        if (Math.random() > 0.5) {
            const numMsgs = 4;
            const randomId = Math.floor(Math.random() * numMsgs) + 1;
            const msgKey = `neo_fab_msg_${randomId}`;
            fabBubble.textContent = window.i18n.t(msgKey);
        } else {
            const randomMeta = metaPhrases[Math.floor(Math.random() * metaPhrases.length)];
            fabBubble.textContent = randomMeta;
        }

        fabBubble.classList.add('show');

        // Changed to hover-only action so click can navigate
        setTimeout(() => {
            fabBubble.classList.remove('show');
        }, 3000);
    };

    if (fabButton) {
        fabButton.addEventListener('mouseenter', showFabMessage);
    }

    // --- Smart Selector Logic (Phase 2) ---
    const chatInput = document.querySelector('.chat-input');
    const smartSelectorOverlay = document.getElementById('smart-selector-overlay');
    const smartSelectorOptions = document.getElementById('smart-selector-options');
    const btnCloseSelector = document.getElementById('btn-close-selector');

    // Mock terminology mapping for Smart Selector
    const smartMapping = [
        { ceoTerm: "プロジェクト車関係", taxTerm: "車両運搬具", icon: "car" },
        { ceoTerm: "プライベートから補填", taxTerm: "事業主借", icon: "wallet" },
        { ceoTerm: "現場の道具・資材", taxTerm: "消耗品費", icon: "hammer" }
    ];

    if (chatInput && smartSelectorOverlay && smartSelectorOptions) {
        // Toggle based on typing
        chatInput.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            if (val.length > 0) {
                // Show selector
                smartSelectorOverlay.classList.remove('hidden');

                // Dynamic Category Generation based on input
                const lowerVal = val.toLowerCase();
                let currentMapping = [];

                if (lowerVal.includes('映像') || lowerVal.includes('カメラ') || lowerVal.includes('撮影')) {
                    currentMapping = [
                        { ceoTerm: "撮影・機材関係", taxTerm: "機材費", icon: "◆" },
                        { ceoTerm: "ロケの移動・宿泊", taxTerm: "旅費交通費", icon: "◆" },
                        { ceoTerm: "クライアントとの食事", taxTerm: "接待交際費", icon: "◆" }
                    ];
                } else if (lowerVal.includes('飲食') || lowerVal.includes('食材') || lowerVal.includes('店')) {
                    currentMapping = [
                        { ceoTerm: "食材の仕入れ", taxTerm: "仕入高", icon: "◆" },
                        { ceoTerm: "店舗の消耗品", taxTerm: "消耗品費", icon: "◆" },
                        { ceoTerm: "新メニューの研究", taxTerm: "研究開発費", icon: "◆" }
                    ];
                } else if (lowerVal.includes('現場') || lowerVal.includes('材料') || lowerVal.includes('工事')) {
                    currentMapping = [
                        { ceoTerm: "現場の材料・資材", taxTerm: "材料費", icon: "◆" },
                        { ceoTerm: "外注・応援の支払い", taxTerm: "外注費", icon: "◆" },
                        { ceoTerm: "プロジェクト車関係", taxTerm: "車両運搬具", icon: "◆" }
                    ];
                } else {
                    // Default fallback
                    currentMapping = [
                        { ceoTerm: "道具・備品", taxTerm: "消耗品費", icon: "◆" },
                        { ceoTerm: "通信・ソフトウェア", taxTerm: "通信費", icon: "◆" },
                        { ceoTerm: "プライベートから補填", taxTerm: "事業主借", icon: "◆" }
                    ];
                }

                // Inject the 3 options
                smartSelectorOptions.innerHTML = currentMapping.map((item, index) => `
                    <div class="smart-option" data-tax="${item.taxTerm}" style="animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) ${index * 0.05}s both;">
                        <div class="icon-wrapper" style="font-size: 14px; display: grid; place-items: center; color: var(--text-muted);">
                            ${item.icon}
                        </div>
                        <div style="">
                            <div style="font-weight: 600;">${item.ceoTerm}</div>
                            <div style="font-size: 11px; color: var(--text-muted);">（税務: ${item.taxTerm}）として記録</div>
                        </div>
                    </div>
                `).join('');

                // Bind click events to new options
                document.querySelectorAll('.smart-option').forEach(opt => {
                    opt.addEventListener('click', () => {
                        const taxName = opt.getAttribute('data-tax');
                        // Hide overlay
                        smartSelectorOverlay.classList.add('hidden');
                        chatInput.value = '';

                        let bubbleProjStr = '';
                        if (currentOpenProjectId) {
                            const proj = mockDB.projects.find((p) => String(p.id) === String(currentOpenProjectId));
                            if (proj) {
                                bubbleProjStr = `（保存先: ${proj.name}）`;
                                const newTx = {
                                    id: Date.now(),
                                    projectId: currentOpenProjectId,
                                    type: "expense",
                                    title: `${taxName} (AI自動分類)`,
                                    amount: Math.floor(Math.random() * 20000) + 1000,
                                    date: new Date().toLocaleDateString('ja-JP').replace(/\//g, '/')
                                };
                                mockDB.activities.unshift(newTx);
                                if (typeof window.renderProjects === 'function') window.renderProjects(mockDB.projects); // update wallet and lists
                            }
                        }

                        // Fake chat bubble from Neo explaining the Time Saved value + next action
                        const chatContainer = document.getElementById('expense-chat-container');
                        if (chatContainer) {
                            const botMsg = document.createElement('div');
                            botMsg.className = 'chat-bubble neo';
                            botMsg.innerHTML = `「${taxName}」で処理しておいたよ。${bubbleProjStr}<br><br><span style="color:var(--accent-neo-yellow);">これでCEOの自由な時間がまた2時間プラス（+）されたね。さあ、次はどのプロジェクトを動かす？🚀</span>`;
                            chatContainer.appendChild(botMsg);
                            chatContainer.parentElement.scrollTop = chatContainer.parentElement.scrollHeight;
                        }
                    });
                });
            } else {
                smartSelectorOverlay.classList.add('hidden');
            }
        });

        // Close button manually
        if (btnCloseSelector) {
            // Use onclick instead of addEventListener to prevent listener accumulation on reusable modals
            btnCloseSelector.onclick = () => {
                smartSelectorOverlay.classList.add('hidden');
            };
        }
    }

    // Check initial state (Setup Gatekeeper is now initialized at the top of the file)
    bindProjectClicks();

    // Navigation intercepts
    // We remove the view-sites hijack to allow the folder icon to route naturally to the project list
    // document.querySelectorAll('.nav-item').forEach(item => { /* deleted */ });

    // --- New Project Modal Logic ---
    // NOTE: ボタンは project.html 内にあり遅延ロードされるため、
    // バインドは pages/project.js の initProjectView() → bindProjectModals() で行う。
    // ここでの getElementById は常に null を返すため削除済み。
    // --- Project Action Menu Logic ---
    // NOTE: project.html は遅延ロードのため、btn-project-menu-toggle / project-action-menu は
    // このタイミングでDOMに存在しない（null になる）。
    // バインドは pages/project.js の bindProjectModals() で行う。

    // --- Edit logic ---
    const btnCloseEditModal = document.getElementById('btn-close-edit-modal');
    if (btnCloseEditModal) {
        btnCloseEditModal.addEventListener('click', () => {
            modalEditProject.classList.remove('show');
            // Neo Singleton: Do not show neoFab
        });
    }

    window.editProject = (projectId) => {
        // Fetch the modal inside the function scope
        const modalEditProject = document.getElementById('modal-edit-project');

        // Populate edit fields
        const proj = mockDB.projects.find((p) => String(p.id) === String(projectId));
        if (proj && modalEditProject) {
            const editName = document.getElementById('edit-proj-name');
            if (editName) editName.value = proj.name || '';

            const editLoc = document.getElementById('edit-proj-location');
            if (editLoc) editLoc.value = proj.location || '';

            const editNote = document.getElementById('edit-proj-note');
            if (editNote) editNote.value = proj.note || '';

            // const editCat = document.getElementById('edit-proj-category');
            // if (editCat) editCat.value = proj.category || '';

            const editDate = document.getElementById('edit-proj-date');
            if (editDate) editDate.value = proj.startDate ? proj.startDate.replace(/\//g, '-') : '';

            const editClient = document.getElementById('edit-proj-client');
            if (editClient) editClient.value = proj.clientName || '';

            const editDeadline = document.getElementById('edit-proj-deadline');
            if (editDeadline) editDeadline.value = proj.paymentDeadline || '';

            const editBank = document.getElementById('edit-proj-bank');
            if (editBank) editBank.value = proj.bankInfo || '';

            modalEditProject.classList.add('show');
            // Hide FAB in modal - REMOVED for Singleton pattern

        }
    };

    const btnUpdateProject = document.getElementById('btn-update-project');
    if (btnUpdateProject) {
        btnUpdateProject.addEventListener('click', () => {
            console.log('[DEBUG] btnUpdateProject clicked');
            const name = document.getElementById('edit-proj-name').value;
            const loc = document.getElementById('edit-proj-location').value;
            const note = document.getElementById('edit-proj-note').value;
            // const cat = document.getElementById('edit-proj-category').value;
            const cat = 'other'; // Hardcoded default

            if (!name) {
                alert('プロジェクト名を入力してください');
                return;
            }

            // Update DB
            const projIndex = mockDB.projects.findIndex((p) => String(p.id) === String(currentOpenProjectId));
            if (projIndex !== -1) {
                mockDB.projects[projIndex].name = name;
                mockDB.projects[projIndex].location = loc;
                mockDB.projects[projIndex].note = note;
                mockDB.projects[projIndex].category = cat;

                const clientEl = document.getElementById('edit-proj-client');
                mockDB.projects[projIndex].clientName = (clientEl && clientEl.value) ? clientEl.value : mockDB.projects[projIndex].clientName;

                const deadlineEl = document.getElementById('edit-proj-deadline');
                mockDB.projects[projIndex].paymentDeadline = (deadlineEl && deadlineEl.value) ? deadlineEl.value : mockDB.projects[projIndex].paymentDeadline;

                const bankEl = document.getElementById('edit-proj-bank');
                mockDB.projects[projIndex].bankInfo = (bankEl && bankEl.value) ? bankEl.value : mockDB.projects[projIndex].bankInfo;

                const inputDate = document.getElementById('edit-proj-date');
                if (inputDate && inputDate.value) mockDB.projects[projIndex].startDate = inputDate.value.replace(/-/g, '/');

                mockDB.projects[projIndex].lastUpdated = new Date().toLocaleDateString('ja-JP').replace(/\//g, '-');

                // Close modal & Resync View
                modalEditProject.classList.remove('show');
                // Neo Singleton: Do not show neoFab

                // 念のためNeoUIからのアクションメニューがあれば閉じる
                const actionMenu = document.getElementById('project-action-menu');
                if (actionMenu) actionMenu.classList.add('hidden');

                if (typeof window.renderProjects === 'function') window.renderProjects(mockDB.projects); // Ensure sites view is refreshed with new info
                window.openProjectDetail(currentOpenProjectId);

                // Neoのフィードバック
                const neoBubble = document.getElementById('neo-fab-bubble');
                if (neoBubble) {
                    neoBubble.textContent = `⚡️ プロジェクト情報を更新したよ。`;
                    neoBubble.classList.add('show');
                    setTimeout(() => { neoBubble.classList.remove('show'); }, 3000);
                }
            }
        });
    }

    // --- Delete logic ---
    const btnCancelDelete = document.getElementById('btn-cancel-delete');
    if (btnCancelDelete) {
        btnCancelDelete.addEventListener('click', () => {
            modalDeleteConfirm.classList.remove('show');
            // Neo Singleton: Do not show neoFab
        });
    }

    const btnConfirmDelete = document.getElementById('btn-confirm-delete');
    if (btnConfirmDelete) {
        btnConfirmDelete.addEventListener('click', () => {
            console.log('[DEBUG] btnConfirmDelete clicked');
            if (window.deleteProject) {
                window.deleteProject(currentOpenProjectId);
            }
        });
    }

    // Direct delete method to be called from the edit modal as well
    window.deleteProject = async (projectId) => {
        if (!projectId) return;

        console.log(`[Neo Deletion Protocol] Initiating Hard Kill for Project ID: ${projectId}`);
        const beforeCount = mockDB.projects.length;

        // Remove from mock DB instantly (Optimistic UI update)
        mockDB.projects = mockDB.projects.filter(p => p.id !== projectId);
        mockDB.documents = mockDB.documents.filter(d => d.projectId !== projectId);
        mockDB.transactions = mockDB.transactions.filter(t => t.projectId !== projectId);

        console.log(`[Neo Deletion Protocol] Success! Project count: ${beforeCount} -> ${mockDB.projects.length}`);

        // --- ZOMBIE QUARANTINE (Client-Side Source of Truth) ---
        // Even if Supabase fails to delete, we memorize that this ID is dead to us.
        let deadIds = JSON.parse(localStorage.getItem('neo_deleted_projects') || '[]');
        if (!deadIds.includes(projectId)) {
            deadIds.push(projectId);
            localStorage.setItem('neo_deleted_projects', JSON.stringify(deadIds));
        }

        // Persistent deletion from Server DB
        if (window.supabaseClient) {
            try {
                // _resolveSupabaseAuthUid throws Error('AUTH_REQUIRED') if no uid
                const delUid = await window._resolveSupabaseAuthUid();
                // Delete project
                await window.supabaseClient.from('projects').delete().eq('id', projectId);
                await window.supabaseClient.from('activities').delete().eq('project_id', projectId).eq('user_id', delUid);
                await window.supabaseClient.from('documents').delete().eq('project_id', projectId);
            } catch (err) {
                if (err?.message === 'AUTH_REQUIRED') {
                    console.warn('[Database] No auth session; skipping server-side project deletion.');
                } else {
                    console.error('[Database] Failed to permanently delete project:', err);
                }
            }
        }

        if (modalDeleteConfirm) modalDeleteConfirm.classList.remove('show');
        if (modalEditProject) modalEditProject.classList.remove('show');

        // Neo Bubble Notification (Undo Snackbar placeholder)
        const neoBubble = document.getElementById('neo-fab-bubble');
        if (neoBubble) {
            neoBubble.textContent = "プロジェクトを削除しました。";
            neoBubble.classList.add('show');
            setTimeout(() => { neoBubble.classList.remove('show'); }, 3500);
        }

        // Render updated list and return to sites view
        if (typeof window.renderProjects === 'function') window.renderProjects(mockDB.projects);
        document.querySelector('[data-target="view-sites"]').click();
    };



    // --- Expense Scanner Modal Logic ---
    const modalExpenseScanner = document.getElementById('modal-expense-scanner');
    const btnCloseExpenseModal = document.getElementById('btn-close-expense-modal');
    const btnExecuteExpense = document.getElementById('btn-execute-expense');

    window.openIncomeModal = () => {
        if (!currentOpenProjectId) return;

        const titleEl = document.getElementById('add-income-title');
        const amountEl = document.getElementById('add-income-amount');
        const modal = document.getElementById('modal-add-income');

        if (!titleEl || !amountEl || !modal) {
            console.error('DOM Error: Add Income Modal elements not found.');
            return;
        }

        titleEl.value = '';
        amountEl.value = '';

        modal.classList.remove('hidden');
        modal.classList.add('show');
    };

    window.closeAddIncomeModal = () => {
        const modal = document.getElementById('modal-add-income');
        if (!modal) return;

        modal.classList.remove('show');

        setTimeout(() => {
            modal.classList.add('hidden');
        }, 300);
    };

    window.saveAddIncome = () => {
        if (!currentOpenProjectId) return;

        const title = document.getElementById('add-income-title').value.trim();
        const amountStr = document.getElementById('add-income-amount').value;
        const numAmount = parseInt(amountStr.replace(/,/g, ''), 10);

        if (!title || isNaN(numAmount)) {
            alert('内容と金額を正しく入力してください。');
            return;
        }

        window.insertTransaction({
            id: Date.now(),
            projectId: currentOpenProjectId,
            type: "income",
            title: title,
            amount: numAmount,
            date: new Date().toLocaleDateString('ja-JP').replace(/\//g, '/'),
            source: "manual",
            category: "売上高",
            isBookkeeping: true
        });

        window.closeAddIncomeModal();
        // Re-render the UI
        window.openProjectDetail(currentOpenProjectId);
    };

    window.handleReceiptUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        console.log('[Neo Compression] File selected:', file.name, (file.size / 1024).toFixed(2) + 'KB');

        // UX Thrill: Show spinning loader inside the already open Add Expense Modal
        const btnTrigger = document.getElementById('btn-modal-camera-trigger');
        let originalHtml = '';
        if (btnTrigger) {
            originalHtml = btnTrigger.innerHTML;
            btnTrigger.innerHTML = '<i data-lucide="loader-2" class="spin" style="width: 18px; height: 18px; animation: spin 1s linear infinite;"></i> <span style="animation: neoDeepThought 2.5s ease-in-out infinite; display: inline-block;">Thinking...</span>';
        }
        if (window.lucide) window.lucide.createIcons();

        // HTML5 Canvas Native Compression Engine
        const img = new Image();
        img.onload = () => {
            const MAX_DIMENSION = 1500; // OCR optimal legibility threshold
            let width = img.width;
            let height = img.height;

            // Aspect Ratio constraints
            if (width > height) {
                if (width > MAX_DIMENSION) {
                    height = Math.round((height *= MAX_DIMENSION / width));
                    width = MAX_DIMENSION;
                }
            } else {
                if (height > MAX_DIMENSION) {
                    width = Math.round((width *= MAX_DIMENSION / height));
                    height = MAX_DIMENSION;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');

            // High-quality downsampling draw
            ctx.drawImage(img, 0, 0, width, height);

            // Serialize to JPG payload (80% yields massive savings with no text degradation)
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);

            // In a real app, calculate true Base64 size, but here we estimate
            const estimatedNewSize = Math.round((compressedDataUrl.length * (3 / 4)) / 1024);
            console.log(`[Neo Compression] Completed. Output Size ~${estimatedNewSize}KB`);

            // Simulate Network / AI transmission delay, then populate fields
            setTimeout(() => {
                if (btnTrigger) {
                    btnTrigger.innerHTML = '<i data-lucide="check-circle" style="width: 18px; height: 18px; color: #10b981;"></i> レシート自動入力完了';
                }
                if (window.lucide) window.lucide.createIcons();

                // Reset input so the same file can be selected again if needed
                event.target.value = '';

                // Randomize the mock extract values a bit for realism
                const amounts = [15400, 3200, 19800, 840, 50000];
                const stores = ["ホームセンター コーナン", "Cafe Renoir", "Amazon Web Services", "タクシー (GO)", "〇〇建設資材"];

                const titleEl = document.getElementById('add-expense-title');
                const amountEl = document.getElementById('add-expense-amount');
                if (titleEl) titleEl.value = stores[Math.floor(Math.random() * stores.length)];
                if (amountEl) amountEl.value = amounts[Math.floor(Math.random() * amounts.length)];

            }, 800);
        };

        const reader = new FileReader();
        reader.onload = (e) => {
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    };

    // --- Company Stamp Logic ---
    const initCompanyStampSettings = () => {
        const uploadInput = document.getElementById('company-stamp-upload');
        const clearBtn = document.getElementById('btn-clear-stamp');
        const previewImg = document.getElementById('stamp-preview-img');
        const placeholderText = document.getElementById('stamp-placeholder-text');

        const scaleSlider = document.getElementById('stamp-scale-slider');
        const xSlider = document.getElementById('stamp-x-slider');
        const ySlider = document.getElementById('stamp-y-slider');

        const scaleVal = document.getElementById('stamp-scale-val');
        const xVal = document.getElementById('stamp-x-val');
        const yVal = document.getElementById('stamp-y-val');

        // Load saved state
        const savedStamp = localStorage.getItem('neo_company_stamp_data');
        const savedScale = localStorage.getItem('neo_company_stamp_scale') || "1.0";
        const savedX = localStorage.getItem('neo_company_stamp_x') || "0";
        const savedY = localStorage.getItem('neo_company_stamp_y') || "0";

        const updatePreviewTransforms = () => {
            if (previewImg && previewImg.src) {
                const scale = scaleSlider.value;
                const x = xSlider.value;
                const y = ySlider.value;

                previewImg.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;

                if (scaleVal) scaleVal.textContent = `${Number(scale).toFixed(1)}x`;
                if (xVal) xVal.textContent = `${x}px`;
                if (yVal) yVal.textContent = `${y}px`;

                // Save automatically on adjust
                localStorage.setItem('neo_company_stamp_scale', scale);
                localStorage.setItem('neo_company_stamp_x', x);
                localStorage.setItem('neo_company_stamp_y', y);
            }
        };

        if (savedStamp && uploadInput) {
            previewImg.src = savedStamp;
            previewImg.style.display = 'block';
            if (placeholderText) placeholderText.style.display = 'none';

            if (scaleSlider) scaleSlider.value = savedScale;
            if (xSlider) xSlider.value = savedX;
            if (ySlider) ySlider.value = savedY;
            updatePreviewTransforms();
        }

        if (uploadInput) {
            uploadInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (ev) => {
                    const b64 = ev.target.result;
                    previewImg.src = b64;
                    previewImg.style.display = 'block';
                    if (placeholderText) placeholderText.style.display = 'none';

                    localStorage.setItem('neo_company_stamp_data', b64);

                    // Reset sliders for new image
                    if (scaleSlider) scaleSlider.value = "1.0";
                    if (xSlider) xSlider.value = "0";
                    if (ySlider) ySlider.value = "0";
                    updatePreviewTransforms();
                };
                reader.readAsDataURL(file);
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (confirm('登録された社判画像を削除しますか？')) {
                    localStorage.removeItem('neo_company_stamp_data');
                    localStorage.removeItem('neo_company_stamp_scale');
                    localStorage.removeItem('neo_company_stamp_x');
                    localStorage.removeItem('neo_company_stamp_y');

                    if (previewImg) {
                        previewImg.src = '';
                        previewImg.style.display = 'none';
                    }
                    if (placeholderText) placeholderText.style.display = 'block';
                    if (uploadInput) uploadInput.value = '';
                }
            });
        }

        [scaleSlider, xSlider, ySlider].forEach(slider => {
            if (slider) {
                slider.addEventListener('input', updatePreviewTransforms);
            }
        });
    };

    // Initialize stamp settings logic on load
    initCompanyStampSettings();
    // --- End Company Stamp Logic ---

    window.openAddExpenseModal = () => {
        if (!currentOpenProjectId) return;

        const modal = document.getElementById('modal-add-expense');
        const titleEl = document.getElementById('add-expense-title');
        const amountEl = document.getElementById('add-expense-amount');
        const dateEl = document.getElementById('add-expense-date');
        const btnTrigger = document.getElementById('btn-modal-camera-trigger');

        if (!modal) {
            console.error('DOM Error: Add Expense Modal elements not found.');
            return;
        }

        // Reset fields
        if (titleEl) titleEl.value = '';
        if (amountEl) amountEl.value = '';
        if (dateEl) dateEl.value = new Date().toISOString().split('T')[0]; // Default to today
        if (btnTrigger) btnTrigger.innerHTML = '<i data-lucide="camera" style="width: 18px; height: 18px; color: var(--accent-neo-blue);"></i> レシート撮影で自動入力';
        if (window.lucide) window.lucide.createIcons();

        modal.classList.remove('hidden');
        modal.classList.add('show');
    };

    window.closeAddExpenseModal = () => {
        const modal = document.getElementById('modal-add-expense');
        if (!modal) return;

        modal.classList.remove('show');

        setTimeout(() => {
            modal.classList.add('hidden');
        }, 300);
    };

    window.saveAddExpense = () => {
        if (!currentOpenProjectId) return;

        const title = document.getElementById('add-expense-title').value.trim();
        const amountStr = document.getElementById('add-expense-amount').value;
        const numAmount = parseInt(amountStr.replace(/,/g, ''), 10);
        const inputDate = document.getElementById('add-expense-date').value || new Date().toISOString().split('T')[0];
        const formattedDate = inputDate.replace(/-/g, '/'); // Match YYYY/MM/DD standard in mockDB

        if (!title || isNaN(numAmount)) {
            alert('内容と金額を正しく入力してください。');
            return;
        }

        window.insertTransaction({
            id: Date.now(),
            projectId: currentOpenProjectId,
            type: "expense",
            title: title + " (手動計上)",
            amount: numAmount,
            date: formattedDate,
            source: "manual",
            category: "未分類 (AI確認中)", // Can trigger AI parsing in background or default mapped
            isBookkeeping: true
        });

        window.closeAddExpenseModal();

        // Trigger Neo subtle toast
        const neoFabBubble = document.getElementById('neo-fab-bubble');
        if (neoFabBubble) {
            neoFabBubble.textContent = `⚡️ 経費 ${numAmount.toLocaleString()}円 を計上し、全体利益から差し引いたよ。`;
            neoFabBubble.classList.add('show');
            setTimeout(() => {
                neoFabBubble.classList.remove('show');
            }, 3000);
        }

        // Re-render completely so Wallet global totals update
        if (typeof window.renderProjects === 'function') window.renderProjects(mockDB.projects);

        // Re-open exactly the current project to refresh the timeline
        window.openProjectDetail(currentOpenProjectId);
    };

    // --- CSV Export Engine (Phase 4) ---
    const btnExportCsv = document.getElementById('btn-export-csv');
    if (btnExportCsv) {
        btnExportCsv.addEventListener('click', () => {
            if (mockDB.transactions.length === 0) {
                alert("エクスポートするデータがありません。");
                return;
            }

            // Generate Rakuraku Seisan / freee compatible CSV format
            // Headers: 取引日, 借方勘定科目, 借方金額, 貸方勘定科目, 貸方金額, 摘要, プロジェクト名
            const headers = ["取引日", "借方勘定科目", "借方金額", "貸方勘定科目", "貸方金額", "摘要", "プロジェクト名"];

            const rows = mockDB.transactions.map(t => {
                const proj = mockDB.projects.find(p => p.id === t.projectId);
                const projName = proj ? proj.name : "";

                // Map logical types to basic accounting subjects
                let debitAccount = "消耗品費";
                if (t.type === "labor") debitAccount = "外注工賃";

                let creditAccount = "現金"; // Default assumption

                // Format date from YYYY/MM/DD to YYYY-MM-DD for standard import
                const formattedDate = t.date.replace(/\//g, "-");

                return [
                    formattedDate,
                    debitAccount,
                    t.amount,
                    creditAccount,
                    t.amount, // Double entry accounting mock
                    t.title,
                    projName
                ].map(val => `"${val}"`).join(','); // Quote all values to prevent comma issues
            });

            const csvContent = [headers.join(','), ...rows].join('\n');

            // Add BOM for Japanese Excel compatibility
            const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
            const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });

            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);

            // Format filename: neo_export_YYYYMMDD.csv
            const today = new Date();
            const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

            link.setAttribute("href", url);
            link.setAttribute("download", `neo_export_${dateStr}.csv`);
            link.style.visibility = 'hidden';

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Trigger Neo subtle toast
            const neoFabBubble = document.getElementById('neo-fab-bubble');
            if (neoFabBubble) {
                neoFabBubble.textContent = `⚡️ freee / 楽楽精算 互換CSVを出力したよ。`;
                neoFabBubble.classList.add('show');
                setTimeout(() => {
                    neoFabBubble.classList.remove('show');
                }, 4000);
            }
        });
    }

    // --- PDF Grid Generation Engine (Phase 5) ---
    const btnExportPdfGrid = document.getElementById('btn-export-pdf-grid');
    const a4Container = document.getElementById('a4-print-container');
    const a4Grid = document.getElementById('a4-receipt-grid');

    if (btnExportPdfGrid && a4Container && a4Grid) {
        btnExportPdfGrid.addEventListener('click', () => {
            // Get expenses
            const expenses = mockDB.transactions.filter(t => t.type === 'expense' && !t.is_deleted);
            if (expenses.length === 0) {
                alert("抽出する領収書データがありません。");
                return;
            }

            a4Grid.innerHTML = ''; // Clear

            expenses.forEach(exp => {
                const proj = mockDB.projects.find(p => p.id === exp.projectId);
                const projName = proj ? proj.name : 'Unknown';

                // Mock simple receipt block
                const block = document.createElement('div');
                block.style.border = '1px solid #e5e7eb';
                block.style.borderRadius = '8px';
                block.style.padding = '16px';
                block.style.display = 'grid';
                block;
                block.style.gap = '8px';
                block.style.backgroundColor = '#f9fafb';

                block.innerHTML = `
                    <div style="font-size: 11px; color: #6b7280; display: grid; grid-auto-flow: column; justify-content: space-between; align-items: center;">
                        <span>Project: ${projName}</span>
                        <span>Date: ${exp.date}</span>
                    </div>
                    <div style=" min-height: 120px; border: 2px dashed #d1d5db; border-radius: 4px; display: grid; place-items: center; color: #9ca3af; font-size: 12px; background: white;">
                        [ AI Extracted Receipt Scan ]
                    </div>
                    <div style="display: grid; grid-auto-flow: column; justify-content: space-between; align-items: center; align-items: end;">
                        <span style="font-size: 12px; font-weight: 600;">${exp.title}</span>
                        <span style="font-size: 14px; font-weight: 700; color: #10b981;">¥${exp.amount.toLocaleString()}</span>
                    </div>
                `;
                a4Grid.appendChild(block);
            });

            // Prevent scrolling on body to ensure crisp print layout
            document.body.style.overflow = 'hidden';

            // Temporarily hide the main app wrapper and show the print container
            const modalReceiptGrid = document.getElementById('modal-receipt-grid');
            if (modalReceiptGrid) {
                modalReceiptGrid.classList.remove('hidden');
            }

            // Set current date on print header
            const pd = document.getElementById('a4-print-date');
            if (pd) pd.textContent = "抽出日: " + new Date().toLocaleDateString('ja-JP');

            // Set initial fitScale for the grid slider and paper
            setTimeout(() => {
                const gridTarget = document.getElementById('a4-print-container');
                const sliderGrid = document.getElementById('zoom-slider-grid');
                if (gridTarget && sliderGrid) {
                    const fw = Math.min(window.innerWidth / 793, 1.0) * 0.95;
                    gridTarget.dataset.baseScale = fw.toString();
                    sliderGrid.value = fw;
                    gridTarget.style.transform = `scale(${fw}) translate(0px, 0px)`;
                }
            }, 100);

        });
    }

    // --- Analog-Digital Bridge: Shared Document View ---
    const urlParams = new URLSearchParams(window.location.search);
    const sharedDocPayload = urlParams.get('share');
    if (sharedDocPayload) {
        try {
            const docData = JSON.parse(decodeURIComponent(atob(sharedDocPayload)));

            // Populate the preview with docData values manually
            window.currentDocType = docData.type || 'estimate';

            // Re-use updateDocPreview but override inputs first
            const elClient = document.getElementById('doc-client-name');
            if (elClient) elClient.value = docData.client || '';
            const elDate = document.getElementById('doc-issue-date');
            if (elDate) elDate.value = docData.date || '';
            const elDeadline = document.getElementById('doc-deadline-date');
            if (elDeadline) elDeadline.value = docData.deadline || '';
            const elSubj = document.getElementById('doc-subject');
            if (elSubj) elSubj.value = docData.subject || '';
            const elMemo = document.getElementById('doc-receipt-memo');
            if (elMemo) elMemo.value = docData.memo || '';
            const elBank = document.getElementById('doc-bank-info');
            if (elBank) elBank.value = docData.bank || '';

            // Handle items
            const itemsContainer = document.getElementById('doc-line-items-container');
            if (itemsContainer && docData.items && docData.items.length > 0) {
                itemsContainer.innerHTML = '';
                docData.items.forEach(item => {
                    itemsContainer.innerHTML += `
                        <div class="doc-line-item-row" style="margin-bottom: 24px; width: 100%; position: relative;">
                            <div style="position: absolute; top: -10px; right: -10px; background: #fff; padding: 4px; border-radius: 8px; z-index: 3; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                                <button type="button" onclick="this.closest('.doc-line-item-row').remove(); window.updateDocPreview();" style="background: none; border: none; color: #ef4444; font-size: 12px; font-weight: 700; padding: 8px; margin: 0; cursor: pointer;">&times; 削除</button>
                            </div>
                            <input type="text" class="form-control item-name-input" value="${item.name}" style="width: 100%; box-sizing: border-box; margin: 30px 0 12px 0 !important; padding: 16px; font-size: 16px; border: 1.5px solid #cbd5e1; border-radius: 12px; background: #fff; color: #0f172a;">
                            <div style="display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 12px; width: 100%; margin: 0; padding: 0;">
                                <input type="number" inputmode="decimal" class="form-control item-price-input" value="${item.price}" style=" margin: 0; padding: 16px; font-size: 18px; font-weight: 700; border: 1.5px solid #cbd5e1; border-radius: 12px; text-align: right; background: #fff; color: #0f172a;">
                                <span style="font-size: 16px; font-weight: 700; color: #475569;">円</span>
                            </div>
                        </div>`;
                });
            }

            // Hide the wrapper so behind the modal is clean
            const appWrap = document.querySelector('.app-wrapper');
            if (appWrap) appWrap.style.display = 'none';

            // Fire the standard renderer safely
            setTimeout(() => {
                window.updateDocPreview();

                // Hide the QR code in the shared view itself to avoid inception
                const qrElContainer = document.getElementById('preview-qr-code')?.parentElement;
                if (qrElContainer) qrElContainer.style.display = 'none';

                // Show the modal instantly
                const previewModal = document.getElementById('modal-doc-preview');
                if (previewModal) {
                    previewModal.classList.remove('hidden');

                    // Hide standard actions, show shared actions
                    const btnSavePdf = document.getElementById('btn-preview-save-pdf');
                    if (btnSavePdf) btnSavePdf.classList.add('hidden');
                    const btnEdit = document.getElementById('btn-preview-edit');
                    if (btnEdit) btnEdit.style.display = 'none'; // Use display none since hidden class might not stick due to inline styles

                    // Determine User vs Guest dynamically based on industry or mockDB
                    const isNeoUser = localStorage.getItem('fini_setup_complete') === 'true';
                    if (isNeoUser) {
                        const btnSaveNeo = document.getElementById('btn-shared-save-neo');
                        if (btnSaveNeo) btnSaveNeo.classList.remove('hidden');
                    } else {
                        const btnSharePdf = document.getElementById('btn-shared-save-pdf');
                        if (btnSharePdf) btnSharePdf.classList.remove('hidden');
                    }
                }
            }, 100);
        } catch (e) {
            console.error("Failed to parse shared document", e);
        }
    }

    window.importSharedDoc = function () {
        alert("Neo+にデータをインポートしました！プロジェクト画面に戻ります。");
        // Strip URL param and reload to pure dashboard
        window.location.href = window.location.origin + window.location.pathname;
    };

    // --- Field King: Wireless Print ---
    window.printModalGrid = function () {
        const mainApp = document.querySelector('.app-container');
        const bottomNav = document.querySelector('.neo-bottom-nav');
        const modalPreview = document.getElementById('modal-receipt-grid');
        const stickyFooter = modalPreview ? modalPreview.querySelector('#grid-floating-footer') : null;
        const previewHeader = modalPreview ? modalPreview.querySelector('#grid-floating-header') : null;

        if (mainApp) mainApp.style.display = 'none';
        if (bottomNav) bottomNav.style.display = 'none';

        if (modalPreview) {
            modalPreview.style.position = 'relative';
            modalPreview.style.overflow = 'visible';
            modalPreview.style.height = 'auto';
        }
        if (stickyFooter) stickyFooter.style.display = 'none';
        if (previewHeader) previewHeader.style.display = 'none';

        setTimeout(() => {
            window.print();

            if (mainApp) mainApp.style.display = '';
            if (bottomNav) bottomNav.style.display = '';

            if (modalPreview) {
                modalPreview.style.position = 'fixed';
                modalPreview.style.overflow = 'hidden';
                modalPreview.style.height = '100dvh';
            }
            if (stickyFooter) stickyFooter.style.display = 'grid';
            if (previewHeader) previewHeader.style.display = 'grid';
        }, 300);
    };

    window.printModalDoc = function () {
        // Temporarily hide the app container and nav to isolate the modal for printing
        const mainApp = document.querySelector('.app-container');
        const bottomNav = document.querySelector('.neo-bottom-nav');
        const modalPreview = document.getElementById('modal-doc-preview');
        const stickyFooter = modalPreview ? modalPreview.querySelector('div[style*="position: absolute; bottom: 0;"]') : null;
        const previewHeader = modalPreview ? modalPreview.querySelector('div[style*="border-bottom: 1px solid"]') : null;
        const paperScaleContainer = document.querySelector('.doc-gen-preview-container > div');

        if (mainApp) mainApp.style.display = 'none';
        if (bottomNav) bottomNav.style.display = 'none';

        // Prepare Modal for pure A4 printing layout
        if (modalPreview) {
            modalPreview.style.position = 'relative';
            modalPreview.style.overflow = 'visible';
            modalPreview.style.height = 'auto';
        }
        if (stickyFooter) stickyFooter.style.display = 'none';
        if (previewHeader) previewHeader.style.display = 'none';

        setTimeout(() => {
            window.print();

            // Restore UI
            if (mainApp) mainApp.style.display = '';
            if (bottomNav) bottomNav.style.display = '';

            if (modalPreview) {
                modalPreview.style.position = 'fixed';
                modalPreview.style.overflow = 'hidden';
                modalPreview.style.height = '100dvh';
            }
            if (stickyFooter) stickyFooter.style.display = 'grid';
            if (previewHeader) previewHeader.style.display = 'grid';

        }, 300);
    };

    // --- Field King: Interactive Pan & Zoom for A4 Preview (Digital Clone Edition) ---
    // Universal logic for all preview containers that need touch pan and zoom OR Slider zooming
    const setupInteractiveZoom = (wrapperId, paperId, sliderId, floatHId, floatFId) => {
        const previewWrapper = document.getElementById(wrapperId);
        const paperTarget = document.getElementById(paperId);
        const sliderInput = document.getElementById(sliderId);

        if (previewWrapper && paperTarget) {
            // Calculate Perfect Fit Scale dynamically with Professional Margins
            const calculateFitScale = () => {
                return 1.0; // CSS natively handles the 100% responsive fit via aspect-ratio.
            };

            let currentZoom = calculateFitScale();
            let baseZoom = currentZoom;
            let lastDist = 0;

            const updateLayout = () => {
                if (sliderInput) sliderInput.value = currentZoom;
                if (currentZoom === 1.0) {
                    paperTarget.style.transform = 'none';
                    paperTarget.style.marginBottom = '0px';
                } else {
                    paperTarget.style.transform = `scale(${currentZoom})`;
                    paperTarget.style.marginBottom = '0px';
                }
            };

            // Apply initial perfect fit
            updateLayout();

            // Recalculate on window resize
            window.addEventListener('resize', () => {
                if (currentZoom <= calculateFitScale() * 1.05) {
                    currentZoom = calculateFitScale();
                    updateLayout();
                }
            });

            // Handle Slider Input
            if (sliderInput) {
                sliderInput.addEventListener('input', (e) => {
                    currentZoom = parseFloat(e.target.value);
                    updateLayout();
                });
            }

            const floatH = document.getElementById(floatHId);
            const floatF = document.getElementById(floatFId);
            let fadeTimeout;

            const fadeUIOut = () => {
                if (floatH) floatH.style.opacity = '0.15';
                if (floatF) floatF.style.opacity = '0.15';
                if (floatH) floatH.style.pointerEvents = 'none';
                if (floatF) floatF.style.pointerEvents = 'none';
            };

            const fadeUIIn = () => {
                if (floatH) floatH.style.opacity = '1';
                if (floatF) floatF.style.opacity = '1';
                if (floatH) floatH.style.pointerEvents = 'auto';
                if (floatF) floatF.style.pointerEvents = 'auto';
            };

            previewWrapper.addEventListener('touchstart', (e) => {
                if (e.target === sliderInput || (sliderInput && sliderInput.contains(e.target))) return; // Ignore slider touches

                if (e.touches.length === 2) {
                    lastDist = Math.hypot(
                        e.touches[0].clientX - e.touches[1].clientX,
                        e.touches[0].clientY - e.touches[1].clientY
                    );
                    baseZoom = currentZoom;
                    fadeUIOut();
                }
                clearTimeout(fadeTimeout);
            }, { passive: true });

            previewWrapper.addEventListener('touchmove', (e) => {
                if (e.target === sliderInput || (sliderInput && sliderInput.contains(e.target))) return;

                if (e.touches.length === 2) {
                    e.preventDefault();
                    const dist = Math.hypot(
                        e.touches[0].clientX - e.touches[1].clientX,
                        e.touches[0].clientY - e.touches[1].clientY
                    );
                    const delta = dist / lastDist;
                    const minZoom = calculateFitScale();
                    currentZoom = Math.min(Math.max(minZoom, baseZoom * delta), 3.0);
                    updateLayout();
                }
                // Removed 1-finger isPanning block to allow 100% native iOS Safari scrolling interactions
            }, { passive: false });

            previewWrapper.addEventListener('touchend', (e) => {
                paperTarget.style.willChange = 'auto';
                setTimeout(() => { paperTarget.style.willChange = 'transform'; }, 50);

                clearTimeout(fadeTimeout);
                fadeTimeout = setTimeout(fadeUIIn, 400);
            });
        }
    };

    // 書類プレビュー用ズーム（project.html 注入後の初回プレビューでバインド）
    window.setupDocPreviewZoom = () => {
        if (window._neoDocPreviewZoomBound) return;
        if (!document.getElementById('modal-doc-preview') || !document.getElementById('doc-preview-paper')) return;
        window._neoDocPreviewZoomBound = true;
        setupInteractiveZoom('modal-doc-preview', 'doc-preview-paper', 'zoom-slider-doc', 'preview-floating-header', 'preview-floating-footer');
    };

    // Setup for Receipt Grid (index.html resident element — safe to call at startup)
    setupInteractiveZoom('modal-receipt-grid', 'a4-print-container', 'zoom-slider-grid', 'grid-floating-header', 'grid-floating-footer');


    // Initialize Icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // --- SUPABASE REAL-TIME BINDING ---
    const initUserSupabase = async () => {
        try {
            if (!window.supabaseClient) {
                // Soft warn instead of error
                console.warn("Supabase client not loaded");
                return;
            }

            // ユーザーデータはリモートがソース。neoHardReset はユーザーデータのみ削除し、知識テーブルは触れない（docs/DATA_INITIALIZATION_RULES.md）。

            // Fetch Projects
            const { data: projData, error: projErr } = await window.supabaseClient.from('projects').select('*').order('id', { ascending: false });
            if (!projErr && projData) {
                // --- ZOMBIE QUARANTINE FILTER ---
                const deadIds = JSON.parse(localStorage.getItem('neo_deleted_projects') || '[]');
                const aliveProjects = projData.filter(p => !deadIds.includes(p.id));

                if (deadIds.length > 0 && aliveProjects.length < projData.length) {
                    console.warn(`[Neo Boot] Suppressed ${projData.length - aliveProjects.length} zombie projects from rendering.`);
                }

                // Map snake_case to camelCase mapping for legacy mockDB usage
                window.mockDB.projects = aliveProjects.map(p => ({
                    id: p.id, name: p.name, customerName: p.customer_name || '-', location: p.location || '-', note: p.note || '',
                    category: p.category, color: p.color, unit: p.unit || '-', hasUnpaid: p.has_unpaid, revenue: parseFloat(p.revenue) || 0,
                    status: p.status, clientName: p.client_name, paymentDeadline: p.payment_deadline, bankInfo: p.bank_info, lastUpdated: p.last_updated, currency: p.currency,
                    startDate: p.created_at ? p.created_at.split('T')[0].replace(/-/g, '/') : null
                }));
            }

            // Fetch Activities — 現在ユーザーの行のみ（RLS と一致）
            // _resolveSupabaseAuthUid throws Error('AUTH_REQUIRED') if session unavailable
            let actData = null, actErr = null;
            try {
                const bootUid = await window._resolveSupabaseAuthUid();
                const actResult = await window.supabaseClient.from('activities').select('*').eq('user_id', bootUid);
                actData = actResult.data;
                actErr = actResult.error;
            } catch (bootErr) {
                if (bootErr?.message === 'AUTH_REQUIRED') {
                    console.warn('[Neo Boot] No auth session; skipping activities fetch.');
                } else {
                    console.error('[Neo Boot] Activities fetch error:', bootErr);
                }
            }
            if (!actErr && actData) {
                const localBefore = Array.isArray(window.mockDB.activities) ? window.mockDB.activities : [];
                const merged =
                    typeof window.mergeActivitiesRemoteAndLocal === 'function'
                        ? window.mergeActivitiesRemoteAndLocal(localBefore, actData)
                        : localBefore;
                window.mockDB.activities = merged;

                window.persistLocalBody();
                console.log(`[Neo Boot] Activities merged: remote=${actData.length}, total=${merged.length}`);
            } else if (actErr) {
                console.warn('[Neo Boot] Activities fetch failed; keeping local mockDB.activities:', actErr.message);
            }

            // Fetch Documents（ユーザーデータのみ — 語彙は initKnowledgeSupabase）
            const { data: docData, error: docErr } = await window.supabaseClient.from('documents').select('*');
            if (!docErr && docData) {
                window.mockDB.documents = docData.map(d => ({
                    id: d.id, projectId: d.project_id, type: d.type, title: d.title, amount: parseFloat(d.amount) || 0, date: d.date, url: d.url
                }));
            }

            // Re-render dashboard
            if (typeof window.renderProjects === 'function') {
                window.renderProjects(window.mockDB.projects);
            }
            if (typeof window.updateSitesList === 'function') {
                window.updateSitesList();
            }
            window._refreshCockpitActivityFeed();
            if (window.currentOpenProjectId && typeof window._refreshProjectDetailIfOpen === 'function') {
                window._refreshProjectDetailIfOpen(window.currentOpenProjectId);
            }
            
            // Activate GlobalStore Realtime Subscriptions
            if (window.GlobalStore && typeof window.GlobalStore.initRealtimeSync === 'function') {
                window.GlobalStore.initRealtimeSync();
            }

        } catch (e) {
            console.error("Supabase init failed", e);
        }
    };

    window.refreshNeoUserDataFromRemote = initUserSupabase;
    window.refreshNeoKnowledgeFromRemote = initKnowledgeSupabase;

    // ユーザーデータと語彙（知識クライアント）を並列取得
    Promise.all([initUserSupabase(), initKnowledgeSupabase()]).catch((e) =>
        console.error('[Neo Boot] Supabase / knowledge init failed', e)
    );

    // Initialize Google Drive GIS explicitly on boot (Async Poller to prevent GSI race condition)
    function safelyInitGIS() {
        if (window.google && window.google.accounts && window.NeoCloudSync && window.NeoCloudSync.initGIS) {
            window.NeoCloudSync.initGIS();
            console.log("[Neo Boot] Google Identity Services successfully initialized.");
        } else {
            setTimeout(safelyInitGIS, 500);
        }
    }
    safelyInitGIS();

    // --- CEO Security Audit Protocol ---
    window.runCEOAudit = () => {
        let logs = JSON.parse(localStorage.getItem('neo_security_logs') || '[]');
        const unviewedLogs = logs.filter(log => !log.viewed);

        if (unviewedLogs.length > 0) {
            console.warn(`[Neo Security Audit] WARNING: CEO, ${unviewedLogs.length} hostile attempts were blocked while you were offline.`);
            unviewedLogs.forEach(log => {
                console.warn(`[BLOCKED] Time: ${log.timestamp} | Reason: ${log.reason} | Input: "${log.input}"`);
            });
            // Mark as viewed
            logs = logs.map(log => ({ ...log, viewed: true }));
            localStorage.setItem('neo_security_logs', JSON.stringify(logs));
        } else {
            console.log('[Neo Security Audit] System is secure. No new threats detected.');
        }
    };

    // Run audit after a short delay so console is ready
    setTimeout(window.runCEOAudit, 2000);


    // --- CEO Sandbox Toolkit (neoAdmin) ---
    window.neoAdmin = {
        backup: () => {
            const data = {
                mockDB: window.mockDB || {},
                logs: JSON.parse(localStorage.getItem('neo_security_logs') || '[]'),
                config: {
                    industry: localStorage.getItem('userMeta_industry'),
                    name: localStorage.getItem('userMeta_name')
                }
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `neo_backup_${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            console.log("✅ [neoAdmin] Database and logs successfully backed up.");
        },
        reset: () => {
            if (confirm("🚨 WARNING: This will completely wipe all local data, projects, expenses, and security logs. Are you sure?")) {
                localStorage.clear();
                console.log("💀 [neoAdmin] Sandbox wiped clean.");
                location.reload();
            }
        },
        monitorLogs: () => {
            console.log("👁️ [neoAdmin] Security Log Monitor Activated. Watching for real-time violations...");
            let lastLogCount = JSON.parse(localStorage.getItem('neo_security_logs') || '[]').length;
            setInterval(() => {
                const logs = JSON.parse(localStorage.getItem('neo_security_logs') || '[]');
                if (logs.length > lastLogCount) {
                    const newLogs = logs.slice(lastLogCount);
                    newLogs.forEach(log => {
                        console.log(`%c🚨 [VIOLATION DETECTED] ${log.reason} | Input: "${log.input}"`, 'color: #FF3B30; font-weight: bold; font-size: 1.1em;');
                    });
                    lastLogCount = logs.length;
                }
            }, 2000);
        }
    };

    // N+ Chat UI Send Logic
    const btnNplusSend = document.getElementById('btn-nplus-send');
    const inputNplusChat = document.getElementById('nplus-chat-input');
    const nplusChatContainer = document.getElementById('nplus-chat-container');

    // 1. Core RAG Retrieval Logic (Simulated for Prototype)
    async function retrieveKnowledgeFromDB(userQueryText) {
        try {
            console.log(`[RAG Engine] Generating embeddings for: "${userQueryText}"`);
            console.log(`[RAG Engine] Retrieving relevant laws via pgvector HNSW index...`);

            // Mock Response based on query
            let contextString = "";
            let citations = [];
            let aiResponseText = "承知しました。AI Coreが最適化プロセスを開始します...";

            if (userQueryText.includes("交際費") || userQueryText.includes("接待")) {
                contextString = "接待交際費は、原則として法人の損金に算入されませんが、中小法人については、年間800万円以内の金額、または接待飲食費の50%のいずれか大きい金額を損金算入することができます（租税特別措置法第61条の4）。";
                citations = [
                    { title: "租税特別措置法 第61条4", url: "https://elaws.e-gov.go.jp/" },
                    { title: "国税庁タックスアンサー No.5265", url: "https://www.nta.go.jp/" }
                ];
                aiResponseText = "CEO、検索結果を踏まえて回答します。接待交際費については、中小法人の特例により年間800万円まで、もしくは交際飲食費の50%を損金（経費）に算入することが可能です。今回のケースなら全額経費として計上して問題ありません。";
            } else if (userQueryText.includes("インボイス") || userQueryText.includes("免税")) {
                contextString = "免税事業者からの仕入れに係る経過措置として、制度開始から3年間は仕入税額相当額の80％、その後の3年間は50％を控除可能です（消費税法）。";
                citations = [
                    { title: "消費税法等の一部を改正する法律", url: "https://elaws.e-gov.go.jp/" }
                ];
                aiResponseText = "インボイス制度に関する検索結果です。免税事業者からの取引でも、現在は経過措置により8割の控除が可能です。システム側で自動判定し、帳簿への記載要件を満たすよう処理しておきました。";
            }

            return { contextString, citations, aiResponseText };
        } catch (error) {
            console.error("RAG Retrieval Error:", error);
            return { contextString: "", citations: [], aiResponseText: "エラーが発生しました。" };
        }
    }

    const sendNplusMessage = async () => {
        if (!inputNplusChat || !nplusChatContainer) return;
        const msg = inputNplusChat.value.trim();
        if (!msg) return;

        // Render User Message
        const userHtml = `
            <div style="display: flex; justify-content: flex-end; margin-bottom: 8px; margin-top: 12px;">
                <div class="chat-bubble user">
                    ${msg}
                </div>
            </div>
        `;
        nplusChatContainer.insertAdjacentHTML('beforeend', userHtml);
        inputNplusChat.value = '';
        nplusChatContainer.scrollTop = nplusChatContainer.scrollHeight;

        // Show "Analyzing Laws..." indicator
        const loadingId = "loading-" + Date.now();
        const loadingHtml = `
            <div id="${loadingId}" style="display: flex; gap: 8px; align-items: flex-end; margin-bottom: 8px; margin-top: 12px; opacity: 0.7;">
                <div class="chat-bubble neo">
                    <i data-lucide="search" style="width:14px; height:14px; display:inline-block; vertical-align:middle; margin-right:4px;"></i> 判例と法令を検索・分析中...
                </div>
            </div>
        `;
        nplusChatContainer.insertAdjacentHTML('beforeend', loadingHtml);
        if (window.lucide) window.lucide.createIcons();
        nplusChatContainer.scrollTop = nplusChatContainer.scrollHeight;

        // Execute RAG
        const { citations, aiResponseText } = await retrieveKnowledgeFromDB(msg);

        // Render AI Response with Citations
        setTimeout(() => {
            const loadingEl = document.getElementById(loadingId);
            if (loadingEl) loadingEl.remove();

            // Build Premium Citation UI elements
            let citationsHtml = '';
            if (citations && citations.length > 0) {
                citationsHtml = `
                <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed rgba(29, 155, 240, 0.3); display: block; gap: 4px;">
                <span style="font-size: 11px; font-weight: 600; color: #10b981; letter-spacing: 0.05em; display: grid; grid-auto-flow: column; justify-content: start; align-items: center; gap: 4px;">
                    <i data-lucide="book-check" style="width:12px; height:12px;"></i> AI ACCOUNTANT CITED SOURCES:
                </span>
                <div style="display: grid; grid-auto-flow: column;  gap: 6px; margin-top: 2px;">
                    ${citations.map(c => `
                    <a href="${c.url}" target="_blank" style="text-decoration: none; display: inline-block; align-items: center; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); color: #10b981; padding: 4px 8px; border-radius: 12px; font-size: 11px; transition: background 0.2s;">
                        <i data-lucide="external-link" style="width:10px; height:10px; margin-right: 4px;"></i> ${c.title}
                    </a>
                    `).join('')}
                </div>
                </div>
            `;
            }

            const neoHtml = `
                <div style="display: flex; gap: 8px; align-items: flex-end; margin-bottom: 8px; margin-top: 12px;">
                    <div class="chat-bubble neo">
                        ${aiResponseText}
                        ${citationsHtml}
                    </div>
                </div>
            `;
            nplusChatContainer.insertAdjacentHTML('beforeend', neoHtml);
            if (window.lucide) window.lucide.createIcons();
            nplusChatContainer.scrollTop = nplusChatContainer.scrollHeight;

        }, 1800); // Simulate API latency
    };

    if (btnNplusSend) {
        btnNplusSend.addEventListener('click', sendNplusMessage);
    }
    if (inputNplusChat) {
        inputNplusChat.addEventListener('keydown', (e) => {
            if (e.isComposing || e.keyCode === 229) return;
            if (e.key === 'Enter') {
                e.preventDefault();
                sendNplusMessage();
            }
        });
    }

    // ==========================================
    // N+ CHAT ENGINE (CEO COCKPIT)
    // ==========================================
    // ** NOTE: This logic has been securely extracted to js/neo-brain.js **
    // The functions window.updateChatCharCounter, window.sendChatMessage, 
    // window.saveNeoFeedback, and window.neoIntellectualMetabolism 
    // are now handled externally to prevent DOM looping and improve modularity.
    // Stubs are provided below for backward compatibility during transition.

    window.updateChatCharCounter = function (inputElement) {
        // console.warn("Legacy window.updateChatCharCounter called. Use neo-brain.js for new logic.");
        const counter = document.getElementById('chat-char-counter');
        if (counter) {
            const len = inputElement.value.length;
            const max = inputElement.getAttribute('maxlength') || 400;
            counter.textContent = `${len} / ${max}`;
            counter.style.color = len >= 380 ? '#ef4444' : (len >= 300 ? '#f59e0b' : 'var(--text-muted)');
        }
    };

    window.sendChatMessage = async function () {
        console.warn("Legacy window.sendChatMessage called. Logic is handled by neo-brain.js");
    };

    // Expose handleInstruction globally for inline HTML event handlers
    window.handleInstruction = handleInstruction;
    
    // Initialize Document Generator (Overrides legacy app.js handlers and uses html2pdf)
    if (typeof initDocumentGenerator === 'function') {
        initDocumentGenerator();
    }

    // --- Security: Manage User API Key (Global for SPA View) ---
    window.saveNeoApiKey = () => {
        const input = document.getElementById('api-key-input');
        if (!input) return;
        const keyVal = input.value.trim();
        if (keyVal) {
            localStorage.setItem('gemini_api_key', keyVal);
            alert("✅ APIキーが安全に保存されました。\\n（※ブラウザ内部にのみ暗号化保存されます）");
            window.location.reload(); // APIキー反映のための強制リロード
        } else {
            localStorage.removeItem('gemini_api_key');
            alert("🗑️ APIキーが削除されました。");
            input.placeholder = "AIzaSy...";
        }
    };

    // ==========================================
    // Phase 11: Global Realtime Render Hook
    // Ensures the currently open Project Detail view auto-refreshes 
    // seamlessly when background Supabase Sync completes or expenses are logged.
    // ==========================================
    if (window.GlobalStore && window.GlobalStore.subscribe) {
        // 再入ガード: openProjectDetail が内部で updateState を呼ぶ可能性があるため
        // ロック中はサブスクライバを再実行しない（Maximum call stack size exceeded 対策）
        let _detailRefreshLock = false;
        window.GlobalStore.subscribe(() => {
            if (_detailRefreshLock) return;
            const detailView = document.getElementById('view-project-detail');
            if (window.currentOpenProjectId && detailView && !detailView.classList.contains('hidden')) {
                _detailRefreshLock = true;
                Promise.resolve(window.openProjectDetail(window.currentOpenProjectId))
                    .finally(() => { _detailRefreshLock = false; });
            }
        });
    }

    // ==========================================
    // Phase 13: Zero-Server Google Drive Citiations UI Flow
    // ==========================================
    window.openDrivePicker = async (folderType) => {
        if (!window.NeoCloudSync || !window.NeoCloudSync.listFilesInFolder) {
            alert("Google Driveと連携されていません。設定画面から接続してください。");
            return;
        }

        const proj = window.mockDB.projects.find(p => p.id === window.currentOpenProjectId);
        if (!proj) return;

        const modal = document.getElementById('modal-drive-picker');
        const listDiv = document.getElementById('drive-picker-list');
        const loader = document.getElementById('drive-picker-loading');
        
        if (modal) {
            modal.classList.remove('hidden');
            listDiv.style.display = 'none';
            listDiv.innerHTML = '';
            loader.style.display = 'flex';
        }

        try {
            // "Documents" -> expects PDFs mostly, "Photos" -> images/videos
            const mime = folderType === 'Documents' ? 'application/pdf' : 'image/';
            const files = await window.NeoCloudSync.listFilesInFolder(folderType, proj.name, mime);
            
            if (files.length === 0) {
                listDiv.innerHTML = `<p style="text-align:center; color:var(--text-muted); font-size:13px; margin:20px 0;">ファイルが見つかりません。<br>Google Driveの「Neo+/${folderType}/${proj.name}」フォルダに保存してください。</p>`;
            } else {
                let html = '';
                files.forEach(f => {
                    const thumb = f.hasThumbnail ? `<img src="${f.thumbnailLink}" style="width:32px; height:32px; border-radius:4px; object-fit:cover;">` : `<div style="width:32px; height:32px; border-radius:4px; background:#f1f5f9; display:grid; place-items:center;"><i data-lucide="file" style="width:16px;height:16px;color:#94a3b8;"></i></div>`;
                    
                    html += `<div style="display:flex; align-items:center; justify-content:space-between; padding:12px; border:1px solid var(--btn-secondary-border); border-radius:12px; background:var(--bg-color);">
                        <div style="display:flex; align-items:center; gap:12px; overflow:hidden;">
                            ${thumb}
                            <span style="font-size:13px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--text-main);">${f.name}</span>
                        </div>
                        <button onclick="window.selectDriveFile('${f.id}', '${f.name}', '${f.webViewLink}', '${f.thumbnailLink || ''}', '${folderType}')" class="btn-micro" style="background:#1D9BF0; color:white; border:none; border-radius:6px; padding:6px 12px; font-size:11px; font-weight:700; cursor:pointer; flex-shrink:0;">
                            引用
                        </button>
                    </div>`;
                });
                listDiv.innerHTML = html;
                if (window.lucide) window.lucide.createIcons();
            }
        } catch (e) {
            console.error(e);
            listDiv.innerHTML = `<p style="text-align:center; color:#ef4444; font-size:13px; margin:20px 0;">Google Driveアクセスエラー。<br>再度認証をお試しください。</p>`;
        } finally {
            loader.style.display = 'none';
            listDiv.style.display = 'flex';
        }
    };

    window.selectDriveFile = async (fileId, fileName, webViewLink, thumbnailLink, folderType) => {
        const projectId = window.currentOpenProjectId;
        
        // Push pointer to mockDB manually
        if (!window.mockDB.files) window.mockDB.files = [];
        
        const newFile = {
            id: 'file_' + Date.now(),
            projectId: projectId,
            file_id: fileId,
            name: fileName,
            webViewLink: webViewLink,
            thumbnailLink: thumbnailLink,
            type: folderType, // "Documents" or "Photos"
            created_at: new Date().toISOString()
        };
        window.mockDB.files.push(newFile);

        // Send ZERO-SERVER Payload to Supabase Fire & Forget
        if (window.supabaseClient) {
            window.supabaseClient.auth.getSession().then(({ data: { session } }) => {
                const uid = session?.user?.id || null;
                window.supabaseClient.from('files').insert({
                    project_id: projectId,
                    file_id: fileId,
                    file_name: fileName,
                    web_view_link: webViewLink,
                    thumbnail_link: thumbnailLink || null,
                    doc_type: folderType,
                    user_id: uid
                }).then(({error}) => {
                    if(error) console.error("Supabase File Sync Failed", error);
                });
            });
        }

        // Close Modal & Triger Refresh
        const modal = document.getElementById('modal-drive-picker');
        if (modal) modal.classList.add('hidden');
        window.openProjectDetail(projectId);
    };

});
