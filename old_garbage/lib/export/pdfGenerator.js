// lib/export/pdfGenerator.js
import { supabase } from '../supabase-client.js';
import { uploadPdfToDrive } from '../cloud/googleDrive.js';

/**
 * Generate PDF from an HTML element using html2pdf.js
 * @param {HTMLElement} element  The DOM element to capture
 * @param {string}  filename     Output filename
 * @param {boolean} triggerDownload  Whether to trigger a local browser download
 * @returns {Promise<Blob>}  The generated PDF Blob
 */
export async function generateHighFidelityPDF(element, filename = 'neo-document.pdf', triggerDownload = true) {
    if (!window.html2pdf) {
        console.error('html2pdf library is not loaded');
        throw new Error('PDF Generation Engine is not loaded.');
    }

    const originalTransform = element.style.transform;
    element.style.transform = 'none';

    const opt = {
        margin: 0,
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
        // html2pdf workers are single-use; create one per operation.
        // Calling .save() then .outputPdf() on the same worker returns empty bytes.
        const blobWorker = window.html2pdf().set(opt).from(element);
        const pdfBlob = await blobWorker.outputPdf('blob');

        if (triggerDownload) {
            // Trigger download via a separate, identical worker
            window.html2pdf().set(opt).from(element).save();
        }

        element.style.transform = originalTransform;
        return pdfBlob;
    } catch (e) {
        element.style.transform = originalTransform;
        console.error("PDF Generation Failed:", e);
        throw e;
    }
}

/**
 * Generate PDF and upload to Google Drive (Zero-Server).
 * Saves only the webViewLink to Supabase `files` table — no binary ever touches the server.
 *
 * @param {HTMLElement} element   DOM element to capture
 * @param {string} filename       Output filename
 * @param {object} meta           Optional metadata: { projectId, docType, clientName }
 * @returns {Promise<string|null>} webViewLink or null on failure
 */
export async function generateAndUploadPDF(element, filename = 'neo-document.pdf', meta = {}) {
    if (!(element instanceof HTMLElement)) {
        throw new Error("generateAndUploadPDF requires an HTMLElement.");
    }

    const pdfBlob = await generateHighFidelityPDF(element, filename, false);

    try {
        const result = await uploadPdfToDrive(pdfBlob, filename);
        if (!result || !result.webViewLink) {
            console.warn("[Drive] Upload returned no webViewLink.");
            return null;
        }

        const webViewLink = result.webViewLink;
        const driveFileId  = result.id;

        // Zero-Server: only the URL pointer is persisted to Supabase
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { error } = await supabase.from('files').insert({
                user_id:      user.id,
                filename:     filename,
                drive_file_id: driveFileId,
                web_view_link: webViewLink,
                doc_type:     meta.docType   || null,
                project_id:   meta.projectId || null,
                client_name:  meta.clientName || null,
                created_at:   new Date().toISOString(),
            });
            if (error) console.warn("[Supabase] files insert error:", error.message);
            else console.log("[Supabase] webViewLink saved to files table:", webViewLink);
        }

        return webViewLink;
    } catch (err) {
        console.warn("[Drive] Upload failed, local download only:", err.message);
        return null;
    }
}
