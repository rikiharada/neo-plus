import { supabase } from '../lib/supabase-client.js';
import { understandIntent } from '../lib/core/intentRouter.js';
import { insertTransaction } from '../lib/data/transactionHandler.js';
import { generateAndUploadPDF } from '../lib/export/pdfGenerator.js';
import { getNeoResponse } from '../lib/api/geminiClient.js';

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
        // CEO: 右寄せ、アバターなし (iMessage スタイル)
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
    setTimeout(() => { chatMessages.scrollTop = chatMessages.scrollHeight; }, 50);

    return row;
}

window.appendChatMessage = appendChatMessage;

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
            appendChatMessage('neo', '<i class="lucide lucide-loader" style="animation: spin 1s linear infinite;"></i> 考え中...');
        }

        await new Promise(resolve => setTimeout(resolve, 800));
        if(window.triggerNeoSyncGlow) window.triggerNeoSyncGlow();
        await new Promise(resolve => setTimeout(resolve, 600));

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
                const projId = window.currentOpenProjectId || 1;
                const pObj = window.mockDB.projects.find(p => p.id === projId);
                const projName = pObj ? pObj.name : '未分類';

                let finalAmount = intent.amount || 0;
                let finalTitle = intent.title || text;
                if (projName !== '未分類') finalTitle = finalTitle.replace(projName, '').trim();

                const newTransactionDraft = {
                    id: Math.floor(Date.now() / 1000),
                    projectId: projId,
                    projectName: projName,
                    type: intent.type || "expense",
                    category: intent.category || "その他",
                    title: finalTitle || "無題の経費",
                    amount: finalAmount,
                    date: new Date().toLocaleDateString('ja-JP').replace(/\//g, '/'),
                    source: intent.source_cache ? "local-cache" : "inline-ai",
                    isBookkeeping: intent.is_bookkeeping || false,
                    inferredTaxRate: intent.inferred_tax_rate || null,
                    taxComment: intent.tax_comment || null,
                    tags: intent.tags || [],
                    originalInput: text 
                };

                window.pendingAiDecision = newTransactionDraft;
                
                const titleField = document.getElementById('confirm-tx-title');
                if (titleField) {
                    titleField.value = newTransactionDraft.title;
                    document.getElementById('confirm-tx-amount').value = newTransactionDraft.amount;
                    document.getElementById('confirm-tx-category').value = newTransactionDraft.type;
                }
                
                if (isSilentWorkflow || intent.is_compound) {
                     try {
                         await window.insertTransaction(newTransactionDraft);
                         window.dispatchEvent(new CustomEvent('neo-render-projects', { detail: { projects: window.mockDB.projects } }));
                         
                         const neoBubble = document.getElementById('neo-fab-bubble');
                         if (neoBubble) {
                             neoBubble.textContent = `【自己完結処理】「${newTransactionDraft.title}」を ${newTransactionDraft.category} で記録したよ⚡️`;
                             neoBubble.classList.add('show');
                             setTimeout(() => neoBubble.classList.remove('show'), 4000);
                         }
                         if (isChatViewActive()) appendChatMessage('neo', `「${newTransactionDraft.title}」を ${newTransactionDraft.category} で記帳しておきました🔥`);
                     } catch (e) {
                         console.error("Silent Auto-save failed", e);
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
                try {
                    const conversationalReply = await getNeoResponse(text);
                    const replyText = typeof conversationalReply === 'string' ? conversationalReply : (conversationalReply.text || "応答がありませんでした。");
                    const neoBubble = document.getElementById('neo-fab-bubble');
                    if (neoBubble) {
                        neoBubble.innerHTML = `<span>${replyText}</span>`;
                        neoBubble.classList.add('show');
                        setTimeout(() => { neoBubble.classList.remove('show'); }, 6000); 
                    }
                    if (isChatViewActive()) appendChatMessage('neo', replyText);
                } catch (fallbackError) {
                    if (isChatViewActive()) appendChatMessage('neo', `エラーが発生しました。もう一度お試しください。`);
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
