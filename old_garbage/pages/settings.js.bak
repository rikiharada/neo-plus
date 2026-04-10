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

    // Retrieve existing URL from Supabase and User Auth Data
    if (supabase) {
        supabase.auth.getUser().then(({ data, error }) => {
            if (data && data.user) {
                const userName = data.user.user_metadata?.name || '';
                const userEmail = data.user.email || '';
                
                const nameInput = document.getElementById('acc-name');
                const emailInput = document.getElementById('acc-email');
                
                if (nameInput) nameInput.value = userName;
                if (emailInput) emailInput.value = userEmail;
            }
        });

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

    // Account Save Logic
    const btnSaveAccount = document.getElementById('btn-save-account');
    if (btnSaveAccount && supabase) {
        btnSaveAccount.addEventListener('click', async () => {
            const originalText = btnSaveAccount.innerHTML;
            btnSaveAccount.innerHTML = '<i class="lucide-loader-2 spin" style="width:16px;height:16px;animation: spin 1s linear infinite;"></i> 更新中...';
            btnSaveAccount.disabled = true;

            const newName = document.getElementById('acc-name')?.value;
            const newEmail = document.getElementById('acc-email')?.value;
            const newPassword = document.getElementById('acc-password')?.value;

            try {
                const updates = { data: { name: newName } };
                if (newEmail) updates.email = newEmail;
                if (newPassword && newPassword.trim().length > 0) updates.password = newPassword;

                const { data, error } = await supabase.auth.updateUser(updates);

                if (error) throw error;
                
                alert('アカウント情報を更新しました。');
                if (newPassword) {
                    document.getElementById('acc-password').value = '';
                }
                
                // Keep it in sync if there's a GlobalStore
                if (window.GlobalStore && window.GlobalStore.setState) {
                     window.GlobalStore.setState({ user: data.user });
                }
                
            } catch (err) {
                console.error('Account update failed:', err);
                alert('更新エラー: ' + err.message);
            } finally {
                btnSaveAccount.innerHTML = originalText;
                btnSaveAccount.disabled = false;
                if (window.lucide) window.lucide.createIcons();
            }
        });
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
