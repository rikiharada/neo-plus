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
            } else if (path === '/chat') {
                // /chat のみ Chatページへ。/cockpit は必ずダッシュボードへ
                if (window.switchView) window.switchView('view-chat');
            } else {
                // / または /cockpit を含む全パスはダッシュボードへ
                if (window.switchView) {
                    window.switchView('view-dash');
                }
            }

            _routingComplete = true; // 以降の TOKEN_REFRESHED 等で再ルーティングさせない

            const uiAvatar = document.querySelector('.user-info-avatar-text');
            if (uiAvatar) {
                uiAvatar.textContent = session.user.email ? session.user.email.charAt(0).toUpperCase() : 'A';
            }
        } else {
            // Unauthorized Route -> Gatekeeper
            window.GlobalStore.user = null;
            window.GlobalStore.session = null;

            // 書類プレビュー / modal-doc-gen 等は position:fixed のため、ログアウト時に必ず閉じる（switchView は呼ばれない）
            if (typeof window.closeAllNeoOverlays === 'function') {
                window.closeAllNeoOverlays();
            }

            if (appContainer) {
                appContainer.style.display = 'none';
            }
            if (viewAuth) {
                viewAuth.classList.remove('hidden');
                viewAuth.style.display = 'grid';
                viewAuth.style.opacity = '1';
            }
        }
    };

    // 1. Initial Check Strategy (Brain/Body Decouple)
    let _initialAuthHandled = false; // 二重発火防止フラグ
    let _routingComplete = false;    // 初回ルーティング完了フラグ（TOKEN_REFRESHED 等で再ルーティングしないため）
    if (window.supabaseClient) {
        window.supabaseClient.auth.getSession().then(({ data: { session } }) => {
            _initialAuthHandled = true;
            handleAuthState(session);
        }).catch((err) => {
            console.warn('Brain (Supabase) Unreachable. Require sign-in when online.', err);
            _initialAuthHandled = true;
            handleAuthState(null);
        });

        // 2. Continuous Listener
        // INITIAL_SESSION イベントは getSession() と重複するためスキップ
        // TOKEN_REFRESHED / SIGNED_IN 等は初回ルーティング後は状態更新のみ行い、再ルーティングしない
        window.supabaseClient.auth.onAuthStateChange((event, currentSession) => {
            if (event === 'INITIAL_SESSION' && _initialAuthHandled) return;

            // 初回ルーティング完了後 & サインアウト以外のイベントはセッション更新のみ
            if (_routingComplete && event !== 'SIGNED_OUT' && currentSession?.user) {
                window.GlobalStore.updateState({ user: currentSession.user, session: currentSession });
                return;
            }

            handleAuthState(currentSession);
        });
    } else {
        console.warn("Brain (Supabase) Client missing. Booting in Body-Only Local Mode.");
        handleAuthState({ user: { email: 'ceo@local.neo', id: 'local-body-id' } });
    }

    // 3. Login Button Binding
    const btnLogin = document.getElementById('btn-auth-login');
    if (btnLogin) {
        const emailInput = document.getElementById('auth-email');
        if (emailInput) {
            const savedEmail = localStorage.getItem('neo_last_login_email');
            if (savedEmail) emailInput.value = savedEmail;
        }

        // Prevent duplicate bindings
        const newBtnLogin = btnLogin.cloneNode(true);
        btnLogin.parentNode.replaceChild(newBtnLogin, btnLogin);

        newBtnLogin.addEventListener('click', async () => {
            const email = document.getElementById('auth-email')?.value;
            const password = document.getElementById('auth-password')?.value;
            const errorMsg = document.getElementById('auth-error-msg');

            // ダミー UUID は DB の user_id に混入するため廃止 — 本番 UID は Supabase セッションのみ
            if (!email && !password) {
                console.warn('[NeoGatekeeper] メールとパスワードを入力してください（ダミー UUID バイパスは無効です）。');
                if (errorMsg) {
                    errorMsg.textContent = 'メールとパスワードを入力してログインしてください。';
                    errorMsg.style.display = 'block';
                }
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
                if (email) localStorage.setItem('neo_last_login_email', email);
            }
        });
    }

    // ==========================================
    // 4. Signup Panel: Toggle + Registration Handler
    // ==========================================
    const panelLogin  = document.getElementById('panel-login');
    const panelSignup = document.getElementById('panel-signup');

    /** ログイン ↔ 新規登録パネル（CSS .auth-panel--hidden でクロスフェード＋浮遊スライド） */
    const _showPanel = (mode) => {
        if (!panelLogin || !panelSignup) return;
        const goSignup = mode === 'signup';
        panelLogin.classList.toggle('auth-panel--hidden', goSignup);
        panelSignup.classList.toggle('auth-panel--hidden', !goSignup);
        if (!goSignup) {
            const errMsg = document.getElementById('auth-error-msg');
            if (errMsg) errMsg.style.display = 'none';
        }
        if (window.lucide) window.lucide.createIcons();
    };

    // 「新規アカウント作成 →」リンク
    const linkSignup = document.getElementById('link-auth-signup');
    if (linkSignup) {
        linkSignup.addEventListener('click', (e) => {
            e.preventDefault();
            _showPanel('signup');
        });
    }

    // 「← ログインに戻る」リンク
    const linkBackToLogin = document.getElementById('link-back-to-login');
    if (linkBackToLogin) {
        linkBackToLogin.addEventListener('click', (e) => {
            e.preventDefault();
            // 成功メッセージ・エラーをリセット
            const successEl = document.getElementById('signup-success-msg');
            const errEl     = document.getElementById('signup-error-msg');
            if (successEl) successEl.style.display = 'none';
            if (errEl) errEl.style.display = 'none';
            _showPanel('login');
        });
    }

    // サインアップフォームのバリデーション（同意チェック + パスワード一致）
    const _validateSignupForm = () => {
        const email    = document.getElementById('signup-email')?.value?.trim() ?? '';
        const pw       = document.getElementById('signup-password')?.value ?? '';
        const pwConf   = document.getElementById('signup-password-confirm')?.value ?? '';
        const consent  = document.getElementById('signup-consent')?.checked ?? false;
        const btn      = document.getElementById('btn-signup-submit');
        if (!btn) return;

        const isValid = email.length > 0 && pw.length >= 8 && pw === pwConf && consent;
        btn.disabled       = !isValid;
        btn.style.opacity  = isValid ? '1' : '0.45';
        btn.style.cursor   = isValid ? 'pointer' : 'not-allowed';
        btn.style.boxShadow = isValid ? '0 8px 25px rgba(139, 92, 246, 0.4)' : 'none';
    };

    ['signup-email', 'signup-password', 'signup-password-confirm', 'signup-consent'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', _validateSignupForm);
    });

    // パスワード一致インジケーター（入力中にフィールドをハイライト）
    const signupPwConf = document.getElementById('signup-password-confirm');
    if (signupPwConf) {
        signupPwConf.addEventListener('input', () => {
            const pw     = document.getElementById('signup-password')?.value ?? '';
            const pwConf = signupPwConf.value;
            if (pwConf.length === 0) {
                signupPwConf.style.borderColor = 'var(--btn-secondary-border)';
                return;
            }
            signupPwConf.style.borderColor = pw === pwConf ? '#10b981' : '#ef4444';
        });
    }

    // サインアップ送信ボタン
    const btnSignupSubmit = document.getElementById('btn-signup-submit');
    if (btnSignupSubmit) {
        btnSignupSubmit.addEventListener('click', async () => {
            const email   = document.getElementById('signup-email')?.value?.trim() ?? '';
            const pw      = document.getElementById('signup-password')?.value ?? '';
            const pwConf  = document.getElementById('signup-password-confirm')?.value ?? '';
            const errEl   = document.getElementById('signup-error-msg');
            const succEl  = document.getElementById('signup-success-msg');

            // 二重チェック
            if (!email || pw.length < 8) {
                if (errEl) { errEl.textContent = 'メールと8文字以上のパスワードを入力してください。'; errEl.style.display = 'block'; }
                return;
            }
            if (pw !== pwConf) {
                if (errEl) { errEl.textContent = 'パスワードが一致しません。'; errEl.style.display = 'block'; }
                return;
            }

            btnSignupSubmit.disabled = true;
            btnSignupSubmit.textContent = '登録中...';
            if (errEl) errEl.style.display = 'none';

            if (!window.supabaseClient) {
                if (errEl) { errEl.textContent = 'Supabase に接続できません。ネットワークを確認してください。'; errEl.style.display = 'block'; }
                btnSignupSubmit.disabled = false;
                btnSignupSubmit.textContent = 'アカウントを作成する';
                return;
            }

            const { error } = await window.supabaseClient.auth.signUp({ email, password: pw });

            if (error) {
                if (errEl) {
                    // Supabase エラーメッセージを日本語化
                    const msgMap = {
                        'User already registered': 'このメールアドレスは既に登録されています。ログインしてください。',
                        'Password should be at least 6 characters': 'パスワードは6文字以上で入力してください。',
                        'Unable to validate email address: invalid format': 'メールアドレスの形式が正しくありません。',
                    };
                    errEl.textContent = msgMap[error.message] ?? `登録に失敗しました: ${error.message}`;
                    errEl.style.display = 'block';
                }
                btnSignupSubmit.disabled = false;
                btnSignupSubmit.textContent = 'アカウントを作成する';
            } else {
                // 成功 — 確認メール送信済みメッセージを表示
                btnSignupSubmit.style.display = 'none';
                if (succEl) {
                    succEl.style.display = 'block';
                    if (window.lucide) window.lucide.createIcons();
                }
                // 3秒後に自動でログインパネルへ戻る
                setTimeout(() => {
                    if (succEl) succEl.style.display = 'none';
                    btnSignupSubmit.style.display = 'block';
                    btnSignupSubmit.disabled = false;
                    btnSignupSubmit.textContent = 'アカウントを作成する';
                    // フォームをリセット
                    ['signup-email', 'signup-password', 'signup-password-confirm'].forEach((id) => {
                        const el = document.getElementById(id);
                        if (el) el.value = '';
                    });
                    const consent = document.getElementById('signup-consent');
                    if (consent) consent.checked = false;
                    _validateSignupForm();
                    _showPanel('login');
                }, 4000);
            }
        });
    }
}
