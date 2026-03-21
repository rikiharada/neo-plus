// lib/export/pdfGenerator.js
import { supabase } from '../supabase-client.js';
import { uploadPdfToDrive } from '../auth/googleDriveClient.js';

/**
 * Generate PDF from an HTML element using html2pdf.js and optionally upload to Drive
 * @param {HTMLElement} element The DOM element to capture (e.g. document.getElementById('doc-preview-paper'))
 * @param {string} filename The filename to save as
 * @param {boolean} triggerDownload Whether to trigger a local browser download
 * @returns {Promise<Blob>} The generated PDF Blob
 */
export async function generateHighFidelityPDF(element, filename = 'neo-document.pdf', triggerDownload = true) {
    if (!window.html2pdf) {
        console.error('html2pdf library is not loaded');
        throw new Error('PDF Generation Engine is not loaded.');
    }

    // Temporarily adjust styles for perfect rendering if necessary
    const originalTransform = element.style.transform;
    element.style.transform = 'none'; // Ensure no scaling affects the canvas capture

    const opt = {
        margin: 0,
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false }, // scale 2 for retina display quality
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
        const worker = window.html2pdf().set(opt).from(element);
        
        // Trigger local download if requested
        if (triggerDownload) {
            worker.save();
        }

        // Also get the blob for potential cloud upload
        const pdfBlob = await worker.outputPdf('blob');

        // Restore styles Native App Feel
        element.style.transform = originalTransform;

        return pdfBlob;
    } catch (e) {
        element.style.transform = originalTransform;
        console.error("PDF Generation Failed:", e);
        throw e;
    }
}

// Keeping the original function signature for backwards compatibility if used elsewhere
export async function generateAndUploadPDF(txs_or_element, filename = 'neo-transactions.pdf') {
    let pdfBlob;
    if (txs_or_element instanceof HTMLElement) {
        pdfBlob = await generateHighFidelityPDF(txs_or_element, filename, false);
    } else {
        // Fallback or legacy (not used in new flow but kept just in case)
        throw new Error("generateAndUploadPDF now requires an HTMLElement for high fidelity rendering.");
    }

    try {
        const url = await uploadPdfToDrive(pdfBlob, filename);
        if (url) {
            const userResponse = await supabase.auth.getUser();
            if (userResponse.data && userResponse.data.user) {
                await supabase.from('profiles').update({ drive_pdf_url: url }).eq('id', userResponse.data.user.id);
            }
        }
        return url;
    } catch(err) {
        console.warn("Drive Upload Failed, returning blob instead", err);
        return null;
    }
}

