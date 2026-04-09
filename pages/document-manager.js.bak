import { generateHighFidelityPDF, generateAndUploadPDF } from '../lib/export/pdfGenerator.js';

/** Same-origin safe (works on subpath deploys; avoids broken root-relative `/views/...`). */
const DOC_GEN_HTML_URL = new URL('../views/document-gen.html', import.meta.url).href;

async function fetchDocumentGenHtml() {
    let res = await fetch(DOC_GEN_HTML_URL);
    if (res.ok) return res.text();
    const fallbackUrl = new URL('views/document-gen.html', window.location.href).href;
    res = await fetch(fallbackUrl);
    if (!res.ok) throw new Error(`document-gen.html: ${res.status}`);
    return res.text();
}

export function initDocumentGenerator() {
    // Basic Storage
    window.currentDocType = 'estimate'; // default
    window.docDbStorage = {}; // Temporary cross-tab storage
    window.projectActivities = []; // Global cache for the current modal session

    // ── 書類タイプ別データフィルター設定 ──────────────────────────────────────
    // 各書類タイプに必要なトランザクションタイプと並び順を定義
    const DOC_TYPE_FILTER = {
        estimate: {
            label:  '御見積書',
            // 見積書: 作業費・材料費・労務費（クライアントに提示する項目）
            types:  new Set(['labor', 'work', 'material', 'expense', 'income', 'revenue']),
            sortBy: 'category',
            hint:   '作業・材料費を見積に反映'
        },
        invoice: {
            label:  '御請求書',
            types:  new Set(['labor', 'work', 'material', 'expense', 'income', 'revenue']),
            sortBy: 'category',
            hint:   '作業・材料費を請求に反映'
        },
        delivery: {
            label:  '納品書',
            // 納品書: 納品した全項目（経費・労務・材料すべて）
            types:  null, // ALL
            sortBy: 'date',
            hint:   '納品した全項目を反映（日付順）'
        },
        receipt: {
            label:  '領収書',
            // 領収書: 受領した全明細
            types:  null, // ALL
            sortBy: 'date',
            hint:   '受領した全明細を反映'
        },
        expense: {
            label:  '経費精算書',
            // 経費精算書: 経費・材料費のみ（作業・労務費は除外）
            types:  new Set(['expense', 'material', 'transport', 'entertainment', 'consumable', 'communication', '雑費']),
            sortBy: 'date',
            hint:   '経費明細のみ（日付順）'
        }
    };

    window.loadActivities = async (projectId) => {
        // mockDB から .transactions (Supabase同期済み) と .activities (ローカル追加分) を両方マージして返す
        const getMockActivities = () => {
            if (!window.mockDB) return [];
            const TYPES = new Set(['expense', 'labor', 'work', 'material', 'income', 'revenue',
                                   'transport', 'entertainment', 'consumable', 'communication']);
            const txs = (window.mockDB.transactions || []).filter(t =>
                t.projectId === projectId && !t.is_deleted
            );
            const acts = (window.mockDB.activities || []).filter(t =>
                t.projectId === projectId && !t.is_deleted
            );
            // 重複除去: id が同じものは .transactions 側を優先
            const seen = new Set(txs.map(t => t.id));
            return [...txs, ...acts.filter(a => !seen.has(a.id))];
        };

        // SPA環境では mockDB を直接使用（ファイルfetchは不要）
        if (window.mockDB) return getMockActivities();

        // サーバー環境フォールバック（将来のAPI対応用）
        try {
            const response = await fetch(`./data/projects/${projectId}/activities.json`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            console.warn("[loadActivities] File fetch skipped, using mockDB:", error.message);
            return getMockActivities();
        }
    };

    // ── 書類タイプに応じたデータ読み込み・明細反映 ────────────────────────────
    // switchDocTab から初回タブ表示時に呼ばれる
    window.refreshLineItemsForDocType = async (docType) => {
        const container = document.getElementById('doc-line-items-container');
        if (!container) return;

        const config = DOC_TYPE_FILTER[docType] || DOC_TYPE_FILTER.estimate;
        const pid = window.currentOpenProjectId;

        // プロジェクトが開いていない場合はデフォルト行のみ
        if (!pid || !window.mockDB) {
            container.innerHTML = window.generateDocLineHTML('', 0, 1, false);
            window.updateDocPreview?.();
            return;
        }

        // 全トランザクション取得（マージ済み）
        const fromTxs  = (window.mockDB.transactions || []).filter(t => t.projectId === pid && !t.is_deleted);
        const fromActs = (window.mockDB.activities  || []).filter(t => t.projectId === pid && !t.is_deleted);
        const seen     = new Set(fromTxs.map(t => t.id));
        let allTxs     = [...fromTxs, ...fromActs.filter(a => !seen.has(a.id))];

        // 書類タイプ別フィルタリング
        let filteredTxs = config.types
            ? allTxs.filter(t => config.types.has(t.type) || config.types.has(t.category))
            : allTxs;

        // 並び替え
        if (config.sortBy === 'date') {
            filteredTxs = filteredTxs.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        } else {
            filteredTxs = filteredTxs.sort((a, b) => (a.category || '').localeCompare(b.category || ''));
        }

        if (filteredTxs.length === 0) {
            container.innerHTML = window.generateDocLineHTML('一式', 0, 1, false);
            window.updateDocPreview?.();
            return;
        }

        // スケルトン表示
        container.innerHTML = (window.generateDocLineHTML(`${config.hint}... データ集計中`, 0, 1, false))
            .replace('<div class="line-item"', '<div class="line-item" style="opacity:0.5;pointer-events:none;"');
        container.querySelectorAll('input').forEach(el => el.setAttribute('disabled', 'disabled'));
        window.updateDocPreview?.();

        // AI解析（非同期）
        setTimeout(async () => {
            try {
                const industry = window.mockDB?.userConfig?.industry || 'general';
                let parsedItems = null;

                if (typeof window.parseReceiptRecords === 'function') {
                    parsedItems = await window.parseReceiptRecords(filteredTxs, industry);
                }

                container.innerHTML = '';

                if (parsedItems && parsedItems.length > 0) {
                    // AI解析成功 → AIバッジ付きで挿入
                    parsedItems.forEach((item, i) => {
                        const srcTx  = filteredTxs[i] || filteredTxs[0];
                        const txDate = srcTx?.date || '';
                        container.insertAdjacentHTML('beforeend',
                            window.generateDocLineHTML(
                                item.item_name || '未分類',
                                parseInt(item.price || '0', 10),
                                parseFloat(item.qty  || '1'),
                                true,    // isAI
                                txDate   // date → data-item-date 属性
                            )
                        );
                    });
                } else {
                    // フォールバック: 生トランザクション
                    filteredTxs.forEach(tx => {
                        container.insertAdjacentHTML('beforeend',
                            window.generateDocLineHTML(
                                tx.title || tx.category || '一式',
                                parseInt(tx.amount || '0', 10),
                                1,
                                false,
                                tx.date || ''
                            )
                        );
                    });
                }
                window.updateDocPreview?.();

            } catch (err) {
                console.error('[refreshLineItemsForDocType] AI parse error:', err);
                container.innerHTML = '';
                // エラー時はフォールバック表示
                filteredTxs.forEach(tx => {
                    container.insertAdjacentHTML('beforeend',
                        window.generateDocLineHTML(
                            tx.title || tx.category || '一式',
                            parseInt(tx.amount || '0', 10),
                            1, false, tx.date || ''
                        )
                    );
                });
                window.updateDocPreview?.();
            }
        }, 80);
    };

    window.openDocGenModal = async () => {
        let modal = document.getElementById('modal-doc-gen');
        
        // Lazy load the HTML if it's not present
        if (!modal) {
            window.GlobalStore?.setLoading(true);
            try {
                const htmlText = await fetchDocumentGenHtml();
                const container = document.getElementById('router-modal-doc-gen') || document.body;
                container.insertAdjacentHTML('beforeend', htmlText);
                modal = document.getElementById('modal-doc-gen');
            } catch (e) {
                console.error("Lazy load doc gen failed:", e);
                window.GlobalStore?.setLoading(false);
                if (window.showNeoToast) {
                    window.showNeoToast('error', '書類エディタの読み込みに失敗しました。ページを再読み込みしてください。');
                } else {
                    alert('書類エディタの読み込みに失敗しました。ネットワークとURLを確認してください。');
                }
                return;
            }
            window.GlobalStore?.setLoading(false);
        }

        if (modal) {
            // Lock body scroll
            document.body.style.overflow = 'hidden';

            modal.classList.remove('hidden');
            // switchView → closeAllNeoOverlays が付与した display:none / opacity:0 を残すと再表示されない
            modal.style.display = 'block';
            modal.style.opacity = '1';
            modal.style.visibility = 'visible';
            window.switchDocTab('estimate');
            const clientInput = document.getElementById('doc-client-name');
            if (clientInput) clientInput.value = '';
            
            const detailProjName = document.getElementById('detail-project-name')?.textContent;
            const subjectInput = document.getElementById('doc-subject');
            if (subjectInput) subjectInput.value = detailProjName || '';
            
            const issueDateInput = document.getElementById('doc-issue-date');
            if (issueDateInput) issueDateInput.value = new Date().toISOString().split('T')[0];

            // Load unbilled activities and push them natively into the invoice
            const container = document.getElementById('doc-line-items-container');
            if (container) {
                container.innerHTML = '';
                // Extract pending transactions (.transactions = Supabase同期済み, .activities = ローカル追加分)
                let pendingTxs = [];
                if (window.mockDB && window.currentOpenProjectId) {
                    const pid = window.currentOpenProjectId;
                    const fromTxs  = (window.mockDB.transactions || []).filter(t => t.projectId === pid && !t.is_deleted);
                    const fromActs = (window.mockDB.activities  || []).filter(t => t.projectId === pid && !t.is_deleted);
                    const seen = new Set(fromTxs.map(t => t.id));
                    pendingTxs = [...fromTxs, ...fromActs.filter(a => !seen.has(a.id))];
                }

                if (pendingTxs.length > 0) {
                    // 1. スケルトンローディング行（.line-item グリッドを使う正規行として描画）
                    container.innerHTML = window.generateDocLineHTML('AIが実費・人工を集計中...', 0, 1, false)
                        .replace('<div class="line-item">', '<div class="line-item" style="opacity:0.55;pointer-events:none;">');
                    container.querySelectorAll('input').forEach(el => el.setAttribute('disabled', 'disabled'));
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
                                    const pQty = parseFloat(item.qty || '1');
                                    container.insertAdjacentHTML('beforeend', window.generateDocLineHTML(pName, pPrice, pQty, true)); // isAI = true
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
                            // エラーUIは .line-item クラスを使わない（グリッド崩れ防止）
                            container.innerHTML = `
                                <div style="padding: 16px 12px; margin-bottom: 8px;">
                                    <div style="background: #fef2f2; border: 1.5px solid #fca5a5; padding: 16px; border-radius: 12px; box-shadow: 0 2px 8px rgba(239,68,68,0.10);">
                                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                                            <span style="font-size:16px;">🚨</span>
                                            <span style="color:#ef4444; font-weight:800; font-size:15px;">AI集計エラー</span>
                                        </div>
                                        <p style="color:#7f1d1d; font-size:13px; margin:0; line-height:1.6;">
                                            Gemini AIとの通信に失敗しました。APIキーが未設定か上限に達している可能性があります。<br>
                                            <span style="font-size:11px; opacity:0.7; font-family:monospace; display:block; margin-top:6px;">${err.message || 'Unknown error'}</span>
                                        </p>
                                    </div>
                                    <button type="button" onclick="window.addDocLineItem()" style="width:100%; margin-top:12px; padding:12px; background:#fff; border:1.5px solid #e2e8f0; border-radius:10px; font-weight:700; font-size:14px; color:#6366f1; cursor:pointer;">
                                        ＋ 手動で明細を入力する
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

            // Load Company Info (persistent across sessions)
            const _setVal = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
            _setVal('doc-company-name',    localStorage.getItem('neo_company_name')    || '');
            _setVal('doc-company-address', localStorage.getItem('neo_company_address') || '');
            _setVal('doc-company-tel',     localStorage.getItem('neo_company_tel')     || '');

            // Render seal list (multi-seal manager)
            if (window.renderSealList) window.renderSealList();

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

    /** プレビュー: closeAllNeoOverlays が付けた display/opacity を外さないと表示されない */
    window.openDocGenPreview = () => {
        const preview = document.getElementById('modal-doc-preview');
        if (!preview) {
            console.warn('[Neo] modal-doc-preview not in DOM');
            if (window.showNeoToast) {
                window.showNeoToast('error', 'プレビューを開けません。プロジェクト一覧を一度開いてからお試しください。');
            } else {
                alert('プレビューを開けませんでした。プロジェクト一覧を一度表示してからお試しください。');
            }
            return;
        }
        try {
            if (typeof window.updateDocPreview === 'function') window.updateDocPreview();
        } catch (e) {
            console.error('[openDocGenPreview] updateDocPreview', e);
        }
        preview.classList.remove('hidden');
        preview.style.display = 'block';
        preview.style.opacity = '1';
        preview.style.visibility = 'visible';
        if (typeof window.setupDocPreviewZoom === 'function') window.setupDocPreviewZoom();
        if (window.lucide) window.lucide.createIcons();
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

    window.saveDocument = async () => {
        window.GlobalStore?.setLoading(true);
        if (window.showNeoToast) window.showNeoToast('info', 'PDFを生成中...');

        let subtotal = 0;
        document.querySelectorAll('.item-price-input').forEach(el => subtotal += parseInt(el.value || '0', 10));

        const data = {
            client: document.getElementById('doc-client-name')?.value || '',
            subject: document.getElementById('doc-subject')?.value || '',
            itemPrice: subtotal
        };
        window.docDbStorage[window.currentDocType] = data;

        const totalStr = document.getElementById('preview-grand-total')?.textContent || '¥0';
        
        try {
            // 1. Get the target HTML element defining the A4 layout
            const element = document.getElementById('doc-preview-paper');
            if (!element) throw new Error("Preview layout element not found.");

            // 2. Define dynamic filename
            const docTypeName = window.currentDocType === 'estimate' ? '見積書' : (window.currentDocType === 'invoice' ? '請求書' : '領収書');
            const clientName = document.getElementById('doc-client-name')?.value || 'Guest';
            const dateStr = new Date().toISOString().split('T')[0];
            const filename = `Neo_${docTypeName}_${clientName}_${dateStr}.pdf`;

            // 3. Generate High-Fidelity PDF and prompt download locally
            const pdfBlob = await generateHighFidelityPDF(element, filename, true);

            // Local download only. Drive upload is now delegated to saveToDriveOnly()

            window.GlobalStore?.setLoading(false);
            
            let msg = `ドキュメント（${docTypeName}）を保存・ダウンロードしました！`;
            if (window.currentDocType === 'estimate') {
                msg += `\n将来的に「請求書」タブを開くと、この内容(${totalStr})が自動で引き継がれます。`;
            }
            if (window.showNeoToast) {
                window.showNeoToast('success', msg);
            } else {
                alert(msg);
            }
            
            window.closeDocGenModal();
        } catch (e) {
            window.GlobalStore?.setLoading(false);
            console.error("Document Generation Error:", e);
            if (window.showNeoToast) {
                window.showNeoToast('error', 'PDFの作成に失敗しました。');
            } else {
                alert('PDF作成エラーが発生しました。');
            }
        }
    };

    window.saveToDriveOnly = async () => {
        const token = localStorage.getItem('neo_cloud_token');
        const expiry = parseInt(localStorage.getItem('neo_token_expiry') || '0', 10);
        
        // Contextual JIT Auth check
        if (!token || expiry < Date.now()) {
            if (window.showNeoToast) window.showNeoToast('info', 'Google Drive初回連携を開きます（ポップアップを許可してください）');
            
            // Override the global initGIS with a specific callback to automatically resume the upload
            if (window.NeoCloudSync && window.NeoCloudSync.initGIS) {
                window.NeoCloudSync.initGIS(async (newToken) => {
                    await _executeDriveUpload();
                });
                window.NeoCloudSync.requestDriveAccess();
            } else {
                alert("Google Drive モジュールがロードされていません");
            }
            return;
        }

        // Already auth'd
        await _executeDriveUpload();
    };

    async function _executeDriveUpload() {
        window.GlobalStore?.setLoading(true);
        if (window.showNeoToast) window.showNeoToast('info', 'Google Driveへ保存中...');
        
        const element = document.getElementById('doc-preview-paper');
        const docTypeName = window.currentDocType === 'estimate' ? '見積書' : (window.currentDocType === 'invoice' ? '請求書' : '領収書');
        const clientName = document.getElementById('doc-client-name')?.value || 'Guest';
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `Neo_${docTypeName}_${clientName}_${dateStr}.pdf`;

        const _docMeta = {
            docType:    window.currentDocType || null,
            projectId:  window.currentOpenProjectId || null,
            clientName: clientName,
        };

        try {
            const url = await generateAndUploadPDF(element, filename, _docMeta);
            if (url) {
                if (window.showNeoToast) window.showNeoToast('success', 'Google Drive に保存しました ☁');
            }
        } catch (e) {
            console.error("Drive Upload Error:", e);
            if(window.showNeoToast) window.showNeoToast('error', 'Drive接続を確認してください');
        }
        window.GlobalStore?.setLoading(false);
    }
}

// ── 発行者情報・社判（複数対応）グローバルハンドラー ─────────────────────────

window.saveCompanyInfo = function() {
    const name    = document.getElementById('doc-company-name')?.value    || '';
    const address = document.getElementById('doc-company-address')?.value || '';
    const tel     = document.getElementById('doc-company-tel')?.value     || '';
    localStorage.setItem('neo_company_name',    name);
    localStorage.setItem('neo_company_address', address);
    localStorage.setItem('neo_company_tel',     tel);
    if (window.updateDocPreview) window.updateDocPreview();
};

// ── Seal helpers ──────────────────────────────────────────────────────────────
const _SEAL_KEY = 'neo_company_seals';
const _loadSeals = () => {
    try { return JSON.parse(localStorage.getItem(_SEAL_KEY) || '[]'); }
    catch(e) { return []; }
};
const _saveSeals = (seals) => {
    localStorage.setItem(_SEAL_KEY, JSON.stringify(seals));
};
const _sealSizeLabel = { 40:'S', 58:'M', 76:'L', 96:'XL' };
const _posLabel = { 'header':'右上（ヘッダー）', 'total':'合計欄横', 'bottom':'書類下部' };

window.renderSealList = function() {
    const list = document.getElementById('doc-seal-list');
    const addBtn = document.getElementById('doc-seal-add-btn');
    if (!list) return;
    const seals = _loadSeals();
    list.innerHTML = '';

    seals.forEach(seal => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 12px;background:#fafafa;border:1px solid #e2e8f0;border-radius:10px;';
        row.innerHTML = `
            <img src="${seal.dataURL}" style="width:44px;height:44px;flex-shrink:0;object-fit:contain;border-radius:50%;border:1.5px solid rgba(180,0,0,0.28);opacity:0.85;">
            <div style="flex:1;display:flex;flex-direction:column;gap:5px;min-width:0;">
                <input type="text" value="${seal.label || ''}" placeholder="名称（例: 社印）"
                    oninput="window.updateSeal('${seal.id}','label',this.value)"
                    style="width:100%;padding:4px 8px;font-size:12px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;box-sizing:border-box;">
                <div style="display:flex;gap:6px;">
                    <select onchange="window.updateSeal('${seal.id}','size',parseInt(this.value))"
                        style="flex:1;padding:4px 6px;font-size:12px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;">
                        ${[40,58,76,96].map(v => `<option value="${v}"${seal.size===v?' selected':''}>${_sealSizeLabel[v]}</option>`).join('')}
                    </select>
                    <select onchange="window.updateSeal('${seal.id}','position',this.value)"
                        style="flex:2;padding:4px 6px;font-size:12px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;">
                        ${Object.entries(_posLabel).map(([v,l]) => `<option value="${v}"${seal.position===v?' selected':''}>${l}</option>`).join('')}
                    </select>
                </div>
            </div>
            <button type="button" onclick="window.deleteSeal('${seal.id}')"
                style="flex-shrink:0;width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:#fee2e2;border:none;border-radius:6px;color:#ef4444;font-size:14px;cursor:pointer;font-weight:700;">✕</button>
        `;
        list.appendChild(row);
    });

    // 3枚以上は追加ボタンを隠す
    if (addBtn) addBtn.style.display = seals.length >= 3 ? 'none' : 'flex';
};

window.handleSealUpload = function(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const seals = _loadSeals();
    if (seals.length >= 3) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        seals.push({
            id: 'seal_' + Date.now(),
            label: ['社印','代表者印','担当者印'][seals.length] || '印',
            dataURL: e.target.result,
            size: 58,
            position: 'header'
        });
        _saveSeals(seals);
        // reset input so same file can be re-selected
        event.target.value = '';
        window.renderSealList();
        if (window.updateDocPreview) window.updateDocPreview();
    };
    reader.readAsDataURL(file);
};

window.updateSeal = function(id, field, value) {
    const seals = _loadSeals();
    const seal = seals.find(s => s.id === id);
    if (!seal) return;
    seal[field] = value;
    _saveSeals(seals);
    if (window.updateDocPreview) window.updateDocPreview();
};

window.deleteSeal = function(id) {
    const seals = _loadSeals().filter(s => s.id !== id);
    _saveSeals(seals);
    window.renderSealList();
    if (window.updateDocPreview) window.updateDocPreview();
};

// legacy clearSeal kept for safety
window.clearSeal = function() {
    _saveSeals([]);
    window.renderSealList();
    if (window.updateDocPreview) window.updateDocPreview();
};
