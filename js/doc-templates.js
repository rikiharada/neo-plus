window.renderEstimateTemplate = function(data) {
    const { client, dateStr, docNo, subject, items, subTotal, tax, grandTotal, receiptMemo, bankInfo } = data;
    
    // Format Numbers
    const fmt = new Intl.NumberFormat('ja-JP');
    
    // Generate Items HTML
    let itemsHTML = '';
    items.forEach(item => {
        const lineTotal = item.price * item.qty;
        itemsHTML += `
            <tr>
                <td style="padding: 2px 4px; font-size: 11px !important; color: #333; border-bottom: 1px solid #999;">${item.name}</td>
                <td style="padding: 2px 4px; font-size: 11px !important; color: #333; text-align: right; border-bottom: 1px solid #999;">${item.qty}</td>
                <td style="padding: 2px 4px; font-size: 11px !important; color: #333; text-align: right; border-bottom: 1px solid #999;">¥${fmt.format(item.price)}</td>
                <td style="padding: 2px 4px; font-size: 11px !important; color: #333; text-align: right; border-bottom: 1px solid #999;">¥${fmt.format(lineTotal)}</td>
            </tr>
        `;
    });

    return `
        <div id="neo-v3-estimate">
            <!-- Top Area (3 Rows) -->
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                <!-- Row 1: Title -->
                <tr>
                    <td colspan="2" style="text-align: center; padding-bottom: 30px;">
                        <span id="preview-doc-title" style="font-size: 18px !important; font-weight: bold; letter-spacing: 2px; color: #000;">御見積書</span>
                    </td>
                </tr>
                <!-- Row 2: Client & Date -->
                <tr>
                    <td style="width: 60%; vertical-align: top; padding-bottom: 10px;">
                        <div id="preview-client-name" style="font-size: 14px !important; font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 4px; display: inline-block; min-width: 80%; color: #000;">${client}</div>
                    </td>
                    <td style="width: 40%; vertical-align: top; text-align: right; font-size: 11px !important; padding-bottom: 10px; color: #333;">
                        <div id="preview-doc-date" style="font-size: 11px !important;">発行日: ${dateStr}</div>
                        <div id="preview-doc-no" style="font-size: 11px !important;">No: ${docNo}</div>
                    </td>
                </tr>
                <!-- Row 3: Message & Company -->
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

            <!-- Detail Table -->
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
                        ${itemsHTML}
                    </tbody>
                </table>
                <div style="border-bottom: 2px solid #333; margin-bottom: 15px;"></div>
            </div>

            <!-- Footer Table (Totals only, perfectly aligned) -->
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
                                <td id="preview-grand-total" style="padding: 6px 4px; font-size: 16px !important; font-weight: bold; color: #000; text-align: right; border-top: 1px solid #666; width: 50%;">¥${fmt.format(grandTotal)}</td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>

            <!-- Absolute Bottom-Left QR Code -->
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
};

window.renderInvoiceTemplate = function(data) {
    const { client, dateStr, deadlineStr, docNo, subject, items, subTotal, tax, grandTotal, bankInfo } = data;
    
    // Format Numbers
    const fmt = new Intl.NumberFormat('ja-JP');
    
    // Generate Items HTML
    let itemsHTML = '';
    items.forEach(item => {
        const lineTotal = item.price * item.qty;
        itemsHTML += `
            <tr>
                <td style="padding: 2px 4px; font-size: 11px !important; color: #333; border-bottom: 1px solid #999;">${item.name}</td>
                <td style="padding: 2px 4px; font-size: 11px !important; color: #333; text-align: right; border-bottom: 1px solid #999;">${item.qty}</td>
                <td style="padding: 2px 4px; font-size: 11px !important; color: #333; text-align: right; border-bottom: 1px solid #999;">¥${fmt.format(item.price)}</td>
                <td style="padding: 2px 4px; font-size: 11px !important; color: #333; text-align: right; border-bottom: 1px solid #999;">¥${fmt.format(lineTotal)}</td>
            </tr>
        `;
    });

    return `
        <div id="neo-v3-estimate">
            <!-- Top Area (3 Rows) -->
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                <!-- Row 1: Title -->
                <tr>
                    <td colspan="2" style="text-align: center; padding-bottom: 30px;">
                        <span id="preview-doc-title" style="font-size: 18px !important; font-weight: bold; letter-spacing: 2px; color: #000;">御請求書</span>
                    </td>
                </tr>
                <!-- Row 2: Client & Date -->
                <tr>
                    <td style="width: 60%; vertical-align: top; padding-bottom: 10px;">
                        <div id="preview-client-name" style="font-size: 14px !important; font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 4px; display: inline-block; min-width: 80%; color: #000;">${client}</div>
                    </td>
                    <td style="width: 40%; vertical-align: top; text-align: right; font-size: 11px !important; padding-bottom: 10px; color: #333;">
                        <div id="preview-doc-date" style="font-size: 11px !important;">請求日: ${dateStr}</div>
                        <div id="preview-doc-no" style="font-size: 11px !important;">No: ${docNo}</div>
                    </td>
                </tr>
                <!-- Row 3: Message & Company -->
                <tr>
                    <td style="width: 60%; vertical-align: top; color: #333;">
                        <div style="font-size: 11px !important; margin-bottom: 15px;">下記の通り御請求申し上げます。</div>
                        <div style="margin-bottom: 5px;">
                            <span style="font-size: 11px !important; margin-right: 10px;">件名:</span>
                            <span id="preview-subject" style="font-size: 12px !important; font-weight: bold; border-bottom: 1px solid #ccc; padding-bottom: 2px; display: inline-block; min-width: 60%; color: #000;">${subject}</span>
                        </div>
                        <div style="font-size: 11px !important; margin-bottom: 5px; color: #333;">お支払期限: <span style="font-weight: bold; color: #000;">${deadlineStr || '末日'}</span></div>
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

            <!-- Detail Table -->
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
                        ${itemsHTML}
                    </tbody>
                </table>
                <div style="border-bottom: 2px solid #333; margin-bottom: 15px;"></div>
            </div>

            <!-- Footer Table (Totals only, perfectly aligned) -->
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
                                <td id="preview-grand-total" style="padding: 6px 4px; font-size: 16px !important; font-weight: bold; color: #000; text-align: right; border-top: 1px solid #666; width: 50%;">¥${fmt.format(grandTotal)}</td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>

            <!-- Absolute Bottom-Left QR Code -->
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
};
