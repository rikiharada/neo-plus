/**
 * Neo+ Account & Settings Module
 * Handles BYOC cloud sync visualization, themes, and document stamp setup.
 */

export function initAccountSettings() {
    console.log("[Neo Account Settings] Initializing...");

    bindCloudSyncEvents();
    bindStampOverlayControls();
    
    // Lucide icons re-render for settings view
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

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
window.resetSetup = () => {
    if (confirm("全てのローカルデータと設定を消去し、初期化しますか？")) {
        localStorage.clear();
        window.location.reload();
    }
};
