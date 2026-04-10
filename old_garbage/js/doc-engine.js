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
            docNumber: document.getElementById('doc-doc-number')?.value || '',
            remarks: document.getElementById('doc-remarks')?.value || '',
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
        if (document.getElementById('doc-doc-number')) document.getElementById('doc-doc-number').value = mem.docNumber || '';
        if (document.getElementById('doc-remarks')) document.getElementById('doc-remarks').value = mem.remarks || '';
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
        if (document.getElementById('doc-remarks')) document.getElementById('doc-remarks').value = '';
        if (document.getElementById('doc-receipt-memo')) document.getElementById('doc-receipt-memo').value = '';
        // 書類番号を自動生成
        const _prefix = { estimate:'EST', invoice:'INV', delivery:'DEL', receipt:'REC', expense:'EXP' }[type] || 'DOC';
        const _today = new Date().toISOString().split('T')[0].replace(/-/g, '');
        if (document.getElementById('doc-doc-number')) document.getElementById('doc-doc-number').value = `${_prefix}-${_today}-01`;

        // Load type-filtered activities for this specific doc type
        const container = document.getElementById('doc-line-items-container');
        if (container) {
            container.innerHTML = '';
            if (window.refreshLineItemsForDocType) {
                window.refreshLineItemsForDocType(type); // Async: loads + filters + renders
            } else {
                container.insertAdjacentHTML('beforeend', window.generateDocLineHTML('', 0, 1, false));
            }
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

    // 発行者情報・書類番号・備考
    const docNumber   = document.getElementById('doc-doc-number')?.value || '';
    const remarks     = document.getElementById('doc-remarks')?.value || '';
    const companyName = document.getElementById('doc-company-name')?.value || 'あなたの会社名';
    const companyAddr = document.getElementById('doc-company-address')?.value || '';
    const companyTel  = document.getElementById('doc-company-tel')?.value || '';
    // 複数社判（位置別レンダリング）
    let _seals = [];
    try { _seals = JSON.parse(localStorage.getItem('neo_company_seals') || '[]'); } catch(e) {}
    const _sealBlock = (pos) => {
        const arr = _seals.filter(s => s.position === pos);
        if (!arr.length) return '';
        return `<div style="display:flex;justify-content:flex-end;align-items:center;gap:6px;margin:6px 0;">${
            arr.map(s => `<img src="${s.dataURL}" title="${s.label||'印'}" style="width:${s.size}px;height:${s.size}px;object-fit:contain;opacity:0.82;border-radius:50%;border:2px solid rgba(192,0,0,0.28);">`).join('')
        }</div>`;
    };

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
        // エラーUI等、入力欄を持たない行はスキップ
        const nameEl  = row.querySelector('.item-name-input');
        const priceEl = row.querySelector('.item-price-input');
        if (!nameEl || !priceEl) return;

        const name = nameEl.value || '作業代行費';
        const price = parseInt(priceEl.value || '0', 10);
        const qtyInput = row.querySelector('.item-qty-input');
        const qty = qtyInput ? parseInt(qtyInput.value || '1', 10) : 1;
        const lineTotal = price * qty;
        subTotal += lineTotal;
        items.push({ name, price, qty });

        // 全書類タイプで統一スタイル
        const tdStyle      = 'padding:6px 10px;font-size:13px;color:#222;border-bottom:1px solid #e5e7eb;line-height:1.4;';
        const tdStyleRight = 'padding:6px 10px;font-size:13px;color:#222;text-align:right;border-bottom:1px solid #e5e7eb;line-height:1.4;';

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

    // ── 共通スタイル定数 ────────────────────────────────────────────────────────
    const S = {
        title:      'font-size:22px;font-weight:900;letter-spacing:4px;color:#000;',
        clientName: 'font-size:17px;font-weight:700;border-bottom:2px solid #000;padding-bottom:5px;display:inline-block;min-width:75%;color:#000;',
        companyName:'font-size:14px;font-weight:700;color:#000;margin-bottom:3px;',
        bodyText:   'font-size:13px;color:#444;line-height:1.6;',
        smallText:  'font-size:12px;color:#555;line-height:1.6;',
        label:      'font-size:12px;color:#777;',
        subject:    'font-size:14px;font-weight:700;border-bottom:1px solid #ccc;padding-bottom:3px;display:inline-block;min-width:60%;color:#000;',
        thCell:     'padding:7px 10px;font-size:12px;font-weight:600;color:#444;',
        totalLbl:   'padding:5px 10px;font-size:13px;color:#666;',
        totalVal:   'padding:5px 10px;font-size:13px;color:#333;text-align:right;',
        grandLbl:   'padding:8px 10px;font-size:15px;font-weight:700;color:#000;border-top:2px solid #000;',
        grandVal:   'padding:8px 10px;font-size:20px;font-weight:900;color:#000;text-align:right;border-top:2px solid #000;',
        itemTable:  'width:100%;border-collapse:collapse;margin-bottom:16px;',
        divider:    'border-bottom:2px solid #333;margin:4px 0 16px;',
    };

    // ── 共通フッター ──────────────────────────────────────────────────────────
    const docFooter = `
        <div style="display:flex;justify-content:flex-end;margin-top:24px;padding-top:10px;border-top:1px solid #e5e7eb;">
            <span style="font-size:10px;color:#d1d5db;">Powered by Neo+</span>
        </div>`;

    // ── 発行者情報ブロック（全テンプレート共通）──────────────────────────────
    const companyBlock = `
        <div style="${S.companyName}">${companyName}</div>
        ${companyAddr ? `<div style="${S.smallText}">${companyAddr}</div>` : ''}
        ${companyTel  ? `<div style="${S.smallText}">TEL: ${companyTel}</div>` : ''}
        ${_sealBlock('header')}`;

    // ── 備考ブロック（入力ありの場合のみ表示）────────────────────────────────
    const remarksBlock = remarks ? `
        <div style="margin:14px 0 8px;padding:10px 14px;background:#fafafa;border-left:3px solid #d1d5db;border-radius:0 6px 6px 0;">
            <div style="${S.label};font-weight:700;margin-bottom:4px;">備考</div>
            <div style="${S.bodyText};white-space:pre-wrap;">${remarks}</div>
        </div>` : '';

    if (window.currentDocType === 'estimate') {
        const est_date  = dateInputStr.replace(/-/g, '/');
        const est_docNo = 'EST-' + dateInputStr.replace(/-/g, '') + '-01';
        const est_deadline = deadlineInputStr ? deadlineInputStr.replace(/-/g, '/') : '';

        if (docPaperContainer) {
            docPaperContainer.innerHTML = `
<div id="neo-v3-estimate" style="font-family:'Noto Sans JP',sans-serif;">

  <!-- タイトル -->
  <div style="text-align:center;padding-bottom:24px;border-bottom:3px solid #000;margin-bottom:20px;">
    <span id="preview-doc-title" style="${S.title}">御　見　積　書</span>
  </div>

  <!-- ヘッダー情報 -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
    <tr>
      <td style="width:58%;vertical-align:top;padding-right:16px;">
        <div id="preview-client-name" style="${S.clientName}">${client}</div>
        <div style="${S.bodyText};margin-top:10px;">御中</div>
        <div style="${S.bodyText};margin-top:14px;">下記の通り御見積申し上げます。</div>
        <div style="margin-top:12px;">
          <span style="${S.label}">件名：</span>
          <span id="preview-subject" style="${S.subject}">${subject}</span>
        </div>
        ${est_deadline ? `<div style="${S.smallText};margin-top:8px;">有効期限：<strong style="color:#000;">${est_deadline}</strong></div>` : ''}
      </td>
      <td style="width:42%;vertical-align:top;text-align:right;">
        ${companyBlock}
        <div id="preview-bank-info" style="margin-top:8px;white-space:pre-line;${S.smallText}">${bankInfo}</div>
        <div style="margin-top:10px;${S.label}">
          <div id="preview-doc-date">発行日：${est_date}</div>
          <div id="preview-doc-no">文書番号：${docNumber}</div>
        </div>
      </td>
    </tr>
  </table>

  <!-- 明細テーブル -->
  <table style="${S.itemTable}">
    <thead>
      <tr style="background:#f3f4f6;border-top:2px solid #000;border-bottom:1px solid #d1d5db;">
        <th style="${S.thCell};text-align:left;">内容・品名</th>
        <th style="${S.thCell};text-align:right;width:13%;">数量</th>
        <th style="${S.thCell};text-align:right;width:22%;">単価</th>
        <th style="${S.thCell};text-align:right;width:22%;">金額</th>
      </tr>
    </thead>
    <tbody id="preview-items-container">${linesHTML}</tbody>
  </table>
  <div style="${S.divider}"></div>

  <!-- 合計欄 -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
    <tr>
      <td style="width:55%;vertical-align:bottom;${S.smallText};font-style:italic;color:#888;">
        ※ 消費税は別途申し受けます。<br>本見積書の有効期限は発行日より1ヶ月です。
      </td>
      <td style="width:45%;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="${S.totalLbl}">小計</td>
            <td id="preview-subtotal" style="${S.totalVal}">¥${fmt.format(subTotal)}</td>
          </tr>
          <tr>
            <td id="preview-tax-label" style="${S.totalLbl}">消費税（10%）</td>
            <td id="preview-tax"       style="${S.totalVal}">¥${fmt.format(tax)}</td>
          </tr>
          <tr>
            <td style="${S.grandLbl}">合計金額</td>
            <td id="preview-grand-total" style="${S.grandVal}">¥${fmt.format(total)}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  ${_sealBlock('total')}
  ${remarksBlock}
  ${_sealBlock('bottom')}
  ${docFooter}
</div>`;
        }
        document.getElementById('doc-tax-calc').textContent  = `¥${fmt.format(tax)}`;
        document.getElementById('doc-total-calc').textContent = `¥${fmt.format(total)}`;
        return;

    } else if (window.currentDocType === 'invoice') {
        const inv_date     = dateInputStr.replace(/-/g, '/');
        const inv_deadline = deadlineInputStr ? deadlineInputStr.replace(/-/g, '/') : '末日';
        const inv_docNo    = 'INV-' + dateInputStr.replace(/-/g, '') + '-01';

        if (docPaperContainer) {
            docPaperContainer.innerHTML = `
<div id="neo-v3-invoice" style="font-family:'Noto Sans JP',sans-serif;">

  <!-- タイトル -->
  <div style="text-align:center;padding-bottom:24px;border-bottom:3px solid #000;margin-bottom:20px;">
    <span id="preview-doc-title" style="${S.title}">御　請　求　書</span>
  </div>

  <!-- ヘッダー情報 -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
    <tr>
      <td style="width:58%;vertical-align:top;padding-right:16px;">
        <div id="preview-client-name" style="${S.clientName}">${client}</div>
        <div style="${S.bodyText};margin-top:10px;">御中</div>
        <div style="${S.bodyText};margin-top:14px;">下記の通り御請求申し上げます。</div>
        <div style="margin-top:12px;">
          <span style="${S.label}">件名：</span>
          <span id="preview-subject" style="${S.subject}">${subject}</span>
        </div>
        <div style="${S.smallText};margin-top:8px;">お支払期限：<strong style="color:#c00;">${inv_deadline}</strong></div>
      </td>
      <td style="width:42%;vertical-align:top;text-align:right;">
        ${companyBlock}
        <div id="preview-bank-info" style="margin-top:8px;white-space:pre-line;${S.smallText};background:#f8faff;border:1px solid #dde5ff;border-radius:6px;padding:8px;text-align:left;">${bankInfo}</div>
        <div style="margin-top:10px;${S.label};text-align:right;">
          <div id="preview-doc-date">請求日：${inv_date}</div>
          <div id="preview-doc-no">文書番号：${docNumber}</div>
        </div>
      </td>
    </tr>
  </table>

  <!-- 明細テーブル -->
  <table style="${S.itemTable}">
    <thead>
      <tr style="background:#f3f4f6;border-top:2px solid #000;border-bottom:1px solid #d1d5db;">
        <th style="${S.thCell};text-align:left;">内容・品名</th>
        <th style="${S.thCell};text-align:right;width:13%;">数量</th>
        <th style="${S.thCell};text-align:right;width:22%;">単価</th>
        <th style="${S.thCell};text-align:right;width:22%;">金額</th>
      </tr>
    </thead>
    <tbody id="preview-items-container">${linesHTML}</tbody>
  </table>
  <div style="${S.divider}"></div>

  <!-- 合計欄 -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
    <tr>
      <td style="width:55%;${S.smallText};font-style:italic;color:#888;vertical-align:top;">
        ※ お振込手数料はご負担ください。<br>期日を過ぎた場合は遅延損害金が発生する場合があります。
      </td>
      <td style="width:45%;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="${S.totalLbl}">小計</td>
            <td id="preview-subtotal" style="${S.totalVal}">¥${fmt.format(subTotal)}</td>
          </tr>
          <tr>
            <td id="preview-tax-label" style="${S.totalLbl}">消費税（10%）</td>
            <td id="preview-tax"       style="${S.totalVal}">¥${fmt.format(tax)}</td>
          </tr>
          <tr>
            <td style="${S.grandLbl}">ご請求金額</td>
            <td id="preview-grand-total" style="${S.grandVal}">¥${fmt.format(total)}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  ${_sealBlock('total')}
  ${remarksBlock}
  ${_sealBlock('bottom')}
  ${docFooter}
</div>`;
        }
        document.getElementById('doc-tax-calc').textContent  = `¥${fmt.format(tax)}`;
        document.getElementById('doc-total-calc').textContent = `¥${fmt.format(total)}`;
        return;
    } else if (window.currentDocType === 'delivery') {
        // ── 納品書テンプレート（金額あり） ───────────────────────────────────
        const del_dateStr  = dateInputStr.replace(/-/g, '/');
        const del_docNo    = 'DEL-' + dateInputStr.replace(/-/g, '') + '-01';
        if (docPaperContainer) {
            docPaperContainer.innerHTML = `
<div id="neo-v3-delivery" style="font-family:'Noto Sans JP',sans-serif;">

  <!-- タイトル -->
  <div style="text-align:center;padding-bottom:24px;border-bottom:3px solid #000;margin-bottom:20px;">
    <span id="preview-doc-title" style="${S.title}">納　品　書</span>
  </div>

  <!-- ヘッダー情報 -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
    <tr>
      <td style="width:58%;vertical-align:top;padding-right:16px;">
        <div id="preview-client-name" style="${S.clientName}">${client}</div>
        <div style="${S.bodyText};margin-top:10px;">御中</div>
        <div style="${S.bodyText};margin-top:14px;">下記の通り納品いたしました。</div>
        <div style="margin-top:12px;">
          <span style="${S.label}">件名：</span>
          <span id="preview-subject" style="${S.subject}">${subject}</span>
        </div>
      </td>
      <td style="width:42%;vertical-align:top;text-align:right;">
        ${companyBlock}
        <div style="margin-top:10px;${S.label};text-align:right;">
          <div id="preview-doc-date">納品日：${del_dateStr}</div>
          <div id="preview-doc-no">文書番号：${docNumber}</div>
        </div>
      </td>
    </tr>
  </table>

  <!-- 明細テーブル -->
  <table style="${S.itemTable}">
    <thead>
      <tr style="background:#f3f4f6;border-top:2px solid #000;border-bottom:1px solid #d1d5db;">
        <th style="${S.thCell};text-align:left;">内容・品名</th>
        <th style="${S.thCell};text-align:right;width:13%;">数量</th>
        <th style="${S.thCell};text-align:right;width:22%;">単価</th>
        <th style="${S.thCell};text-align:right;width:22%;">金額</th>
      </tr>
    </thead>
    <tbody id="preview-items-container">${linesHTML}</tbody>
  </table>
  <div style="${S.divider}"></div>

  <!-- 合計欄 -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
    <tr>
      <td style="width:55%;vertical-align:bottom;${S.smallText};font-style:italic;color:#888;">
        ※ 上記商品・サービスを納品いたしました。
      </td>
      <td style="width:45%;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="${S.totalLbl}">小計</td>
            <td id="preview-subtotal" style="${S.totalVal}">¥${fmt.format(subTotal)}</td>
          </tr>
          <tr>
            <td id="preview-tax-label" style="${S.totalLbl}">消費税（10%）</td>
            <td id="preview-tax"       style="${S.totalVal}">¥${fmt.format(tax)}</td>
          </tr>
          <tr>
            <td style="${S.grandLbl}">納品合計</td>
            <td id="preview-grand-total" style="${S.grandVal}">¥${fmt.format(total)}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  <!-- 納品済スタンプ（通常フロー） -->
  <div style="display:flex;justify-content:flex-end;margin-top:16px;">
    <div style="width:72px;height:72px;border:2px solid #c00;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#c00;font-size:13px;font-weight:bold;opacity:0.7;letter-spacing:2px;">納品済</div>
  </div>

  ${_sealBlock('total')}
  ${remarksBlock}
  ${_sealBlock('bottom')}
  ${docFooter}
</div>`;
        }
        document.getElementById('doc-tax-calc').textContent  = `¥${fmt.format(tax)}`;
        document.getElementById('doc-total-calc').textContent = `¥${fmt.format(total)}`;
        return;

    } else if (window.currentDocType === 'receipt') {
        // ── 領収書テンプレート（明細付き） ───────────────────────────────────
        const rec_dateStr    = dateInputStr.replace(/-/g, '/');
        const rec_docNo      = 'REC-' + dateInputStr.replace(/-/g, '') + '-01';
        const receiptMemoVal = document.getElementById('doc-receipt-memo')?.value || 'お品代として';
        const payMethodEl    = document.getElementById('doc-payment-method');
        const payMethodLabel = payMethodEl ? payMethodEl.options[payMethodEl.selectedIndex]?.text || '現金' : '現金';
        const payMethodColor = payMethodLabel === '現金' ? '#059669' : payMethodLabel.includes('銀行') ? '#2563eb' : '#7c3aed';

        if (docPaperContainer) {
            docPaperContainer.innerHTML = `
<div id="neo-v3-receipt" style="font-family:'Noto Sans JP',sans-serif;">

  <!-- タイトル -->
  <div style="text-align:center;padding-bottom:24px;border-bottom:3px solid #000;margin-bottom:20px;">
    <span id="preview-doc-title" style="${S.title}">領　収　書</span>
  </div>

  <!-- ヘッダー情報 -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
    <tr>
      <td style="width:58%;vertical-align:top;padding-right:16px;">
        <div id="preview-client-name" style="${S.clientName}">${client}</div>
        <div style="${S.bodyText};margin-top:10px;">御中</div>
        <div style="${S.bodyText};margin-top:10px;">上記の金額を確かに領収いたしました。</div>
      </td>
      <td style="width:42%;vertical-align:top;text-align:right;">
        ${companyBlock}
        <div style="margin-top:10px;${S.label};text-align:right;">
          <div id="preview-doc-date">領収日：${rec_dateStr}</div>
          <div id="preview-doc-no">文書番号：${docNumber}</div>
        </div>
      </td>
    </tr>
  </table>

  <!-- 大きな合計金額 -->
  <div style="text-align:center;margin:18px 0;padding:18px;background:#f8faff;border:1px solid #dde5ff;border-radius:10px;">
    <div style="${S.label};margin-bottom:6px;">領　収　金　額</div>
    <div id="preview-grand-total" style="font-size:32px;font-weight:900;color:#000;letter-spacing:2px;">¥${fmt.format(total)} <span style="font-size:15px;font-weight:normal;">也</span></div>
  </div>

  <!-- 但し書き + 決済方法 -->
  <div style="display:flex;align-items:center;gap:20px;margin:16px 0;${S.bodyText}">
    <div>但し書き：<span id="preview-memo-text" style="font-weight:700;color:#000;">${receiptMemoVal}</span></div>
    <div>決済方法：<span style="background:${payMethodColor};color:#fff;padding:2px 10px;border-radius:10px;font-size:12px;font-weight:700;">${payMethodLabel}</span></div>
  </div>

  <!-- 明細テーブル -->
  <table style="${S.itemTable}">
    <thead>
      <tr style="background:#f3f4f6;border-top:2px solid #000;border-bottom:1px solid #d1d5db;">
        <th style="${S.thCell};text-align:left;">内容・品名</th>
        <th style="${S.thCell};text-align:right;width:13%;">数量</th>
        <th style="${S.thCell};text-align:right;width:22%;">単価</th>
        <th style="${S.thCell};text-align:right;width:22%;">金額</th>
      </tr>
    </thead>
    <tbody id="preview-items-container">${linesHTML}</tbody>
  </table>
  <div style="${S.divider}"></div>

  <!-- 小計・税 -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
    <tr>
      <td style="width:55%;${S.smallText};font-style:italic;color:#888;vertical-align:top;">
        ※ この領収書が唯一の証票となります。
      </td>
      <td style="width:45%;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="${S.totalLbl}">小計</td>
            <td id="preview-subtotal" style="${S.totalVal}">¥${fmt.format(subTotal)}</td>
          </tr>
          <tr>
            <td id="preview-tax-label" style="${S.totalLbl}">消費税（10%）</td>
            <td id="preview-tax"       style="${S.totalVal}">¥${fmt.format(tax)}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  ${_sealBlock('total')}
  ${remarksBlock}
  ${_sealBlock('bottom')}
  ${docFooter}
</div>`;
        }
        document.getElementById('doc-tax-calc').textContent  = `¥${fmt.format(tax)}`;
        document.getElementById('doc-total-calc').textContent = `¥${fmt.format(total)}`;
        return;

    } else if (window.currentDocType === 'expense') {
        // ── 経費精算書テンプレート（日付順リスト） ───────────────────────────
        const exp_dateStr = dateInputStr.replace(/-/g, '/');
        const exp_docNo   = 'EXP-' + dateInputStr.replace(/-/g, '') + '-01';
        const projectName = document.getElementById('doc-subject')?.value || '';

        // 日付列付き行 (data-item-date attribute から日付を取得)
        const expTdDate  = 'padding:6px 10px;font-size:13px;color:#555;border-bottom:1px solid #e5e7eb;width:18%;white-space:nowrap;';
        const expTdBody  = 'padding:6px 10px;font-size:13px;color:#222;border-bottom:1px solid #e5e7eb;line-height:1.4;';
        const expTdRight = 'padding:6px 10px;font-size:13px;color:#222;text-align:right;border-bottom:1px solid #e5e7eb;';
        let expLinesHTML = '';
        let expSubTotal  = 0;
        const expItemRows = document.querySelectorAll('#doc-items-container .line-item, #doc-line-items-container .line-item');
        expItemRows.forEach(row => {
            const nameEl  = row.querySelector('.item-name-input');
            const priceEl = row.querySelector('.item-price-input');
            if (!nameEl || !priceEl) return;
            const n    = nameEl.value || '経費';
            const p    = parseInt(priceEl.value || '0', 10);
            const q    = parseInt(row.querySelector('.item-qty-input')?.value || '1', 10);
            const lt   = p * q;
            const date = row.getAttribute('data-item-date') || '';
            const displayDate = date ? date.replace(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/, '$2/$3') : '';
            expSubTotal += lt;
            expLinesHTML += `<tr>
              <td style="${expTdDate}">${displayDate}</td>
              <td style="${expTdBody}">${n}</td>
              <td style="${expTdRight}">¥${fmt.format(lt)}</td>
            </tr>`;
        });
        const expTax   = Math.floor(expSubTotal * taxRate);
        const expTotal = expSubTotal + expTax;
        const expItems = items; // use same items array for QR

        if (docPaperContainer) {
            docPaperContainer.innerHTML = `
<div id="neo-v3-expense" style="font-family:'Noto Sans JP',sans-serif;">

  <!-- タイトル -->
  <div style="text-align:center;padding-bottom:24px;border-bottom:3px solid #000;margin-bottom:20px;">
    <span id="preview-doc-title" style="${S.title}">経　費　精　算　書</span>
  </div>

  <!-- ヘッダー情報 -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
    <tr>
      <td style="width:58%;vertical-align:top;padding-right:16px;">
        <div style="${S.label}">申請者</div>
        <div id="preview-client-name" style="${S.clientName}">${client || '担当者名'}</div>
        <div style="margin-top:12px;">
          <span style="${S.label}">件名：</span>
          <span id="preview-subject" style="${S.subject}">${projectName}</span>
        </div>
      </td>
      <td style="width:42%;vertical-align:top;text-align:right;">
        ${companyBlock}
        <div style="margin-top:10px;${S.label};text-align:right;">
          <div id="preview-doc-date">作成日：${exp_dateStr}</div>
          <div id="preview-doc-no">文書番号：${docNumber}</div>
        </div>
      </td>
    </tr>
  </table>

  <!-- 経費明細テーブル（日付順・3列） -->
  <table style="${S.itemTable}">
    <thead>
      <tr style="background:#f3f4f6;border-top:2px solid #000;border-bottom:1px solid #d1d5db;">
        <th style="${S.thCell};text-align:left;width:18%;">日付</th>
        <th style="${S.thCell};text-align:left;">内容・費目</th>
        <th style="${S.thCell};text-align:right;width:22%;">金額</th>
      </tr>
    </thead>
    <tbody id="preview-items-container">${expLinesHTML}</tbody>
  </table>
  <div style="${S.divider}"></div>

  <!-- 合計欄 -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
    <tr>
      <td style="width:55%;${S.smallText};font-style:italic;color:#888;vertical-align:top;">
        ※ 上記経費について精算をお願いいたします。
      </td>
      <td style="width:45%;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="${S.totalLbl}">小計</td>
            <td id="preview-subtotal" style="${S.totalVal}">¥${fmt.format(expSubTotal)}</td>
          </tr>
          <tr>
            <td id="preview-tax-label" style="${S.totalLbl}">消費税（10%）</td>
            <td id="preview-tax"       style="${S.totalVal}">¥${fmt.format(expTax)}</td>
          </tr>
          <tr>
            <td style="${S.grandLbl}">精算合計</td>
            <td id="preview-grand-total" style="${S.grandVal}">¥${fmt.format(expTotal)}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  ${_sealBlock('total')}
  ${remarksBlock}
  ${_sealBlock('bottom')}
  ${docFooter}
</div>`;
        }
        document.getElementById('doc-tax-calc').textContent  = `¥${fmt.format(expTax)}`;
        document.getElementById('doc-total-calc').textContent = `¥${fmt.format(expTotal)}`;
        return;

    } else if (docPaperContainer && window.defaultGenericTemplateHTML) {
        // Restore generic template structure when switching away from typed templates
        if (docPaperContainer.querySelector('#neo-v3-estimate, #neo-v3-delivery, #neo-v3-receipt, #neo-v3-expense')) {
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
// date: optional ISO/JP date string → stored as data-item-date attribute (used by 経費精算書 preview)
window.generateDocLineHTML = (name = "", price = 0, qty = 1, isAI = false, date = "") => {
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
    const dateAttr  = date ? ` data-item-date="${date}"` : '';

    return `
        <div class="line-item"${dateAttr}>
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
