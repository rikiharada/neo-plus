/** Project Detail AI Confirmations & Lexicon */
            window.cancelNeoConfirm = () => {
                document.getElementById('modal-neo-confirm').classList.add('hidden');
                window.pendingAiDecision = null;
                const neoBubble = document.getElementById('neo-fab-bubble');
                if (neoBubble) {
                    neoBubble.classList.remove('show');
                }
            };

            
window.saveNeoConfirm = () => {
                if (!window.pendingAiDecision) return;

                const confirmedTitle = document.getElementById('confirm-tx-title').value;
                const confirmedAmount = parseInt(document.getElementById('confirm-tx-amount').value, 10) || 0;
                const confirmedCategory = document.getElementById('confirm-tx-category').value;
                const originalCategory = document.getElementById('confirm-tx-original-category').value;

                // 1. Semantic Correction Learning Loop
                if (confirmedCategory !== originalCategory) {
                    console.log(`[Neo AI Learning] User corrected category: ${originalCategory} -> ${confirmedCategory} for input: "${window.pendingAiDecision.originalInput}"`);

                    // Simple learning: record the correction mapping
                    window.aiCorrectionLog.push({
                        input_snippet: window.pendingAiDecision.originalInput.substring(0, 20),
                        corrected_to: confirmedCategory
                    });

                    // Keep log concise
                    if (window.aiCorrectionLog.length > 20) {
                        window.aiCorrectionLog.shift();
                    }
                    localStorage.setItem('neo_ai_corrections', JSON.stringify(window.aiCorrectionLog));

                    // Fire-and-forget async contribution to Global Lexicon (Crowdsourced Intelligence)
                    if (window.contributeToGlobalLexicon) {
                        window.contributeToGlobalLexicon(window.pendingAiDecision.originalInput, confirmedCategory);
                    }
                }

                // 2. Apply confirmed data
                const hintInput = window.pendingAiDecision.originalInput || '';
                const finalTransaction = {
                    ...window.pendingAiDecision,
                    title: confirmedTitle,
                    amount: confirmedAmount,
                    type: confirmedCategory
                };

                // Remove temporary keys before inserting
                delete finalTransaction.projectName;
                delete finalTransaction.originalInput;

                if ((finalTransaction.projectId == null || finalTransaction.projectId === '') && typeof window.resolveExpenseProjectId === 'function') {
                    finalTransaction.projectId = window.resolveExpenseProjectId(finalTransaction, hintInput);
                }

                // 3. Save officially
                window.insertTransaction(finalTransaction);

                try {
                    const savedTxs = JSON.parse(localStorage.getItem('neo_transactions') || '[]');
                    savedTxs.push(finalTransaction);
                    localStorage.setItem('neo_transactions', JSON.stringify(savedTxs));
                } catch (e) { console.error("Local storage save failed:", e); }

                window.renderProjects(window.mockDB.projects);
                window.updateGlobalProfitDisplay();

                document.getElementById('modal-neo-confirm').classList.add('hidden');
                window.pendingAiDecision = null;

                if (window.currentOpenProjectId != null && typeof window.openProjectDetail === 'function') {
                    window.openProjectDetail(window.window.currentOpenProjectId);
                }

                const neoBubble = document.getElementById('neo-fab-bubble');
                if (neoBubble) {
                    neoBubble.textContent = `了解！「${confirmedTitle}（¥${confirmedAmount.toLocaleString()}）」を記録したよ✨`;
                    neoBubble.classList.add('show');
                    setTimeout(() => { neoBubble.classList.remove('show'); }, 4000);
                }
            };

            
            window.contributeToGlobalLexicon = async (originalInput, correctedCategory) => {
                if (!window.supabaseClient || typeof extractPureBusinessTerm !== 'function') return;
                try {
                    // Start Secondary AI Data Cleansing to protect PII
                    const pureTerm = await extractPureBusinessTerm(originalInput);

                    if (!pureTerm || pureTerm.length < 2) return;

                    // [REJECTION_PROTOCOL] Check
                    if (pureTerm === "[REJECT]" || pureTerm.includes("[REJECT]")) {
                        console.warn("[Neo Global Agent] Contribution REJECTED to protect PII or filter toxicity. Skipping upload.");
                        return;
                    }

                    console.log("[Neo Global Agent] Extracted pure term for communal DB:", pureTerm);

                    // Check existing dictionary via Supabase
                    const kc = window.supabaseKnowledgeClient || window.supabaseClient;
                    const { data: existing } = await kc
                        .from('neo_global_lexicon')
                        .select('id, frequency')
                        .eq('keyword', pureTerm)
                        .eq('category', correctedCategory)
                        .single();

                    if (existing) {
                        await kc
                            .from('neo_global_lexicon')
                            .update({ frequency: existing.frequency + 1 })
                            .eq('id', existing.id);
                    } else {
                        await kc
                            .from('neo_global_lexicon')
                            .insert([{
                                keyword: pureTerm,
                                category: correctedCategory,
                                frequency: 1
                            }]);
                    }
                    console.log("[Neo Global Agent] Successfully contributed to collective intelligence.");
                } catch (e) {
                    console.error("[Neo Global Agent] Contribution failed silently:", e);
                }
            };
            