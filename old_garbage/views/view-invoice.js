/** Invoice View Generator */


window.issueInvoiceFromPreview = async function() {
    const previewContainer = document.querySelector('.invoice-a4');
    if (!previewContainer) return;

    // Provide visual feedback
    const btn = document.querySelector('#document-preview-modal header button:last-child');
    const originalText = btn.textContent;
    btn.textContent = '保存中...';
    btn.disabled = true;

    try {
        if (typeof html2pdf !== 'undefined') {
            const opt = {
                margin:       0,
                filename:     `Invoice_${Date.now()}.pdf`,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { scale: 2 },
                jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
            };

            const pdfWorker = await html2pdf().set(opt).from(previewContainer).outputPdf('blob');
            const url = await window.uploadPdfToDrive(pdfWorker, `Invoice_${Date.now()}.pdf`);
            console.log('Invoice successfully uploaded to Google Drive:', url);
            
            // Log to chat
            const cv = document.getElementById('view-chat');
            if (cv && !cv.classList.contains('hidden')) {
                const msgs = document.getElementById('chat-messages');
                if (msgs) {
                    msgs.insertAdjacentHTML('beforeend', `<div class="chat-message message-neo"><div class="message-bubble">請求書を作成してDriveに保存しました！<br><a href="${url}" target="_blank" style="color:var(--accent-neo-cyan);">[プレビューを開く]</a></div></div>`);
                    msgs.scrollTop = msgs.scrollHeight;
                }
            }
        } else {
            console.warn('html2pdf is not loaded. Falling back to native print dialog.');
            window.print();
        }
    } catch (err) {
        console.error('Invoice Generation failed:', err);
        alert('請求書の保存に失敗しました: ' + err.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
        document.getElementById('document-preview-modal').classList.add('hidden');
    }
};

