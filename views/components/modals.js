/** Global Modals */
    window.openDocGenModal = () => {
        const modal = document.getElementById('modal-doc-gen');
        if (modal) {
            modal.classList.remove('hidden');
            window.switchDocTab('estimate');
            document.getElementById('doc-client-name').value = '';
            document.getElementById('doc-subject').value = document.getElementById('detail-project-name')?.textContent || '';
            document.getElementById('doc-issue-date').value = new Date().toISOString().split('T')[0];

            // Load unbilled activities and push them natively into the invoice
            const container = document.getElementById('doc-line-items-container');
            if (container) {
                container.innerHTML = '';
                // Extract pending transactions
                let pendingTxs = [];
                if (window.mockDB && window.mockDB.activities && window.currentOpenProjectId) {
                    pendingTxs = window.mockDB.activities.filter(t => t.projectId === window.currentOpenProjectId && !t.is_deleted);
                }

                if (pendingTxs.length > 0) {
                    // 1. Instantly show a skeleton loading state
                    container.innerHTML = `
                        <div class="line-item" style="opacity: 0.6; pointer-events: none;">
                            <div class="input-group">
                                <label>内容</label>
                                <input type="text" class="form-control item-name-input" value="AIが実費・人工を集計中..." disabled style="width: 100%; box-sizing: border-box; margin: 0; padding: 12px; font-size: 14px; border: 1.5px solid #cbd5e1; border-radius: 8px; background: #f8fafc; color: #64748b;">
                            </div>
                            <div class="input-group qty">
                                <label>数量</label>
                                <input type="number" class="form-control item-qty-input" value="1" disabled style="width: 100%; box-sizing: border-box; margin: 0; padding: 12px; font-size: 14px; border: 1.5px solid #cbd5e1; border-radius: 8px; text-align: center; background: #f8fafc; color: #64748b;">
                            </div>
                            <div class="input-group price" style="position: relative; width: 100%;">
                                <label>単価</label>
                                <input type="text" class="form-control item-price-input" value="0" disabled style="width: 100%; box-sizing: border-box; margin: 0; padding: 12px 24px 12px 12px; font-size: 14px; border: 1.5px solid #cbd5e1; border-radius: 8px; text-align: right; background: #f8fafc; color: #64748b;">
                                <span style="position: absolute; right: 8px; top: 38px; font-size: 12px; color: #94a3b8; pointer-events: none;">円</span>
                            </div>
                            <button type="button" class="delete-button" disabled>×</button>
                        </div>
                    `;
                    window.updateDocPreview();

                    // 2. Call AI parsing asynchronously
                    setTimeout(async () => {
                        try {
                            const industry = window.mockDB?.userConfig?.industry || 'general';
                            let parsedItems = null;

                            if (typeof window.parseReceiptRecords === 'function') {
                                parsedItems = await window.parseReceiptRecords(pendingTxs, industry);
                            }

                            container.innerHTML = ''; // Clear loading skeleton

                            if (parsedItems && parsedItems.length > 0) {
                                // Render AI Normalized Items
                                parsedItems.forEach(item => {
                                    const pName = item.item_name || '未分類項';
                                    const pPrice = parseInt(item.price || '0', 10);
                                    container.insertAdjacentHTML('beforeend', window.generateDocLineHTML(pName, pPrice, 1, true)); // isAI = true

                                    // Extreme DOM Assurance
                                    console.assert(container.lastElementChild.querySelector('input.item-name-input').value === pName, "CRITICAL ERROR: AI injected row failed to persist in DOM.");
                                });
                            } else {
                                // Fallback: Render Raw Traansactions if AI fails
                                pendingTxs.forEach(tx => {
                                    const pName = tx.title || '';
                                    const pPrice = parseInt(tx.amount || '0', 10);
                                    container.insertAdjacentHTML('beforeend', window.generateDocLineHTML(pName, pPrice, 1));
                                });
                            }
                            window.updateDocPreview();

                        } catch (err) {
                            console.error('[Document AI] Parsing failed', err);
                            // Loud Error UI (No silent fallback per CEO orders)
                            container.innerHTML = `
                                <div class="line-item" style="grid-template-columns: 1fr; margin-bottom: 24px;">
                                    <div style="background: #fef2f2; border: 2px solid #ef4444; padding: 20px; border-radius: 12px; box-shadow: 0 4px 12px rgba(239,68,68,0.15);">
                                        <h4 style="color: #ef4444; font-weight: 800; font-size: 18px; margin: 0 0 8px 0; display: grid; grid-auto-flow: column; justify-content: start; align-items: center; gap: 8px;">
                                            🚨 API Key Error
                                        </h4>
                                        <p style="color: #7f1d1d; font-size: 14px; margin: 0; line-height: 1.5; font-weight: 600;">
                                            Gemini AIとの通信に失敗しました。APIキーが設定されていないか、上限に達しています。<br>
                                            <span style="font-size: 12px; opacity: 0.8; margin-top: 8px; display: block; font-family: monospace;">Detail: ${err.message || 'Unknown Network Error'}</span>
                                        </p>
                                    </div>
                                    <button type="button" onclick="window.addDocLineItem()" style="width: 100%; padding: 14px; background: #fff; border: 1.5px solid #cbd5e1; border-radius: 12px; font-weight: 700; color: #475569; margin-top: 16px;">
                                        手動で明細を入力する
                                    </button>
                                </div>
                            `;
                            window.updateDocPreview();
                        }
                    }, 100);

                } else {
                    // Default fallback (No transactions)
                    container.innerHTML = window.generateDocLineHTML('一式', 0, 1);
                }
            }

            // Load Bank Info from History
            const savedBankInfo = localStorage.getItem('neo_bank_info');
            if (savedBankInfo) {
                const bankInput = document.getElementById('doc-bank-info');
                if (bankInput) bankInput.value = savedBankInfo;
            }

            // Initialize Focus Auto-Scroll (Ultimate Input Feel)
            if (!window.docGenFocusScrollInitialized) {
                const inputs = modal.querySelectorAll('.doc-gen-inputs input, .doc-gen-inputs textarea, .doc-gen-inputs select');
                inputs.forEach(el => {
                    el.addEventListener('focus', function () {
                        setTimeout(() => {
                            this.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 300); // Wait for mobile keyboard to appear
                    });
                });

                // Save Bank Info on change
                const bankInputEl = document.getElementById('doc-bank-info');
                if (bankInputEl) {
                    bankInputEl.addEventListener('input', (e) => {
                        localStorage.setItem('neo_bank_info', e.target.value);
                    });
                }

                window.docGenFocusScrollInitialized = true;
            }

            window.updateDocPreview();
        }
    };
    
    window.closeDocGenModal = () => {
        const modal = document.getElementById('modal-doc-gen');
        if (modal) {
            modal.classList.add('hidden');
        }
        const modalPreview = document.getElementById('modal-doc-preview');
        if (modalPreview) {
            modalPreview.classList.add('hidden');
        }
        document.body.style.overflow = '';
        if (window.switchView) window.switchView('view-dash');
    };

    