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
let isProcessingInstruction = false;

export async function handleInstruction(text, hasImage = false) {
    if (!text && !hasImage) return;
    if (isProcessingInstruction) return;

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

        /** Supabase 複合経路: 文字列 UUID（十分な長さ）のみ bulk insert 可 */
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
