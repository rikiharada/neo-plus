export function initDocumentGenerator() {
    // Basic Storage
    window.currentDocType = 'estimate'; // default
    window.docDbStorage = {}; // Temporary cross-tab storage
    window.projectActivities = []; // Global cache for the current modal session

    window.loadActivities = async (projectId) => {
        try {
            // OS共通の相対パスを使用
            const response = await fetch(`./data/projects/${projectId}/activities.json`);
            if (!response.ok) throw new Error('Network response was not ok');
            return await response.json();
        } catch (error) {
            console.error("Activity fetch error (fallback to mockDB):", error);
            // エラー時はフォールバックとしてローカルモックから返して後続の処理を止めない
            if (window.mockDB && window.mockDB.transactions) {
                return window.mockDB.transactions.filter(t =>
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
                if (window.mockDB && window.mockDB.transactions && window.currentOpenProjectId) {
                    pendingTxs = window.mockDB.transactions.filter(t => t.projectId === window.currentOpenProjectId && !t.is_deleted);
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
                                });
                            } else {
                                // Fallback: Render Raw Transactions if AI fails
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

            // Render Activity Reference Data (Contextual Data Bridge)
            const actSec = document.getElementById('activity-reference-section');
            const actList = document.getElementById('activity-reference-list');
            const actToggleBtn = document.getElementById('import-activity-btn');

            // Always hide section by default when opening
            if (actSec) actSec.style.display = 'none';

            if (actList && actToggleBtn && window.currentOpenProjectId) {
                // Fetch recent expenses/labor for this project
                loadActivities(window.currentOpenProjectId).then(acts => {
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
                });
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
    };

    window.saveDocument = () => {
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

        if (window.currentDocType === 'estimate') {
            msg += `\n将来的に「請求書」タブを開くと、この内容(${totalStr})が自動で引き継がれます。`;
        }

        alert(msg);
        window.closeDocGenModal();
    };
}
