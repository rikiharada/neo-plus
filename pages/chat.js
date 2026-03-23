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
    const k1 = localStorage.getItem('gemini_api_key');
    const k2 = localStorage.getItem('neo_api_key');
    const k = (k1 || k2 || '').trim();
    return k.length > 10 && k !== 'undefined' && k !== 'null';
}

export function appendChatMessage(sender, htmlContent) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return null;

    // タイムスタンプ: 時:分 (日本語)
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false });

    const row = document.createElement('div');
    row.className = 'chat-message-row';

    if (sender === 'neo') {
        // Neo: 左寄せ、アバター左上固定
        row.style.justifyContent = 'flex-start';
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
        row.style.justifyContent = 'flex-end';
        row.innerHTML = `
            <div class="chat-bubble-col ceo">
                <div class="message-bubble ceo">${htmlContent}</div>
                <span class="chat-timestamp">${timeStr}</span>
            </div>
        `;
    }

    chatMessages.appendChild(row);

    // 最新メッセージへスクロール
    setTimeout(() => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
        if (typeof window.syncChatVisualViewport === 'function') window.syncChatVisualViewport();
    }, 50);

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
        greeting = `おはようございます、${salutation}。今日もフルサポートします。<br><span style="font-size:12px;color:var(--text-muted);">あなたの手のひらに、安心のマネーマネジメントを。</span>`;
    } else if (hour >= 12 && hour < 18) {
        greeting = `お疲れ様です、${salutation}。<br><span style="font-size:12px;color:var(--text-muted);">あなたの手のひらに、安心のマネーマネジメントを。</span>`;
    } else if (hour >= 18 && hour < 24) {
        greeting = `お疲れ様です、${salutation}。<br><span style="font-size:12px;color:var(--text-muted);">あなたの手のひらに、安心のマネーマネジメントを。</span>`;
    } else {
        greeting = `遅くまでお疲れ様です、${salutation}。<br><span style="font-size:12px;color:var(--text-muted);">あなたの手のひらに、安心のマネーマネジメントを。</span>`;
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
        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages) {
            requestAnimationFrame(() => { chatMessages.scrollTop = chatMessages.scrollHeight; });
        }
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
function resolveProjectIdForExpenseIntent(intent, userText = '') {
    if (typeof window.resolveExpenseProjectId === 'function') {
        return window.resolveExpenseProjectId(intent, userText || '');
    }
    const projects = window.mockDB?.projects || [];
    if (!projects.length) return null;
    const matches = (id) => id != null && id !== '' && projects.some((p) => String(p.id) === String(id));
    if (intent.project_id != null && matches(intent.project_id)) {
        return projects.find((p) => String(p.id) === String(intent.project_id)).id;
    }
    if (window.currentOpenProjectId != null && matches(window.currentOpenProjectId)) {
        return projects.find((p) => String(p.id) === String(window.currentOpenProjectId)).id;
    }
    if (projects.length === 1) return projects[0].id;
    return null;
}

let isProcessingInstruction = false;

export async function handleInstruction(text, hasImage = false) {
    if (!text && !hasImage) return;
    if (isProcessingInstruction) return;

    const instructionInput = document.getElementById('main-instruction-input') || document.getElementById('chat-input-field');
    const instructionMics = document.querySelectorAll('#btn-chat-voice, .btn-mic');
    const btnAttachImages = document.querySelectorAll('#btn-chat-camera, .btn-attach-image');

    if (!navigator.onLine) {
        const neoBubble = document.getElementById('neo-fab-bubble');
        if (neoBubble) {
            neoBubble.textContent = `現在オフラインですが、セキュリティチェックは正常に完了しました。通信環境の良いところで再度お試しください。`;
            neoBubble.classList.add('show');
            setTimeout(() => { neoBubble.classList.remove('show'); }, 6000);
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
        if (window.neo) window.neo.speak('neo_thinking');

        // Context preparation for Intent Analysis layer (Phase 2 Layer 1)
        const contextData = {
           industry: window.mockDB?.userConfig?.industry || 'general',
           activeProjects: window.mockDB?.projects ? window.mockDB.projects.map(p => ({ id: p.id, name: p.name, status: p.status })).slice(0, 10) : [],
           recentTransactions: window.mockDB?.transactions ? window.mockDB.transactions.filter(t => !t.is_deleted).slice(0, 5).map(t => ({ title: t.title, amount: t.amount, date: t.date })) : []
        };

        const intents = await understandIntent(text, hasImage, contextData);

        const isChatViewActive = () => {
            const cv = document.getElementById('view-chat');
            return cv && !cv.classList.contains('hidden');
        };

        const hasConsult = intents.some(i => i.ui_action === 'think_consult');
        if (hasConsult) {
            window.switchView('view-chat');
            appendChatMessage('user', text);
            // ストリーミングバブルがリアルタイム表示するので「考え中」プレースホルダーは不要
        }

        if(window.triggerNeoSyncGlow) window.triggerNeoSyncGlow();

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
                const newProjectName = intent.project_name || "名称未設定プロジェクト";
                const newProjId = Date.now();
                const newProj = {
                    id: newProjId, name: newProjectName, customerName: "-", location: intent.location || "-", note: "",
                    category: "other", color: "#007AFF", unit: "-", hasUnpaid: false, revenue: 0,
                    status: 'active', clientName: "", paymentDeadline: "", bankInfo: "",
                    lastUpdated: intent.date || new Date().toLocaleDateString('ja-JP').replace(/\//g, '/')
                };
                window.insertProject(newProj);
                window.currentOpenProjectId = newProjId;
                window.dispatchEvent(new CustomEvent('neo-render-projects', { detail: { projects: window.mockDB.projects } }));

                const neoBubble = document.getElementById('neo-fab-bubble');
                if (neoBubble) {
                    neoBubble.textContent = `プロジェクト「${newProjectName}」を作成したよ⚡️`;
                    neoBubble.classList.add('show');
                    setTimeout(() => { neoBubble.classList.remove('show'); }, 3000);
                }

                if (isSilentWorkflow || intent.is_compound) {
                    console.log(`[Neo Intent Execution] Silent/Compound flow, skipping switchView`);
                    if (isChatViewActive()) appendChatMessage('neo', `プロジェクト「${newProjectName}」を作成しました🔥`);
                } else {
                    const curViewBottom = document.querySelector('.view:not(.hidden)');
                    const currentViewId = curViewBottom ? curViewBottom.id : null;
                    console.log(`[Neo Intent Execution] Directing to view-sites. Current visible view: ${currentViewId}`);
                    if (currentViewId !== 'view-sites') window.switchView('view-sites');
                }
            } else if (action === "ADD_EXPENSE") {
                const projId = resolveProjectIdForExpenseIntent(intent, text);
                if (projId == null) {
                    const neoBubble = document.getElementById('neo-fab-bubble');
                    if (neoBubble) {
                        neoBubble.textContent = 'プロジェクトが選べませんでした。一覧からプロジェクトを開いてから経費を記録してください。';
                        neoBubble.classList.add('show');
                        setTimeout(() => neoBubble.classList.remove('show'), 5000);
                    }
                    if (isChatViewActive()) {
                        appendChatMessage('neo', 'どのプロジェクトの経費か決められませんでした。プロジェクト一覧から対象を開いてから、もう一度お試しください。');
                    }
                    continue;
                }
                const pObj = window.mockDB.projects.find(p => String(p.id) === String(projId));
                const projName = pObj ? pObj.name : '未分類';

                const amtList = Array.isArray(intent.amounts)
                    ? intent.amounts.filter((a) => a && Number(a.value) > 0)
                    : [];
                const multi = amtList.length > 1;
                const lineItems = amtList.length > 0
                    ? amtList.map((a) => ({
                        title: (a.label && String(a.label).trim()) || intent.category || '経費',
                        amount: Number(a.value)
                    }))
                    : [{
                        title: (intent.title || text || '').trim(),
                        amount: intent.amount || 0
                    }];

                const today = new Date().toLocaleDateString('ja-JP').replace(/\//g, '/');
                const baseMeta = {
                    projectId: projId,
                    projectName: projName,
                    type: intent.type || 'expense',
                    category: intent.category || 'その他',
                    date: today,
                    source: intent.source_cache ? 'local-cache' : 'inline-ai',
                    isBookkeeping: intent.is_bookkeeping || false,
                    inferredTaxRate: intent.inferred_tax_rate || null,
                    taxComment: intent.tax_comment || null,
                    tags: intent.tags || [],
                    originalInput: text
                };

                const cleanTitle = (raw) => {
                    let t = (raw || '').trim() || '無題の経費';
                    if (projName !== '未分類') t = t.split(projName).join('').trim();
                    return t || '無題の経費';
                };

                const runSilentInserts = async () => {
                    const baseTime = Date.now();
                    for (let i = 0; i < lineItems.length; i++) {
                        const { title: liTitle, amount: liAmt } = lineItems[i];
                        const ft = multi ? liTitle : cleanTitle(liTitle);
                        if (!liAmt || liAmt <= 0) continue;
                        const draft = {
                            ...baseMeta,
                            id: baseTime + i,
                            title: ft,
                            amount: liAmt
                        };
                        await window.insertTransaction(draft);
                    }
                };

                const firstLine = lineItems[0];
                const firstTitle = multi ? firstLine.title : cleanTitle(firstLine.title);
                const firstAmount = firstLine.amount || intent.amount || 0;

                const newTransactionDraft = {
                    id: Math.floor(Date.now() / 1000),
                    projectId: projId,
                    projectName: projName,
                    type: baseMeta.type,
                    category: baseMeta.category,
                    title: firstTitle,
                    amount: firstAmount,
                    date: today,
                    source: baseMeta.source,
                    isBookkeeping: baseMeta.isBookkeeping,
                    inferredTaxRate: baseMeta.inferredTaxRate,
                    taxComment: baseMeta.taxComment,
                    tags: baseMeta.tags,
                    originalInput: text
                };

                window.pendingAiDecision = newTransactionDraft;

                const titleField = document.getElementById('confirm-tx-title');
                if (titleField) {
                    titleField.value = multi
                        ? `${lineItems.length}件（${firstTitle} 他）`
                        : newTransactionDraft.title;
                    const amtEl = document.getElementById('confirm-tx-amount');
                    if (amtEl) {
                        amtEl.value = multi
                            ? lineItems.reduce((s, x) => s + (Number(x.amount) || 0), 0)
                            : newTransactionDraft.amount;
                    }
                    document.getElementById('confirm-tx-category').value = newTransactionDraft.type;
                }

                const silentLike = isSilentWorkflow || intent.is_compound || multi;

                if (silentLike) {
                    try {
                        await runSilentInserts();
                        window.dispatchEvent(new CustomEvent('neo-render-projects', { detail: { projects: window.mockDB.projects } }));

                        const pvd = document.getElementById('view-project-detail');
                        if (
                            pvd && !pvd.classList.contains('hidden') &&
                            typeof window.openProjectDetail === 'function' &&
                            String(window.currentOpenProjectId) === String(projId)
                        ) {
                            window.openProjectDetail(projId);
                        }

                        const neoBubble = document.getElementById('neo-fab-bubble');
                        if (neoBubble) {
                            neoBubble.textContent = multi
                                ? `【自己完結】${lineItems.length}件の経費を ${projName} に記録したよ⚡️`
                                : `【自己完結処理】「${newTransactionDraft.title}」を ${newTransactionDraft.category} で記録したよ⚡️`;
                            neoBubble.classList.add('show');
                            setTimeout(() => neoBubble.classList.remove('show'), 4000);
                        }
                        if (isChatViewActive()) {
                            appendChatMessage('neo', multi
                                ? `${lineItems.length}件を「${projName}」に計上しておいたよ🔥`
                                : `「${newTransactionDraft.title}」を ${newTransactionDraft.category} で記帳しておきました🔥`);
                        }
                    } catch (e) {
                        console.error('Silent Auto-save failed', e);
                    }
                } else {
                    const confirmModal = document.getElementById('modal-neo-confirm');
                    if (confirmModal) confirmModal.classList.remove('hidden');
                }

                if (intent.is_compound) {
                    const curView = document.querySelector('.view:not(.hidden)');
                    const currentViewId = curView ? curView.id : null;
                    if (currentViewId !== 'view-sites') window.switchView('view-sites');
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
                const targetProjectName = intent.project_name;
                let targetProjId = window.findProjectIdByName ? window.findProjectIdByName(targetProjectName) : null;
                if (!targetProjId && window.currentOpenProjectId) {
                    targetProjId = window.currentOpenProjectId;
                }

                if (targetProjId) {
                    if (isChatViewActive()) appendChatMessage('neo', `「${targetProjectName || '現在のプロジェクト'}」の請求書を下書きしました⚡️`);
                    if (window.showInvoicePreview) window.showInvoicePreview(targetProjId);
                } else {
                    const neoBubble = document.getElementById('neo-fab-bubble');
                    if (neoBubble) {
                        neoBubble.textContent = `ごめん、「${targetProjectName || '指定のプロジェクト'}」が見つからなかった。`;
                        neoBubble.classList.add('show');
                        setTimeout(() => neoBubble.classList.remove('show'), 4000);
                    }
                    if (isChatViewActive()) appendChatMessage('neo', `対象のプロジェクトが見つかりませんでした。`);
                }
            } else if (action === "QUERY_KNOWLEDGE") {
                const answerText = intent.answer;
                if (answerText) {
                    const neoBubble = document.getElementById('neo-fab-bubble');
                    if (neoBubble) {
                        neoBubble.innerHTML = `<span>${answerText}</span>`;
                        neoBubble.classList.add('show');
                        setTimeout(() => { neoBubble.classList.remove('show'); }, 6000); 
                    }
                    if (isChatViewActive()) appendChatMessage('neo', answerText);
                }
            } else if (action === "UNKNOWN" || action === "UNKNOWN_ERROR" || !action) {
                // ── Step 1: Neoの自己紹介 → APIキー不要でオフライン応答 ──────────
                if (_SELF_REF_PATTERN.test(text)) {
                    if (isChatViewActive()) appendChatMessage('neo', _NEO_SELF_INTRO);
                    continue;
                }

                // ── Step 2a: 無効・期限切れ・漏洩扱いの API キー ─────────────────────
                if (intent.errorType === "INVALID_API_KEY") {
                    if (isChatViewActive()) {
                        appendChatMessage(
                            'neo',
                            'Gemini APIキーが無効か、有効期限が切れています。<br><span style="font-size:13px;color:var(--text-muted);">Google AI Studio（aistudio.google.com/apikey）で新しいキーを発行し、右下「アカウント」から保存し直してください。</span>'
                        );
                    }
                    continue;
                }

                // ── Step 2b: APIキー未設定 ─────────────────────────────────────────
                if (!_hasValidApiKey() || intent.errorType === "NO_API_KEY") {
                    if (isChatViewActive()) appendChatMessage('neo', 'ごめんなさい、今は少し考えさせてくださいね。後ほどもう一度お試しください。');
                    continue;
                }

                // ── Step 3: APIキーあり → ストリーミングでリアルタイム応答 ──────────
                try {
                    if (isChatViewActive()) {
                        // 空バブルを即座に作成してストリームを流し込む
                        const streamRow = appendChatMessage('neo', '<span class="neo-stream-text" style="white-space:pre-wrap;"></span>');
                        const streamSpan = streamRow?.querySelector('.neo-stream-text');
                        const chatMessages = document.getElementById('chat-messages');

                        let finalText = '';
                        try {
                            finalText = await getNeoResponseStream(text, (_chunk, fullText) => {
                                if (streamSpan) streamSpan.textContent = fullText;
                                if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
                            });
                        } catch (streamErr) {
                            const isKeyErr =
                                streamErr?.message?.includes('INVALID_API_KEY') ||
                                streamErr?.message?.includes('NO_API_KEY') ||
                                streamErr?.message?.includes('quota') ||
                                /expired|API_KEY_INVALID|leaked/i.test(String(streamErr?.message || ''));
                            if (isKeyErr) {
                                if (streamRow) streamRow.remove();
                                if (isChatViewActive()) {
                                    appendChatMessage(
                                        'neo',
                                        'Gemini APIキーが無効か期限切れです。アカウントタブで新しいキーを保存してください。'
                                    );
                                }
                                continue;
                            }
                            // その他のエラー → 非ストリーミングにフォールバック
                            console.warn('[Neo] Stream failed, falling back to non-stream:', streamErr);
                            try {
                                finalText = await getNeoResponse(text);
                                if (streamSpan) streamSpan.textContent = finalText;
                            } catch (fallback2) {
                                if (streamRow) streamRow.remove();
                                if (isChatViewActive()) appendChatMessage('neo', `ネット接続を確認してもう一度お試しください。`);
                                continue;
                            }
                        }

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
                    if (isChatViewActive()) {
                        appendChatMessage('neo', 'ごめんなさい、今は少し考えさせてくださいね。後ほどもう一度お試しください。');
                    }
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
    } finally {
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
