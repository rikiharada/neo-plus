// pages/settings.js
import { initDrive } from '../lib/auth/googleDriveClient.js';
import { supabase } from '../lib/supabase-client.js';

export function initSettingsView() {
    const container = document.getElementById('view-settings');
    if (!container) return;

    const statusEl = document.getElementById('drive-link-status');
    const connectBtn = document.getElementById('btn-connect-drive');
    const linkContainer = document.getElementById('drive-pdf-link-container');
    const linkAnchor = document.getElementById('drive-pdf-link-anchor');

    // Retrieve existing URL from Supabase 
    if (supabase) {
        supabase.from('profiles').select('drive_pdf_url').single().then(({ data }) => {
            if (data && data.drive_pdf_url) {
                if (statusEl) statusEl.textContent = '連携済み';
                if (linkContainer && linkAnchor) {
                    linkAnchor.href = data.drive_pdf_url;
                    linkContainer.style.display = 'block';
                }
            }
        }).catch(err => console.error("Drive link fetch error", err));
    }

    if (connectBtn) {
        connectBtn.addEventListener('click', async () => {
            try {
                await initDrive();
                alert('Google Drive連携完了！（drive.fileスコープのみ）');
                if (statusEl) statusEl.textContent = '連携済み';
            } catch (err) {
                console.error("Drive auth failed", err);
                alert("連携に失敗しました。詳細: " + err.message);
            }
        });
    }
}
