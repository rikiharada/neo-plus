/**
 * チャット＋コックピット経由の handleInstruction（単一モジュール）。
 * NeoChat クラス等の別断片をここに混ぜないこと（Illegal return / ブレース不整合の原因になる）。
 */
import { supabase } from '../lib/supabase-client.js';
import { understandIntent } from '../lib/core/intentRouter.js';
import { generateAndUploadPDF } from '../lib/export/pdfGenerator.js';
import { getNeoResponse, getNeoResponseStream } from '../lib/api/geminiClient.js';

// API Key inline card feature removed by User request (Hiding system operations for Persona immersion)

// ─── Neoについての自己紹介モック（APIキー不要） ────────────────────────
const _NEO_SELF_INTRO = `私はNeo+のAIアシスタント「Neo」です。\n` +
    `会計・経費記録・請求書作成・税務相談が得意分野です。\n` +
    `Gemini APIキーを設定すると、より詳しい経営アドバイスや自由な質問応答ができるようになります。\n` +
    `設定は右下の「アカウント」タブから行えます。`;

const _SELF_REF_PATTERN = /neo(の|は|って|について|を|が|とは)|(機能|役目|役割|できること|得意|知識|何が|なにが|使い方|紹介)/i;

/** APIキーが設定・有効かチェック */
function _hasValidApiKey() {
    if (typeof window.getGeminiApiKey === 'function') {
        const k = window.getGeminiApiKey();
        if (k && k.length > 10) return true;
    }
    const k1 = localStorage.getItem('gemini_api_key');
    const k2 = localStorage.getItem('neo_api_key');
    const k = (k1 || k2 || '').trim();
    return k.length > 10 && k !== 'undefined' && k !== 'null';
}

function _buildOfflineFallbackReply(inputText = '') {
    const t = String(inputText || '');
    if (!t) return null;

    if (/消費税|税率|インボイス/i.test(t)) {
        return '日本の消費税率は原則10%です。軽減税率8%は飲食料品（酒類・外食除く）と定期購読新聞に適用されます。';
    }
    if (_SELF_REF_PATTERN.test(t)) {
        return _NEO_SELF_INTRO;
    }
    if (/使い方|どう使|できること|機能/i.test(t)) {
        return '入力欄に「案件名・金額・日付」を書くだけで、プロジェクト作成、経費記録、書類作成まで順番に進められます。';
    }
    return null;
}

/** チャット末尾へスクロール（レイアウト確定後に複数フレームで追従） */
export function scrollChatToBottom() {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;
    const run = () => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    };
    run();
    requestAnimationFrame(run);
    requestAnimationFrame(() => {
        run();
        if (typeof window.syncChatVisualViewport === 'function') window.syncChatVisualViewport();
    });
    setTimeout(run, 50);
    setTimeout(run, 200);
}

window.scrollChatToBottom = scrollChatToBottom;

export function appendChatMessage(sender, htmlContent) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return null;

    // タイムスタンプ: 時:分 (日本語)
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false });

    const row = document.createElement('div');
    row.className = sender === 'neo'
        ? 'chat-message-row chat-message-row--neo'
        : 'chat-message-row chat-message-row--user';

    if (sender === 'neo') {
        // Neo: 左寄せ、アバター左上固定
        row.innerHTML = `
            <img src="img/neo_avatar.jpg" class="chat-avatar"
                 alt="Neo"
                 onerror="this.onerror=null; this.src=''; this.alt='N';">
            <div class="chat-bubble-col neo">
                <div class="message-bubble neo">${htmlContent}</div>
                <span class="chat-timestamp">${timeStr}</span>
            </div>
        `;
    } else {
        // user: 右寄せ、アバターなし (iMessage スタイル)
        row.innerHTML = `
            <div class="chat-bubble-col ceo">
                <div class="message-bubble ceo">${htmlContent}</div>
                <span class="chat-timestamp">${timeStr}</span>
            </div>
        `;
    }

    chatMessages.appendChild(row);

    scrollChatToBottom();

    return row;
}

window.appendChatMessage = appendChatMessage;

// ── チャット初回挨拶 (マルチユーザー対応) ───────────────────────
let _chatGreeted = false;

/**
 * ユーザーへの呼びかけを返す。
 * 名前が登録されていれば「田中さん」、なければ「オーナー」。
 */
function _getSalutation() {
    const name = window.neoUserProfile?.name;
    if (name) {
        const familyName = name.split(/[\s　]/)[0];
        return `${familyName}さん`;
    }
    return 'オーナー';
}

export function initChatView() {
    if (typeof window.bindChatVisualViewport === 'function') window.bindChatVisualViewport();

    if (_chatGreeted) return;
    _chatGreeted = true;

    const hour = new Date().getHours();
    const salutation = _getSalutation();
    let greeting;
    if (hour >= 5 && hour < 12) {
        greeting = `おはようございます、${salutation}。今日もフルサポートします。<br><span style="font-size:12px;color:var(--text-muted);">確かなマネーマネジメントを、あなたと共に。</span>`;
    } else if (hour >= 12 && hour < 18) {
        greeting = `お疲れ様です、${salutation}。<br><span style="font-size:12px;color:var(--text-muted);">確かなマネーマネジメントを、あなたと共に。</span>`;
    } else if (hour >= 18 && hour < 24) {
        greeting = `お疲れ様です、${salutation}。<br><span style="font-size:12px;color:var(--text-muted);">確かなマネーマネジメントを、あなたと共に。</span>`;
    } else {
        greeting = `遅くまでお疲れ様です、${salutation}。<br><span style="font-size:12px;color:var(--text-muted);">確かなマネーマネジメントを、あなたと共に。</span>`;
    }

    setTimeout(() => {
        if (window.appendChatMessage) window.appendChatMessage('neo', greeting);
    }, 350);
}

// --- Mobile keyboard: visualViewport → --vv-keyboard-inset (chat.css) ---
let _chatVisualViewportBound = false;

function syncChatVisualViewport() {
    const chat = document.getElementById('view-chat');
    const active = chat && !chat.classList.contains('hidden');
    if (!active || !window.visualViewport) {
        document.documentElement.style.setProperty('--vv-keyboard-inset', '0px');
        return;
    }
    const vv = window.visualViewport;
    const inset = Math.max(0, window.innerHeight - vv.offsetTop - vv.height);
    document.documentElement.style.setProperty('--vv-keyboard-inset', `${inset}px`);

    if (inset > 48) {
        window.scrollChatToBottom?.();
    }
}

function bindChatVisualViewport() {
    if (_chatVisualViewportBound) {
        syncChatVisualViewport();
        return;
    }
    _chatVisualViewportBound = true;

    const onChange = () => syncChatVisualViewport();

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', onChange);
        window.visualViewport.addEventListener('scroll', onChange);
    }
    window.addEventListener('resize', onChange);
    window.addEventListener('orientationchange', () => setTimeout(onChange, 280));

    document.addEventListener('focusin', (e) => {
        const t = e.target;
        if (t && (t.id === 'chat-input-field' || t.closest?.('#chat-input-container'))) onChange();
    });
    document.addEventListener('focusout', (e) => {
        if (e.target && e.target.id === 'chat-input-field') setTimeout(onChange, 120);
    });

    onChange();
}

window.syncChatVisualViewport = syncChatVisualViewport;
window.bindChatVisualViewport = bindChatVisualViewport;

window.initChatView = initChatView;

/**
 * 経費の紐づけ先プロジェクトID。app.js の resolveExpenseProjectId に委譲（未初期化時のみ最小フォールバック）。
 */
let isProcessingInstruction = false;

export async function handleInstruction(text, hasImage = false) {
    if (!text && !hasImage) return;
    if (isProcessingInstruction) return;

    /** ダッシュ（コックピット）からの入力のみ：認証確定前は送信しない（AUTH_REQUIRED 連鎖防止） */
    const _cockpitAuthGate = () => {
        const cv = document.getElementById('view-chat');
        return !cv || cv.classList.contains('hidden');
    };
    if (
        _cockpitAuthGate() &&
        window.supabaseClient &&
        typeof window._ensureAuthReadyForMutation === 'function'
    ) {
        const ok = await window._ensureAuthReadyForMutation();
        if (!ok) return;
    }

    const instructionInput = document.getElementById('main-instruction-input') || document.getElementById('chat-input-field');
    const instructionMics = document.querySelectorAll('#btn-chat-voice, .btn-mic');
    const btnAttachImages = document.querySelectorAll('#btn-chat-camera, .btn-attach-image');

    // ── ヘルパー: チャットビューがアクティブか判定 ──────────────
    const isChatViewActive = () => {
        const cv = document.getElementById('view-chat');
        return cv && !cv.classList.contains('hidden');
    };

    // ── 【最重要修正】チャット画面からの送信は即座にユーザーバブルを表示 ──
    // API エラー・タイムアウト・どんな処理失敗でもメッセージが残るように、
    // 非同期処理の前に同期的に追加する。
    const _calledFromChat = isChatViewActive();
    let pendingNeoRow = null;
    let neoResponded = false;

    const _createThinkingBubble = () => {
        if (!_calledFromChat || !text) return null;
        return appendChatMessage(
            'neo',
            '<span class="neo-thinking"><span class="neo-thinking-label">Thinking</span><span class="neo-thinking-dots"><span></span><span></span><span></span></span></span>'
        );
    };

    const _resolveNeoReply = (html, { isError = false } = {}) => {
        neoResponded = true;
        if (pendingNeoRow) {
            const bubble = pendingNeoRow.querySelector('.message-bubble.neo');
            if (bubble) {
                bubble.classList.remove('neo-thinking-bubble');
                if (isError) bubble.classList.add('neo-error-bubble');
                bubble.innerHTML = html;
            }
            pendingNeoRow = null;
            return;
        }
        if (isChatViewActive()) appendChatMessage('neo', html);
    };

    const _runOneTouchDocumentFlow = async (rawText, explicitDocType = null, explicitProjectName = '') => {
        const projects = Array.isArray(window.mockDB?.projects) ? window.mockDB.projects : [];
        const targetProjectName = (explicitProjectName || '').trim();
        const hasEstimateKeyword = /見積/.test(rawText || '') || /見積/.test(explicitDocType || '');
        const docType = hasEstimateKeyword ? 'estimate' : 'invoice';
        let targetProjId = targetProjectName && window.findProjectIdByName
            ? window.findProjectIdByName(targetProjectName)
            : null;

        if (!targetProjId && window.currentOpenProjectId) targetProjId = window.currentOpenProjectId;
        if (!targetProjId && projects.length > 0) targetProjId = projects[projects.length - 1].id;

        if (!targetProjId && typeof window.createProject === 'function') {
            const inferredName = targetProjectName ||
                String(rawText || '')
                    .replace(/(請求書|インボイス|見積書|見積もり|領収書|納品書|書類|発行|作成|作って|作る|お願い|して)/g, '')
                    .trim() ||
                `書類案件_${new Date().toISOString().slice(0, 10)}`;
            const created = window.createProject(inferredName);
            if (created?.id) targetProjId = created.id;
        }

        if (!targetProjId) {
            _resolveNeoReply('書類作成先のプロジェクトを準備できませんでした。', { isError: true });
            return false;
        }

        window.currentOpenProjectId = targetProjId;
        const targetProj = projects.find((p) => String(p.id) === String(targetProjId));
        const resolvedProjectName = targetProjectName || targetProj?.name || '現在のプロジェクト';
        try {
            if (typeof window.openDocumentGenFromIntent === 'function') {
                await window.openDocumentGenFromIntent({
                    projectId: targetProjId,
                    projectName: resolvedProjectName,
                    docType,
                    sourceText: rawText
                });
            } else if (typeof window.openDocGenModal === 'function') {
                await window.openDocGenModal();
            }
        } catch (e) {
            console.warn('[GENERATE_DOCUMENT] open doc flow fallback:', e);
            if (typeof window.openDocGenModal === 'function') await window.openDocGenModal();
        }

        _resolveNeoReply(`「${resolvedProjectName}」の${docType === 'estimate' ? '見積書' : '請求書'}作成ページを開いたよ。`);
        return true;
    };

    if (_calledFromChat && text) {
        // XSS対策: innerHTML ではなく textContent 相当の安全なエスケープ
        const safeText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
        appendChatMessage('user', safeText);
        pendingNeoRow = _createThinkingBubble();
        const bubble = pendingNeoRow?.querySelector('.message-bubble.neo');
        if (bubble) bubble.classList.add('neo-thinking-bubble');
    }

    if (!navigator.onLine) {
        if (_calledFromChat) {
            _resolveNeoReply('ごめんね、ちょっと調子悪いみたい… 電波の良い場所でもう一度試してね。', { isError: true });
        } else {
            const neoBubble = document.getElementById('neo-fab-bubble');
            if (neoBubble) {
                neoBubble.textContent = `現在オフラインですが、セキュリティチェックは正常に完了しました。通信環境の良いところで再度お試しください。`;
                neoBubble.classList.add('show');
                setTimeout(() => { neoBubble.classList.remove('show'); }, 6000);
            }
        }
        if (instructionInput) instructionInput.value = '';
        return;
    }

    isProcessingInstruction = true;
    const instructionStartTime = Date.now();

    instructionMics.forEach(mic => mic.disabled = true);
    btnAttachImages.forEach(btn => btn.disabled = true);

    if (instructionInput) {
        instructionInput.style.transition = 'border-color 0.3s ease, box-shadow 0.3s ease';
        instructionInput.style.borderColor = 'var(--accent-neo-blue)';
        instructionInput.style.boxShadow = '0 0 10px rgba(29, 155, 240, 0.2)';
        instructionInput.disabled = true;
    }

    try {
        const quickDocIntent =
            /(請求書|インボイス|見積書|見積もり).*(作って|作成|発行|生成|作る|お願い)/.test(text) ||
            /(作って|作成|発行|生成|作る|お願い).*(請求書|インボイス|見積書|見積もり)/.test(text);
        if (quickDocIntent) {
            await _runOneTouchDocumentFlow(text);
            return;
        }

        if (window.neo) window.neo.speak('neo_thinking');

        // Context preparation for Intent Analysis layer (Phase 2 Layer 1)
        const contextData = {
           industry: window.mockDB?.userConfig?.industry || 'general',
           activeProjects: window.mockDB?.projects ? window.mockDB.projects.map(p => ({ id: p.id, name: p.name, status: p.status })).slice(0, 10) : [],
           recentTransactions: window.mockDB?.transactions ? window.mockDB.transactions.filter(t => !t.is_deleted).slice(0, 5).map(t => ({ title: t.title, amount: t.amount, date: t.date })) : []
        };

        const intents = await understandIntent(text, hasImage, contextData);

        const hasConsult = intents.some(i => i.ui_action === 'think_consult');
        if (hasConsult) {
            // チャット画面以外からの送信の場合だけ遷移＆ユーザーバブル追加
            if (!_calledFromChat) {
                window.switchView('view-chat');
                appendChatMessage('user', text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'));
            }
            // ストリーミングバブルがリアルタイム表示するので「考え中」プレースホルダーは不要
        }

        if(window.triggerNeoSyncGlow) window.triggerNeoSyncGlow();

        const showCompoundFail = (msg = '保存に失敗しました。もう一度試してください') => {
            console.error('Compound failed: invalid project_id, staying on dashboard');
            if (isChatViewActive()) _resolveNeoReply(msg, { isError: true });
            const nb = document.getElementById('neo-fab-bubble');
            if (nb) {
                nb.textContent = msg;
                nb.classList.add('show');
                setTimeout(() => nb.classList.remove('show'), 6000);
            }
            if (window.switchView) window.switchView('view-dash');
        };

        /**
         * Supabase が返す projects.id は UUID 文字列の場合もあれば bigint（数値）の場合もある。
         * 旧 isCompoundRemoteUuid（長さ>=20 の文字列のみ）は bigint で誤判定していた。
         */
        const isValidRemoteProjectIdFromDb = (id) => {
            if (id == null || id === '') return false;
            if (typeof id === 'number' && Number.isFinite(id) && id > 0) return true;
            const s = String(id).trim();
            if (s === 'undefined' || s === 'null' || s === '') return false;
            if (
                /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
            ) {
                return true;
            }
            if (/^\d+$/.test(s)) return true;
            return s.length >= 20;
        };

        window.__compoundDbProjectId = null;
        window.__compoundLocalMode = false;

        // Action Execution Layer (Phase 2 Layer 2)
        for (const intent of intents) {
            const action = intent.action;
            const isSilentWorkflow = intent.is_silent;
            
            console.log(`[Neo Intent Execution] Executing action: ${action}, is_silent: ${!!isSilentWorkflow}`);

            if (action === "COMPLIANCE_VIOLATION") {
                if(window.handleComplianceViolation) window.handleComplianceViolation(`Physical Blacklist Match (${intent.text})`, text);
                break;
            } else if (action === "NAVIGATE") {
                const neoBubble = document.getElementById('neo-fab-bubble');
                if (neoBubble) {
                    neoBubble.textContent = `了解、移動するよ⚡️`;
                    neoBubble.classList.add('show');
                    setTimeout(() => { neoBubble.classList.remove('show'); }, 3000);
                }
                window.switchView(intent.target_view);
            } else if (action === "NAVIGATE_PROJECT") {
                 window.currentOpenProjectId = intent.project_id;
            } else if (action === "CREATE_PROJECT") {
                console.log('Compound: Creating project...');
                const newProjectName = (intent.project_name || '名称未設定プロジェクト').trim();
                const loc = (intent.location && String(intent.location).trim()) || '-';
                let uid = null;
                if (window.supabaseClient && typeof window._resolveSupabaseAuthUid === 'function') {
                    try {
                        uid = await window._resolveSupabaseAuthUid();
                    } catch (e) {
                        console.error('[Neo] CREATE_PROJECT: Skipping Supabase INSERT — could not resolve UID', e);
                    }
                }
                if (
                    uid &&
                    typeof window._isValidSupabaseAuthUid === 'function' &&
                    !window._isValidSupabaseAuthUid(uid)
                ) {
                    console.error('[Neo] CREATE_PROJECT: Skipping Supabase INSERT — invalid UID');
                    uid = null;
                }

                const createdAtIso = (() => {
                    try {
                        if (intent.date && typeof intent.date === 'string') {
                            const d = new Date(intent.date.replace(/\//g, '-'));
                            if (!Number.isNaN(d.getTime())) return d.toISOString();
                        }
                    } catch {
                        /* ignore */
                    }
                    return new Date().toISOString();
                })();

                let savedProj = null;

                if (window.supabaseClient && uid) {
                    const newProjRaw = {
                        name: newProjectName,
                        category: 'other',
                        color: '#007AFF',
                        status: 'active',
                        location: loc,
                        user_id: uid,
                        created_at: createdAtIso
                    };
                    const { data, error } = await window.supabaseClient.from('projects').insert([newProjRaw]).select();
                    if (error || !data || data.length === 0) {
                        console.error('[Neo] CREATE_PROJECT Supabase insert failed:', error);
                        showCompoundFail('プロジェクト作成に失敗しました。ログイン状態を確認して、もう一度お試しください。');
                        return;
                    }
                    const row = data[0];
                    if (!isValidRemoteProjectIdFromDb(row.id)) {
                        console.error('Compound failed: invalid project_id from DB, staying on dashboard', row.id);
                        showCompoundFail();
                        return;
                    }
                    console.log(
                        `[Neo] CREATE_PROJECT OK — project id=${row.id} (type=${typeof row.id}) user_id=${row.user_id ?? uid}`
                    );

                    savedProj = {
                        id: row.id,
                        user_id: row.user_id ?? uid,
                        name: row.name,
                        customerName: '-',
                        location: row.location || loc,
                        note: row.note || '',
                        category: row.category || 'other',
                        color: row.color || '#007AFF',
                        unit: '-',
                        hasUnpaid: false,
                        revenue: 0,
                        status: row.status || 'active',
                        clientName: row.client_name || '',
                        paymentDeadline: row.payment_deadline || '',
                        bankInfo: row.bank_info || '',
                        lastUpdated: row.last_updated || null,
                        startDate: row.created_at ? row.created_at.split('T')[0].replace(/-/g, '/') : null
                    };
                    window.mockDB.projects.unshift(savedProj);
                    window.__compoundDbProjectId = row.id;
                    window.__compoundLocalMode = false;
                    window.persistLocalBody?.();
                } else if (typeof window.insertProject === 'function') {
                    console.log('Compound: no Supabase session — local insertProject fallback');
                    const localProj = {
                        id: Date.now(),
                        name: newProjectName,
                        customerName: '-',
                        location: loc,
                        note: '',
                        category: 'other',
                        color: '#007AFF',
                        unit: '-',
                        hasUnpaid: false,
                        revenue: 0,
                        status: 'active',
                        clientName: '',
                        paymentDeadline: '',
                        bankInfo: '',
                        lastUpdated: new Date().toLocaleDateString('ja-JP').replace(/\//g, '/')
                    };
                    savedProj = await window.insertProject(localProj);
                    if (!savedProj || savedProj.id == null || String(savedProj.id) === 'undefined') {
                        showCompoundFail('プロジェクトをローカルに作成できませんでした。');
                        return;
                    }
                    window.__compoundDbProjectId = savedProj.id;
                    window.__compoundLocalMode = true;
                    window.persistLocalBody?.();
                    console.log('Compound: local project created (numeric id), no auto-navigation');
                } else {
                    showCompoundFail('ログインが必要です。アカウントからサインインしてから、もう一度お試しください。');
                    return;
                }

                window.currentOpenProjectId = savedProj.id;
                window.dispatchEvent(new CustomEvent('neo-render-projects', { detail: { projects: window.mockDB.projects } }));

                const isPartiallyCompound = intents.length > 1 || intent.is_compound;
                if (isSilentWorkflow || isPartiallyCompound) {
                    _resolveNeoReply(`プロジェクト「${savedProj.name}」を作成しました🔥`);
                } else if (window.openProjectDetail && !window.__compoundLocalMode) {
                    window.openProjectDetail(savedProj.id, { navigate: true, skipFetch: false });
                } else if (window.switchView) {
                    window.switchView('view-dash');
                }
            } else if (action === "ADD_EXPENSE") {
                const projId = window.__compoundDbProjectId ?? window.resolveProjectIdForExpenseIntent(intent, text);
                if (
                    projId == null ||
                    projId === '' ||
                    String(projId) === 'undefined' ||
                    String(projId) === 'null'
                ) {
                    console.error('Compound failed: invalid project_id, staying on dashboard', projId);
                    showCompoundFail();
                    return;
                }

                const pObj = window.mockDB.projects.find((p) => String(p.id) === String(projId));
                const projName = pObj ? pObj.name : '未分類';

                const sourceAmounts = Array.isArray(intent.amounts) && intent.amounts.length > 0 ? intent.amounts : [];
                const amtList = sourceAmounts.filter((a) => a && Number(a.value) > 0);
                const multi = amtList.length > 1;
                const lineItems =
                    amtList.length > 0
                        ? amtList.map((a) => ({
                              title: (a.label && String(a.label).trim()) || intent.category || '経費',
                              amount: Number(a.value)
                          }))
                        : [
                              {
                                  title: (intent.title || text || '').trim() || '経費',
                                  amount: Number(intent.amount) || 0
                              }
                          ];

                const today = new Date().toLocaleDateString('ja-JP').replace(/\//g, '/');
                /** intent の日付（例: 2026/04/20）を mock / insertTransaction に渡す（常に今日にしない） */
                const expenseDateDisplay = (() => {
                    if (intent?.date && typeof intent.date === 'string') {
                        const s = intent.date.trim();
                        if (s) return s.replace(/-/g, '/');
                    }
                    return today;
                })();
                const baseMeta = {
                    type: intent.type || 'expense',
                    category: intent.category || 'その他',
                    isBookkeeping: intent.is_bookkeeping !== false
                };
                const cleanTitle = (raw) => {
                    let t = (raw || '').trim() || '無題の経費';
                    if (projName !== '未分類') t = t.split(projName).join('').trim();
                    return t || '無題の経費';
                };

                const primaryTitle = multi ? lineItems.map((x) => x.title).join('・') : cleanTitle(lineItems[0]?.title || '');
                const primaryCat = baseMeta.category;

                const silentLike = isSilentWorkflow || intent.is_compound || multi;

                const finishCompoundState = () => {
                    window.__compoundDbProjectId = null;
                    window.__compoundLocalMode = false;
                };

                if (silentLike) {
                    try {
                        let uid = null;
                        if (window.supabaseClient && typeof window._resolveSupabaseAuthUid === 'function') {
                            try {
                                uid = await window._resolveSupabaseAuthUid();
                            } catch (e) {
                                console.error('[Neo] ADD_EXPENSE bulk: Skipping remote INSERT — could not resolve UID', e);
                            }
                        }
                        if (
                            uid &&
                            typeof window._isValidSupabaseAuthUid === 'function' &&
                            !window._isValidSupabaseAuthUid(uid)
                        ) {
                            console.error('[Neo] ADD_EXPENSE bulk: invalid UID — remote path disabled');
                            uid = null;
                        }

                        const rowsToSave = [];
                        for (let i = 0; i < lineItems.length; i++) {
                            const { title: liTitle, amount: liAmt } = lineItems[i];
                            const ft = multi ? liTitle : cleanTitle(liTitle);
                            if (!liAmt || liAmt <= 0) continue;
                            rowsToSave.push({ title: ft, amount: liAmt });
                        }

                        if (rowsToSave.length === 0) {
                            if (isChatViewActive()) {
                                _resolveNeoReply('金額を読み取れませんでした。金額をはっきり書いて、もう一度お試しください。', { isError: true });
                            }
                            if (window.switchView) window.switchView('view-dash');
                            return;
                        }

                        const txPayload = (row) => ({
                            projectId: projId,
                            projectName: projName,
                            type: baseMeta.type,
                            category: baseMeta.category,
                            title: row.title,
                            amount: row.amount,
                            date: expenseDateDisplay,
                            isBookkeeping: baseMeta.isBookkeeping,
                            originalInput: text
                        });

                        /** 未ログイン or 直前の CREATE がローカル専用 → 即飛ばし禁止 */
                        const forceLocalNoNavigate = window.__compoundLocalMode === true || !uid;

                        if (forceLocalNoNavigate) {
                            console.log('Compound: local path — insertTransaction (staying on dashboard)');
                            for (const row of rowsToSave) {
                                await window.insertTransaction(txPayload(row));
                            }
                            window.dispatchEvent(new CustomEvent('neo-render-projects', { detail: { projects: window.mockDB.projects } }));
                            window._refreshCockpitActivityFeed?.();
                            window.renderCockpitFeed?.(0);
                            if (window.switchView) window.switchView('view-dash');
                            const nb = document.getElementById('neo-fab-bubble');
                            if (nb) {
                                nb.textContent = multi
                                    ? `【記録完了】${rowsToSave.length}件を「${projName}」に保存しました。プロジェクト一覧から開いて確認できます。`
                                    : `【記録完了】「${primaryTitle}」を保存しました。`;
                                nb.classList.add('show');
                                setTimeout(() => nb.classList.remove('show'), 5000);
                            }
                            if (isChatViewActive()) {
                                _resolveNeoReply(
                                    multi
                                        ? `${rowsToSave.length}件を「${projName}」に計上したよ🔥`
                                        : `「${primaryTitle}」を記帳したよ🔥`
                                );
                            }
                            finishCompoundState();
                        } else if (isValidRemoteProjectIdFromDb(projId)) {
                            if (!uid) {
                                console.error('[Neo] ADD_EXPENSE bulk: no auth uid — cannot set user_id on activities');
                                showCompoundFail('セッションを確認してください（経費の user_id を保存できません）。');
                                finishCompoundState();
                                return;
                            }
                            /** id は activities の自動採番（int4 等）— フィールドを付けない */
                            const bulkActivities = rowsToSave.map((row) => ({
                                project_id: projId,
                                user_id: uid,
                                type: baseMeta.type,
                                category: baseMeta.category,
                                title: row.title,
                                amount: row.amount,
                                date: (() => {
                                    if (intent?.date && typeof intent.date === 'string') {
                                        const s = intent.date.trim();
                                        const jp = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
                                        if (jp) {
                                            const y = jp[1];
                                            const m = jp[2].padStart(2, '0');
                                            const d = jp[3].padStart(2, '0');
                                            return new Date(`${y}-${m}-${d}T12:00:00.000Z`).toISOString();
                                        }
                                    }
                                    return new Date().toISOString();
                                })(),
                                is_bookkeeping: baseMeta.isBookkeeping,
                                is_deleted: false
                            }));

                            console.log('[Neo] Compound bulk insert — payload sample:', {
                                user_id: uid,
                                project_id: projId,
                                project_id_type: typeof projId,
                                rowCount: bulkActivities.length
                            });

                            const { data: insertedRows, error: insErr } = await window.supabaseClient
                                .from('activities')
                                .insert(bulkActivities)
                                .select();
                            if (insErr) {
                                console.error('[Neo] activities bulk insert failed:', insErr);
                                showCompoundFail();
                                finishCompoundState();
                                return;
                            }

                            const insN = Array.isArray(insertedRows) ? insertedRows.length : 0;
                            const bulkDbRows = Array.isArray(insertedRows) ? insertedRows : insertedRows ? [insertedRows] : [];
                            console.log('[Neo] bulk INSERT DB returned row(s):', {
                                count: insN,
                                rows: bulkDbRows.map((r) => ({
                                    id: r.id,
                                    project_id: r.project_id,
                                    project_id_type: typeof r.project_id,
                                    user_id: r.user_id,
                                    user_id_type: typeof r.user_id
                                }))
                            });
                            console.log(
                                `[Insert Success] user_id = ${uid} | project_id = ${projId} | rows inserted = ${insN}`
                            );
                            console.log(`Compound: Bulk inserted ${bulkActivities.length} expenses`);

                            /** 複合経費は最低 2 行を要求（1 行のみのときは rowsToSave に合わせる） */
                            const minNeeded = Math.max(rowsToSave.length, multi ? 2 : 1);
                            let verifyData = null;
                            let verified = false;

                            for (let attempt = 1; attempt <= 15; attempt++) {
                                if (attempt === 1) {
                                    await new Promise((resolve) => setTimeout(resolve, 150));
                                } else {
                                    await new Promise((resolve) => setTimeout(resolve, 50));
                                }

                                const verifyPids =
                                    typeof window._neoExpandProjectIdCandidates === 'function'
                                        ? window._neoExpandProjectIdCandidates([projId])
                                        : [projId];
                                const { data: vd, error: selErr } = await window.supabaseClient
                                    .from('activities')
                                    .select('*')
                                    .in('project_id', verifyPids)
                                    .eq('user_id', uid);

                                if (selErr) {
                                    console.warn(`Compound: verify SELECT error (attempt ${attempt})`, selErr);
                                }

                                verifyData = vd;
                                const got = vd ? vd.length : 0;
                                console.log(`Compound: verify attempt ${attempt}/15 — need ${minNeeded}, got ${got}`);

                                if (vd && got >= minNeeded) {
                                    verified = true;
                                    console.log(`Compound: Verified ${got} activities in DB`);
                                    break;
                                }
                            }

                            if (!verified) {
                                const got = verifyData ? verifyData.length : 0;
                                console.error(
                                    `Compound: verification failed (need ${minNeeded}, got ${got}), staying on dashboard — no navigation`
                                );
                                showCompoundFail('保存の確認が間に合いませんでした。一覧を更新して確認してください。');
                                finishCompoundState();
                                return;
                            }

                            if (typeof window.mapActivityRowToMock === 'function' && verifyData) {
                                for (const row of verifyData) {
                                    const norm = window.mapActivityRowToMock(row);
                                    const dup = window.mockDB.activities.some(
                                        (a) =>
                                            String(a.projectId) === String(projId) &&
                                            String(a.id) === String(norm.id)
                                    );
                                    if (!dup) window.mockDB.activities.push(norm);
                                }
                                window.persistLocalBody?.();
                            }

                            window.dispatchEvent(new CustomEvent('neo-render-projects', { detail: { projects: window.mockDB.projects } }));
                            window._refreshCockpitActivityFeed?.();
                            window.renderCockpitFeed?.(0);

                            await new Promise((resolve) => setTimeout(resolve, 50));

                            console.log('Compound: All good, opening project detail');
                            if (typeof window.openProjectDetail === 'function') {
                                await window.openProjectDetail(projId, { navigate: true, skipFetch: false });
                            }

                            const neoBubble = document.getElementById('neo-fab-bubble');
                            if (neoBubble) {
                                neoBubble.textContent = multi
                                    ? `【記録完了】${rowsToSave.length}件の経費を「${projName}」に保存しました⚡️`
                                    : `【記録完了】「${primaryTitle}」を ${primaryCat} で保存しました⚡️`;
                                neoBubble.classList.add('show');
                                setTimeout(() => neoBubble.classList.remove('show'), 4000);
                            }
                            if (isChatViewActive()) {
                                _resolveNeoReply(
                                    multi
                                        ? `${rowsToSave.length}件を「${projName}」に計上したよ🔥`
                                        : `「${primaryTitle}」を ${primaryCat} で記帳したよ🔥`
                                );
                            }

                            finishCompoundState();
                        } else {
                            console.log('Compound: non-UUID project_id — insertTransaction fallback');
                            for (const row of rowsToSave) {
                                await window.insertTransaction(txPayload(row));
                            }
                            window.dispatchEvent(new CustomEvent('neo-render-projects', { detail: { projects: window.mockDB.projects } }));
                            window._refreshCockpitActivityFeed?.();
                            window.renderCockpitFeed?.(0);
                            if (typeof window.openProjectDetail === 'function') {
                                await window.openProjectDetail(projId, { navigate: true, skipFetch: false });
                            }
                            const neoBubble = document.getElementById('neo-fab-bubble');
                            if (neoBubble) {
                                neoBubble.textContent = multi
                                    ? `【記録完了】${rowsToSave.length}件の経費を「${projName}」に保存しました⚡️`
                                    : `【記録完了】「${primaryTitle}」を ${primaryCat} で保存しました⚡️`;
                                neoBubble.classList.add('show');
                                setTimeout(() => neoBubble.classList.remove('show'), 4000);
                            }
                            if (isChatViewActive()) {
                                _resolveNeoReply(
                                    multi
                                        ? `${rowsToSave.length}件を「${projName}」に計上したよ🔥`
                                        : `「${primaryTitle}」を ${primaryCat} で記帳したよ🔥`
                                );
                            }
                            finishCompoundState();
                        }
                    } catch (e) {
                        console.error('Compound failed:', e);
                        showCompoundFail();
                        window.__compoundDbProjectId = null;
                        window.__compoundLocalMode = false;
                    }
                } else {
                    const confirmModal = document.getElementById('modal-neo-confirm');
                    if (confirmModal) confirmModal.classList.remove('hidden');
                }
            } else if (action === "AGGREGATE_EXPENSES") {
                const targetProjectName = intent.project_name;
                const targetProjId = window.findProjectIdByName ? window.findProjectIdByName(targetProjectName) : null;
                if (targetProjId) {
                    const targetProj = window.mockDB.projects.find(p => p.id === targetProjId);
                    const expenses = window.mockDB.transactions
                        .filter(t => t.projectId === targetProjId && (t.type === 'expense' || t.type === 'labor'))
                        .reduce((acc, curr) => acc + curr.amount, 0);

                    const neoBubble = document.getElementById('neo-fab-bubble');
                    if (neoBubble) {
                        neoBubble.textContent = `了解。「${targetProj.name}」の現在の経費合計は ¥${expenses.toLocaleString()} だよ📊`;
                        neoBubble.classList.add('show');
                        setTimeout(() => { neoBubble.classList.remove('show'); }, 5000);
                    }
                    alert(`【集計結果】\nプロジェクト: ${targetProj.name}\n経費合計: ¥${expenses.toLocaleString()}`);
                } else {
                    const neoBubble = document.getElementById('neo-fab-bubble');
                    if (neoBubble) {
                        neoBubble.textContent = `ごめん、「${targetProjectName}」が見つからなかった。`;
                        neoBubble.classList.add('show');
                        setTimeout(() => { neoBubble.classList.remove('show'); }, 4000);
                    }
                }
            } else if (action === "GENERATE_DOCUMENT") {
                await _runOneTouchDocumentFlow(text, intent.document_type, intent.project_name);
            } else if (action === "QUERY_KNOWLEDGE") {
                const answerText = intent.answer;
                if (answerText) {
                    const neoBubble = document.getElementById('neo-fab-bubble');
                    if (neoBubble) {
                        neoBubble.innerHTML = `<span>${answerText}</span>`;
                        neoBubble.classList.add('show');
                        setTimeout(() => { neoBubble.classList.remove('show'); }, 6000); 
                    }
                    _resolveNeoReply(answerText);
                } else {
                    const offlineReply = _buildOfflineFallbackReply(text);
                    if (offlineReply) _resolveNeoReply(offlineReply);
                }
            } else if (action === "UNKNOWN" || action === "UNKNOWN_ERROR" || !action) {
                // ── Step 0: Intent側が返した answer を最優先（APIキー有無に依存させない） ──────────
                if (typeof intent.answer === 'string' && intent.answer.trim()) {
                    _resolveNeoReply(intent.answer.trim());
                    continue;
                }

                // ── Step 1: Neoの自己紹介 → APIキー未設定時のみオフライン応答 ──────────
                if (_SELF_REF_PATTERN.test(text)) {
                    _resolveNeoReply(_NEO_SELF_INTRO);
                    continue;
                }

                // ── Step 2a: 無効・期限切れ・漏洩扱いの API キー ─────────────────────
                if (intent.errorType === "INVALID_API_KEY") {
                    const offlineReply = _buildOfflineFallbackReply(text);
                    if (offlineReply) {
                        _resolveNeoReply(offlineReply);
                        continue;
                    }
                    _resolveNeoReply('ごめんね、ちょっと調子悪いみたい… しばらくしてからもう一度試してね。', { isError: true });
                    continue;
                }

                // ── Step 2b: APIキー未設定 ─────────────────────────────────────────
                if (!_hasValidApiKey() || intent.errorType === "NO_API_KEY") {
                    const offlineReply = _buildOfflineFallbackReply(text);
                    if (offlineReply) {
                        _resolveNeoReply(offlineReply);
                        continue;
                    }
                    _resolveNeoReply('ごめんね、ちょっと調子悪いみたい… 後でもう一度試してね。', { isError: true });
                    continue;
                }

                // ── Step 3: APIキーあり → ストリーミングでリアルタイム応答 ──────────
                try {
                    if (isChatViewActive()) {
                        const streamRow = pendingNeoRow || appendChatMessage('neo', '<span class="neo-stream-text" style="white-space:pre-wrap;"></span>');
                        const streamBubble = streamRow?.querySelector('.message-bubble.neo');
                        if (streamBubble) {
                            streamBubble.classList.remove('neo-thinking-bubble', 'neo-error-bubble');
                            streamBubble.innerHTML = '<span class="neo-stream-text" style="white-space:pre-wrap;"></span>';
                        }
                        const streamSpan = streamRow?.querySelector('.neo-stream-text');
                        const chatMessages = document.getElementById('chat-messages');

                        let finalText = '';
                        try {
                            finalText = await getNeoResponseStream(text, (_chunk, fullText) => {
                                if (streamSpan) streamSpan.textContent = fullText;
                                if (chatMessages) {
                                    chatMessages.scrollTop = chatMessages.scrollHeight;
                                    window.scrollChatToBottom?.();
                                }
                            });
                        } catch (streamErr) {
                            const isKeyErr =
                                streamErr?.message?.includes('INVALID_API_KEY') ||
                                streamErr?.message?.includes('NO_API_KEY') ||
                                streamErr?.message?.includes('quota') ||
                                /expired|API_KEY_INVALID|leaked/i.test(String(streamErr?.message || ''));
                            if (isKeyErr) {
                                if (streamRow) streamRow.remove();
                                pendingNeoRow = null;
                                _resolveNeoReply('ごめんね、ちょっと調子悪いみたい… しばらくしてからもう一度試してね。', { isError: true });
                                continue;
                            }
                            // その他のエラー → 非ストリーミングにフォールバック
                            console.warn('[Neo] Stream failed, falling back to non-stream:', streamErr);
                            try {
                                finalText = await getNeoResponse(text);
                                if (streamSpan) streamSpan.textContent = finalText;
                            } catch (fallback2) {
                                if (streamRow) streamRow.remove();
                                pendingNeoRow = null;
                                _resolveNeoReply('ごめんね、ちょっと調子悪いみたい… ネット接続を確認してもう一度試してね。', { isError: true });
                                continue;
                            }
                        }
                        pendingNeoRow = null;
                        neoResponded = true;

                        // FABバブルにも最終テキストを反映
                        if (finalText) {
                            const neoBubble = document.getElementById('neo-fab-bubble');
                            if (neoBubble) {
                                neoBubble.innerHTML = `<span>${finalText}</span>`;
                                neoBubble.classList.add('show');
                                setTimeout(() => { neoBubble.classList.remove('show'); }, 6000);
                            }
                        }
                    } else {
                        // チャット非表示時はFABバブルに非ストリーミングで表示
                        const replyText = await getNeoResponse(text);
                        const neoBubble = document.getElementById('neo-fab-bubble');
                        if (neoBubble) {
                            neoBubble.innerHTML = `<span>${replyText}</span>`;
                            neoBubble.classList.add('show');
                            setTimeout(() => { neoBubble.classList.remove('show'); }, 6000);
                        }
                    }
                } catch (fallbackError) {
                    _resolveNeoReply('ごめんね、ちょっと調子悪いみたい… 後でもう一度試してね。', { isError: true });
                }
            }
        }

        const chatContainer = document.getElementById('chat-messages');
        if (chatContainer) {
            const loaders = chatContainer.querySelectorAll('.lucide-loader');
            loaders.forEach(l => { const bubble = l.closest('.chat-message-row'); if (bubble) bubble.remove(); });
        }
    } catch (error) {
        console.error("Failed to route via Intent Logic:", error);
        _resolveNeoReply('ごめんね、ちょっと調子悪いみたい…', { isError: true });
    } finally {
        if (pendingNeoRow && !neoResponded) {
            pendingNeoRow.remove();
            pendingNeoRow = null;
        }
        if (instructionInput) instructionInput.value = '';
        const elapsed = Date.now() - instructionStartTime;
        const remainingDelay = Math.max(0, 500 - elapsed);
        setTimeout(() => {
            if (instructionInput) {
                instructionInput.style.borderColor = '';
                instructionInput.style.boxShadow = '';
                instructionInput.disabled = false;
                instructionInput.focus();
            }
            instructionMics.forEach(mic => mic.disabled = false);
            btnAttachImages.forEach(btn => btn.disabled = false);
            isProcessingInstruction = false;
            if (window.neo) window.neo.speak('neo_idle');
        }, remainingDelay);
    }
}

window.handleInstruction = handleInstruction;
