/**
 * Neo+ Account & Settings Module
 * Handles BYOC cloud sync visualization, themes, and document stamp setup.
 */

export function initAccountSettings() {
    console.log("[Neo Account Settings] Initializing...");

    _restoreGDriveState();
    bindCloudSyncEvents();
    bindStampOverlayControls();

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

/** Restore Google Drive UI state from localStorage on every settings page open */
function _restoreGDriveState() {
    const panel      = document.getElementById('gdrive-connection-panel');
    // 1-Click Flow: Client ID is safely wrapped inside googleDrive.js

    // Restore connected/disconnected display
    const token  = localStorage.getItem('neo_cloud_token');
    const expiry = parseInt(localStorage.getItem('neo_token_expiry') || '0', 10);
    const isValid = token && expiry > Date.now();

    if (panel) panel.style.display = 'block';

    if (isValid) {
        // Already connected — re-init GIS silently and show connected state
        _initGISWithSavedId(() => {});
        if (window.NeoCloudSync) window.NeoCloudSync.updateUIConnectionState(true);
    } else {
    if (window.NeoCloudSync) window.NeoCloudSync.updateUIConnectionState(false);
    }
}

/** Init GIS synchronously for 1-click binding */
function _initGISWithSavedId(onToken) {
    if (!window.NeoCloudSync) return;
    window.NeoCloudSync.initGIS(onToken);
}

// 1-click flow implies no explicit ID saving necessary.

function bindCloudSyncEvents() {
    const radioGdrive = document.getElementById('radio-gdrive-sync');
    const loadingOverlay = document.getElementById('gdrive-loading-overlay');

    if (radioGdrive && loadingOverlay) {
        radioGdrive.onchange = (e) => {
            if (e.target.checked) {
                loadingOverlay.classList.remove('hidden');

                // Trigger Google Identity Services (GIS)
                if (window.NeoCloudSync && window.NeoCloudSync.initGIS) {
                    window.NeoCloudSync.initGIS((token) => {
                        // Success Callback
                        loadingOverlay.classList.add('hidden');
                        
                        // Add CSS Pulse Animation hook to radio parent
                        const container = radioGdrive.closest('label') || radioGdrive.parentElement;
                        if (container) {
                            container.classList.add('neo-pulse-sync');
                            // Replace text to reflect connection
                            const textSpan = container.querySelector('span:last-child');
                            if (textSpan) textSpan.innerHTML = '<span style="color:#10b981; font-weight:700;">●</span> Google Drive (Connected)';
                        }
                        
                        // Update Header Cloud Icon
                        const headerCloudIcon = document.querySelector('.scan-pulse')?.previousElementSibling;
                        if (headerCloudIcon) {
                            headerCloudIcon.setAttribute('data-lucide', 'cloud-check');
                            headerCloudIcon.style.color = '#10b981';
                            if(window.lucide) window.lucide.createIcons();
                        }

                        if (window.neoBubble) window.neoBubble("Google Drive との暗号化同期(Zero-Server)を確立しました。");
                        
                        // Prompt auth flow manually since it might be required for the first time
                        window.NeoCloudSync.requestDriveAccess();
                    });
                } else {
                    console.error("NeoCloudSync module not loaded.");
                    loadingOverlay.classList.add('hidden');
                }
            }
        };
    }
}

function bindStampOverlayControls() {
    const toggleStamp = document.getElementById('toggle-stamp-overlay');
    const uploadArea = document.getElementById('stamp-upload-area');
    const fileInput = document.getElementById('stamp-file-input');
    const previewImg = document.getElementById('stamp-preview-img');
    const adjustControls = document.getElementById('stamp-adjust-controls');
    
    // Position Sliders
    const xSlider = document.getElementById('stamp-x-slider');
    const ySlider = document.getElementById('stamp-y-slider');
    const xVal = document.getElementById('stamp-x-val');
    const yVal = document.getElementById('stamp-y-val');

    // 1. Toggle Switch visually updates the sliding knob via CSS (added dynamically if missing)
    if (toggleStamp) {
        const spanKnob = toggleStamp.parentElement.querySelector('.slider-knob');
        if (spanKnob) {
            // Apply initial state
            spanKnob.style.transform = toggleStamp.checked ? 'translateX(20px)' : 'translateX(0)';
            spanKnob.parentElement.style.backgroundColor = toggleStamp.checked ? 'var(--accent-neo-green)' : '#ccc';
        }

        toggleStamp.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            if (spanKnob) {
                spanKnob.style.transform = isChecked ? 'translateX(20px)' : 'translateX(0)';
                spanKnob.parentElement.style.backgroundColor = isChecked ? 'var(--accent-neo-green)' : '#ccc';
            }
            
            // Link state to GlobalConfig (mock concept)
            if (window.GlobalStore && window.GlobalStore.userConfig) {
                window.GlobalStore.userConfig.useStamp = isChecked;
            }
        });
    }

    // 2. Click Upload Area -> Trigger File Input
    if (uploadArea && fileInput) {
        uploadArea.addEventListener('click', () => {
            fileInput.click();
        });
    }

    // 3. Handle File Selection (Fake upload / read locally)
    if (fileInput && previewImg) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(eResult) {
                    previewImg.src = eResult.target.result;
                    previewImg.style.display = 'block';
                    
                    // Hide the placeholder icon/text
                    const icon = uploadArea.querySelector('i');
                    const text1 = uploadArea.querySelector('div:nth-of-type(1)');
                    const text2 = uploadArea.querySelector('div:nth-of-type(2)');
                    if (icon) icon.style.display = 'none';
                    if (text1) text1.style.display = 'none';
                    if (text2) text2.style.display = 'none';

                    // Save to userConfig cache
                    if (window.GlobalStore && window.GlobalStore.userConfig) {
                        window.GlobalStore.userConfig.stampDataUrl = eResult.target.result;
                    }

                    if (window.neoBubble) window.neoBubble("社印をスキャンし、暗号化キャッシュに保存しました。");
                }
                reader.readAsDataURL(file);
            }
        });
    }

    // 4. Handle Adjust Sliders
    const updatePosition = () => {
        if (!xSlider || !ySlider) return;
        if (xVal) xVal.textContent = xSlider.value + 'px';
        if (yVal) yVal.textContent = ySlider.value + 'px';
        
        if (window.GlobalStore && window.GlobalStore.userConfig) {
            window.GlobalStore.userConfig.stampOffsetX = parseInt(xSlider.value, 10);
            window.GlobalStore.userConfig.stampOffsetY = parseInt(ySlider.value, 10);
        }
    };

    if (xSlider) xSlider.addEventListener('input', updatePosition);
    if (ySlider) ySlider.addEventListener('input', updatePosition);
}

// Global reset exposed
window.resetSetup = async () => {
    const confirmed = confirm(
        "⚠️ 全データを完全に消去します。\n\n" +
        "・フォルダ（プロジェクト）\n" +
        "・経費・取引履歴\n" +
        "・書類データ\n" +
        "・ローカルキャッシュ・設定\n\n" +
        "この操作は取り消せません。本当に初期化しますか？"
    );
    if (!confirmed) return;

    // ボタンをローディング表示に変更
    const btn = document.querySelector('[onclick="window.resetSetup()"]');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.innerHTML = '⏳ リセット中...';
        btn.disabled = true;
    }

    try {
        // 1. Supabase のユーザーデータを削除 + localStorage のユーザーボディをクリア
        if (typeof window.neoHardReset === 'function') {
            await window.neoHardReset();
        } else {
            // フォールバック: ローカルのみクリア
            if (typeof window.neoDangerZoneWipeUserLocalBody === 'function') {
                window.neoDangerZoneWipeUserLocalBody({ context: 'manual_reset' });
            }
        }

        // 2. 残りの localStorage を全消去（設定・テーマ・キャッシュ含む）
        localStorage.clear();

        // 3. リロードして真っさらな状態に
        window.location.reload();
    } catch (e) {
        console.error('[Reset] エラー:', e);
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
        alert('リセット中にエラーが発生しました。ページを手動でリロードしてください。\n' + (e?.message || e));
    }
};
