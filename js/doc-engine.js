/**
 * Neo+ Document Rendering Engine (doc-engine.js)
 * Isolates strictly formatted A4 document generation (Estimate, Invoice, Receipt, etc.).
 * Strictly adheres to the 11px Monotone CEO Layout standard.
 */

window._neoDocMemory = window._neoDocMemory || {};

window.switchDocTab = (type) => {
    // SAVE CURRENT STATE BEFORE SWITCHING (Strict Isolation)
    if (window.currentDocType) {
        window._neoDocMemory[window.currentDocType] = {
            client: document.getElementById('doc-client-name')?.value || '',
            issueDate: document.getElementById('doc-issue-date')?.value || '',
            deadline: document.getElementById('doc-deadline-date')?.value || '',
            subject: document.getElementById('doc-subject')?.value || '',
            receiptMemo: document.getElementById('doc-receipt-memo')?.value || '',
            paymentMethod: document.getElementById('doc-payment-method')?.value || 'cash',
            bankInfo: document.getElementById('doc-bank-info')?.value || '',
            itemsHTML: document.getElementById('doc-line-items-container')?.innerHTML || ''
        };
    }

    window.currentDocType = type;
    
    // Reset tab styling
    ['estimate', 'invoice', 'delivery', 'receipt', 'expense'].forEach(t => {
        const btn = document.getElementById('tab-doc-' + t);
        if (btn) {
            if (t === type) {
                btn.style.background = '#fff';
                btn.style.color = 'var(--text-main)';
                btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
            } else {
                btn.style.background = 'transparent';
                btn.style.color = 'var(--text-muted)';
                btn.style.boxShadow = 'none';
            }
        }
    });

    // Update Labels based on type
    const tTitle = document.getElementById('preview-doc-title');
    const tDeadlineLabel = document.getElementById('doc-deadline-label');
    if (tTitle && tDeadlineLabel) {
        if (type === 'estimate') {
            tTitle.textContent = '御見積書';
            tDeadlineLabel.textContent = '有効期限';
        } else if (type === 'invoice') {
            tTitle.textContent = '御請求書';
            tDeadlineLabel.textContent = 'お支払期限';
        } else if (type === 'delivery') {
            tTitle.textContent = '納品書';
            tDeadlineLabel.textContent = '(なし)';
        } else if (type === 'receipt') {
            tTitle.textContent = '領収書';
            tDeadlineLabel.textContent = '(なし)';
        } else if (type === 'expense') {
            tTitle.textContent = '経費精算書';
            tDeadlineLabel.textContent = '(なし)';
        }
    }

    // --- RESTORE ISOLATED STATE ---
    const mem = window._neoDocMemory[type];
    if (mem) {
        if (document.getElementById('doc-client-name')) document.getElementById('doc-client-name').value = mem.client;
        if (document.getElementById('doc-issue-date')) document.getElementById('doc-issue-date').value = mem.issueDate;
        if (document.getElementById('doc-deadline-date')) document.getElementById('doc-deadline-date').value = mem.deadline;
        if (document.getElementById('doc-subject')) document.getElementById('doc-subject').value = mem.subject;
        if (document.getElementById('doc-receipt-memo')) document.getElementById('doc-receipt-memo').value = mem.receiptMemo;
        if (document.getElementById('doc-payment-method')) document.getElementById('doc-payment-method').value = mem.paymentMethod;
        if (document.getElementById('doc-bank-info')) document.getElementById('doc-bank-info').value = mem.bankInfo;
        if (document.getElementById('doc-line-items-container') && mem.itemsHTML) {
            document.getElementById('doc-line-items-container').innerHTML = mem.itemsHTML;
        }
    } else {
        // First time opening this specific tab: clear fields completely to ensure ZERO BLEEDING
        if (document.getElementById('doc-client-name')) document.getElementById('doc-client-name').value = '';
        if (document.getElementById('doc-subject')) document.getElementById('doc-subject').value = document.getElementById('detail-project-name')?.textContent || '';
        if (document.getElementById('doc-issue-date')) document.getElementById('doc-issue-date').value = new Date().toISOString().split('T')[0];
        if (document.getElementById('doc-deadline-date')) document.getElementById('doc-deadline-date').value = '';
        if (document.getElementById('doc-receipt-memo')) document.getElementById('doc-receipt-memo').value = '';
        
        // Reset items to default 1 row
        const container = document.getElementById('doc-line-items-container');
        if(container) {
            container.innerHTML = '';
            container.insertAdjacentHTML('beforeend', window.generateDocLineHTML('', 0, 1, false));
        }
    }

    // Toggle visibility of conditional inputs
    const deadlineContainer = document.getElementById('doc-deadline-container');
    const bankInputs = document.getElementById('doc-bank-inputs');
    const receiptInputs = document.getElementById('doc-receipt-inputs');

    if (deadlineContainer) {
        deadlineContainer.style.visibility = (type === 'estimate' || type === 'invoice') ? 'visible' : 'hidden';
        if (deadlineContainer.style.visibility === 'hidden') {
            document.getElementById('doc-deadline-date').value = '';
        }
    }
    if (bankInputs) {
        bankInputs.style.display = (type === 'invoice') ? 'block' : 'none';
    }
    if (receiptInputs) {
        receiptInputs.style.display = (type === 'receipt') ? 'block' : 'none';
    }

    window.updateDocPreview();
};

window.updateDocPreview = () => {
    // Collect Inputs
    const client = document.getElementById('doc-client-name')?.value || '株式会社〇〇 御中';
    const dateInputStr = document.getElementById('doc-issue-date')?.value || new Date().toISOString().split('T')[0];
    let deadlineInputStr = document.getElementById('doc-deadline-date')?.value || '';
    const subject = document.getElementById('doc-subject')?.value || '〇〇工事一式として';
    const itemName = document.getElementById('doc-item-name')?.value || '作業代行費';
    const itemPrice = parseInt(document.getElementById('doc-item-price')?.value || '0', 10);

    // Context specific reads
    const receiptMemo = document.getElementById('doc-receipt-memo')?.value || 'お品代として';
    const paymentMethodEl = document.getElementById('doc-payment-method');
    const paymentMethodStr = paymentMethodEl ? paymentMethodEl.options[paymentMethodEl.selectedIndex].text : '';
    const bankInfo = document.getElementById('doc-bank-info')?.value || '〇〇銀行 〇〇支店\n普通 1234567\nカ）ネオプラス';
    const taxRateElement = document.getElementById('doc-tax-rate');
    const taxRate = taxRateElement ? parseFloat(taxRateElement.value) : 0.1;

    // Auto-Expiration for Estimate
    if (window.currentDocType === 'estimate' && !deadlineInputStr && dateInputStr) {
        const issueDate = new Date(dateInputStr);
        issueDate.setMonth(issueDate.getMonth() + 1); // +1 Month
        deadlineInputStr = issueDate.toISOString().split('T')[0];
        const deadlineEl = document.getElementById('doc-deadline-date');
        if (deadlineEl) deadlineEl.value = deadlineInputStr;
    }

    // Item Logic (Dynamic Multi-Row)
    const fmt = new Intl.NumberFormat('ja-JP');
    const itemRows = document.querySelectorAll('#doc-items-container .line-item, #doc-line-items-container .line-item');
    let linesHTML = '';
    let subTotal = 0;
    const items = [];

    itemRows.forEach(row => {
        const name = row.querySelector('.item-name-input').value || '作業代行費';
        const price = parseInt(row.querySelector('.item-price-input').value || '0', 10);
        const qtyInput = row.querySelector('.item-qty-input');
        const qty = qtyInput ? parseInt(qtyInput.value || '1', 10) : 1;
        const lineTotal = price * qty;
        subTotal += lineTotal;
        items.push({ name, price, qty });

        const isEstimate = window.currentDocType === 'estimate';
        const tdStyle = isEstimate 
            ? 'padding: 2px 4px; font-size: 11px !important; color: #333; border-bottom: 1px solid #999;'
            : 'padding: 15px; font-size: 16px; color: #000; border-bottom: 1px solid #ccc;';
        const tdStyleRight = isEstimate
            ? 'padding: 2px 4px; font-size: 11px !important; color: #333; text-align: right; border-bottom: 1px solid #999;'
            : 'padding: 15px; font-size: 16px; color: #000; text-align: right; border-bottom: 1px solid #ccc;';

        linesHTML += `
            <tr>
                <td style="${tdStyle}">${name}</td>
                <td style="${tdStyleRight}">${qty}</td>
                <td style="${tdStyleRight}">¥${fmt.format(price)}</td>
                <td style="${tdStyleRight}">¥${fmt.format(lineTotal)}</td>
            </tr>
        `;
    });

    // Calc Defaults
    const tax = Math.floor(subTotal * taxRate);
    const total = subTotal + tax;

    // NEW: Intercept Estimate Rendering Completely
    const docPaperContainer = document.getElementById('doc-preview-paper');
    if (docPaperContainer && !window.defaultGenericTemplateHTML) {
        // Save the generic HTML the very first time (it has all the IDs for other docs)
        window.defaultGenericTemplateHTML = docPaperContainer.innerHTML;
    }

    if (window.currentDocType === 'estimate') {
        const estimate_dateStr = dateInputStr.replace(/-/g, '/');
        const estimate_docNo = 'EST-' + dateInputStr.replace(/-/g, '') + '-01';

        if (docPaperContainer) {
            docPaperContainer.innerHTML = ''; // EXPLICIT DOM CLEARING
            docPaperContainer.innerHTML = `
    <div id="neo-v3-estimate">
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
                <td colspan="2" style="text-align: center; padding-bottom: 30px;">
                    <span id="preview-doc-title" style="font-size: 18px !important; font-weight: bold; letter-spacing: 2px; color: #000;">御見積書</span>
                </td>
            </tr>
            <tr>
                <td style="width: 60%; vertical-align: top; padding-bottom: 10px;">
                    <div id="preview-client-name" style="font-size: 14px !important; font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 4px; display: inline-block; min-width: 80%; color: #000;">${client}</div>
                </td>
                <td style="width: 40%; vertical-align: top; text-align: right; font-size: 11px !important; padding-bottom: 10px; color: #333;">
                    <div id="preview-doc-date" style="font-size: 11px !important;">発行日: ${estimate_dateStr}</div>
                    <div id="preview-doc-no" style="font-size: 11px !important;">No: ${estimate_docNo}</div>
                </td>
            </tr>
            <tr>
                <td style="width: 60%; vertical-align: top; color: #333;">
                    <div style="font-size: 11px !important; margin-bottom: 15px;">下記の通り御見積申し上げます。</div>
                    <div style="margin-bottom: 5px;">
                        <span style="font-size: 11px !important; margin-right: 10px;">件名:</span>
                        <span id="preview-subject" style="font-size: 12px !important; font-weight: bold; border-bottom: 1px solid #ccc; padding-bottom: 2px; display: inline-block; min-width: 60%; color: #000;">${subject}</span>
                    </div>
                    <div id="preview-receipt-memo" style="font-size: 11px !important; color: #333;">但し書き: <span id="preview-memo-text">${receiptMemo}</span></div>
                </td>
                <td style="width: 40%; vertical-align: top; text-align: right; font-size: 11px !important; line-height: 1.6; color: #333;">
                    <div style="font-size: 12px !important; font-weight: bold; margin-bottom: 5px; color: #000;">あなたの会社名</div>
                    <div style="font-size: 11px !important;">〒106-0032</div>
                    <div style="font-size: 11px !important;">東京都港区六本木1-1-1</div>
                    <div style="font-size: 11px !important;">TEL: 03-1234-5678</div>
                    <div id="preview-bank-info" style="margin-top: 10px; white-space: pre-line; font-size: 11px !important;">${bankInfo}</div>
                </td>
            </tr>
        </table>
        <div style="margin-bottom: 20px;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 11px !important;">
                <thead>
                    <tr style="background-color: #f8f9fa; border-top: 2px solid #000; border-bottom: 1px solid #000;">
                        <th style="padding: 2px 4px; font-weight: normal; color: #333; font-size: 11px !important;">内容・品名</th>
                        <th style="padding: 2px 4px; font-weight: normal; text-align: right; width: 15%; color: #333; font-size: 11px !important;">数量</th>
                        <th style="padding: 2px 4px; font-weight: normal; text-align: right; width: 20%; color: #333; font-size: 11px !important;">単価</th>
                        <th style="padding: 2px 4px; font-weight: normal; text-align: right; width: 20%; color: #333; font-size: 11px !important;">金額</th>
                    </tr>
                </thead>
                <tbody id="preview-items-container">
                    ${linesHTML}
                </tbody>
            </table>
            <div style="border-bottom: 2px solid #333; margin-bottom: 15px;"></div>
        </div>
        <table style="width: 100%; border-collapse: collapse;">
            <tr>
                <td style="width: 60%;"></td>
                <td style="width: 40%; vertical-align: bottom;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 2px 4px; font-size: 11px !important; color: #666; width: 50%;">小計</td>
                            <td id="preview-subtotal" style="padding: 2px 4px; font-size: 11px !important; color: #333; text-align: right; width: 50%;">¥${fmt.format(subTotal)}</td>
                        </tr>
                        <tr>
                            <td id="preview-tax-label" style="padding: 2px 4px; font-size: 11px !important; color: #666; width: 50%;">消費税 (10%)</td>
                            <td id="preview-tax" style="padding: 2px 4px; font-size: 11px !important; color: #333; text-align: right; width: 50%;">¥${fmt.format(tax)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 4px; font-size: 12px !important; font-weight: bold; color: #000; border-top: 1px solid #666; width: 50%;">合計金額</td>
                            <td id="preview-grand-total" style="padding: 6px 4px; font-size: 16px !important; font-weight: bold; color: #000; text-align: right; border-top: 1px solid #666; width: 50%;">¥${fmt.format(total)}</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
        <div style="position: absolute; bottom: 30px; left: 30px; margin: 0; padding: 0;">
            <table style="border-collapse: collapse;">
                <tr>
                    <td style="width: 60px; vertical-align: bottom;">
                        <img id="preview-qr-code" src="" style="width: 50px; height: 50px; display: block;" alt="QR">
                    </td>
                    <td style="vertical-align: bottom; font-size: 9px !important; color: #666; padding-bottom: 2px; line-height: 1.2;">
                        このQRコードをカメラで読み取ると、<br>本書類をデジタル保存できます。
                    </td>
                </tr>
            </table>
        </div>
    </div>
            `;
        }
        // Update tiny UI
        document.getElementById('doc-tax-calc').textContent = `¥${fmt.format(tax)}`;
        document.getElementById('doc-total-calc').textContent = `¥${fmt.format(total)}`;
        return; // EXIT EARLY
    } else if (window.currentDocType === 'invoice') {
        const invoice_dateStr = dateInputStr.replace(/-/g, '/');
        const invoice_deadlineStr = deadlineInputStr ? deadlineInputStr.replace(/-/g, '/') : '';
        const invoice_docNo = 'INV-' + dateInputStr.replace(/-/g, '') + '-01';

        if (docPaperContainer) {
            docPaperContainer.innerHTML = ''; // EXPLICIT DOM CLEARING
            docPaperContainer.innerHTML = `
    <div id="neo-v3-estimate">
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
                <td colspan="2" style="text-align: center; padding-bottom: 30px;">
                    <span id="preview-doc-title" style="font-size: 18px !important; font-weight: bold; letter-spacing: 2px; color: #000;">御請求書</span>
                </td>
            </tr>
            <tr>
                <td style="width: 60%; vertical-align: top; padding-bottom: 10px;">
                    <div id="preview-client-name" style="font-size: 14px !important; font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 4px; display: inline-block; min-width: 80%; color: #000;">${client}</div>
                </td>
                <td style="width: 40%; vertical-align: top; text-align: right; font-size: 11px !important; padding-bottom: 10px; color: #333;">
                    <div id="preview-doc-date" style="font-size: 11px !important;">請求日: ${invoice_dateStr}</div>
                    <div id="preview-doc-no" style="font-size: 11px !important;">No: ${invoice_docNo}</div>
                </td>
            </tr>
            <tr>
                <td style="width: 60%; vertical-align: top; color: #333;">
                    <div style="font-size: 11px !important; margin-bottom: 15px;">下記の通り御請求申し上げます。</div>
                    <div style="margin-bottom: 5px;">
                        <span style="font-size: 11px !important; margin-right: 10px;">件名:</span>
                        <span id="preview-subject" style="font-size: 12px !important; font-weight: bold; border-bottom: 1px solid #ccc; padding-bottom: 2px; display: inline-block; min-width: 60%; color: #000;">${subject}</span>
                    </div>
                    <div style="font-size: 11px !important; margin-bottom: 5px; color: #333;">お支払期限: <span style="font-weight: bold; color: #000;">${invoice_deadlineStr || '末日'}</span></div>
                </td>
                <td style="width: 40%; vertical-align: top; text-align: right; font-size: 11px !important; line-height: 1.6; color: #333;">
                    <div style="font-size: 12px !important; font-weight: bold; margin-bottom: 5px; color: #000;">あなたの会社名</div>
                    <div style="font-size: 11px !important;">〒106-0032</div>
                    <div style="font-size: 11px !important;">東京都港区六本木1-1-1</div>
                    <div style="font-size: 11px !important;">TEL: 03-1234-5678</div>
                    <div id="preview-bank-info" style="margin-top: 10px; white-space: pre-line; font-size: 11px !important; text-align: right;">${bankInfo}</div>
                </td>
            </tr>
        </table>
        <div style="margin-bottom: 20px;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 11px !important;">
                <thead>
                    <tr style="background-color: #f8f9fa; border-top: 2px solid #000; border-bottom: 1px solid #000;">
                        <th style="padding: 2px 4px; font-weight: normal; color: #333; font-size: 11px !important;">内容・品名</th>
                        <th style="padding: 2px 4px; font-weight: normal; text-align: right; width: 15%; color: #333; font-size: 11px !important;">数量</th>
                        <th style="padding: 2px 4px; font-weight: normal; text-align: right; width: 20%; color: #333; font-size: 11px !important;">単価</th>
                        <th style="padding: 2px 4px; font-weight: normal; text-align: right; width: 20%; color: #333; font-size: 11px !important;">金額</th>
                    </tr>
                </thead>
                <tbody id="preview-items-container">
                    ${linesHTML}
                </tbody>
            </table>
            <div style="border-bottom: 2px solid #333; margin-bottom: 15px;"></div>
        </div>
        <table style="width: 100%; border-collapse: collapse;">
            <tr>
                <td style="width: 60%;"></td>
                <td style="width: 40%; vertical-align: bottom;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 2px 4px; font-size: 11px !important; color: #666; width: 50%;">小計</td>
                            <td id="preview-subtotal" style="padding: 2px 4px; font-size: 11px !important; color: #333; text-align: right; width: 50%;">¥${fmt.format(subTotal)}</td>
                        </tr>
                        <tr>
                            <td id="preview-tax-label" style="padding: 2px 4px; font-size: 11px !important; color: #666; width: 50%;">消費税 (10%)</td>
                            <td id="preview-tax" style="padding: 2px 4px; font-size: 11px !important; color: #333; text-align: right; width: 50%;">¥${fmt.format(tax)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 4px; font-size: 12px !important; font-weight: bold; color: #000; border-top: 1px solid #666; width: 50%;">ご請求金額</td>
                            <td id="preview-grand-total" style="padding: 6px 4px; font-size: 16px !important; font-weight: bold; color: #000; text-align: right; border-top: 1px solid #666; width: 50%;">¥${fmt.format(total)}</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
        <div style="position: absolute; bottom: 30px; left: 30px; margin: 0; padding: 0;">
            <table style="border-collapse: collapse;">
                <tr>
                    <td style="width: 60px; vertical-align: bottom;">
                        <img id="preview-qr-code" src="" style="width: 50px; height: 50px; display: block;" alt="QR">
                    </td>
                    <td style="vertical-align: bottom; font-size: 9px !important; color: #666; padding-bottom: 2px; line-height: 1.2;">
                        このQRコードをカメラで読み取ると、<br>本書類をデジタル保存できます。
                    </td>
                </tr>
            </table>
        </div>
    </div>
            `;
        }
        // Update tiny UI
        document.getElementById('doc-tax-calc').textContent = `¥${fmt.format(tax)}`;
        document.getElementById('doc-total-calc').textContent = `¥${fmt.format(total)}`;
        return; // EXIT EARLY
    } else if (docPaperContainer && window.defaultGenericTemplateHTML) {
        // Restore generic template structure for Invoice/Delivery/Receipt if we are switching away from Estimate
        if (docPaperContainer.querySelector('#neo-v3-estimate')) {
            docPaperContainer.innerHTML = window.defaultGenericTemplateHTML;
        }
    }

    // --- Generic Fallback Updates ---
    const previewContainer = document.getElementById('preview-items-container');
    if (previewContainer) {
        previewContainer.innerHTML = linesHTML;
    }

    // Update tiny UI
    document.getElementById('doc-tax-calc').textContent = `¥${fmt.format(tax)}`;
    document.getElementById('doc-total-calc').textContent = `¥${fmt.format(total)}`;

    // Update Tax Label dynamically
    const pTaxLabel = document.getElementById('preview-tax-label');
    if (pTaxLabel) {
        let taxStr = '10%';
        if (taxRate === 0.08) taxStr = '8%';
        if (taxRate === 0) taxStr = '0%';
        pTaxLabel.textContent = `消費税 (${taxStr})`;
    }

    // --- Company Stamp Overlay Logic for Manual Doc Generator ---
    const stampOverlay = document.getElementById('invoice-stamp-overlay');
    const savedStamp = localStorage.getItem('neo_company_stamp_data');
    
    if (stampOverlay && savedStamp) {
        const scale = localStorage.getItem('neo_company_stamp_scale') || "1.0";
        const x = localStorage.getItem('neo_company_stamp_x') || "0";
        const y = localStorage.getItem('neo_company_stamp_y') || "0";
        
        stampOverlay.src = savedStamp;
        stampOverlay.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
        stampOverlay.style.display = 'block';
        
        const companyInfoArea = document.getElementById('invoice-company-info-area');
        if (companyInfoArea) {
            companyInfoArea.style.minHeight = '120px';
        }
    } else if (stampOverlay) {
        stampOverlay.style.display = 'none';
    }
    // ------------------------------------------------------------


    // Update A4 Preview Elements
    const pClient = document.getElementById('preview-client-name');
    if (pClient) pClient.textContent = client;
    
    const pDate = document.getElementById('preview-doc-date');
    if (pDate) {
        let prefix = '発行日';
        if (window.currentDocType === 'estimate') prefix = '見積日';
        else if (window.currentDocType === 'invoice') prefix = '請求日';
        else if (window.currentDocType === 'delivery') prefix = '納品日';
        else if (window.currentDocType === 'receipt') prefix = '領収日';
        pDate.textContent = `${prefix}: ${dateInputStr.replace(/-/g, '/')}`;
    }

    const pSub = document.getElementById('preview-subject');
    if (pSub) pSub.textContent = subject;

    const pSubLabel = document.getElementById('preview-subject-label');
    if (pSubLabel) {
        if (window.currentDocType === 'receipt') {
            pSubLabel.textContent = '決済金額';
            pSub.textContent = `¥${fmt.format(total)} -`;
        } else {
            pSubLabel.textContent = '件名';
            pSub.textContent = subject;
        }
    }

    const pSubtotal = document.getElementById('preview-subtotal');
    if (pSubtotal) pSubtotal.textContent = `¥${fmt.format(subTotal)}`;

    const pTax = document.getElementById('preview-tax');
    if (pTax) pTax.textContent = `¥${fmt.format(tax)}`;

    const pGrand = document.getElementById('preview-grand-total');
    if (pGrand) pGrand.textContent = `¥${fmt.format(total)}`;

    // Dynamic Document Number Prefix for realism
    const numPrefix = document.getElementById('preview-doc-no');
    if (numPrefix) {
        const codes = {
            'estimate': 'EST',
            'invoice': 'INV',
            'delivery': 'DEL',
            'receipt': 'REC',
            'expense': 'EXP'
        };
        const code = codes[window.currentDocType] || 'DOC';
        numPrefix.textContent = `No: ${code}-${dateInputStr.replace(/-/g, '')}-01`;
    }

    // Feature: Delivery Note Stamp
    const dStamp = document.getElementById('preview-delivery-stamp');
    if (dStamp) {
        dStamp.style.display = window.currentDocType === 'delivery' ? 'block' : 'none';
    }

    // Feature: Receipt Memo (但し書き) and Invoice Bank Info
    const rMemo = document.getElementById('preview-receipt-memo');
    const rMemoText = document.getElementById('preview-memo-text');
    if (rMemo && rMemoText) {
        if (window.currentDocType === 'receipt') {
            rMemo.style.display = 'block';
            const methodBadge = `<span style="display:inline-block; margin-right: 8px; padding: 2px 6px; background: #e2e8f0; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 11px;">[${paymentMethodStr}]</span>`;
            rMemoText.innerHTML = `${methodBadge} ${receiptMemo}`;
        } else if (window.currentDocType === 'invoice') {
            rMemo.style.display = 'block';
            const bankHtml = bankInfo.replace(/\n/g, '<br>');
            rMemoText.innerHTML = `<span style="font-size:12px; font-weight: 400; color:#0f172a; display:block; padding: 8px; background: #fff; border: 1.5px solid #1D9BF0; border-radius: 4px; line-height: 1.4;"><strong>【振込先口座】</strong><br>${bankHtml}<br><span style="color:#ef4444; font-size: 11px; font-weight:700; display:block; margin-top:4px;">※お支払期限: ${deadlineInputStr.replace(/-/g, '/')}</span></span>`;
        } else if (window.currentDocType === 'estimate') {
            rMemo.style.display = 'block';
            rMemoText.innerHTML = `<span style="color:#ef4444; font-size: 12px;">有効期限: ${deadlineInputStr.replace(/-/g, '/')} まで</span>`;
        } else {
            rMemo.style.display = 'none';
        }
    }

    // Feature: Digital Bridge QR Code Generation & Toggle Interaction
    const qrEl = document.getElementById('preview-qr-code');
    const qrContainer = qrEl ? qrEl.parentElement : null;
    const qrToggle = document.getElementById('doc-toggle-qr');
    const showQr = qrToggle ? qrToggle.checked : true;
    
    if (qrEl && qrContainer) {
        if (showQr) {
            try {
                // Extract items perfectly
                const items = [];
                const rowsForQR = document.querySelectorAll('#doc-items-container .line-item, #doc-line-items-container .line-item');
                rowsForQR.forEach(row => {
                    const qtyInput = row.querySelector('.item-qty-input');
                    items.push({
                        name: row.querySelector('.item-name-input').value || '作業代行費',
                        price: parseInt(row.querySelector('.item-price-input').value || '0', 10),
                        qty: qtyInput ? parseInt(qtyInput.value || '1', 10) : 1
                    });
                });

                const docData = {
                    type: window.currentDocType,
                    client: client,
                    date: dateInputStr,
                    deadline: deadlineInputStr,
                    subject: subject,
                    memo: receiptMemo,
                    bank: bankInfo,
                    payment: paymentMethodStr,
                    items: items
                };

                const payload = btoa(encodeURIComponent(JSON.stringify(docData)));
                const shareUrl = `${window.location.origin}${window.location.pathname}?share=${payload}`;
                qrEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=0&data=${encodeURIComponent(shareUrl)}`;
                qrEl.style.display = 'block';
                qrContainer.style.display = 'grid';
            } catch (e) {
                console.error("QR gen failed", e);
                qrContainer.style.display = 'none';
            }
        } else {
            qrContainer.style.display = 'none'; // Hide if user toggled off
        }
    }
    
    // Feature: Dynamic Paper Size Adjustments
    const paperSizeSel = document.getElementById('doc-paper-size');
    const paperContainer = document.querySelector('#doc-preview-paper'); // The exact paper div (originally scaled A4)
    if (paperSizeSel && paperContainer) {
        const size = paperSizeSel.value; // 'A4' or 'B5'
        if (size === 'B5') {
            paperContainer.style.aspectRatio = '1 / 1.414';
        } else { // Default A4
            paperContainer.style.aspectRatio = '1 / 1.414';
        }
        
        // Remove the legacy transform scaling, rely on Flexbox + aspect ratio
        paperContainer.style.transform = `none`;
    }
};

window.handleAIDocUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (window.neo) window.neo.speak('neo_thinking');
    
    // SHOW UI OVERLAY
    const parseOverlay = document.getElementById('doc-neo-parsing-overlay');
    if (parseOverlay) parseOverlay.classList.remove('hidden');
    
    // Simulate OCR latency
    setTimeout(() => {
        // HIDE UI OVERLAY
        if (parseOverlay) parseOverlay.classList.add('hidden');

        // Mock Data (Starbucks Receipt style as requested)
        const extractedItem = "スターバックス コーヒー";
        const extractedPrice = 1250;
        const extractedDate = new Date().toISOString().split('T')[0];

        // 1. Fill Inputs instantly
        const itemNameEl = document.getElementById('doc-item-name');
        if (itemNameEl) itemNameEl.value = extractedItem;

        const itemPriceEl = document.getElementById('doc-item-price');
        if (itemPriceEl) itemPriceEl.value = extractedPrice.toString();

        const dateEl = document.getElementById('doc-issue-date');
        if (dateEl) dateEl.value = extractedDate;

        // 2. Clear out the file input so it can trigger again
        event.target.value = '';

        // 3. Immediately flush to preview and trigger recalculations (Tax, Grand Total)
        window.updateDocPreview();

        if (window.neo) window.neo.speak('neo_success');
        
        const neoBubble = document.getElementById('neo-fab-bubble');
        if (neoBubble) {
            neoBubble.textContent = `⚡️ レシートから「${extractedItem} / ¥${extractedPrice}」を抽出して自動入力しました！消費税も計算済みです。`;
            neoBubble.classList.add('show');
            setTimeout(() => { neoBubble.classList.remove('show'); }, 5000);
        }
        
    }, 1500); // 1.5s AI simulation delay
};

// HTML template generation for consistency
window.generateDocLineHTML = (name = "", price = 0, qty = 1, isAI = false) => {
    // AI生成バッジ: インラインタグ形式（淡い紫 + 影 + × 閉じるボタン）
    const aiBadge = isAI ? `
        <div class="ai-tag-badge">
            <span>✦ AI生成</span>
            <button class="ai-badge-dismiss" onclick="this.closest('.ai-tag-badge').remove();" title="バッジを消す">✕</button>
        </div>
    ` : '';

    // 名前に含まれる " などをエスケープ
    const safeName  = String(name).replace(/"/g, '&quot;');
    const safePrice = Number(price) || 0;
    const safeQty   = Number(qty)   || 1;

    return `
        <div class="line-item">
            <div class="input-group">
                ${aiBadge}
                <input type="text" class="form-control item-name-input" placeholder="内容を入力" oninput="window.updateDocPreview()" value="${safeName}">
            </div>
            <div class="input-group qty">
                <input type="number" inputmode="decimal" pattern="[0-9]*" class="form-control item-qty-input" value="${safeQty}" oninput="window.updateDocPreview()">
            </div>
            <div class="input-group price">
                <input type="number" inputmode="decimal" pattern="[0-9]*" class="form-control item-price-input" value="${safePrice}" oninput="window.updateDocPreview()">
            </div>
            <button class="delete-row-btn" onclick="this.closest('.line-item').remove(); window.updateDocPreview();" title="この行を削除">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
        </div>
    `;
};
