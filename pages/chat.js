import { supabase } from '../lib/supabase-client.js';
import { routeIntent } from '../lib/core/intentRouter.js';
import { insertTransaction } from '../lib/data/transactionHandler.js';
import { generateAndUploadPDF } from '../lib/export/pdfGenerator.js';
import { getNeoResponse } from '../lib/api/geminiClient.js';


export function appendChatMessage(sender, htmlContent) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return null;

    const row = document.createElement('div');
    if (sender === 'neo') {
        row.className = 'message-bubble neo';
    } else {
        row.className = 'message-bubble ceo';
    }
    
    row.innerHTML = htmlContent;
    chatMessages.appendChild(row);
    
    setTimeout(() => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 50);
    
    return row;
}

window.appendChatMessage = appendChatMessage;

// Reconstruct dependencies for handleInstruction since it was extracted from app.js
let isProcessingInstruction = false;

export async function handleInstruction(text, hasImage = false) {
    if (!text && !hasImage) return;
    if (isProcessingInstruction) return;

    // Grab DOM elements fresh in case they changed or router swapped them
    const instructionInput = document.getElementById('main-instruction-input') || document.getElementById('chat-input-field');
    const instructionMics = document.querySelectorAll('#btn-chat-voice, .btn-mic');
    const btnAttachImages = document.querySelectorAll('#btn-chat-camera, .btn-attach-image');

    const COMPLIANCE_BLACKLIST = [
        "裏金", "脱税", "粉飾", "マネロン", "キックバック", "マネーロンダリング", 
        "架空請求", "横領", "脱法", "裏帳簿",
        "風俗", "アダルト", "エロ", "パパ活", "ギャラ飲み", "キャバクラ", "ソープ"
    ];

    const matchedToxicKw = COMPLIANCE_BLACKLIST.find(keyword => text.includes(keyword));
    if (matchedToxicKw) {
        if(window.handleComplianceViolation) window.handleComplianceViolation(`Physical Blacklist Match (${matchedToxicKw})`, text);
        if (instructionInput) instructionInput.value = '';
        return;
    }

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

        const compoundMatch = text.match(/(?:「([^」]+)」|([^\s]+?))(?:という|で)(?:フォルダ|プロジェクト)を?作って(.*?(?:追加|計上).*)/);
        if (compoundMatch) {
            const newProjectName = compoundMatch[1] || compoundMatch[2];
            const expenseText = compoundMatch[3]; 

            if (newProjectName && expenseText) {
                const newProjId = Date.now();
                const newProj = {
                    id: newProjId,
                    name: newProjectName,
                    customerName: "-",
                    location: "-",
                    note: "",
                    category: "other",
                    color: "#007AFF",
                    unit: "-",
                    hasUnpaid: false,
                    revenue: 0,
                    status: 'active',
                    clientName: "",
                    paymentDeadline: "",
                    bankInfo: "",
                    lastUpdated: new Date().toLocaleDateString('ja-JP').replace(/\//g, '/')
                };
                window.insertProject(newProj);
                window.currentOpenProjectId = newProjId;

                let finalAmount = 0;
                const amountMatch = expenseText.match(/\d+/);
                if (amountMatch) {
                    finalAmount = parseInt(amountMatch[0], 10);
                }

                let finalTitle = expenseText
                    .replace(/[、,。]/g, '')
                    .replace(/追加して/g, '')
                    .replace(/追加/g, '')
                    .replace(/計上して/g, '')
                    .replace(/計上/g, '')
                    .replace(newProjectName, '')
                    .trim();

                const newTransaction = {
                    id: Date.now() + 1,
                    projectId: newProjId,
                    type: "expense",
                    title: finalTitle || "無題の経費",
                    amount: finalAmount,
                    date: new Date().toLocaleDateString('ja-JP').replace(/\//g, '/'),
                    source: "inline-compound"
                };

                window.insertTransaction(newTransaction);
                try {
                    const savedTxs = JSON.parse(localStorage.getItem('neo_transactions') || '[]');
                    savedTxs.push(newTransaction);
                    localStorage.setItem('neo_transactions', JSON.stringify(savedTxs));
                } catch (e) { }

                if (window.renderProjects) window.renderProjects(window.mockDB.projects);

                const neoBubble = document.getElementById('neo-fab-bubble');
                if (neoBubble) {
                    neoBubble.textContent = `フォルダ「${newProjectName}」を作成し、${finalAmount}円を記録したよ⚡️`;
                    neoBubble.classList.add('show');
                    setTimeout(() => { neoBubble.classList.remove('show'); }, 5000);
                }

                if (instructionInput) {
                    instructionInput.value = '';
                }
                const curView = document.querySelector('.view:not(.hidden)');
                const currentViewId = curView ? curView.id : null;
                if (currentViewId !== 'view-sites') {
                    window.switchView('view-sites');
                }
                return;
            }
        }

        const commandData = window.parseCommand ? window.parseCommand(text) : {};
        const hasActionVerb = /(作って|新規|作成|立ち上げて|が入った|決まった|する|はいいた|はいいった|入った|決定|儲かった|ゲット)/.test(text);
        
        // Prevent aggressive local hijack if the query contains multiple actions/expenses
        const isComplexProjectQuery = text.includes('、') || text.includes('。') || (text.match(/[0-9,０-９]+/g) || []).length > 1;

        if (!isComplexProjectQuery && commandData && (commandData.date || commandData.location || hasActionVerb)) {
            const newProjInfo = window.createProject ? window.createProject(commandData.title, commandData.date, commandData.location) : {name: commandData.title};

            const neoBubble = document.getElementById('neo-fab-bubble');
            if (neoBubble) {
                neoBubble.textContent = `了解！「${newProjInfo.name}」プロジェクトを作成したよ⚡️`;
                neoBubble.classList.add('show');
                setTimeout(() => { neoBubble.classList.remove('show'); }, 4000);
            }

            if (instructionInput) instructionInput.value = '';
            
            const curViewBottom = document.querySelector('.view:not(.hidden)');
            const currentViewId = curViewBottom ? curViewBottom.id : null;
            if (currentViewId !== 'view-sites') window.switchView('view-sites');
            return; 
        }

        const aggregateMatch = text.match(/(?:「([^」]+)」|([^\s]+?))(?:の請求書まとめて|を合計して|の集計|の合計)/);
        if (aggregateMatch) {
            const targetProjectName = aggregateMatch[1] || aggregateMatch[2];
            if (targetProjectName && window.findProjectIdByName) {
                const targetProjId = window.findProjectIdByName(targetProjectName);
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

                    if (instructionInput) instructionInput.value = '';
                    return; 
                } else {
                    const neoBubble = document.getElementById('neo-fab-bubble');
                    if (neoBubble) {
                        neoBubble.textContent = `ごめん、「${targetProjectName}」が見つからなかった。`;
                        neoBubble.classList.add('show');
                        setTimeout(() => { neoBubble.classList.remove('show'); }, 4000);
                    }
                    if (instructionInput) instructionInput.value = '';
                    return;
                }
            }
        }

        const invoiceMatch = text.match(/(?:「([^」]+)」|([^\s]+?))の請求書(プレビュー)?/);
        if (invoiceMatch && text.includes('プレビュー')) {
             // To keep the script modular, we leave the intense invoice logic intact but ported
             const targetProjectName = invoiceMatch[1] || invoiceMatch[2];
             if (targetProjectName && window.findProjectIdByName) {
                 const targetProjId = window.findProjectIdByName(targetProjectName);
                 if (targetProjId) {
                     const targetProj = window.mockDB.projects.find(p => p.id === targetProjId);
                     const expenses = window.mockDB.transactions.filter(t => t.projectId === targetProjId && (t.type === 'expense' || t.type === 'labor'));
                     const subtotal = expenses.reduce((acc, curr) => acc + curr.amount, 0);
                     const tax = Math.floor(subtotal * 0.1);
                     const grandTotal = subtotal + tax;
                     
                     const industry = window.mockDB.userConfig.industry;
                     const honorific = (industry === 'freelance' || industry === 'general') ? '様' : '御中';
                     const itemDescription = (industry === 'construction') ? '一式' : '内容';
                     const itemUnit = (industry === 'construction') ? '式' : '回';

                     document.getElementById('invoice-client-name').textContent = (targetProj.clientName || '株式会社〇〇') + ` ${honorific}`;
                     document.getElementById('invoice-date').textContent = `発行日: ${new Date().toLocaleDateString('ja-JP').replace(/\//g, '/')}`;
                     document.getElementById('invoice-no').textContent = `請求番号: INV-${Date.now().toString().slice(-4)}`;
                     document.getElementById('invoice-total-amount').textContent = `¥${grandTotal.toLocaleString()}`;

                     const tbody = document.getElementById('invoice-items-body');
                     if (tbody) {
                         tbody.innerHTML = `
                             <tr style="border-bottom: 1px solid #eee;">
                                 <td style="padding: 12px 8px;">${targetProj.name} ${itemDescription}</td>
                                 <td style="padding: 12px 8px; text-align: center;">1</td>
                                 <td style="padding: 12px 8px; text-align: center;">${itemUnit}</td>
                                 <td style="padding: 12px 8px; text-align: right;">${subtotal.toLocaleString()}</td>
                             </tr>
                         `;
                     }

                     document.getElementById('invoice-subtotal').textContent = `¥${subtotal.toLocaleString()}`;
                     document.getElementById('invoice-tax').textContent = `¥${tax.toLocaleString()}`;
                     document.getElementById('invoice-grand-total').textContent = `¥${grandTotal.toLocaleString()}`;

                     const neoBubble = document.getElementById('neo-fab-bubble');
                     if (neoBubble) {
                         neoBubble.textContent = `了解。「${targetProj.name}」の請求書を下書きしたよ⚡️`;
                         neoBubble.classList.add('show');
                         setTimeout(() => { neoBubble.classList.remove('show'); }, 3000);
                     }

                     if (instructionInput) instructionInput.value = '';
                     window.switchView('view-invoice');
                     return; 
                 }
             }
        }

        const navMatch = text.match(/(ホーム|ダッシュボード|トップ|プロジェクト|プロジェクト一覧|現場|現場一覧|一覧|設定|プロファイル|アカウント)\s*(に|へ)?(戻して|戻る|見せて|開いて|いって|いく)/);
        if (navMatch) {
            const keyword = navMatch[1];
            let targetView = null;

            if (keyword.includes('ホーム') || keyword.includes('ダッシュボード') || keyword.includes('トップ')) targetView = 'view-dash';
            else if (keyword.includes('プロジェクト') || keyword.includes('現場') || keyword.includes('一覧')) targetView = 'view-sites';
            else if (keyword.includes('設定') || keyword.includes('プロファイル') || keyword.includes('アカウント')) targetView = 'view-settings';

            if (targetView) {
                const neoBubble = document.getElementById('neo-fab-bubble');
                if (neoBubble) {
                    neoBubble.textContent = `了解、移動するよ⚡️`;
                    neoBubble.classList.add('show');
                    setTimeout(() => { neoBubble.classList.remove('show'); }, 3000);
                }
                if (instructionInput) instructionInput.value = '';
                window.switchView(targetView);
                return; 
            }
        }

        const matchedProjectId = window.findProjectIdByName ? window.findProjectIdByName(text) : null;
        if (matchedProjectId) {
            window.currentOpenProjectId = matchedProjectId;
        }

        await new Promise(resolve => setTimeout(resolve, 800));
        if(window.triggerNeoSyncGlow) window.triggerNeoSyncGlow();
        await new Promise(resolve => setTimeout(resolve, 600));

        let intents = [{ action: "UNKNOWN" }];
        let isSilentWorkflow = false;

        if (!hasImage) {
            const intentType = (typeof window.analyzeIntent === 'function') ? window.analyzeIntent(text) : "UNKNOWN";
            
            if (intentType === "CONSULT" || intentType === "UNKNOWN") {
                window.switchView('view-chat');
                appendChatMessage('user', text);
                appendChatMessage('neo', '<i class="lucide lucide-loader" style="animation: spin 1s linear infinite;"></i> 考え中...');
                
                const condensedProjects = window.mockDB.projects.map(p => ({ id: p.id, name: p.name, status: p.status })).slice(0, 10);
                const recentLogs = window.mockDB.transactions.filter(t => !t.is_deleted).slice(0, 5).map(t => ({ title: t.title, amount: t.amount, date: t.date }));
                const stateMemory = JSON.stringify({ active_projects: condensedProjects, recent_transactions: recentLogs });

                try {
                    const geminiResult = await window.determineRouteFromIntent(text, window.mockDB.userConfig.industry, stateMemory, new Date().toLocaleString('ja-JP'));
                    intents = Array.isArray(geminiResult) ? geminiResult : [geminiResult];
                } catch (aiError) {
                    alert("通信エラーが発生しました。");
                    return;
                }
            } else if (intentType === "ENTRY" || intentType === "ACTION") {
                let parsedItems = null;

                // Bypass local parser for complex multi-intent queries (e.g., punctuation or multiple numbers)
                const isComplexQuery = text.includes('、') || text.includes('。') || (text.match(/[0-9,０-９]+/g) || []).length > 1;

                if (!isComplexQuery) {
                    if (typeof window.parseLocallyWithKnowledge === 'function') {
                        parsedItems = await window.parseLocallyWithKnowledge(text);
                    } else if (typeof window.parseLocally === 'function') {
                        parsedItems = window.parseLocally(text);
                    }
                }

                if (parsedItems && Array.isArray(parsedItems) && parsedItems.length > 0) {
                    intents = parsedItems;
                    isSilentWorkflow = true;
                } else {
                    // Try the Silent AI Core (parseInputToData) if local parsing failed
                    let aiParsed = null;
                    if (typeof window.parseInputToData === 'function') {
                        aiParsed = await window.parseInputToData(text);
                    }

                    if (aiParsed && Array.isArray(aiParsed) && aiParsed.length > 0) {
                        console.log("[DEBUG] parseInputToData returned:", aiParsed);
                        const hasConsult = aiParsed.some(a => a.action === 'CONSULT' || a.action === 'UNKNOWN');
                        if (!hasConsult) {
                            intents = aiParsed;
                            isSilentWorkflow = true;
                        } else {
                            window.switchView('view-chat');
                            appendChatMessage('user', text);
                            appendChatMessage('neo', '<i class="lucide lucide-loader" style="animation: spin 1s linear infinite;"></i> 考え中...');
                            intents = aiParsed;
                        }
                    } else {
                        // Total fallback to heavy Chat engine
                        window.switchView('view-chat');
                        appendChatMessage('user', text);
                        appendChatMessage('neo', '<i class="lucide lucide-loader" style="animation: spin 1s linear infinite;"></i> 考え中...');
                        
                        const stateMemory = JSON.stringify({ active_projects: window.mockDB.projects.slice(0,5) });
                        try {
                            const geminiResult = await window.determineRouteFromIntent(text, window.mockDB.userConfig.industry, stateMemory, new Date().toLocaleString('ja-JP'));
                            intents = Array.isArray(geminiResult) ? geminiResult : [geminiResult];
                        } catch (aiError) {
                            alert("通信エラーが発生しました。");
                            return;
                        }
                    }
                }
            }
        }

        // Fallback for conversational (UNKNOWN) intents
        if (intents.length === 1 && (intents[0].action === 'UNKNOWN' || intents[0].action === 'COMPLIANCE_VIOLATION' || !intents[0].action)) {
            try {
                const conversationalReply = await getNeoResponse(text);
                const replyText = typeof conversationalReply === 'string' ? conversationalReply : (conversationalReply.text || "応答がありませんでした。");
                intents = [{ action: "QUERY_KNOWLEDGE", answer: replyText }];
            } catch (fallbackError) {
                console.error("Gemini Chat Engine Error:", fallbackError);
                intents = [{ action: "UNKNOWN_ERROR" }];
            }
        }

        const isChatViewActive = () => {
            const cv = document.getElementById('view-chat');
            return cv && !cv.classList.contains('hidden');
        };

        for (const intent of intents) {
            const action = intent.action;

            if (action === "CREATE_PROJECT") {
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
                if(window.renderProjects) window.renderProjects(window.mockDB.projects);

                const neoBubble = document.getElementById('neo-fab-bubble');
                if (neoBubble) {
                    neoBubble.textContent = `プロジェクト「${newProjectName}」を作成したよ⚡️`;
                    neoBubble.classList.add('show');
                    setTimeout(() => { neoBubble.classList.remove('show'); }, 3000);
                }

                if (isSilentWorkflow) {
                    if (instructionInput) instructionInput.value = '';
                    if (isChatViewActive()) appendChatMessage('neo', `プロジェクト「${newProjectName}」を作成しました🔥`);
                    // removed early return to allow subsequent actions
                }

            } else if (action === "ADD_EXPENSE") {
                const projId = window.currentOpenProjectId || 1;
                const pObj = window.mockDB.projects.find(p => p.id === projId);
                const projName = pObj ? pObj.name : '未分類';

                let finalAmount = intent.amount;
                if (!finalAmount || finalAmount === 0 || isNaN(finalAmount)) {
                    const match = text.match(/\d+/);
                    finalAmount = match ? parseInt(match[0], 10) : 0;
                }

                let finalTitle = intent.title || text;
                if (projName !== '未分類') finalTitle = finalTitle.replace(projName, '').trim();

                let entryType = intent.type || "expense";

                const newTransactionDraft = {
                    id: Date.now(),
                    projectId: projId,
                    projectName: projName,
                    type: entryType,
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
                
                document.getElementById('confirm-tx-title').value = newTransactionDraft.title;
                document.getElementById('confirm-tx-amount').value = newTransactionDraft.amount;
                document.getElementById('confirm-tx-category').value = newTransactionDraft.type;
                
                if (isSilentWorkflow) {
                     try {
                         await window.insertTransaction(newTransactionDraft);
                         if(window.renderProjects) window.renderProjects(window.mockDB.projects);
                         if (instructionInput) instructionInput.value = '';
                         
                         const neoBubble = document.getElementById('neo-fab-bubble');
                         if (neoBubble) {
                             neoBubble.textContent = `【自己完結処理】「${newTransactionDraft.title}」を ${newTransactionDraft.category} で記録したよ⚡️`;
                             neoBubble.classList.add('show');
                             setTimeout(() => neoBubble.classList.remove('show'), 4000);
                         }
                         if (isChatViewActive()) appendChatMessage('neo', `「${newTransactionDraft.title}」を ${newTransactionDraft.category} で記帳しておきました🔥`);
                         // removed early return to allow subsequent actions
                     } catch (e) {
                         console.error("Silent Auto-save failed", e);
                     }
                } else {
                    document.getElementById('modal-neo-confirm').classList.remove('hidden');
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
            } else {
                 // Fallback
                 if (isChatViewActive()) appendChatMessage('neo', `エラーが発生しました。もう一度お試しください。`);
            }
        }

        const chatContainer = document.getElementById('chat-messages');
        if (chatContainer) {
            const loaders = chatContainer.querySelectorAll('.lucide-loader');
            loaders.forEach(l => { const bubble = l.closest('.chat-message-row'); if (bubble) bubble.remove(); });
        }
        if (instructionInput) instructionInput.value = '';

    } catch (error) {
        console.error("Failed to route via AI Chat logic:", error);
    } finally {
        const elapsed = Date.now() - instructionStartTime;
        const remainingDelay = Math.max(0, 1000 - elapsed);
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
