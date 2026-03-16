/**
 * Neo+ Setup / Gatekeeper Controller
 * Handles first-time setup, language selection, and consent validation.
 */

// Global export of the initialization function so the router can trigger it
export function initSetupView() {
    console.log('[Setup] Initializing Setup View Controller');

    const setupConsentCheckbox = document.getElementById('setup-consent-checkbox');
    const btnStart = document.getElementById('btn-start');
    const selectUiLang = document.getElementById('select-ui-lang');
    const selectNeoMode = document.getElementById('select-neo-mode');

    // Restore previous selections if they exist
    if (selectUiLang) {
        const savedLang = localStorage.getItem('neo_ui_lang');
        if (savedLang) selectUiLang.value = savedLang;
    }

    if (selectNeoMode) {
        const savedMode = localStorage.getItem('neo_language_mode');
        if (savedMode) selectNeoMode.value = savedMode;
    }

    // Gatekeeper Validation
    const validateSetupGatekeeper = () => {
        const validationMsg = document.getElementById('setup-validation-msg');
        if (!btnStart) return;

        let isValid = false;
        if (setupConsentCheckbox && setupConsentCheckbox.checked) {
            isValid = true;
        }

        if (isValid) {
            btnStart.disabled = false;
            btnStart.style.opacity = '1';
            btnStart.style.cursor = 'pointer';
            btnStart.style.boxShadow = '0 8px 25px rgba(29, 155, 240, 0.4)';
            if (validationMsg) validationMsg.style.opacity = '0';
        } else {
            btnStart.disabled = true;
            btnStart.style.opacity = '0.4';
            btnStart.style.cursor = 'not-allowed';
            btnStart.style.boxShadow = 'none';
            if (validationMsg) validationMsg.style.opacity = '1';
        }
    };

    if (setupConsentCheckbox) {
        // Remove old global listeners if they exist (to prevent duplicates during SPA navigation)
        setupConsentCheckbox.removeEventListener('change', validateSetupGatekeeper);
        setupConsentCheckbox.addEventListener('change', validateSetupGatekeeper);
    }

    // Start App Handler
    const handleStartApp = () => {
        if (setupConsentCheckbox && !setupConsentCheckbox.checked) {
            alert('利用規約に同意してください。');
            return;
        }

        console.log('[Setup] btnStart clicked (Gatekeeper passed)');

        // Save Master Settings
        localStorage.setItem('fini_setup_complete', 'true');
        localStorage.setItem('neo_legal_consent', 'true'); // Formalize consent matrix

        if (selectUiLang) {
            const chosenLang = selectUiLang.value || 'ja';
            localStorage.setItem('neo_ui_lang', chosenLang);
            if (window.i18n) {
                window.i18n.loadLocale(chosenLang).then(() => {
                    window.i18n.updateDOM();
                });
            }
        }

        if (selectNeoMode) {
            localStorage.setItem('neo_language_mode', selectNeoMode.value || 'ja');
        }

        // Transition to Dashboard via Global Router
        if (window.showDash) {
            window.showDash();
        } else {
            window.switchView('view-dash');
        }

        console.log('%cNEO+ CORE SYSTEM: ONLINE / PAID TIER ACTIVATED', 'color: #10b981; font-weight: bold; font-size: 16px;');
    };

    if (btnStart) {
        btnStart.removeEventListener('click', handleStartApp);
        btnStart.addEventListener('click', handleStartApp);
    }

    // Initial check
    validateSetupGatekeeper();
}
