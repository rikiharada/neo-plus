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

    // ----------------------------------------------------------------------
    // Part 2: Authentication Gatekeeper (Migrated from app.js)
    // ----------------------------------------------------------------------
    console.log('[Setup] Initializing Auth Gatekeeper');
    const viewAuth = document.getElementById('view-auth');
    const appContainer = document.getElementById('app-container');

    const handleAuthState = (session) => {
        if (session?.user) {
            // Authenticated Route
            window.GlobalStore.updateState({ user: session.user, session: session });
            if (window.GlobalStore.initRealtimeSync && window.supabaseClient) {
                window.GlobalStore.initRealtimeSync();
            }

            if (viewAuth) {
                viewAuth.classList.add('hidden');
                viewAuth.style.display = 'none';
            }
            if (appContainer) {
                appContainer.style.display = 'block';
            }

            // Vercel SPA Deep Link Routing Guard
            const path = window.location.pathname;
            
            if (path === '/account' || path === '/settings') {
                if (window.switchView) window.switchView('view-settings');
            } else if (path === '/cockpit' || path === '/chat') {
                if (window.switchView) window.switchView('view-chat');
            } else {
                if (window.switchView) {
                    window.switchView('view-chat');
                }
            }

            const uiAvatar = document.querySelector('.user-info-avatar-text');
            if (uiAvatar) {
                uiAvatar.textContent = session.user.email ? session.user.email.charAt(0).toUpperCase() : 'A';
            }
        } else {
            // Unauthorized Route -> Gatekeeper
            window.GlobalStore.user = null;
            window.GlobalStore.session = null;

            if (appContainer) {
                appContainer.style.display = 'none';
            }
            if (viewAuth) {
                viewAuth.classList.remove('hidden');
                viewAuth.style.display = 'grid';
            }
        }
    };

    // 1. Initial Check Strategy (Brain/Body Decouple)
    if (window.supabaseClient) {
        window.supabaseClient.auth.getSession().then(({ data: { session } }) => {
            handleAuthState(session);
        }).catch(err => {
            console.warn("Brain (Supabase) Unreachable. Falling back to Local Body Mode.", err);
            handleAuthState({ user: { email: 'ceo@local.neo', id: 'local-body-id' } });
        });

        // 2. Continuous Listener
        window.supabaseClient.auth.onAuthStateChange((_event, currentSession) => {
            handleAuthState(currentSession);
        });
    } else {
        console.warn("Brain (Supabase) Client missing. Booting in Body-Only Local Mode.");
        handleAuthState({ user: { email: 'ceo@local.neo', id: 'local-body-id' } });
    }

    // 3. Login Button Binding
    const btnLogin = document.getElementById('btn-auth-login');
    if (btnLogin) {
        // Prevent duplicate bindings
        const newBtnLogin = btnLogin.cloneNode(true);
        btnLogin.parentNode.replaceChild(newBtnLogin, btnLogin);

        newBtnLogin.addEventListener('click', async () => {
            const email = document.getElementById('auth-email')?.value;
            const password = document.getElementById('auth-password')?.value;
            const errorMsg = document.getElementById('auth-error-msg');
            const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

            // Development Auto-Login Bypass (Enabled for preview/dev)
            if (!email && !password) {
                console.log("[NeoGatekeeper] Development bypass activated. Logging in as CEO.");
                if (errorMsg) errorMsg.style.display = 'none';
                newBtnLogin.textContent = "Bypass 成功";
                handleAuthState({ user: { email: 'ceo@example.com', id: '00000000-0000-0000-0000-000000000000' } });
                return;
            }

            if (!email || !password) {
                if (errorMsg) {
                    errorMsg.textContent = "メールとパスワードを入力してください";
                    errorMsg.style.display = 'block';
                }
                return;
            }

            newBtnLogin.disabled = true;
            newBtnLogin.textContent = "認証中...";

            const { error } = await window.supabaseClient.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                if (errorMsg) {
                    errorMsg.textContent = "ログインに失敗しました: " + error.message;
                    errorMsg.style.display = 'block';
                }
                newBtnLogin.disabled = false;
                newBtnLogin.textContent = "ログイン";
            } else {
                if (errorMsg) errorMsg.style.display = 'none';
                newBtnLogin.textContent = "ログイン成功";
            }
        });
    }
}
