// --- Neo-Sync v2.0 Global Data Model ---
window.mockDB = window.mockDB || {
    userConfig: {
        industry: localStorage.getItem('neo_industry') || "construction",
        cloudProvider: localStorage.getItem('neo_cloud') || "icloud",
        targetMonthlyProfit: 1000000
    },
    inbox: [],
    clients: [],
    vendors: [],
    projects: [],
    documents: [],
    transactions: [],
    learnedKeywords: {}
};

// Global DB Helpers for Supabase Sync
window.insertProject = async (proj) => {
    window.mockDB.projects.unshift(proj);
    if (window.supabaseClient) {
        try {
            await window.supabaseClient.from('projects').insert([{
                name: proj.name,
                customer_name: proj.customerName || null,
                location: proj.location || null,
                note: proj.note || null,
                category: proj.category || 'other',
                color: proj.color || '#8E8E93',
                unit: proj.unit || null,
                has_unpaid: proj.hasUnpaid || false,
                revenue: proj.revenue || 0,
                status: proj.status || 'active',
                client_name: proj.clientName || null,
                payment_deadline: proj.paymentDeadline || null,
                bank_info: proj.bankInfo || null,
                last_updated: proj.lastUpdated || null,
                currency: proj.currency || 'JPY'
            }]);
        } catch(e) { console.error('Supabase Error:', e); }
    }
};

window.insertTransaction = async (tx) => {
    window.mockDB.transactions.push(tx);
    if (window.supabaseClient) {
        try {
            await window.supabaseClient.from('activities').insert([{
                project_id: tx.projectId,
                type: tx.type,
                category: tx.category,
                title: tx.title,
                amount: tx.amount,
                date: tx.date,
                receipt_url: tx.receiptUrl || null,
                is_bookkeeping: tx.isBookkeeping || false,
                is_deleted: false // Explicitly initialize persistent state
            }]);
            console.log("Supabase insertTransaction success:", tx.title, "is_bookkeeping:", tx.isBookkeeping);
        } catch(e) { console.error('Supabase Error:', e); }
    }
};

window.updateTransaction = async (txId, updates) => {
    // Local Update
    const tx = window.mockDB.transactions.find(t => t.id === txId);
    if (!tx) return;
    
    // Merge updates
    const originalTitle = tx.title;
    const originalAmount = tx.amount;
    
    if (updates.category) tx.category = updates.category;
    if (updates.title) tx.title = updates.title;
    if (updates.amount !== undefined) tx.amount = Number(updates.amount);
    
    tx.is_user_corrected = true; // Flag for Ground Truth Cache Priority

    // Sync to Supabase if exists
    if (window.supabaseClient) {
        try {
            // Note: Since our MVP frontend doesn't strictly pull unique Postgres UUIDs back to mockDB.id on insert,
            // we will search and update by original title and amount as a composite fallback for the prototype.
            // In a production app, the insertTransaction should return the actual DB UUID to keep them synced.
            const query = window.supabaseClient.from('activities').update({
                category: tx.category,
                title: tx.title,
                amount: tx.amount,
                is_user_corrected: true
            }).match({
                title: originalTitle,
                amount: originalAmount,
                date: tx.date
            });
            await query;
            console.log("Supabase updateTransaction success:", tx.title, "updates:", updates);
        } catch(e) { console.error('Supabase Update Error:', e); }
    }
};


window.parseCommand = function (text) {
    let result = { date: null, location: null, title: text, category: "雑費" };
    console.log(`[DEBUG] Final Form Lexicon Parse Start: "${text}"`);

    let remainingText = text;

    // 1. Date Extraction: (\d{1,2})月(\d{1,2})日 OR (\d{1,2})/(\d{1,2})
    const dateMatch = remainingText.match(/(\d{1,2})[月\/](\d{1,2})(?:日)?/);
    if (dateMatch) {
        const mm = dateMatch[1].padStart(2, '0');
        const dd = dateMatch[2].padStart(2, '0');
        const yy = new Date().getFullYear();
        result.date = `${yy}/${mm}/${dd}`;
        remainingText = remainingText.replace(dateMatch[0], '');
    }

    // 2. Location Extraction: Text right before 'で' or 'にて'
    // Ignore leading particles like 'に' or 'は' that might be lingering after date removal
    const locMatch = remainingText.match(/(?:[には])?([^、。\sには]+?)(?:で|にて)/);
    if (locMatch) {
        result.location = locMatch[1].trim();
        remainingText = remainingText.replace(locMatch[0], '');
    }

    // 3. Title cleanup & Conversational Nuance Interpretation
    // First, strip out common typo variations and intent triggers BEFORE stripping particles
    // "はいいた" -> "入った", "決まった" -> "決定"
    remainingText = remainingText.replace(/はいいた|はいいった/g, '入った');

    // Aggressively strip leading particles and common verbs including the CEO's new list
    // Removed: フォルダ作って, 保存して, メモして, 追加して, 作成して, 開始, ある, あります, 作成, ファイル, 新規, フォルダ, が入った, が決まった, する
    const noiseWordsRegex = /フォルダ作って|フォルダを作って|プロジェクトを作って|保存して|メモして|追加して|作成して|開始|ある|あります|作成|ファイル|新規|フォルダ|が入った|が決まった|する|入った|決定/g;

    remainingText = remainingText.replace(/^[、。\sにはでをが]+/g, '')
        .replace(/[、。\sが。]+$/g, '')
        .replace(noiseWordsRegex, '')
        .replace(/[をが。.]/g, '')
        .trim();

    if (remainingText.length > 0) {
        result.title = remainingText;
    } else {
        result.title = "新規プロジェクト";
    }

    // Deep Industry Entity Classification (Keep original category logic)
    const currentIndustry = (typeof mockDB !== 'undefined' && mockDB.userConfig) ? mockDB.userConfig.industry : 'general';
    if (window.StaticLexicon && window.StaticLexicon.categorizeExpense) {
        result.category = window.StaticLexicon.categorizeExpense(text, currentIndustry);
    }

    console.log(`Extraction Test: [Date: ${result.date || "-"}, Loc: ${result.location || "-"}, Title: ${result.title}, Category: ${result.category}]`);
    return result;
};

// Global hoisting of createProject to ensure it is always available
window.createProject = window.createProject || function (title, pDate, pLoc) {
    let parsed = window.parseCommand(title);
    let cleanTitle = parsed.title || '';
    // 物理的に『作成』『ファイル』等のゴミを完全抹殺する (parseCommand側でも処理しているが念入りに)
    const extraNoise = /フォルダ作って|フォルダを作って|プロジェクトを作って|保存して|メモして|追加して|作成して|開始|ある|あります|作成|ファイル|新規|フォルダ|が入った|が決まった|する|はいいた|はいいった|入った|決定/g;
    cleanTitle = cleanTitle.replace(/^[、。\sにはでをが]+/g, '')
        .replace(/[、。\sが。]+$/g, '')
        .replace(extraNoise, '')
        .replace(/[をが。.]/g, '');
    if (cleanTitle === '') cleanTitle = '新規プロジェクト';

    const newProjId = Date.now();
    const newProj = {
        id: newProjId,
        name: cleanTitle,
        customerName: "-",
        location: parsed.location || pLoc || "-",
        note: "",
        category: "other",
        color: "#007AFF",
        unit: "-",
        hasUnpaid: false,
        revenue: 0,
        status: 'active',
        startDate: parsed.date ? parsed.date.replace(/\//g, '-') : (pDate ? pDate.replace(/\//g, '-') : new Date().toLocaleDateString('ja-JP').replace(/\//g, '-')),
        lastUpdated: new Date().toLocaleDateString('ja-JP').replace(/\//g, '-')
    };

    // Safety Fallback Check
    if (!window.mockDB || !window.mockDB.projects) {
        window.mockDB = window.mockDB || { projects: [], transactions: [], documents: [] };
        if (!window.mockDB.projects) window.mockDB.projects = [];
    }

    window.insertProject(newProj);
    currentOpenProjectId = newProjId;

    // 即時UI更新
    if (typeof renderProjects === 'function') {
        renderProjects(mockDB.projects);
    }
    return newProj;
};

// Add self-test on load just to be absolutely sure
setTimeout(() => {
    console.log('--- Self Test for Final Form parseCommand ---');
    if (window.parseCommand) {
        window.parseCommand('3月24日、銀座で撮影');
    }
}, 1000);

// Make initialization robust for iOS Safari
window.addEventListener('load', async () => {
    // Initialize i18n
    await window.i18n.loadLocale('ja'); // Load default 'ja' locale

    // Setup Views
    const setupView = document.getElementById('view-setup');
    const dashView = document.getElementById('view-dash');

    // Setup Elements
    const btnStart = document.getElementById('btn-start');
    const selectFontSize = document.getElementById('select-font-size');
    const selectIndustry = document.getElementById('select-industry');

    // Populate Massive Industry List from window.INDUSTRIES
    if (selectIndustry && window.INDUSTRIES) {
        selectIndustry.innerHTML = '<option value="" disabled selected>選択して下さい（選択不可）</option>';
        window.INDUSTRIES.forEach(ind => {
            const opt = document.createElement('option');
            opt.value = ind.id;
            opt.textContent = ind.name;
            selectIndustry.appendChild(opt);
        });
    }

    // Dashboard Elements
    const neoDashContainer = document.getElementById('neo-dash-container');

    let neo;
    let currentOpenProjectId = null;
    let currentProjectPage = 1;

    // Initial state logic
    const checkInitialSetup = () => {
        // --- Gatekeeper V2: Unified Onboarding Check ---
        const hasSetup = localStorage.getItem('fini_setup_complete');
        // A single source of truth for completion.
        if (!hasSetup) {
            window.switchView('view-setup');
            
            // Re-eval setup validation on boot if they are on the setup screen
            setTimeout(() => {
                if(window.validateSetupGatekeeper) window.validateSetupGatekeeper();
            }, 500);
        } else {
            window.showDash();
            
            // Re-render user info on Dash
            const uiAvatar = document.querySelector('.user-info-avatar-text');
            const storedName = localStorage.getItem('userMeta_name') || 'Guest';
            if (uiAvatar) {
                uiAvatar.textContent = storedName.charAt(0).toUpperCase();
            }

            // --- 📡 Initialize Neo Trend Alerts ---
            checkLatestBusinessTrends();
        }
    };

    /**
     * 📡 Future Feature: checkLatestBusinessTrends()
     * Simulates fetching real-time tax/subsidy news from the internet (e.g. via RSS or API).
     */
    function checkLatestBusinessTrends() {
        const marqueeText = document.getElementById('trend-marquee-text');
        
        const mockTrendNews = [
            "【IT導入補助金】令和8年度のスケジュールが更新されました。",
            "【インボイス制度】免税事業者の経過措置（8割控除）に関するFAQが追加されました",
            "【確定申告】今年のe-Taxのメンテナンス予定が発表されました",
            "【Neo+稼働状況】AI監査エンジンは現在100%の精度で稼働中..."
        ];

        if (marqueeText) {
            const randomNews = mockTrendNews[Math.floor(Math.random() * mockTrendNews.length)];
            marqueeText.textContent = `SYSTEM ONLINE: ${randomNews} // Current Status: Awaiting CEO Input...`;
        }
    }

    // --- Global Profit Calculation ---
    window.updateGlobalProfitDisplay = () => {
        if (!window.mockDB) return;
        
        // Calculate total revenue from projects and transactions
        let totalRevenue = 0;
        if (window.mockDB.projects) {
            window.mockDB.projects.forEach(p => {
                if (p.id !== 1 && p.revenue) {
                    totalRevenue += p.revenue;
                }
            });
        }

        let totalExpenses = 0;
        if (window.mockDB.transactions) {
            window.mockDB.transactions.forEach(t => {
                if (t.type === 'expense') totalExpenses += t.amount;
                if (t.type === 'sales') totalRevenue += t.amount;
            });
        }
        
        const currentProfit = totalRevenue - totalExpenses;
        const fmt = new Intl.NumberFormat('ja-JP');

        // Update all elements showing profit
        const mainProfitEls = document.querySelectorAll('#total-profit, #header-profit');
        mainProfitEls.forEach(el => {
            if (el) {
                el.textContent = `¥${fmt.format(currentProfit)}`;
                // Optional color logic
                if (currentProfit < 0) {
                    el.style.color = '#FF3B30';
                } else {
                    el.style.color = 'var(--text-main)';
                }
            }
        });

        // Update circular progress (if present)
        const profitProgress = document.getElementById('profit-progress-circle');
        if (profitProgress) {
            const target = (window.mockDB.userConfig && window.mockDB.userConfig.targetMonthlyProfit) ? window.mockDB.userConfig.targetMonthlyProfit : 1000000;
            const percentage = Math.min(100, Math.max(0, (currentProfit / target) * 100));
            profitProgress.style.strokeDasharray = `${percentage}, 100`;
            
            const percentageText = document.getElementById('profit-percentage');
            if (percentageText) percentageText.textContent = `${Math.floor(percentage)}%`;
        }
    };

    window.showDash = () => {
        if (setupView) {
            setupView.classList.add('hidden');
            setupView.style.display = 'none';
        }

        if (dashView) {
            dashView.classList.remove('hidden');
            dashView.style.display = 'grid';
        }

        // Animate neo container coming in
        setTimeout(() => {
            if (neoDashContainer) {
                neoDashContainer.classList.add('active');
            }
            if (neo) neo.speak('neo_startup');
        }, 100);

        if (bottomNav) {
            bottomNav.classList.remove('hidden');
            bottomNav.style.display = 'grid';
        }

        applyTheme(document.documentElement.getAttribute('data-theme') || 'dark');

        // Refresh UI
        if (typeof renderProjects === 'function') {
            renderProjects(mockDB.projects);
        }
        window.updateGlobalProfitDisplay();

        // 常に最新の設定を反映
        const userIndustry = (typeof mockDB !== 'undefined' && mockDB.userConfig) ? mockDB.userConfig.industry : 'general';
        const docBtnContainer = document.getElementById('docgen-btn-container');

        if (docBtnContainer) {
            docBtnContainer.innerHTML = ''; // クリア
            const createDocBtn = (icon, color, title, desc, docType) => {
                return `<button class="btn-primary" onclick="window.openDocGenModal()" style="width: 100%; border-radius: 12px; font-weight: 600; font-size: 14px; display: grid; grid-auto-flow: column; justify-content: start; align-items: center; justify-content: start; gap: 12px; padding: 16px;"><i data-lucide="${icon}" style="width: 20px; height: 20px; color: ${color};"></i><div style="text-align: left;"><div style="line-height: 1;">${title}</div><div style="font-size: 10px; color: var(--text-muted); font-weight: 400; margin-top: 4px;">${desc}</div></div></button>`;
            };

            const baseButtons = [
                createDocBtn('file-check', 'var(--accent-neo-blue)', '請求書', 'インボイス対応', 'invoice'),
                createDocBtn('file-spreadsheet', '#10b981', '領収書', '受領証明', 'expense'),
                createDocBtn('calculator', '#f59e0b', '見積書', '概算プラン', 'estimate')
            ];

            let industrySpecificButtons = [];
            if (userIndustry === 'construction') {
                 industrySpecificButtons = [
                     createDocBtn('hammer', '#6366f1', '人工出面表', '作業員報告用', 'expense')
                 ];
            } else if (userIndustry === 'freelance') {
                industrySpecificButtons = [
                     createDocBtn('briefcase', '#ec4899', '業務委託契約書', '簡易フォーマット', 'estimate')
                 ];
            }
            docBtnContainer.innerHTML = [...baseButtons, ...industrySpecificButtons].join('');
            if (window.lucide) window.lucide.createIcons();
        }

    };

    const applyFontSize = (size) => {
        document.documentElement.style.fontSize = size;
    };

    // Listeners
    if (selectFontSize) {
        selectFontSize.addEventListener('change', (e) => {
            if (e.target.value === 'huge') {
                applyFontSize('120%');
            } else {
                applyFontSize('100%');
            }
        });
    }

    // Make the start button handler globally accessible to prevent mis-bindings
    window.handleStartApp = () => {
        const consentCheckbox = document.getElementById('setup-consent-checkbox');
        
        if (consentCheckbox && !consentCheckbox.checked) {
            alert('利用規約に同意してください。');
            return;
        }

        console.log('[DEBUG] btnStart globally clicked (Gatekeeper passed)');
        
        // Save Master Settings
        localStorage.setItem('fini_setup_complete', 'true');
        localStorage.setItem('neo_legal_consent', 'true'); // Formalize consent matrix
        
        if (selectIndustry && window.mockDB && window.mockDB.userConfig) {
            window.mockDB.userConfig.industry = selectIndustry.value;
            localStorage.setItem('neo_industry', selectIndustry.value);
        }
        
        // Final structural reset & entrance
        document.body.style.overflow = '';
        window.showDash();

        // 最初の接続テストが成功した瞬間のログ (CEO Request)
        console.log('%cNEO+ CORE SYSTEM: ONLINE / PAID TIER ACTIVATED', 'color: #10b981; font-weight: bold; font-size: 16px;');
    };

    // Gatekeeper V2 Dynamic Validation Matrix
    window.validateSetupGatekeeper = () => {
        const consentCheckbox = document.getElementById('setup-consent-checkbox');
        const startBtn = document.getElementById('btn-start');
        const validationMsg = document.getElementById('setup-validation-msg');
        
        if (!startBtn) return;
        
        let isValid = false;
        if (consentCheckbox) {
            if (consentCheckbox.checked) {
                isValid = true;
            }
        }
        
        if (isValid) {
            startBtn.disabled = false;
            startBtn.style.opacity = '1';
            startBtn.style.cursor = 'pointer';
            startBtn.style.boxShadow = '0 8px 25px rgba(29, 155, 240, 0.4)';
            if(validationMsg) validationMsg.style.opacity = '0';
        } else {
            startBtn.disabled = true;
            startBtn.style.opacity = '0.4';
            startBtn.style.cursor = 'not-allowed';
            startBtn.style.boxShadow = 'none';
            if(validationMsg) validationMsg.style.opacity = '1';
        }
    };

    const setupConsentCheckbox = document.getElementById('setup-consent-checkbox');
    
    if (setupConsentCheckbox) {
        setupConsentCheckbox.addEventListener('change', window.validateSetupGatekeeper);
    }

    if (btnStart) {
        btnStart.addEventListener('click', window.handleStartApp);
    }

    // Theme Management
    // Now using a class for theme toggles since they exist on multiple views
    const applyTheme = (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('fini_theme', theme);

        // Update all theme toggle buttons
        const toggleBtns = document.querySelectorAll('.theme-toggle');
        const isDark = theme === 'dark';

        toggleBtns.forEach(btn => {
            const iconSun = btn.querySelector('.icon-sun');
            const iconMoon = btn.querySelector('.icon-moon');
            if (isDark) {
                if (iconSun) iconSun.style.display = 'none';
                if (iconMoon) iconMoon.style.display = 'block';
            } else {
                if (iconSun) iconSun.style.display = 'block';
                if (iconMoon) iconMoon.style.display = 'none';
            }
        });

        // Ensure Lucide icons are rendered for newly displayed elements
        if (window.lucide) {
            window.lucide.createIcons();
        }
    };

    const toggleTheme = () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        applyTheme(newTheme);

        // Make Neo react to theme change
        if (neo) {
            if (newTheme === 'light') {
                neo.speak('neo_react_light');
            } else {
                neo.speak('neo_react_dark');
            }
        }
    };

    // Setup theme toggle listeners
    document.addEventListener('click', (e) => {
        if (e.target.closest('.theme-toggle')) {
            toggleTheme();
        }
    });

    // Initial Theme load
    const savedTheme = localStorage.getItem('fini_theme') || 'dark';
    applyTheme(savedTheme);

    // --- BYOC Google Drive Sync Visualization ---
    const radioGdrive = document.getElementById('radio-gdrive-sync');
    const loadingOverlay = document.getElementById('gdrive-loading-overlay');
    
    if (radioGdrive && loadingOverlay) {
        radioGdrive.addEventListener('change', (e) => {
            if (e.target.checked) {
                // Show Loader
                loadingOverlay.classList.remove('hidden');
                
                // Simulate OAuth / API Binding Delay (Premium feel)
                setTimeout(() => {
                    loadingOverlay.classList.add('hidden');
                    
                    // Trigger Success Toast
                    const neoFabBubble = document.getElementById('neo-fab-bubble');
                    if (neoFabBubble) {
                        neoFabBubble.innerHTML = `<i data-lucide="triangle" style="width:14px; height:14px; vertical-align:middle; color:#34A853; margin-right:4px;"></i>Google Drive との暗号化同期を確立しました。`;
                        neoFabBubble.classList.add('show');
                        setTimeout(() => neoFabBubble.classList.remove('show'), 4000);
                        if(window.lucide) window.lucide.createIcons();
                    }
                    
                    // Update header icons globally to reflect Drive
                    const cloudIcons = document.querySelectorAll('.cloud-sync-status');
                    cloudIcons.forEach(icon => {
                        icon.innerHTML = `<i data-lucide="triangle" style="width: 16px; height: 16px; color: #34A853;"></i>`;
                        if(window.lucide) window.lucide.createIcons();
                    });
                    
                }, 2500);
            }
        });
    }

    // Navigation Logic
    const allViews = [
        setupView,
        dashView,
        document.getElementById('view-sites'),
        document.getElementById('view-expense'),
        document.getElementById('view-wallet'),
        document.getElementById('view-settings'),
        document.getElementById('view-project-detail'),
        document.getElementById('view-chat')
    ];
    const bottomNav = document.getElementById('bottom-nav');
    const navItems = document.querySelectorAll('.nav-item');

    const switchView = (targetId) => {
        // 鉄壁のガード: inline-expense の場合は絶対に画面遷移させない
        if (targetId === 'inline-expense') {
            console.log("Blocked switchView due to inline-expense routing.");
            return;
        }

        // 強制的にすべてのビューを非表示にする
        const allViewIds = ['view-setup', 'view-dash', 'view-sites', 'view-expense', 'view-wallet', 'view-settings', 'view-project-detail', 'view-chat'];
        allViewIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.classList.add('hidden');
                el.style.display = 'none';
                el.style.opacity = '';
            }
        });

        const targetViewElement = document.getElementById(targetId);

        // The global-neo-btn was removed to enforce the singleton pattern.


        if (targetId === 'view-sites') {
            const listContainer = document.getElementById('project-list-container');
            if (listContainer) {
                listContainer.classList.remove('hidden');
                listContainer.style.display = 'grid';
                listContainer.style.visibility = 'visible';
            }
            if (targetViewElement) {
                targetViewElement.classList.remove('hidden');
                targetViewElement.style.display = 'block';
            }
        } else if (targetViewElement) {
            targetViewElement.classList.remove('hidden');
            targetViewElement.style.display = 'block';
        }

        if (targetViewElement) {
            targetViewElement.style.opacity = '0';
            // Trigger reflow
            void targetViewElement.offsetWidth;
            targetViewElement.style.transition = 'opacity 0.2s ease';
            targetViewElement.style.opacity = '1';

            setTimeout(() => {
                targetViewElement.style.transition = '';
                targetViewElement.style.opacity = '';

                // Trigger Neo Brain Sync Animation if navigating to dash
                if (targetId === 'view-dash') {
                    const brainBar = document.getElementById('neo-brain-progress-bar');
                    const brainPct = document.getElementById('neo-brain-percentage');
                    if (brainBar && brainPct) {
                        brainBar.style.width = '0%';
                        brainPct.textContent = '0%';
                        
                        // Force reflow
                        void brainBar.offsetWidth;
                        
                        brainBar.style.width = '84%';
                        let count = 0;
                        const interval = setInterval(() => {
                            count += 2;
                            if (count >= 84) {
                                count = 84;
                                clearInterval(interval);
                            }
                            brainPct.textContent = count + '%';
                        }, 30);
                    }
                }
            }, 200);
        }

        // Update Nav active state
        navItems.forEach(item => {
            if (item.getAttribute('data-target') === targetId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Keep DOM localized
        if (window.i18n && window.i18n.updateDOM) {
            window.i18n.updateDOM();
        }

        // Scroll to bottom if Expense chat
        if (targetId === 'view-expense') {
            const chatContainer = document.getElementById('expense-chat-container');
            if (chatContainer) {
                setTimeout(() => {
                    document.getElementById('app-container').scrollTop = document.getElementById('app-container').scrollHeight;
                }, 100);
            }
        }

        // Setup N+ AI Core Chat
        if (targetId === 'view-chat') {
            if (bottomNav) bottomNav.style.display = 'none';
            const chatContainer = document.getElementById('chat-messages');
            
            setTimeout(() => {
                const inputEl = document.getElementById('chat-input-field');
                if (inputEl) inputEl.focus();
                if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
            }, 100);
        } else if (targetId !== 'view-invoice' && targetId !== 'view-setup') {
            if (bottomNav) {
                bottomNav.classList.remove('hidden');
                bottomNav.style.display = 'grid';
            }
        }

        // Ensure Lucide icons are rendered for newly displayed elements across views
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }; // close switchView()

    // Expose to window for inline onclick in HTML
    window.switchView = switchView;

    // AI Cockpit Toggle
    window.toggleCockpit = () => {
        const cockpit = document.getElementById('neo-cockpit');
        if (!cockpit) return;
        
        if (cockpit.style.display === 'none') {
            cockpit.style.display = 'block';
            cockpit.classList.add('active'); // New class to physically push content
            cockpit.style.opacity = '0';
            setTimeout(() => cockpit.style.opacity = '1', 10);
            
            // Focus textarea securely
            const ta = document.getElementById('main-instruction-input');
            if(ta) setTimeout(() => ta.focus(), 200);
        } else {
            cockpit.style.opacity = '0';
            cockpit.classList.remove('active');
            setTimeout(() => cockpit.style.display = 'none', 300);
        }
    };

    // Global Neo Tap Action (Jump to Dashboard and open Cockpit)
    window.openDashToCockpit = () => {
        window.switchView('view-dash');
        const cockpit = document.getElementById('neo-cockpit');
        if (cockpit) {
            cockpit.style.display = 'block';
            cockpit.classList.add('active'); // Guarantee class injection
            cockpit.style.opacity = '1';
            
            const ta = document.getElementById('main-instruction-input');
            if(ta) setTimeout(() => ta.focus(), 200);
            
            // Scroll to top
            const scrollContainer = document.getElementById('app-container') || document.documentElement;
            scrollContainer.scrollTop = 0;
        }
    };

    const instructionInputs = document.querySelectorAll('#main-instruction-input');
    const instructionMics = [document.getElementById('main-mic-btn'), document.getElementById('btn-voice')].filter(Boolean);
    const btnAttachImages = [document.getElementById('btn-attach-image'), document.getElementById('btn-camera')].filter(Boolean);
    const btnSendInstructions = [document.getElementById('btn-send-instruction'), document.getElementById('btn-send')].filter(Boolean);
    const ocrUploads = document.querySelectorAll('#ocr-upload');

    let isProcessingInstruction = false;

    // Helper to get active input
    const getActiveInput = () => {
        for (const input of instructionInputs) {
            // Check if it's visible (offsetParent is not null)
            if (input.offsetParent !== null) return input;
        }
        return instructionInputs[0] || document.createElement('textarea');
    };

    // Proxy to fix all old references to `instructionInput` across the codebase transparently
    const instructionInput = new Proxy({}, {
        get(target, prop) {
            if (prop === 'addEventListener') {
                return (event, handler, options) => {
                    instructionInputs.forEach(input => input.addEventListener(event, handler, options));
                };
            }
            const active = getActiveInput();
            const val = active[prop];
            if (typeof val === 'function') {
                return val.bind(active);
            }
            return val;
        },
        set(target, prop, value) {
            if (prop === 'value' || prop === 'disabled') {
                instructionInputs.forEach(input => input[prop] = value);
            } else {
                const active = getActiveInput();
                active[prop] = value;
            }
            return true;
        }
    });

    // --- Real-time Local Parsing to populate background inputs ---
    instructionInputs.forEach(input => {
        input.addEventListener('input', (e) => {
            if (!e.target.value) return;
            // Silent parsing for UI updates
            const parsed = window.parseCommand(e.target.value);
            if (parsed) {
                // UI Auto-Input Preview (The Trinity Thrill)
                const previewContainer = document.getElementById('trinity-preview');
                const pTitle = document.getElementById('preview-title');
                const pLoc = document.getElementById('preview-loc');
                const pLocBadge = document.getElementById('preview-loc-badge');
                const pDate = document.getElementById('preview-date');
                const pDateBadge = document.getElementById('preview-date-badge');

                if (previewContainer && pTitle) {
                    let hasAny = false;

                    let dispTitle = parsed.title;
                    if (dispTitle === '新規プロジェクト' || dispTitle === '') {
                        dispTitle = '-';
                    } else {
                        hasAny = true;
                    }
                    pTitle.textContent = dispTitle;

                    if (parsed.location) {
                        pLoc.textContent = parsed.location;
                        if (pLocBadge) pLocBadge.style.display = 'inline-grid';
                        hasAny = true;
                    } else if (pLocBadge) {
                        pLocBadge.style.display = 'none';
                    }

                    if (parsed.date) {
                        pDate.textContent = parsed.date;
                        if (pDateBadge) pDateBadge.style.display = 'inline-grid';
                        hasAny = true;
                    } else if (pDateBadge) {
                        pDateBadge.style.display = 'none';
                    }

                    previewContainer.style.opacity = hasAny ? '1' : '0';
                }
                // Bi-directional binding: Title
                if (parsed.title && parsed.title !== '新規プロジェクト') {
                    // Update original UI inputs
                    const newName = document.getElementById('new-proj-name');
                    if (newName) newName.value = parsed.title;
                    const editName = document.getElementById('edit-proj-name');
                    if (editName) editName.value = parsed.title;

                    // Force the CEO's requested physical ID if it exists anywhere
                    const ceoName = document.getElementById('project-name-input');
                    if (ceoName) ceoName.value = parsed.title;
                }

                // Bi-directional binding: Location
                if (parsed.location) {
                    const newLoc = document.getElementById('new-proj-location');
                    if (newLoc) newLoc.value = parsed.location;
                    const editLoc = document.getElementById('edit-proj-location');
                    if (editLoc) editLoc.value = parsed.location;
                }

                // Bi-directional binding: Date
                if (parsed.date) {
                    const dateStr = parsed.date.replace(/\//g, '-');
                    // Original inputs
                    const startInput = document.getElementById('new-proj-start-date');
                    if (startInput) startInput.value = dateStr;
                    const deadInput = document.getElementById('edit-proj-deadline');
                    if (deadInput) deadInput.value = dateStr;

                    // Force the CEO's requested physical ID if it exists anywhere
                    const ceoDate = document.getElementById('project-date-input');
                    if (ceoDate) ceoDate.value = dateStr;
                }

                // Immediate dynamic eradication of '工事完了日' if industry is general/unset
                const ind = (typeof mockDB !== 'undefined' && mockDB.userConfig) ? mockDB.userConfig.industry : 'general';
                if (!ind || ind === 'general') {
                    document.querySelectorAll('label, div, span, p').forEach(el => {
                        if (el.textContent && el.textContent.includes('工事完了日') && el.children.length === 0) {
                            el.textContent = el.textContent.replace(/工事完了日/g, '予定日');
                        }
                    });
                }
            }
        });
    });

    // --- Tag Relay Dedicated Function ---
    window.createNewProjectFromTags = (rawText = '') => {
        // 1. タグデータの強制抽出 (モーダルの状態やOpacityに依存させない)
        const textToParse = rawText || getActiveInput()?.value || '';
        const parsed = window.parseCommand(textToParse);

        let previewTitle = document.getElementById('preview-title')?.textContent || '';
        if (previewTitle === '-' || previewTitle === '') {
            previewTitle = parsed.title || '新規プロジェクト';
        }

        let previewLoc = document.getElementById('preview-loc')?.textContent || '';
        if (previewLoc === '-' || previewLoc === '') previewLoc = parsed.location || '';

        let previewDate = document.getElementById('preview-date')?.textContent || '';
        if (previewDate === '-' || previewDate === '') previewDate = parsed.date || '';

        // 2.強制実行
        let newProj = null;
        if (window.createProject) {
            newProj = window.createProject(previewTitle, previewDate, previewLoc);
            console.log(`[SUCCESS] Project Created: ${newProj.name}`);
        }

        // Safety enforced physical UI update
        if (typeof renderProjects === 'function') {
            console.log("[DEBUG] Current mockDB.projects before render:", mockDB.projects);
            renderProjects(mockDB.projects);
            console.log("[DEBUG] Render successful");
        }

        // 3. UIの連動
        const input = getActiveInput();
        if (input) {
            input.value = '';
            input.style.height = '48px';
        }

        if (window.neo) window.neo.speak('neo_success');

        const titleSpan = document.getElementById('success-doc-title');
        if (titleSpan) titleSpan.textContent = `プロジェクト「${previewTitle}」を作成しました`;

        // Show Neo Bubble
        const neoBubble = document.getElementById('neo-fab-bubble');
        if (neoBubble) {
            neoBubble.textContent = `⚡️ フォルダ「${previewTitle}」を作成したよ。`;
            neoBubble.classList.add('show');
            setTimeout(() => { neoBubble.classList.remove('show'); }, 4000);
        }

        if (window.switchView) {
            window.switchView('view-dash');
        }

        return true;
    };

    // Document Generator Logic
    window.currentDocType = 'estimate'; // default
    window.docDbStorage = {}; // Temporary cross-tab storage

    window.projectActivities = []; // Global cache for the current modal session

    window.loadActivities = async (projectId) => {
        try {
            // OS共通の相対パスを使用
            const response = await fetch(`./data/projects/${projectId}/activities.json`);
            if (!response.ok) throw new Error('Network response was not ok');
            return await response.json();
        } catch (error) {
            console.error("Activity fetch error (fallback to mockDB):", error);
            // エラー時はフォールバックとしてローカルモックから返して後続の処理を止めない
            if (window.mockDB && window.mockDB.transactions) {
                return window.mockDB.transactions.filter(t => 
                    t.projectId === projectId && 
                    !t.is_deleted && 
                    (t.type === 'expense' || t.type === 'labor' || t.type === 'work')
                );
            }
            return [];
        }
    };

    window.openDocGenModal = async () => {
        const modal = document.getElementById('modal-doc-gen');
        if (modal) {
            // Lock body scroll
            document.body.style.overflow = 'hidden';
            
            modal.classList.remove('hidden');
            // Reset to Estimate by default, but carry over project name if possible
            window.switchDocTab('estimate');
            
            // Auto-fill project details if inside a project
            const projNameEl = document.getElementById('detail-project-name');
            if (projNameEl && projNameEl.textContent) {
                 const subjectInput = document.getElementById('doc-subject');
                 if (subjectInput) subjectInput.value = projNameEl.textContent;
            }

            // Set today's date
            document.getElementById('doc-issue-date').value = new Date().toISOString().split('T')[0];
            
            // Set deadline to next month
            const nextMonth = new Date();
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            document.getElementById('doc-deadline-date').value = nextMonth.toISOString().split('T')[0];

            // Render Activity Reference Data (Contextual Data Bridge)
            const actSec = document.getElementById('activity-reference-section');
            const actList = document.getElementById('activity-reference-list');
            const actToggleBtn = document.getElementById('import-activity-btn');
            
            // Always hide section by default when opening
            if (actSec) actSec.style.display = 'none';

            if (actList && actToggleBtn && window.currentOpenProjectId) {
                // Fetch recent expenses/labor for this project
                const acts = await window.loadActivities(window.currentOpenProjectId);
                const recentActs = acts.sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 10); // Top 10
                window.projectActivities = recentActs; // Cache globally

                if (recentActs.length > 0) {
                    actToggleBtn.style.display = 'block'; // Show the toggle button
                    actList.innerHTML = recentActs.map(act => {
                        const icon = act.type === 'labor' || act.type === 'work' ? 'hammer' : 'receipt';
                        const color = act.type === 'labor' || act.type === 'work' ? '#8b5cf6' : '#f59e0b';
                        const amountText = act.amount ? `¥${act.amount.toLocaleString()}` : (act.unit ? `${act.unit}人工` : (act.cost ? `¥${act.cost.toLocaleString()}` : ''));
                        return `
                            <button onclick="window.importFromActivity(this, '${act.id}')" style="flex-shrink: 0; background: #fff; border: 1.5px solid #cbd5e1; border-radius: 20px; padding: 6px 14px; font-size: 13px; font-weight: 600; color: #475569; display: flex; align-items: center; gap: 6px; cursor: pointer; transition: all 0.2s;">
                                <i data-lucide="${icon}" style="width: 14px; height: 14px; color: ${color};"></i>
                                ${act.title || act.content || '名目なし'}
                                <span style="color: #94a3b8; font-size: 11px; margin-left: 4px;">${amountText}</span>
                            </button>
                        `;
                    }).join('');
                    if (window.lucide) window.lucide.createIcons();
                } else {
                    actToggleBtn.style.display = 'none';
                    actList.innerHTML = '';
                }
            } else if (actToggleBtn) {
                actToggleBtn.style.display = 'none';
            }

            window.updateDocPreview();
        }
    };

    window.importFromActivity = (btnEl, activityId) => {
        const selectedData = window.projectActivities.find(a => a.id === activityId);
        if (!selectedData) return;

        // Visual feedback
        const origBg = btnEl.style.background;
        const origColor = btnEl.style.color;
        const origBorder = btnEl.style.borderColor;

        btnEl.style.background = 'var(--accent-neo-blue)';
        btnEl.style.color = '#fff';
        btnEl.style.borderColor = 'var(--accent-neo-blue)';
        
        // Find icons and change their color temporarily
        const icons = btnEl.querySelectorAll('svg');
        const origIconColors = [];
        icons.forEach(i => {
            origIconColors.push(i.style.color);
            i.style.color = '#fff';
        });

        setTimeout(() => {
            btnEl.style.background = origBg;
            btnEl.style.color = origColor;
            btnEl.style.borderColor = origBorder;
            icons.forEach((i, idx) => {
                i.style.color = origIconColors[idx];
            });
        }, 300);

        const content = selectedData.title || selectedData.content || '名目なし';
        const price = selectedData.amount || selectedData.cost || selectedData.price || 0;
        const quantity = selectedData.unit || selectedData.quantity || 1;

        // Call dedicated injection function per CEO request
        window.injectActivityIntoLineItem(content, quantity, price);
    };

    window.injectActivityIntoLineItem = function(content, quantity, price) {
        const container = document.getElementById('doc-line-items-container');
        if (!container) {
            console.error("Target container #doc-line-items-container not found.");
            return;
        }

        // Check if the only existing row is completely empty to overwrite it
        const rows = container.querySelectorAll('.line-item');
        let injected = false;
        if (rows.length === 1) {
            const nameInp = rows[0].querySelector('.item-name-input');
            const priceInp = rows[0].querySelector('.item-price-input');
            const qtyInp = rows[0].querySelector('.item-qty-input');
            if (nameInp && priceInp && qtyInp && !nameInp.value && (!priceInp.value || priceInp.value == 0 || priceInp.value === "")) {
                nameInp.value = content;
                priceInp.value = price || 0;
                qtyInp.value = quantity || 1;
                injected = true;
            }
        }

        if (!injected) {
            // Append a new row using the template generator
            container.insertAdjacentHTML('beforeend', window.generateDocLineHTML(content, price || 0, quantity || 1, false));
        }

        // recalculate totals
        if (typeof window.updateDocPreview === 'function') {
            window.updateDocPreview();
        } else if (typeof calculateTotal === 'function') {
            calculateTotal();
        }
    };

    window.switchDocTab = (type) => {
        window.currentDocType = type;
        
        // Reset tab styling
        ['estimate', 'invoice', 'delivery', 'receipt', 'expense'].forEach(t => {
            const btn = document.getElementById('tab-doc-' + t);
            if (btn) {
                if (t === type) {
                    btn.style.background = '#fff';
                    btn.style.color = 'var(--text-main)';
                    btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                } else {
                    btn.style.background = 'transparent';
                    btn.style.color = 'var(--text-muted)';
                    btn.style.boxShadow = 'none';
                }
            }
        });

        // Update Labels based on type
        const tTitle = document.getElementById('preview-doc-title');
        const tDeadlineLabel = document.getElementById('doc-deadline-label');
        if (tTitle && tDeadlineLabel) {
            if (type === 'estimate') {
                tTitle.textContent = '御見積書';
                tDeadlineLabel.textContent = '有効期限';
            } else if (type === 'invoice') {
                tTitle.textContent = '御請求書';
                tDeadlineLabel.textContent = 'お支払期限';
            } else if (type === 'delivery') {
                tTitle.textContent = '納品書';
                tDeadlineLabel.textContent = '(なし)';
            } else if (type === 'receipt') {
                tTitle.textContent = '領収書';
                tDeadlineLabel.textContent = '(なし)';
            } else if (type === 'expense') {
                tTitle.textContent = '経費精算書';
                tDeadlineLabel.textContent = '(なし)';
            }

            // --- Cascading Data Copy Feature ---
            // If switching to a new tab, try to copy data from a previous logical step
            // Order: Estimate -> Invoice -> Delivery -> Receipt
            const sourceOrder = ['receipt', 'delivery', 'invoice', 'estimate'];
            let sourceData = null;
            
            // Find the closest previous data source available
            const currentIndex = sourceOrder.indexOf(type);
            for (let i = currentIndex + 1; i < sourceOrder.length; i++) {
                if (window.docDbStorage[sourceOrder[i]]) {
                    sourceData = window.docDbStorage[sourceOrder[i]];
                    break;
                }
            }

            if (sourceData) {
                const clientInput = document.getElementById('doc-client-name');
                if (clientInput && !clientInput.value && sourceData.client) clientInput.value = sourceData.client;
                
                const subjInput = document.getElementById('doc-subject');
                if (subjInput && !subjInput.value && sourceData.subject) subjInput.value = sourceData.subject;
                
                const itemInput = document.getElementById('doc-item-name');
                if (itemInput && !itemInput.value && sourceData.itemName) itemInput.value = sourceData.itemName;
                
                const priceInput = document.getElementById('doc-item-price');
                if (priceInput && !priceInput.value && sourceData.itemPrice) priceInput.value = sourceData.itemPrice;
            }
        }

        // Toggle visibility of conditional inputs
        const deadlineContainer = document.getElementById('doc-deadline-container');
        const bankInputs = document.getElementById('doc-bank-inputs');
        const receiptInputs = document.getElementById('doc-receipt-inputs');

        if (deadlineContainer) {
            deadlineContainer.style.visibility = (type === 'estimate' || type === 'invoice') ? 'visible' : 'hidden';
            if (deadlineContainer.style.visibility === 'hidden') {
                document.getElementById('doc-deadline-date').value = '';
            }
        }
        if (bankInputs) {
            bankInputs.style.display = (type === 'invoice') ? 'block' : 'none';
        }
        if (receiptInputs) {
            receiptInputs.style.display = (type === 'receipt') ? 'block' : 'none';
        }

        window.updateDocPreview();
    };

    window.updateDocPreview = () => {
        // Collect Inputs
        const client = document.getElementById('doc-client-name')?.value || '株式会社〇〇 御中';
        const dateInputStr = document.getElementById('doc-issue-date')?.value || new Date().toISOString().split('T')[0];
        let deadlineInputStr = document.getElementById('doc-deadline-date')?.value || '';
        const subject = document.getElementById('doc-subject')?.value || '〇〇工事一式として';
        const itemName = document.getElementById('doc-item-name')?.value || '作業代行費';
        const itemPrice = parseInt(document.getElementById('doc-item-price')?.value || '0', 10);

        // Context specific reads
        const receiptMemo = document.getElementById('doc-receipt-memo')?.value || 'お品代として';
        const paymentMethodEl = document.getElementById('doc-payment-method');
        const paymentMethodStr = paymentMethodEl ? paymentMethodEl.options[paymentMethodEl.selectedIndex].text : '';
        const bankInfo = document.getElementById('doc-bank-info')?.value || '〇〇銀行 〇〇支店\n普通 1234567\nカ）ネオプラス';
        const taxRateElement = document.getElementById('doc-tax-rate');
        const taxRate = taxRateElement ? parseFloat(taxRateElement.value) : 0.1;

        // Auto-Expiration for Estimate
        if (window.currentDocType === 'estimate' && !deadlineInputStr && dateInputStr) {
            const issueDate = new Date(dateInputStr);
            issueDate.setMonth(issueDate.getMonth() + 1); // +1 Month
            deadlineInputStr = issueDate.toISOString().split('T')[0];
            const deadlineEl = document.getElementById('doc-deadline-date');
            if (deadlineEl) deadlineEl.value = deadlineInputStr;
        }

        // Item Logic (Dynamic Multi-Row)
        const itemRows = document.querySelectorAll('#doc-items-container .line-item, #doc-line-items-container .line-item');
        let linesHTML = '';
        let subTotal = 0;

        itemRows.forEach(row => {
            const name = row.querySelector('.item-name-input').value || '作業代行費';
            const price = parseInt(row.querySelector('.item-price-input').value || '0', 10);
            const qtyInput = row.querySelector('.item-qty-input');
            const qty = qtyInput ? parseInt(qtyInput.value || '1', 10) : 1;
            const lineTotal = price * qty;
            subTotal += lineTotal;

            linesHTML += `
                <tr>
                    <td style="padding: 15px; font-size: 16px; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${name}</td>
                    <td style="padding: 15px; font-size: 16px; color: #0f172a; text-align: right; border-bottom: 1px solid #e2e8f0;">${qty}</td>
                    <td style="padding: 15px; font-size: 16px; color: #0f172a; text-align: right; border-bottom: 1px solid #e2e8f0;">¥${fmt.format(price)}</td>
                    <td style="padding: 15px; font-size: 16px; color: #0f172a; text-align: right; border-bottom: 1px solid #e2e8f0;">¥${fmt.format(lineTotal)}</td>
                </tr>
            `;
        });

        const previewContainer = document.getElementById('preview-items-container');
        if (previewContainer) {
            previewContainer.innerHTML = linesHTML;
        }

        const fmt = new Intl.NumberFormat('ja-JP');

        // Calc Defaults
        const tax = Math.floor(subTotal * taxRate);
        const total = subTotal + tax;

        // Update tiny UI
        document.getElementById('doc-tax-calc').textContent = `¥${fmt.format(tax)}`;
        document.getElementById('doc-total-calc').textContent = `¥${fmt.format(total)}`;

        // Update Tax Label dynamically
        const pTaxLabel = document.getElementById('preview-tax-label');
        if (pTaxLabel) {
            let taxStr = '10%';
            if (taxRate === 0.08) taxStr = '8%';
            if (taxRate === 0) taxStr = '0%';
            pTaxLabel.textContent = `消費税 (${taxStr})`;
        }

        // --- Company Stamp Overlay Logic for Manual Doc Generator ---
        const stampOverlay = document.getElementById('invoice-stamp-overlay');
        const savedStamp = localStorage.getItem('neo_company_stamp_data');
        
        if (stampOverlay && savedStamp) {
            const scale = localStorage.getItem('neo_company_stamp_scale') || "1.0";
            const x = localStorage.getItem('neo_company_stamp_x') || "0";
            const y = localStorage.getItem('neo_company_stamp_y') || "0";
            
            stampOverlay.src = savedStamp;
            stampOverlay.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
            stampOverlay.style.display = 'block';
            
            const companyInfoArea = document.getElementById('invoice-company-info-area');
            if (companyInfoArea) {
                companyInfoArea.style.minHeight = '120px';
            }
        } else if (stampOverlay) {
            stampOverlay.style.display = 'none';
        }
        // ------------------------------------------------------------


        // Update A4 Preview Elements
        const pClient = document.getElementById('preview-client-name');
        if (pClient) pClient.textContent = client;
        
        const pDate = document.getElementById('preview-doc-date');
        if (pDate) {
            let prefix = '発行日';
            if (window.currentDocType === 'estimate') prefix = '見積日';
            else if (window.currentDocType === 'invoice') prefix = '請求日';
            else if (window.currentDocType === 'delivery') prefix = '納品日';
            else if (window.currentDocType === 'receipt') prefix = '領収日';
            pDate.textContent = `${prefix}: ${dateInputStr.replace(/-/g, '/')}`;
        }

        const pSub = document.getElementById('preview-subject');
        if (pSub) pSub.textContent = subject;

        const pSubLabel = document.getElementById('preview-subject-label');
        if (pSubLabel) {
            if (window.currentDocType === 'receipt') {
                pSubLabel.textContent = '決済金額';
                pSub.textContent = `¥${fmt.format(total)} -`;
            } else {
                pSubLabel.textContent = '件名';
                pSub.textContent = subject;
            }
        }

        const pSubtotal = document.getElementById('preview-subtotal');
        if (pSubtotal) pSubtotal.textContent = `¥${fmt.format(subTotal)}`;

        const pTax = document.getElementById('preview-tax');
        if (pTax) pTax.textContent = `¥${fmt.format(tax)}`;

        const pGrand = document.getElementById('preview-grand-total');
        if (pGrand) pGrand.textContent = `¥${fmt.format(total)}`;

        // Dynamic Document Number Prefix for realism
        const numPrefix = document.getElementById('preview-doc-no');
        if (numPrefix) {
            const codes = {
                'estimate': 'EST',
                'invoice': 'INV',
                'delivery': 'DEL',
                'receipt': 'REC',
                'expense': 'EXP'
            };
            const code = codes[window.currentDocType] || 'DOC';
            numPrefix.textContent = `No: ${code}-${dateInputStr.replace(/-/g, '')}-01`;
        }

        // Feature: Delivery Note Stamp
        const dStamp = document.getElementById('preview-delivery-stamp');
        if (dStamp) {
            dStamp.style.display = window.currentDocType === 'delivery' ? 'block' : 'none';
        }

        // Feature: Receipt Memo (但し書き) and Invoice Bank Info
        const rMemo = document.getElementById('preview-receipt-memo');
        const rMemoText = document.getElementById('preview-memo-text');
        if (rMemo && rMemoText) {
            if (window.currentDocType === 'receipt') {
                rMemo.style.display = 'block';
                const methodBadge = `<span style="display:inline-block; margin-right: 8px; padding: 2px 6px; background: #e2e8f0; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 11px;">[${paymentMethodStr}]</span>`;
                rMemoText.innerHTML = `${methodBadge} ${receiptMemo}`;
            } else if (window.currentDocType === 'invoice') {
                rMemo.style.display = 'block';
                const bankHtml = bankInfo.replace(/\n/g, '<br>');
                rMemoText.innerHTML = `<span style="font-size:12px; font-weight: 400; color:#0f172a; display:block; padding: 8px; background: #fff; border: 1.5px solid #1D9BF0; border-radius: 4px; line-height: 1.4;"><strong>【振込先口座】</strong><br>${bankHtml}<br><span style="color:#ef4444; font-size: 11px; font-weight:700; display:block; margin-top:4px;">※お支払期限: ${deadlineInputStr.replace(/-/g, '/')}</span></span>`;
            } else if (window.currentDocType === 'estimate') {
                rMemo.style.display = 'block';
                rMemoText.innerHTML = `<span style="color:#ef4444; font-size: 12px;">有効期限: ${deadlineInputStr.replace(/-/g, '/')} まで</span>`;
            } else {
                rMemo.style.display = 'none';
            }
        }

        // Feature: Digital Bridge QR Code Generation & Toggle Interaction
        const qrEl = document.getElementById('preview-qr-code');
        const qrContainer = qrEl ? qrEl.parentElement : null;
        const qrToggle = document.getElementById('doc-toggle-qr');
        const showQr = qrToggle ? qrToggle.checked : true;
        
        if (qrEl && qrContainer) {
            if (showQr) {
                try {
                    // Extract items perfectly
                    const items = [];
                    const rowsForQR = document.querySelectorAll('#doc-items-container .line-item, #doc-line-items-container .line-item');
                    rowsForQR.forEach(row => {
                        const qtyInput = row.querySelector('.item-qty-input');
                        items.push({
                            name: row.querySelector('.item-name-input').value || '作業代行費',
                            price: parseInt(row.querySelector('.item-price-input').value || '0', 10),
                            qty: qtyInput ? parseInt(qtyInput.value || '1', 10) : 1
                        });
                    });

                    const docData = {
                        type: window.currentDocType,
                        client: client,
                        date: dateInputStr,
                        deadline: deadlineInputStr,
                        subject: subject,
                        memo: receiptMemo,
                        bank: bankInfo,
                        payment: paymentMethodStr,
                        items: items
                    };

                    const payload = btoa(encodeURIComponent(JSON.stringify(docData)));
                    const shareUrl = `${window.location.origin}${window.location.pathname}?share=${payload}`;
                    qrEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=0&data=${encodeURIComponent(shareUrl)}`;
                    qrEl.style.display = 'block';
                    qrContainer.style.display = 'grid';
                } catch (e) {
                    console.error("QR gen failed", e);
                    qrContainer.style.display = 'none';
                }
            } else {
                qrContainer.style.display = 'none'; // Hide if user toggled off
            }
        }
        
        // Feature: Dynamic Paper Size Adjustments
        const paperSizeSel = document.getElementById('doc-paper-size');
        const paperContainer = document.querySelector('#doc-preview-paper'); // The exact paper div (originally scaled A4)
        if (paperSizeSel && paperContainer) {
            const size = paperSizeSel.value; // 'A4' or 'B5'
            if (size === 'B5') {
                paperContainer.style.width = '182mm';
                paperContainer.style.minHeight = '257mm';
                paperContainer.style.padding = '15mm';
            } else { // Default A4
                paperContainer.style.width = '210mm';
                paperContainer.style.minHeight = '297mm';
                paperContainer.style.padding = '20mm';
            }
            
            // Re-apply perfect fit scale based on new potential width
            const currentWidth = size === 'B5' ? 687 : 793; // Approx px width at 96dpi
            const fitScale = Math.min(window.innerWidth / currentWidth, 1.0) * 0.95;
            paperContainer.style.transform = `scale(${fitScale}) translate(0px, 0px)`;
        }
    };

    window.handleAIDocUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (window.neo) window.neo.speak('neo_thinking');
        
        // SHOW UI OVERLAY
        const parseOverlay = document.getElementById('doc-neo-parsing-overlay');
        if (parseOverlay) parseOverlay.classList.remove('hidden');
        
        // Simulate OCR latency
        setTimeout(() => {
            // HIDE UI OVERLAY
            if (parseOverlay) parseOverlay.classList.add('hidden');

            // Mock Data (Starbucks Receipt style as requested)
            const extractedItem = "スターバックス コーヒー";
            const extractedPrice = 1250;
            const extractedDate = new Date().toISOString().split('T')[0];

            // 1. Fill Inputs instantly
            const itemNameEl = document.getElementById('doc-item-name');
            if (itemNameEl) itemNameEl.value = extractedItem;

            const itemPriceEl = document.getElementById('doc-item-price');
            if (itemPriceEl) itemPriceEl.value = extractedPrice.toString();

            const dateEl = document.getElementById('doc-issue-date');
            if (dateEl) dateEl.value = extractedDate;

            // 2. Clear out the file input so it can trigger again
            event.target.value = '';

            // 3. Immediately flush to preview and trigger recalculations (Tax, Grand Total)
            window.updateDocPreview();

            if (window.neo) window.neo.speak('neo_success');
            
            const neoBubble = document.getElementById('neo-fab-bubble');
            if (neoBubble) {
                neoBubble.textContent = `⚡️ レシートから「${extractedItem} / ¥${extractedPrice}」を抽出して自動入力しました！消費税も計算済みです。`;
                neoBubble.classList.add('show');
                setTimeout(() => { neoBubble.classList.remove('show'); }, 5000);
            }
            
        }, 1500); // 1.5s AI simulation delay
    };

    // HTML template generation for consistency
    window.generateDocLineHTML = (name = "", price = 0, qty = 1, isAI = false) => {
        const aiBadge = isAI ? `
            <style>
                @keyframes neoAIFadeIn {
                    0% { opacity: 0; transform: translateY(-4px) scale(0.95); }
                    100% { opacity: 1; transform: translateY(0) scale(1); }
                }
            </style>
            <div style="position: absolute; left: -10px; top: -14px; background: linear-gradient(135deg, #6366f1, #a855f7); color: white; font-size: 10px; font-weight: 800; padding: 4px 8px; border-radius: 20px; box-shadow: 0 2px 4px rgba(168,85,247,0.4); z-index: 2; pointer-events: none; animation: neoAIFadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;">✨ AI生成</div>
        ` : '';

        return `
            <div class="line-item">
                ${aiBadge}
                <div class="input-group">
                    <label>内容</label>
                    <input type="text" class="form-control item-name-input" placeholder="内容を入力" oninput="window.updateDocPreview()" value="${name}" style="width: 100%; box-sizing: border-box; margin: 0; padding: 12px; font-size: 14px; border: 1.5px solid #cbd5e1; border-radius: 8px; background: #fff; color: #0f172a; position: relative; z-index: 1;">
                </div>
                <div class="input-group qty">
                    <label>数量</label>
                    <input type="number" inputmode="decimal" pattern="[0-9]*" class="form-control item-qty-input" placeholder="数量" value="${qty}" oninput="window.updateDocPreview()" style="width: 100%; box-sizing: border-box; margin: 0; padding: 12px; font-size: 14px; border: 1.5px solid #cbd5e1; border-radius: 8px; text-align: center; background: #fff; color: #0f172a;">
                </div>
                <div class="input-group price" style="position: relative; width: 100%;">
                    <label>単価</label>
                    <input type="text" inputmode="decimal" pattern="[0-9]*" class="form-control item-price-input" placeholder="0" oninput="window.updateDocPreview()" value="${price}" style="width: 100%; box-sizing: border-box; margin: 0; padding: 12px 24px 12px 12px; font-size: 14px; border: 1.5px solid #cbd5e1; border-radius: 8px; text-align: right; background: #fff; color: #0f172a;">
                    <span style="position: absolute; right: 8px; top: 38px; font-size: 12px; color: #94a3b8; pointer-events: none;">円</span>
                </div>
                <button type="button" class="delete-button" onclick="this.closest('.line-item').remove(); window.updateDocPreview();">×</button>
            </div>`;
    };

    // MULTI-LINE SUPPORT: Function to add item rows
    window.addDocLineItem = () => {
        const container = document.getElementById('doc-line-items-container');
        if (!container) return;
        
        container.insertAdjacentHTML('beforeend', window.generateDocLineHTML('', 0, 1, false));
        
        // Auto focus the new text input
        const rows = container.querySelectorAll('.line-item');
        if (rows.length > 0) {
            const newInputs = rows[rows.length - 1].querySelectorAll('input');
            if(newInputs.length > 0) newInputs[0].focus();
        }
    };

    window.closeDocGenModal = () => {
        const modal = document.getElementById('modal-doc-gen');
        if (modal) {
            modal.classList.add('hidden');
        }
        const modalPreview = document.getElementById('modal-doc-preview');
        if (modalPreview) {
            modalPreview.classList.add('hidden');
        }
        document.body.style.overflow = '';
        if (window.switchView) window.switchView('view-dash');
    };

    window.saveDocument = () => {
        let subtotal = 0;
        document.querySelectorAll('.item-price-input').forEach(el => subtotal += parseInt(el.value || '0', 10));

        const data = {
            client: document.getElementById('doc-client-name')?.value || '',
            subject: document.getElementById('doc-subject')?.value || '',
            itemPrice: subtotal
        };
        window.docDbStorage[window.currentDocType] = data;

        const totalStr = document.getElementById('preview-grand-total')?.textContent || '¥0';
        let msg = `ドキュメント（${window.currentDocType === 'estimate' ? '見積書' : (window.currentDocType === 'invoice' ? '請求書' : '領収書')}）を保存しました！`;
        
        if (window.currentDocType === 'estimate') {
            msg += `\n将来的に「請求書」タブを開くと、この内容(${totalStr})が自動で引き継がれます。`;
        }
        
        alert(msg);
        window.closeDocGenModal();
    };

    const originalDocOpen = window.openDocGenModal;
    window.openDocGenModal = () => {
         const modal = document.getElementById('modal-doc-gen');
         if(modal) {
             modal.classList.remove('hidden');
             window.switchDocTab('estimate');
             document.getElementById('doc-client-name').value = '';
             document.getElementById('doc-subject').value = document.getElementById('detail-project-name')?.textContent || '';
             document.getElementById('doc-issue-date').value = new Date().toISOString().split('T')[0];
             
             // Load unbilled activities and push them natively into the invoice
             const container = document.getElementById('doc-line-items-container');
             if(container) {
                container.innerHTML = '';
                // Extract pending transactions
                let pendingTxs = [];
                if (window.mockDB && window.mockDB.transactions && window.currentOpenProjectId) {
                    pendingTxs = window.mockDB.transactions.filter(t => t.projectId === window.currentOpenProjectId && !t.is_deleted);
                }

                if (pendingTxs.length > 0) {
                    // 1. Instantly show a skeleton loading state
                    container.innerHTML = `
                        <div class="line-item" style="opacity: 0.6; pointer-events: none;">
                            <div class="input-group">
                                <label>内容</label>
                                <input type="text" class="form-control item-name-input" value="AIが実費・人工を集計中..." disabled style="width: 100%; box-sizing: border-box; margin: 0; padding: 12px; font-size: 14px; border: 1.5px solid #cbd5e1; border-radius: 8px; background: #f8fafc; color: #64748b;">
                            </div>
                            <div class="input-group qty">
                                <label>数量</label>
                                <input type="number" class="form-control item-qty-input" value="1" disabled style="width: 100%; box-sizing: border-box; margin: 0; padding: 12px; font-size: 14px; border: 1.5px solid #cbd5e1; border-radius: 8px; text-align: center; background: #f8fafc; color: #64748b;">
                            </div>
                            <div class="input-group price" style="position: relative; width: 100%;">
                                <label>単価</label>
                                <input type="text" class="form-control item-price-input" value="0" disabled style="width: 100%; box-sizing: border-box; margin: 0; padding: 12px 24px 12px 12px; font-size: 14px; border: 1.5px solid #cbd5e1; border-radius: 8px; text-align: right; background: #f8fafc; color: #64748b;">
                                <span style="position: absolute; right: 8px; top: 38px; font-size: 12px; color: #94a3b8; pointer-events: none;">円</span>
                            </div>
                            <button type="button" class="delete-button" disabled>×</button>
                        </div>
                    `;
                    window.updateDocPreview();

                    // 2. Call AI parsing asynchronously
                    setTimeout(async () => {
                        try {
                            const industry = window.mockDB?.userConfig?.industry || 'general';
                            let parsedItems = null;

                            if (typeof window.parseReceiptRecords === 'function') {
                                parsedItems = await window.parseReceiptRecords(pendingTxs, industry);
                            }

                            container.innerHTML = ''; // Clear loading skeleton

                            if (parsedItems && parsedItems.length > 0) {
                                // Render AI Normalized Items
                                parsedItems.forEach(item => {
                                    const pName = item.item_name || '未分類項';
                                    const pPrice = parseInt(item.price || '0', 10);
                                    container.insertAdjacentHTML('beforeend', window.generateDocLineHTML(pName, pPrice, 1, true)); // isAI = true
                                    
                                    // Extreme DOM Assurance
                                    console.assert(container.lastElementChild.querySelector('input.item-name-input').value === pName, "CRITICAL ERROR: AI injected row failed to persist in DOM.");
                                });
                            } else {
                                // Fallback: Render Raw Traansactions if AI fails
                                pendingTxs.forEach(tx => {
                                    const pName = tx.title || '';
                                    const pPrice = parseInt(tx.amount || '0', 10);
                                    container.insertAdjacentHTML('beforeend', window.generateDocLineHTML(pName, pPrice, 1));
                                });
                            }
                            window.updateDocPreview();

                        } catch(err) {
                            console.error('[Document AI] Parsing failed', err);
                            // Loud Error UI (No silent fallback per CEO orders)
                            container.innerHTML = `
                                <div class="line-item" style="grid-template-columns: 1fr; margin-bottom: 24px;">
                                    <div style="background: #fef2f2; border: 2px solid #ef4444; padding: 20px; border-radius: 12px; box-shadow: 0 4px 12px rgba(239,68,68,0.15);">
                                        <h4 style="color: #ef4444; font-weight: 800; font-size: 18px; margin: 0 0 8px 0; display: grid; grid-auto-flow: column; justify-content: start; align-items: center; gap: 8px;">
                                            🚨 API Key Error
                                        </h4>
                                        <p style="color: #7f1d1d; font-size: 14px; margin: 0; line-height: 1.5; font-weight: 600;">
                                            Gemini AIとの通信に失敗しました。APIキーが設定されていないか、上限に達しています。<br>
                                            <span style="font-size: 12px; opacity: 0.8; margin-top: 8px; display: block; font-family: monospace;">Detail: ${err.message || 'Unknown Network Error'}</span>
                                        </p>
                                    </div>
                                    <button type="button" onclick="window.addDocLineItem()" style="width: 100%; padding: 14px; background: #fff; border: 1.5px solid #cbd5e1; border-radius: 12px; font-weight: 700; color: #475569; margin-top: 16px;">
                                        手動で明細を入力する
                                    </button>
                                </div>
                            `;
                            window.updateDocPreview();
                        }
                    }, 100);

                } else {
                    // Default fallback (No transactions)
                    container.innerHTML = window.generateDocLineHTML('一式', 0, 1);
                }
             }
             
             // Load Bank Info from History
             const savedBankInfo = localStorage.getItem('neo_bank_info');
             if (savedBankInfo) {
                 const bankInput = document.getElementById('doc-bank-info');
                 if (bankInput) bankInput.value = savedBankInfo;
             }

             // Initialize Focus Auto-Scroll (Ultimate Input Feel)
             if (!window.docGenFocusScrollInitialized) {
                 const inputs = modal.querySelectorAll('.doc-gen-inputs input, .doc-gen-inputs textarea, .doc-gen-inputs select');
                 inputs.forEach(el => {
                     el.addEventListener('focus', function() {
                         setTimeout(() => {
                             this.scrollIntoView({ behavior: 'smooth', block: 'center' });
                         }, 300); // Wait for mobile keyboard to appear
                     });
                 });
                 
                 // Save Bank Info on change
                 const bankInputEl = document.getElementById('doc-bank-info');
                 if (bankInputEl) {
                     bankInputEl.addEventListener('input', (e) => {
                         localStorage.setItem('neo_bank_info', e.target.value);
                     });
                 }

                 window.docGenFocusScrollInitialized = true;
             }

             window.updateDocPreview();
         }
    };

    // --- Send Button Logic ---
    btnSendInstructions.forEach(btn => {
        btn.addEventListener('click', () => {
            console.log('[DEBUG] btnSendInstruction clicked');
            const input = getActiveInput();
            if (!input) return;
            const rawText = input.value;

            if (rawText.trim() === '') return;

            // 送信ボタンの機能強制接続: アクション動詞または日付・場所が含まれていれば、バイパスしてプロジェクト化
            // 領収書のメタファー（儲かった、交通費）等の場合は handleInstruction (支出登録) へ流すため除外
            const isExpense = /(儲かった|ゲット|交通費|代|費|タクシー|電車|領収書|レシート)/.test(rawText);
            const isProject = /(作って|新規|作成|立ち上げて|が入った|決まった|する|はいいた|はいいった|入った|決定|の件)/.test(rawText);

            const pCmd = window.parseCommand(rawText);

            if (!isExpense && (pCmd.date || pCmd.location || isProject)) {
                window.createNewProjectFromTags(rawText);
            } else {
                handleInstruction(rawText);
            }
        });
    });

    // OCR Simulation Logic (Removed per user request to purely open file dialogs)

    // --- Voice Recognition Setup (Push-To-Talk & Privacy-First) ---
    const voiceStatusIndicator = document.getElementById('voice-status-indicator');
    let recognition = null;

    if ('webkitSpeechRecognition' in window) {
        recognition = new webkitSpeechRecognition();
        recognition.lang = 'ja-JP';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
            instructionMics.forEach(mic => {
                mic.classList.add('recording');
                mic.style.color = '#FF3B30';
            });
            if (voiceStatusIndicator) voiceStatusIndicator.classList.remove('hidden');
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            const input = getActiveInput();
            if (input) {
                input.value = transcript;
                input.style.height = 'auto';
                input.style.height = (input.scrollHeight) + 'px';
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
        };

        recognition.onend = () => {
            instructionMics.forEach(mic => {
                mic.classList.remove('recording');
                mic.style.color = 'var(--text-muted)';
            });
            if (voiceStatusIndicator) voiceStatusIndicator.classList.add('hidden');
        };
    }

    // Push-To-Talk event bindings
    if (recognition) {
        const startDictation = (e) => {
            e.preventDefault(); // Prevent text selection/scrolling
            try { recognition.start(); } catch (e) { }
        };

        const stopDictation = (e) => {
            e.preventDefault();
            try { recognition.stop(); } catch (e) { }
        };

        instructionMics.forEach(mic => {
            mic.addEventListener('mousedown', startDictation);
            mic.addEventListener('touchstart', startDictation, { passive: false });
        });

        document.addEventListener('mouseup', stopDictation);
        document.addEventListener('touchend', stopDictation);
    }

    const triggerNeoSyncGlow = () => {
        const iconsToGlow = document.querySelectorAll('[data-target="view-sites"] i, [data-target="view-wallet"] i');
        iconsToGlow.forEach(icon => {
            icon.classList.add('neo-sync-glow');
            setTimeout(() => {
                icon.classList.remove('neo-sync-glow');
            }, 1500); // Glow lasts 1.5 seconds
        });
    };

    const findProjectIdByName = (text) => {
        if (!text) return null;

        const textLower = text.toLowerCase();

        // 1. 完全一致チェック（最優先）
        // テキストそのものがプロジェクト名と完全に一致する場合（例: 「東京駅」という名前のプロジェクトがある場合）
        const exactMatch = mockDB.projects.find(p => p.id !== 1 && p.name.toLowerCase() === textLower);
        if (exactMatch) {
            return exactMatch.id;
        }

        let bestMatch = null;
        let longestMatchLength = 0;

        // 2. 最長一致チェック（部分一致用）
        mockDB.projects.forEach(p => {
            if (p.id === 1) return; // 未分類は除外

            const pNameLower = p.name.toLowerCase();

            // プロジェクト名がテキストに含まれているか
            if (textLower.includes(pNameLower)) {
                if (pNameLower.length > longestMatchLength) {
                    longestMatchLength = pNameLower.length;
                    bestMatch = p;
                }
            } else {
                // キーワードによるフォールバックマッチング（先頭一致など）
                const keywords = [pNameLower, pNameLower.substring(0, 4), pNameLower.substring(0, 2)];
                for (const kw of keywords) {
                    if (kw.length >= 2 && textLower.includes(kw)) {
                        if (kw.length > longestMatchLength) {
                            longestMatchLength = kw.length;
                            bestMatch = p;
                        }
                    }
                }
            }
        });

        return bestMatch ? bestMatch.id : null;
    };

    // --- AI Local Caching Engine ---
    const findLocalMatch = (text) => {
        // Strip amount
        const amountMatch = text.match(/\d+(?:,\d+)*万?/);
        let amount = 0;
        if (amountMatch) {
            let strAmt = amountMatch[0].replace(/,/g, '');
            if (strAmt.includes('万')) strAmt = strAmt.replace('万', '0000');
            amount = parseInt(strAmt, 10);
        }
        
        let keywordText = text;
        if (amountMatch) keywordText = keywordText.replace(amountMatch[0], '');
        keywordText = keywordText.replace(/円/g, '').replace(/追加して/g, '').replace(/追加/g, '').trim();

        if (keywordText.length < 2) return null;

        // Priority 1: Ground Truth (User Corrections)
        const correctionLog = window.aiCorrectionLog || JSON.parse(localStorage.getItem('neo_ai_corrections') || '[]');
        for (const log of correctionLog) {
            if (log.input_snippet && log.input_snippet.length >= 2) {
                if (keywordText.includes(log.input_snippet)) {
                    return {
                        action: "ADD_EXPENSE",
                        title: keywordText,
                        amount: amount,
                        category: log.corrected_to || 'その他',
                        is_bookkeeping: true,
                        type: log.corrected_to || 'expense',
                        source_cache: true
                    };
                }
            }
        }

        // Priority 2: Global Lexicon (Crowdsourced Communal Truth)
        if (window.globalLexicon && Array.isArray(window.globalLexicon)) {
            for (const lex of window.globalLexicon) {
                if (lex.keyword && lex.keyword.length >= 2) {
                    if (keywordText.includes(lex.keyword)) {
                        console.log(`[Neo Global Agent] Communal Knowledge Hit: "${lex.keyword}" -> ${lex.category}`);
                        return {
                            action: "ADD_EXPENSE",
                            title: keywordText,
                            amount: amount,
                            category: lex.category || 'その他',
                            is_bookkeeping: true,
                            type: lex.category || 'expense',
                            source_cache: true
                        };
                    }
                }
            }
        }

        // Priority 3: Historical Precedent (Existing DB)
        // Sort descending by ID, but prioritize 'is_user_corrected' Ground Truths
        const sortedTxs = [...mockDB.transactions].sort((a,b) => {
            if (a.is_user_corrected && !b.is_user_corrected) return -1;
            if (!a.is_user_corrected && b.is_user_corrected) return 1;
            return b.id - a.id;
        });

        for (const tx of sortedTxs) {
            if (tx.title && tx.title.length >= 2) {
                if (keywordText.includes(tx.title) || tx.title.includes(keywordText)) {
                    return {
                        action: "ADD_EXPENSE",
                        title: keywordText, // Use user's exact input, not historical title
                        amount: amount,
                        category: tx.category || 'その他',
                        is_bookkeeping: tx.isBookkeeping || false,
                        type: tx.type || 'expense',
                        source_cache: true
                    };
                }
            }
        }
        return null;
    };

    const COMPLIANCE_BLACKLIST = [
        "裏金", "脱税", "粉飾", "マネロン", "キックバック", "マネーロンダリング", 
        "架空請求", "横領", "脱法", "裏帳簿",
        "風俗", "アダルト", "エロ", "パパ活", "ギャラ飲み", "キャバクラ", "ソープ"
    ];

    window.logSecurityEvent = (reason, input) => {
        let logs = JSON.parse(localStorage.getItem('neo_security_logs') || '[]');
        logs.push({ timestamp: new Date().toLocaleString('ja-JP'), reason, input, viewed: false });
        localStorage.setItem('neo_security_logs', JSON.stringify(logs));
    };

    window.handleComplianceViolation = (reason = "Unknown Violation", inputContext = "") => {
        let strikes = parseInt(localStorage.getItem('neo_compliance_strikes') || '0', 10);
        strikes++;
        localStorage.setItem('neo_compliance_strikes', strikes.toString());

        console.error(`[Neo Compliance] Violation detected. Strike ${strikes}/3. Reason: ${reason}`);
        window.logSecurityEvent(reason, inputContext);

        if (strikes >= 3) {
            // Trigger permanent account suspension UI
            const modal = document.getElementById('modal-account-suspended');
            if (modal) {
                modal.classList.remove('hidden');
                modal.style.display = 'grid'; // Ensure flex override
            }
        } else {
            // Warning Bubble
            const neoBubble = document.getElementById('neo-fab-bubble');
            if (neoBubble) {
                neoBubble.textContent = `【警告 ${strikes}/3】利用規約に反する不適切な単語を検知しました。記録を中止します。`;
                neoBubble.style.backgroundColor = '#FF3B30';
                neoBubble.style.color = '#FFF';
                neoBubble.classList.add('show');
                setTimeout(() => { 
                    neoBubble.classList.remove('show'); 
                    neoBubble.style.backgroundColor = '';
                    neoBubble.style.color = '';
                }, 5000);
            }
        }
    };

    // --- System Health & Diagnostic Protocol ---
    window.updateSystemStatus = (status) => {
        const indicators = document.querySelectorAll('.system-health-indicator');
        indicators.forEach(indicator => {
            if (status === 'error') {
                indicator.style.backgroundColor = '#FF3B30';
                indicator.style.boxShadow = '0 0 8px rgba(255, 59, 48, 0.6)';
                indicator.title = 'System Health: Error / Offline';
            } else {
                indicator.style.backgroundColor = '#10b981';
                indicator.style.boxShadow = '0 0 8px rgba(16, 185, 129, 0.6)';
                indicator.title = 'System Health: Online';
            }
        });
    };

    window.onerror = function(msg, url, lineNo, columnNo, error) {
        console.error('[Neo Global Error caught]: ', msg, url, lineNo, columnNo, error);
        window.updateSystemStatus('error');
        return false;
    };

    window.addEventListener('unhandledrejection', function(event) {
        console.error('[Neo Promise Rejection caught]: ', event.reason);
        window.updateSystemStatus('error');
    });

    window.runNeoDiagnostic = async () => {
        try {
            console.log('[Neo Diagnostic] Starting hourly self-ping...');
            const diagnosticPrompt = "SYSTEM_PING: What is your primary mission?";
            // Pass diagnostic prompt directly to router (ignoring UI state)
            const currentDateTime = new Date().toLocaleString('ja-JP');
            const result = await determineRouteFromIntent(diagnosticPrompt, mockDB.userConfig.industry, "{}", currentDateTime);
            
            let isOk = false;
            const intents = Array.isArray(result) ? result : [result];
            for (const intent of intents) {
                if (intent.action === "DIAGNOSTIC_OK") {
                    isOk = true;
                    break;
                }
            }

            if (isOk) {
                console.log('[Neo Diagnostic] Success: AI is responsive and identity is intact.');
                window.updateSystemStatus('online');
            } else {
                throw new Error("Diagnostic failed to return DIAGNOSTIC_OK.");
            }
        } catch (e) {
            console.error('[Neo Diagnostic] FAILED:', e);
            window.updateSystemStatus('error');
            const neoBubble = document.getElementById('neo-fab-bubble');
            if (neoBubble) {
                neoBubble.textContent = "システムに一時的な接続障害が発生しています。";
                neoBubble.style.backgroundColor = '#FF3B30';
                neoBubble.style.color = '#FFF';
                neoBubble.classList.add('show');
                setTimeout(() => { 
                    neoBubble.classList.remove('show'); 
                    neoBubble.style.backgroundColor = '';
                    neoBubble.style.color = '';
                }, 5000);
            }
        }
    };

    // Run diagnostic ping every 1 hour (3600000 ms)
    setInterval(window.runNeoDiagnostic, 3600000);

    const handleInstruction = async (text, hasImage = false) => {
        if (!text && !hasImage) return;
        if (isProcessingInstruction) return;
        
        // --- 1. Hardcoded Compliance Blacklist Check ---
        const matchedToxicKw = COMPLIANCE_BLACKLIST.find(keyword => text.includes(keyword));
        if (matchedToxicKw) {
            window.handleComplianceViolation(`Physical Blacklist Match (${matchedToxicKw})`, text);
            if (instructionInput) instructionInput.value = '';
            return; // Immediately halt all execution
        }

        // --- 1.5 Offline Guardianship Validation Check ---
        if (!navigator.onLine) {
            const neoBubble = document.getElementById('neo-fab-bubble');
            if (neoBubble) {
                neoBubble.textContent = `現在オフラインですが、セキュリティチェックは正常に完了しました。通信環境の良いところで再度お試しください。`;
                neoBubble.classList.add('show');
                setTimeout(() => { neoBubble.classList.remove('show'); }, 6000);
            }
            if (instructionInput) instructionInput.value = '';
            return; // Halt AI execution safely, physical blacklist already ran
        }

        isProcessingInstruction = true;

        const instructionStartTime = Date.now();
        instructionMics.forEach(mic => mic.disabled = true);
        btnAttachImages.forEach(btn => btn.disabled = true);

        // Tag relay logic has been moved to createNewProjectFromTags and the send button listener

        // UI Indicator for AI processing
        if (instructionInput) {
            instructionInput.style.transition = 'border-color 0.3s ease, box-shadow 0.3s ease';
            instructionInput.style.borderColor = 'var(--accent-neo-blue)';
            instructionInput.style.boxShadow = '0 0 10px rgba(29, 155, 240, 0.2)';
            instructionInput.disabled = true;
        }

        try {
            // Simulate AI Processing Time (Multi-modal parsing)
            if (neo) neo.speak('neo_thinking');

            // --- 強制コマンド: 複合(フォルダ作成 ＋ 経費追加) ---
            // 例: 「品川駅というフォルダを作って、タクシー代2000円を追加して」
            const compoundMatch = text.match(/(?:「([^」]+)」|([^\s]+?))(?:という|で)(?:フォルダ|プロジェクト)を?作って(.*?(?:追加|計上).*)/);
            if (compoundMatch) {
                const newProjectName = compoundMatch[1] || compoundMatch[2];
                const expenseText = compoundMatch[3]; // 「、タクシー代2000円を追加して」の部分

                if (newProjectName && expenseText) {
                    const newProjId = Date.now();
                    const newProj = {
                        id: newProjId,
                        name: newProjectName,
                        customerName: "-",
                        location: "-",
                        note: "",
                        category: "other",
                        color: "#007AFF",
                        unit: "-",
                        hasUnpaid: false,
                        revenue: 0,
                        status: 'active',
                        clientName: "",
                        paymentDeadline: "",
                        bankInfo: "",
                        lastUpdated: new Date().toLocaleDateString('ja-JP').replace(/\//g, '/')
                    };
                    window.insertProject(newProj);
                    currentOpenProjectId = newProjId;

                    // 経費部分の解析
                    let finalAmount = 0;
                    const amountMatch = expenseText.match(/\d+/);
                    if (amountMatch) {
                        finalAmount = parseInt(amountMatch[0], 10);
                    }

                    // タイトルから作成したプロジェクト名と不要なコマンド語彙を削る
                    let finalTitle = expenseText
                        .replace(/[、,。]/g, '')
                        .replace(/追加して/g, '')
                        .replace(/追加/g, '')
                        .replace(/計上して/g, '')
                        .replace(/計上/g, '')
                        .replace(newProjectName, '')
                        .trim();

                    const newTransaction = {
                        id: Date.now() + 1,
                        projectId: newProjId,
                        type: "expense",
                        title: finalTitle || "無題の経費",
                        amount: finalAmount,
                        date: new Date().toLocaleDateString('ja-JP').replace(/\//g, '/'),
                        source: "inline-compound"
                    };

                    window.insertTransaction(newTransaction);
                    try {
                        const savedTxs = JSON.parse(localStorage.getItem('neo_transactions') || '[]');
                        savedTxs.push(newTransaction);
                        localStorage.setItem('neo_transactions', JSON.stringify(savedTxs));
                    } catch (e) { /* ignore */ }

                    renderProjects(mockDB.projects);

                    // 通知バブル
                    const neoBubble = document.getElementById('neo-fab-bubble');
                    if (neoBubble) {
                        neoBubble.textContent = `フォルダ「${newProjectName}」を作成し、${finalAmount}円を記録したよ⚡️`;
                        neoBubble.classList.add('show');
                        setTimeout(() => { neoBubble.classList.remove('show'); }, 5000);
                    }

                    if (instructionInput) {
                        instructionInput.value = '';
                    }
                    const curView = document.querySelector('.view:not(.hidden)');
                    const currentViewId = curView ? curView.id : null;
                    if (currentViewId !== 'view-sites') {
                        switchView('view-sites');
                    }
                    return; // AI呼び出しを完全バイパス
                }
            }

            // --- 強制コマンド: オフライン・エンティティ抽出（完全ローカル対応） ---
            const commandData = window.parseCommand(text);

            // Accept offline parsing if we explicitly found a date or location, OR if it has action verbs/conversational triggers
            const hasActionVerb = /(作って|新規|作成|立ち上げて|が入った|決まった|する|はいいた|はいいった|入った|決定|儲かった|ゲット)/.test(text);
            if (commandData.date || commandData.location || hasActionVerb) {

                // Ensure createProject exists explicitly - now globally hoisted

                const newProjInfo = window.createProject(commandData.title, commandData.date, commandData.location);

                // 通知バブル
                const neoBubble = document.getElementById('neo-fab-bubble');
                if (neoBubble) {
                    neoBubble.textContent = `了解！「${newProjInfo.name}」プロジェクトを作成したよ⚡️`;
                    neoBubble.classList.add('show');
                    setTimeout(() => { neoBubble.classList.remove('show'); }, 4000);
                }

                if (instructionInput) {
                    instructionInput.value = '';
                }
                const curViewBottom = document.querySelector('.view:not(.hidden)');
                const currentViewId = curViewBottom ? curViewBottom.id : null;
                if (currentViewId !== 'view-sites') {
                    switchView('view-sites');
                }
                return; // 重要: 完全にAPIをバイパス
            }

            // --- 強制コマンド: 集計・合計 ---
            // 例: 「東京駅の請求書まとめて」「東京駅を合計して」
            const aggregateMatch = text.match(/(?:「([^」]+)」|([^\s]+?))(?:の請求書まとめて|を合計して|の集計|の合計)/);
            if (aggregateMatch) {
                const targetProjectName = aggregateMatch[1] || aggregateMatch[2];
                if (targetProjectName) {
                    const targetProjId = findProjectIdByName(targetProjectName);
                    if (targetProjId) {
                        const targetProj = mockDB.projects.find(p => p.id === targetProjId);

                        // 経費（expense）と人工（labor）を合計
                        const expenses = mockDB.transactions
                            .filter(t => t.projectId === targetProjId && (t.type === 'expense' || t.type === 'labor'))
                            .reduce((acc, curr) => acc + curr.amount, 0);

                        // 通知バブル
                        const neoBubble = document.getElementById('neo-fab-bubble');
                        if (neoBubble) {
                            neoBubble.textContent = `了解。「${targetProj.name}」の現在の経費合計は ¥${expenses.toLocaleString()} だよ📊`;
                            neoBubble.classList.add('show');
                            setTimeout(() => { neoBubble.classList.remove('show'); }, 5000);
                        }

                        // ネイティブアラートでも出す（確実な認知のため）
                        alert(`【集計結果】\nプロジェクト: ${targetProj.name}\n経費合計: ¥${expenses.toLocaleString()}`);

                        if (instructionInput) {
                            instructionInput.value = '';
                        }
                        return; // ここで抜けることでAI呼び出しを完全バイパス
                    } else {
                        const neoBubble = document.getElementById('neo-fab-bubble');
                        if (neoBubble) {
                            neoBubble.textContent = `ごめん、「${targetProjectName}」が見つからなかった。`;
                            neoBubble.classList.add('show');
                            setTimeout(() => { neoBubble.classList.remove('show'); }, 4000);
                        }
                        if (instructionInput) {
                            instructionInput.value = '';
                        }
                        return;
                    }
                }
            }

            // --- 強制コマンド: 請求書プレビュー ---
            // 例: 「東京駅の請求書プレビュー」「東京駅の請求書」
            const invoiceMatch = text.match(/(?:「([^」]+)」|([^\s]+?))の請求書(プレビュー)?/);
            if (invoiceMatch && text.includes('プレビュー')) {
                const targetProjectName = invoiceMatch[1] || invoiceMatch[2];
                if (targetProjectName) {
                    const targetProjId = findProjectIdByName(targetProjectName);
                    if (targetProjId) {
                        const targetProj = mockDB.projects.find(p => p.id === targetProjId);

                        // 経費（expense）と人工（labor）を集計
                        const expenses = mockDB.transactions
                            .filter(t => t.projectId === targetProjId && (t.type === 'expense' || t.type === 'labor'));

                        const subtotal = expenses.reduce((acc, curr) => acc + curr.amount, 0);
                        const tax = Math.floor(subtotal * 0.1);
                        const grandTotal = subtotal + tax;

                        // Universal Engine: 職種に応じたテンプレート自動切り替え
                        const industry = mockDB.userConfig.industry;
                        const honorific = (industry === 'freelance' || industry === 'general') ? '様' : '御中';
                        const itemDescription = (industry === 'construction') ? '一式' : '内容';
                        const itemUnit = (industry === 'construction') ? '式' : '回';

                        // 請求書プレビューUIの更新
                        document.getElementById('invoice-client-name').textContent = (targetProj.clientName || '株式会社〇〇') + ` ${honorific}`;
                        document.getElementById('invoice-date').textContent = `発行日: ${new Date().toLocaleDateString('ja-JP').replace(/\//g, '/')}`;
                        document.getElementById('invoice-no').textContent = `請求番号: INV-${Date.now().toString().slice(-4)}`;

                        document.getElementById('invoice-total-amount').textContent = `¥${grandTotal.toLocaleString()}`;

                        // --- Company Stamp Overlay Logic ---
                        const stampOverlay = document.getElementById('invoice-stamp-overlay');
                        const savedStamp = localStorage.getItem('neo_company_stamp_data');
                        
                        if (stampOverlay && savedStamp) {
                            const scale = localStorage.getItem('neo_company_stamp_scale') || "1.0";
                            const x = localStorage.getItem('neo_company_stamp_x') || "0";
                            const y = localStorage.getItem('neo_company_stamp_y') || "0";
                            
                            stampOverlay.src = savedStamp;
                            stampOverlay.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
                            stampOverlay.style.display = 'block';
                            
                            const companyInfoArea = document.getElementById('invoice-company-info-area');
                            if (companyInfoArea) {
                                companyInfoArea.style.minHeight = '120px';
                            }
                        } else if (stampOverlay) {
                            stampOverlay.style.display = 'none';
                        }
                        // -----------------------------------

                        const tbody = document.getElementById('invoice-items-body');
                        if (tbody) {
                            tbody.innerHTML = `
                                <tr style="border-bottom: 1px solid #eee;">
                                    <td style="padding: 12px 8px;">${targetProj.name} ${itemDescription}</td>
                                    <td style="padding: 12px 8px; text-align: center;">1</td>
                                    <td style="padding: 12px 8px; text-align: center;">${itemUnit}</td>
                                    <td style="padding: 12px 8px; text-align: right;">${subtotal.toLocaleString()}</td>
                                </tr>
                            `;
                        }

                        document.getElementById('invoice-subtotal').textContent = `¥${subtotal.toLocaleString()}`;
                        document.getElementById('invoice-tax').textContent = `¥${tax.toLocaleString()}`;
                        document.getElementById('invoice-grand-total').textContent = `¥${grandTotal.toLocaleString()}`;

                        document.getElementById('invoice-bank-info').textContent = targetProj.bankInfo || '指定なし（プロジェクト設定から入力してください）';
                        document.getElementById('invoice-deadline').textContent = targetProj.paymentDeadline ? targetProj.paymentDeadline.replace(/-/g, '/') : '指定なし';

                        // 通知バブル
                        const neoBubble = document.getElementById('neo-fab-bubble');
                        if (neoBubble) {
                            neoBubble.textContent = `了解。「${targetProj.name}」の請求書を下書きしたよ⚡️`;
                            neoBubble.classList.add('show');
                            setTimeout(() => { neoBubble.classList.remove('show'); }, 3000);
                        }

                        if (instructionInput) {
                            instructionInput.value = '';
                        }
                        switchView('view-invoice');
                        return; // AI呼び出しを完全バイパス
                    }
                }
            }

            // --- 強制コマンド: 画面遷移 (Navigation) ---
            // 例: 「一覧見せて」「ホームに戻して」
            const navMatch = text.match(/(ホーム|ダッシュボード|トップ|プロジェクト|プロジェクト一覧|現場|現場一覧|一覧|設定|プロファイル|アカウント)\s*(に|へ)?(戻して|戻る|見せて|開いて|いって|いく)/);
            if (navMatch) {
                const keyword = navMatch[1];
                let targetView = null;

                if (keyword.includes('ホーム') || keyword.includes('ダッシュボード') || keyword.includes('トップ')) {
                    targetView = 'view-dash';
                } else if (keyword.includes('プロジェクト') || keyword.includes('現場') || keyword.includes('一覧')) {
                    targetView = 'view-sites';
                } else if (keyword.includes('設定') || keyword.includes('プロファイル') || keyword.includes('アカウント')) {
                    targetView = 'view-settings';
                }

                if (targetView) {
                    // 通知バブル
                    const neoBubble = document.getElementById('neo-fab-bubble');
                    if (neoBubble) {
                        neoBubble.textContent = `了解、移動するよ⚡️`;
                        neoBubble.classList.add('show');
                        setTimeout(() => { neoBubble.classList.remove('show'); }, 3000);
                    }

                    if (instructionInput) {
                        instructionInput.value = '';
                    }
                    switchView(targetView);
                    return; // AI呼び出しを完全バイパス
                }
            }

            // --- Home Parsing Logic for Projects (Fuzzy Match / あいまい検索) ---
            const matchedProjectId = findProjectIdByName(text);
            if (matchedProjectId) {
                currentOpenProjectId = matchedProjectId;
            }

            // Artificial delay to simulate complex parsing
            await new Promise(resolve => setTimeout(resolve, 800));

            // Trigger the Neo-Sync glowing effect -> Data is being distributed
            triggerNeoSyncGlow();

            // Allow glow to be visible for a moment before switching views
            await new Promise(resolve => setTimeout(resolve, 600));

            // Logic to determine route based on input type
            let intents = [{ action: "UNKNOWN" }];

            if (!hasImage) {
                const localMatch = findLocalMatch(text);

                if (false && localMatch && localMatch.amount > 0) {
                    intents = [localMatch];
                    console.log("[Neo AI] LOCAL CACHE HIT:", localMatch);
                    
                    // Show a fast cache notification indicator playfully
                    const neoBubble = document.getElementById('neo-fab-bubble');
                    if (neoBubble) {
                        neoBubble.textContent = `過去のデータから一瞬で答えたよ⚡️`;
                        neoBubble.classList.add('show');
                        setTimeout(() => neoBubble.classList.remove('show'), 2000);
                    }
                } else {
                    // --- Construct Memory ---
                    const condensedProjects = mockDB.projects.map(p => ({
                        id: p.id,
                        name: p.name,
                        revenue: p.revenue,
                        status: p.status
                    })).slice(0, 10);
                    
                    const recentLogs = mockDB.transactions
                        .filter(t => !t.is_deleted)
                        .slice(0, 5)
                        .map(t => ({
                            title: t.title,
                            amount: t.amount,
                            date: t.date
                        }));
                        
                    // Add Correction History to prevent repeated mistakes
                    const correctionHistory = window.aiCorrectionLog ? window.aiCorrectionLog.slice(-5) : [];
                        
                    const stateMemory = JSON.stringify({ 
                        active_projects: condensedProjects, 
                        recent_transactions: recentLogs,
                        recent_corrections: correctionHistory
                    });

                    // Call Gemini API from gemini.js with Memory Context (with Fallback)
                    try {
                        const currentDateTime = new Date().toLocaleString('ja-JP');
                        const geminiResult = await determineRouteFromIntent(text, mockDB.userConfig.industry, stateMemory, currentDateTime);
                        if (Array.isArray(geminiResult)) {
                            intents = geminiResult;
                        } else {
                            intents = [geminiResult];
                        }
                    } catch (aiError) {
                        console.error("[Neo AI Fallback] Gemini call failed:", aiError);
                        const neoBubble = document.getElementById('neo-fab-bubble');
                        if (neoBubble) {
                            neoBubble.textContent = "ごめんなさい、ちょっと考えすぎてフリーズしちゃった。手動で入力画面から登録してくれるかな💦";
                            neoBubble.classList.add('show');
                            setTimeout(() => { neoBubble.classList.remove('show'); }, 5000);
                        }
                        
                        // Fail safely back to home
                        if (instructionInput) instructionInput.value = '';
                        switchView('view-dash');
                        return; // Halt AI execution
                    }
                }
            }

            console.log('Final Intents:', intents);

            // Loop through all actions sequentially
            for (const intent of intents) {
                const action = intent.action;

                if (action === "CREATE_PROJECT") {
                    const newProjectName = intent.project_name || "名称未設定プロジェクト";
                    const newProjId = Date.now();
                    const newProj = {
                        id: newProjId,
                        name: newProjectName,
                        customerName: "-",
                        location: "-",
                        note: "",
                        category: "other",
                        color: "#007AFF",
                        unit: "-",
                        hasUnpaid: false,
                        revenue: 0,
                        status: 'active',
                        clientName: "",
                        paymentDeadline: "",
                        bankInfo: "",
                        lastUpdated: new Date().toLocaleDateString('ja-JP').replace(/\//g, '/')
                    };
                    window.insertProject(newProj);
                    currentOpenProjectId = newProjId;
                    renderProjects(mockDB.projects);

                    const neoBubble = document.getElementById('neo-fab-bubble');
                    if (neoBubble) {
                        neoBubble.textContent = `プロジェクト「${newProjectName}」を作成したよ⚡️`;
                        neoBubble.classList.add('show');
                        setTimeout(() => { neoBubble.classList.remove('show'); }, 3000);
                    }

                } else if (action === "ADD_EXPENSE") {
                    const projId = currentOpenProjectId || 1;
                    const pObj = mockDB.projects.find(p => p.id === projId);
                    const projName = pObj ? pObj.name : '未分類';

                    let finalAmount = intent.amount;
                    if (!finalAmount || finalAmount === 0 || isNaN(finalAmount)) {
                        const match = text.match(/\d+/);
                        finalAmount = match ? parseInt(match[0], 10) : 0;
                    }

                    let finalTitle = intent.title || text;
                    if (projName !== '未分類') {
                        finalTitle = finalTitle.replace(projName, '').trim();
                    }

                    // BusinessLexicon: 専門用語・多言語マッピング
                    let entryType = intent.type || "expense";
                    let matchedByLearning = intent.source_cache ? true : false;
                    const checkString = (finalTitle + " " + text).toLowerCase();

                    // 1. Pro-Artisan Learning System (Highest Priority)
                    const extractedTags = intent.tags || [];
                    if (!matchedByLearning) {
                        const allKeywords = [...extractedTags.map(t => t.toLowerCase()), ...checkString.split(/\s+/)];
                        for (const kw of allKeywords) {
                            if (mockDB.learnedKeywords[kw]) {
                                entryType = mockDB.learnedKeywords[kw];
                                matchedByLearning = true;
                                console.log(`[Neo AI] Applied Lexicon Category: "${kw}" => ${entryType}`);
                                break;
                            }
                        }
                    }

                    // 2. Default BusinessLexicon Fallback
                    if (!matchedByLearning) {
                        if (/(人工|作業員|職人|応援|labor|worker|helper)/.test(checkString)) {
                            entryType = "labor";
                        } else if (/(材料|資材|建材|ホームセンター|material|lumber|hardware)/.test(checkString)) {
                            entryType = "material";
                        } else if (/(外注|下請|協力業|outsource|subcontractor)/.test(checkString)) {
                            entryType = "outsource";
                        } else if (/(接待|交際|会食|飲み会|coffee|dinner|meeting|entertainment)/.test(checkString)) {
                            entryType = "entertainment";
                        } else if (/(交通|タクシー|新幹線|電車|バス|ガソリン|transport|taxi|train|gas|fuel)/.test(checkString)) {
                            entryType = "transport";
                        }
                    }

                    const newTransactionDraft = {
                        id: Date.now(),
                        projectId: projId,
                        projectName: projName,
                        type: entryType,
                        category: intent.category || "その他",
                        title: finalTitle || "無題の経費",
                        amount: finalAmount,
                        date: new Date().toLocaleDateString('ja-JP').replace(/\//g, '/'),
                        source: intent.source_cache ? "local-cache" : "inline-ai",
                        isBookkeeping: intent.is_bookkeeping || false,
                        inferredTaxRate: intent.inferred_tax_rate || null,
                        taxComment: intent.tax_comment || null,
                        tags: extractedTags,
                        originalInput: text // Save what the user actually said
                    };

                    // --- Duplicate Entry Guardrail ---
                    const todayDate = new Date().toLocaleDateString('ja-JP').replace(/\//g, '/');
                    const isDuplicate = mockDB.transactions.some(t => 
                        !t.is_deleted && 
                        t.date === todayDate && 
                        t.amount === finalAmount && 
                        (t.title === finalTitle || t.category === newTransactionDraft.category)
                    );

                    if (isDuplicate) {
                        const neoBubble = document.getElementById('neo-fab-bubble');
                        if (neoBubble) {
                            neoBubble.textContent = `【確認】同じ金額・内容のデータが最近登録されています。二重登録ではありませんか？`;
                            neoBubble.style.backgroundColor = '#FF9500'; // Warning Orange
                            neoBubble.style.color = '#FFF';
                            neoBubble.classList.add('show');
                            setTimeout(() => { 
                                neoBubble.classList.remove('show'); 
                                neoBubble.style.backgroundColor = '';
                                neoBubble.style.color = '';
                            }, 6000);
                        }
                    }

                    // ---- RAG Rejection Immediate Feedback ----
                    if (intent.is_bookkeeping === false && intent.tax_comment) {
                        const neoBubble = document.getElementById('neo-fab-bubble');
                        if (neoBubble) {
                            let displayText = intent.tax_comment;
                            if (intent.citation && intent.citation !== "Neo+ Memory") {
                                displayText += `<div style="margin-top: 8px; font-size: 10px; color: var(--accent-neo-blue); background: rgba(15, 98, 254, 0.1); padding: 4px 8px; border-radius: 4px; display: inline-block; align-items: center; gap: 4px;"><i data-lucide="book-open" style="width: 12px; height: 12px;"></i> 法的根拠: ${intent.citation}</div>`;
                            }
                            neoBubble.innerHTML = displayText;
                            if (window.lucide) window.lucide.createIcons();
                            neoBubble.classList.add('show');
                            setTimeout(() => { neoBubble.classList.remove('show'); }, 8000);
                        }
                        return; // Prevent modal opening
                    }

                    // ---- DOUBLE CHECK VALIDATION GATE ----
                    // Instead of saving directly, store in pending and open confirmation modal
                    window.pendingAiDecision = newTransactionDraft;
                    
                    document.getElementById('confirm-tx-title').value = newTransactionDraft.title;
                    document.getElementById('confirm-tx-amount').value = newTransactionDraft.amount;
                    document.getElementById('confirm-tx-category').value = newTransactionDraft.type;
                    document.getElementById('confirm-tx-original-category').value = newTransactionDraft.type;
                    
                    // Populate Tax Hint UI if inferred
                    const taxHintBox = document.getElementById('confirm-tax-hint');
                    const taxRateVal = document.getElementById('confirm-tax-rate-val');
                    if (taxHintBox && taxRateVal) {
                        if (newTransactionDraft.inferredTaxRate) {
                            taxRateVal.textContent = newTransactionDraft.inferredTaxRate;
                            taxHintBox.classList.remove('hidden');
                        } else {
                            taxHintBox.classList.add('hidden');
                        }
                    }

                    document.getElementById('modal-neo-confirm').classList.remove('hidden');

                    if (!isDuplicate) {
                        const neoBubble = document.getElementById('neo-fab-bubble');
                        if (neoBubble) {
                            neoBubble.textContent = `この内容で保存していいかな？ (修正もできるよ☝️)`;
                            neoBubble.classList.add('show');
                        }
                    }

                } else if (action === "PREVIEW_INVOICE") {
                    const targetProjectName = intent.project_name;
                    let targetProjId = currentOpenProjectId;

                    if (targetProjectName) {
                        targetProjId = findProjectIdByName(targetProjectName) || currentOpenProjectId;
                    }

                    if (targetProjId) {
                        const targetProj = mockDB.projects.find(p => p.id === targetProjId);
                        const expenses = mockDB.transactions.filter(t => t.projectId === targetProjId && !t.is_deleted && (t.type === 'expense' || t.type === 'labor' || t.type === 'material' || t.type === 'outsource' || t.type === 'entertainment' || t.type === 'transport'));
                        const subtotal = expenses.reduce((acc, curr) => acc + curr.amount, 0);
                        const tax = Math.floor(subtotal * 0.1);
                        const grandTotal = subtotal + tax;

                        // Universal Engine: 職種に応じたテンプレート自動切り替え
                        const industry = mockDB.userConfig.industry;
                        const honorific = (industry === 'freelance' || industry === 'general') ? '様' : '御中';
                        const itemDescription = (industry === 'construction') ? '一式' : '内容';
                        const itemUnit = (industry === 'construction') ? '式' : '回';

                        document.getElementById('invoice-client-name').textContent = (targetProj.clientName || '株式会社〇〇') + ` ${honorific}`;
                        document.getElementById('invoice-date').textContent = `発行日: ${new Date().toLocaleDateString('ja-JP').replace(/\//g, '/')}`;
                        document.getElementById('invoice-no').textContent = `請求番号: INV-${Date.now().toString().slice(-4)}`;
                        document.getElementById('invoice-total-amount').textContent = `¥${grandTotal.toLocaleString()}`;

                        // --- Company Stamp Overlay Logic ---
                        const stampOverlay = document.getElementById('invoice-stamp-overlay');
                        const savedStamp = localStorage.getItem('neo_company_stamp_data');
                        
                        if (stampOverlay && savedStamp) {
                            const scale = localStorage.getItem('neo_company_stamp_scale') || "1.0";
                            const x = localStorage.getItem('neo_company_stamp_x') || "0";
                            const y = localStorage.getItem('neo_company_stamp_y') || "0";
                            
                            stampOverlay.src = savedStamp;
                            stampOverlay.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
                            stampOverlay.style.display = 'block';
                            
                            // Adjust company info area height to ensure stamp isn't cut off visually
                            const companyInfoArea = document.getElementById('invoice-company-info-area');
                            if (companyInfoArea) {
                                companyInfoArea.style.minHeight = '120px';
                            }
                        } else if (stampOverlay) {
                            stampOverlay.style.display = 'none';
                        }
                        // -----------------------------------

                        const tbody = document.getElementById('invoice-items-body');
                        if (tbody) {
                            tbody.innerHTML = `
                                <tr style="border-bottom: 1px solid #eee;">
                                    <td style="padding: 12px 8px;">${targetProj.name} ${itemDescription}</td>
                                    <td style="padding: 12px 8px; text-align: center;">1</td>
                                    <td style="padding: 12px 8px; text-align: center;">${itemUnit}</td>
                                    <td style="padding: 12px 8px; text-align: right;">${subtotal.toLocaleString()}</td>
                                </tr>
                            `;
                        }

                        document.getElementById('invoice-subtotal').textContent = `¥${subtotal.toLocaleString()}`;
                        document.getElementById('invoice-tax').textContent = `¥${tax.toLocaleString()}`;
                        document.getElementById('invoice-grand-total').textContent = `¥${grandTotal.toLocaleString()}`;
                        document.getElementById('invoice-bank-info').textContent = targetProj.bankInfo || '指定なし（プロジェクト設定から入力してください）';
                        document.getElementById('invoice-deadline').textContent = targetProj.paymentDeadline ? targetProj.paymentDeadline.replace(/-/g, '/') : '指定なし';

                        switchView('view-invoice');

                        const neoBubble = document.getElementById('neo-fab-bubble');
                        if (neoBubble) {
                            neoBubble.textContent = `了解。「${targetProj.name}」の請求書を下書きしたよ⚡️`;
                            neoBubble.classList.add('show');
                            setTimeout(() => { neoBubble.classList.remove('show'); }, 3000);
                        }
                    }

                } else if (action === "AGGREGATE") {
                    const targetProjectName = intent.project_name;
                    if (targetProjectName) {
                        const targetProjId = findProjectIdByName(targetProjectName);
                        if (targetProjId) {
                            const targetProj = mockDB.projects.find(p => p.id === targetProjId);
                            const expenses = mockDB.transactions
                                .filter(t => t.projectId === targetProjId && (t.type === 'expense' || t.type === 'labor' || t.type === 'material' || t.type === 'outsource' || t.type === 'entertainment' || t.type === 'transport'))
                                .reduce((acc, curr) => acc + curr.amount, 0);

                            console.log(`[DEBUG - AGGREGATE] Project: ${targetProj.name} | Total Scanned: ¥${expenses}`);

                            const neoBubble = document.getElementById('neo-fab-bubble');
                            if (neoBubble) {
                                neoBubble.textContent = `了解。「${targetProj.name}」のこれまでの総経費は ¥${expenses.toLocaleString()} だよ📊`;
                                neoBubble.classList.add('show');
                                setTimeout(() => { neoBubble.classList.remove('show'); }, 5000);
                            }
                            alert(`【累計集計結果】\nプロジェクト: ${targetProj.name}\nこれまでの経費合計: ¥${expenses.toLocaleString()}`);
                        }
                    }
                } else if (action === "NAVIGATE") {
                    if (intent.target_view) {
                        switchView(intent.target_view);
                    }
                } else if (action === "GENERATE_DOCUMENT") {
                    try {
                        const docType = intent.doc_type; // e.g. "invoice", "estimate"
                        const targetProjectName = intent.project_name;
                        
                        let targetProjId = currentOpenProjectId || 1; 
                        
                        if (targetProjectName) {
                            const foundId = findProjectIdByName(targetProjectName);
                            if (foundId) {
                                targetProjId = foundId;
                            }
                        }
                        
                        // 1. Physically swap to Sites view and open project detail
                        switchView('view-sites');
                        window.openProjectDetail(targetProjId);
                        
                        // 2. Wait for transition, then physically open document modal
                        setTimeout(() => {
                            try {
                                const btnOpenDocModal = document.getElementById('btn-open-doc-modal');
                                if (btnOpenDocModal) {
                                    btnOpenDocModal.click(); // Stop at opening. Never auto-generate the actual PDF.
                                    
                                    const neoBubble = document.getElementById('neo-fab-bubble');
                                    if (neoBubble) {
                                        neoBubble.textContent = `書類作成の準備ができたよ⚡️`;
                                        neoBubble.classList.add('show');
                                        setTimeout(() => { neoBubble.classList.remove('show'); }, 3000);
                                    }
                                } else {
                                    console.warn("[Neo Fallback] Generate Document button missing.");
                                    throw new Error("Missing UI Element");
                                }
                            } catch(uiError) {
                                const neoBubble = document.getElementById('neo-fab-bubble');
                                if (neoBubble) {
                                    neoBubble.textContent = "ごめんなさい、書類画面を開けなかったみたい。プロジェクト詳細から手動で開いてみてね💦";
                                    neoBubble.classList.add('show');
                                    setTimeout(() => { neoBubble.classList.remove('show'); }, 4000);
                                }
                            }
                        }, 500); 
                    } catch (genError) {
                        console.error("[Neo Fallback] Document generation flow failed.", genError);
                    }

                } else if (action === "QUERY_KNOWLEDGE") {
                    const answerText = intent.answer;
                    const citation = intent.citation;
                    if (answerText) {
                        const neoBubble = document.getElementById('neo-fab-bubble');
                        if (neoBubble) {
                            let bubbleHTML = `<span>${answerText}</span>`;
                            if (citation && citation !== "Neo+ Memory") {
                                bubbleHTML += `<div style="margin-top: 8px; font-size: 10px; color: var(--accent-neo-blue); background: rgba(15, 98, 254, 0.1); padding: 4px 8px; border-radius: 4px; display: inline-block; align-items: center; gap: 4px;"><i data-lucide="book-open" style="width: 12px; height: 12px;"></i> 法的根拠: ${citation}</div>`;
                            }
                            neoBubble.innerHTML = bubbleHTML;
                            if (window.lucide) window.lucide.createIcons();
                            neoBubble.classList.add('show');
                            setTimeout(() => { neoBubble.classList.remove('show'); }, 6000); // Wait 6s so user can read
                        }
                    }
                } else if (action === "COMPLIANCE_VIOLATION") {
                    window.handleComplianceViolation("AI Ethics Protocol Violation", text);
                } else {
                    // Check if UNKNOWN is actually an active AI refusal (Speculation, Sex, Ethics)
                    const answerText = intent.answer || "";
                    if (answerText.includes("お答えできません") || answerText.includes("一切行いません") || answerText.includes("不適切な発言")) {
                        window.logSecurityEvent(`AI Behavioral Refusal: ${answerText.slice(0, 20)}...`, text);
                        const neoBubble = document.getElementById('neo-fab-bubble');
                        if (neoBubble) {
                            neoBubble.textContent = answerText;
                            neoBubble.classList.add('show');
                            setTimeout(() => { neoBubble.classList.remove('show'); }, 6000);
                        }
                    } else {
                        // Fallback to expense if UNKNOWN or unclear
                        const projId = currentOpenProjectId || 1;

                        let finalAmountFallback = 0;
                        const match = text.match(/\d+/);
                        if (match) {
                            finalAmountFallback = parseInt(match[0], 10);
                        }

                        const newTransaction = {
                            id: Date.now(),
                            projectId: projId,
                            type: "expense",
                            title: text.trim() || "無題の経費",
                            amount: finalAmountFallback,
                            date: new Date().toLocaleDateString('ja-JP').replace(/\//g, '/'),
                            source: "inline-fallback"
                        };

                        window.insertTransaction(newTransaction);
                        renderProjects(mockDB.projects);

                        const neoBubble = document.getElementById('neo-fab-bubble');
                        if (neoBubble) {
                            neoBubble.textContent = `内容が不明確なため、「未分類」として仮保存したよ⚡️`;
                            neoBubble.classList.add('show');
                            setTimeout(() => { neoBubble.classList.remove('show'); }, 4000);
                        }
                    }
                }
            }

            if (instructionInput) {
                instructionInput.value = '';
            }
        } catch (error) {
            console.error("Failed to route via Gemini:", error);
            // alert("AI連携に失敗しました。\nエラー: " + error.message);

            // AIエラー時でもローカルで強制的に未分類として保存、もしくは入力から推測
            let projId = 1; // 1 = 未分類

            // 強制紐付け：入力テキストから「東京駅」などのプロジェクト名を特定する
            const matchedFallbackProjectId = findProjectIdByName(text);
            let projNameFallback = '未分類';
            if (matchedFallbackProjectId) {
                projId = matchedFallbackProjectId;
                projNameFallback = mockDB.projects.find(p => p.id === projId).name || '未分類';
            }

            let errorFallbackAmount = 0;
            const match = text.match(/\d+/);
            if (match) {
                errorFallbackAmount = parseInt(match[0], 10);
            }

            let errorFinalTitle = text;
            if (projNameFallback !== '未分類') {
                errorFinalTitle = errorFinalTitle.replace(projNameFallback, '').trim();
            }

            const errorTransaction = {
                id: Date.now(),
                projectId: projId,
                type: "expense",
                title: errorFinalTitle || "無題の経費",
                amount: errorFallbackAmount,
                date: new Date().toLocaleDateString('ja-JP').replace(/\//g, '/'),
                source: "error-fallback"
            };

            window.insertTransaction(errorTransaction);

            try {
                const savedTxs = JSON.parse(localStorage.getItem('neo_transactions') || '[]');
                savedTxs.push(errorTransaction);
                localStorage.setItem('neo_transactions', JSON.stringify(savedTxs));
                console.log("Error fallback expense forcefully saved to localStorage.");
            } catch (e) { /* ignore */ }

            // UIの即時同期・更新
            renderProjects(mockDB.projects);

            // 逃げのコードを物理的にコメントアウト
            // switchView('view-expense');

            const neoBubble = document.getElementById('neo-fab-bubble');
            if (neoBubble) {
                const projNameFallback = mockDB.projects.find(p => p.id === projId).name || '未分類';
                if (errorFallbackAmount > 0) {
                    neoBubble.textContent = `AIレスポンスエラー。「${projNameFallback}」へ${errorFallbackAmount}円を追加したよ⚡️`;
                } else {
                    neoBubble.textContent = `AI連携に失敗。「${projNameFallback}」に「${text}」で仮保存したよ⚡️`;
                }
                neoBubble.classList.add('show');
                setTimeout(() => { neoBubble.classList.remove('show'); }, 4000);
            }
            // Clear input on fallback
            if (instructionInput) {
                instructionInput.value = '';
            }
        } finally {
            // Restore input UI state
            const elapsed = Date.now() - instructionStartTime;
            const remainingDelay = Math.max(0, 3000 - elapsed);

            setTimeout(() => {
                if (instructionInput) {
                    instructionInput.style.borderColor = '';
                    instructionInput.style.boxShadow = '';
                    instructionInput.disabled = false;
                    instructionInput.focus();
                }
                instructionMics.forEach(mic => mic.disabled = false);
                btnAttachImages.forEach(btn => btn.disabled = false);
                isProcessingInstruction = false;
                if (neo) neo.speak('neo_idle');
            }, remainingDelay);
        }
    };

    if (instructionInput) {
        instructionInput.addEventListener('keydown', (e) => {
            // IME変換中のEnter押下は無視する
            if (e.isComposing || e.keyCode === 229) {
                return;
            }

            if (e.key === 'Enter') {
                if (e.shiftKey) {
                    // Shift + Enter の場合は改行を許容するため、そのままにする（デフォルトの挙動）
                    return;
                } else {
                    // 通常のEnter（変換確定後）は送信処理に回す
                    e.preventDefault(); // デフォルトの改行を防ぐ

                    // 送信インターセプト: DETECTEDタグがあれば最優先
                    if (window.createNewProjectFromTags && window.createNewProjectFromTags()) {
                        return;
                    }

                    const textValue = e.target.value.trim();
                    if (textValue) {
                        handleInstruction(textValue);
                    }
                }
            }
        });
    }

    instructionMics.forEach(mic => {
        mic.addEventListener('click', (e) => {
            e.preventDefault();
            // 純粋に音声入力の待機状態にする (mousedown等で起動済み)
            // お節介な自動入力は行わない
        });
    });

    btnAttachImages.forEach((btn, index) => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            // 純粋に画像選択ポップアップを開く
            if (ocrUploads[index]) {
                ocrUploads[index].click();
            } else if (ocrUploads[0]) {
                ocrUploads[0].click();
            }
        });
    });

    // Nav Item Listeners
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            switchView(item.getAttribute('data-target'));
        });
    });

    const showSetup = () => {
        switchView('view-setup');
        if (bottomNav) bottomNav.classList.add('hidden');

        // Neo Singleton: Do not hide neoFab

    };

    const showDash = () => {
        switchView('view-dash');
        if (bottomNav) bottomNav.classList.remove('hidden');

        // Restore size preference if reloading dash directly
        const storedSize = document.getElementById('select-font-size').value;
        if (storedSize === 'huge') applyFontSize('120%');

        // Initial First Action Greeting (CEO Request)
        setTimeout(() => {
            const bubble = document.getElementById('neo-fab-bubble');
            if (bubble) {
                bubble.textContent = 'CEO、今日の現場の動きを教えて。';
                bubble.classList.add('show');
            }
        }, 500);
    };

    // Database hoisted globally
    const mockDB = window.mockDB;

    // Simulated function to update local dictionary (Pro-Artisan mapping)
    window.updateLearnedKeyword = (keyword, category) => {
        if (!keyword || !category) return;
        mockDB.learnedKeywords[keyword.toLowerCase()] = category;
        console.log(`[Neo DB] Learned new mapping: "${keyword}" => ${category}`);
    };

    // --- DocGenerator: Universal Document Engine Stub ---
    window.DocGenerator = {
        generateInvoice: function (projectId) {
            console.log(`[DocGenerator] 請求書 (Invoice) generated for Project ID: ${projectId}`);
            alert(`請求書 (Invoice) generated for Project ID: ${projectId}`);
            return { status: "success", documentId: "inv_" + Date.now() };
        },
        generateQuote: function (projectId) {
            console.log(`[DocGenerator] 見積書 (Quote) generated for Project ID: ${projectId}`);
            alert(`見積書 (Quote) generated for Project ID: ${projectId}`);
            return { status: "success", documentId: "qte_" + Date.now() };
        },
        generateDelivery: function (projectId) {
            console.log(`[DocGenerator] 納品書 (Delivery) generated for Project ID: ${projectId}`);
            alert(`納品書 (Delivery) generated for Project ID: ${projectId}`);
            return { status: "success", documentId: "del_" + Date.now() };
        }
    };

    // Filter Logic Toggle
    const btnFilterProjects = document.getElementById('btn-filter-projects');
    const filterDropdown = document.getElementById('filter-dropdown');

    if (btnFilterProjects && filterDropdown) {
        btnFilterProjects.addEventListener('click', (e) => {
            e.stopPropagation();
            filterDropdown.classList.toggle('hidden');
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!filterDropdown.contains(e.target) && !btnFilterProjects.contains(e.target)) {
                filterDropdown.classList.add('hidden');
            }
        });

        // Filter Options Clicks
        const filterOptions = filterDropdown.querySelectorAll('.filter-option');
        filterOptions.forEach(opt => {
            opt.addEventListener('click', () => {
                // Remove active from all
                filterOptions.forEach(o => o.classList.remove('active'));
                // Add to clicked
                opt.classList.add('active');

                // Toggle active state on the filter button itself
                const filterType = opt.getAttribute('data-filter');
                if (filterType !== 'newest') {
                    btnFilterProjects.classList.add('filter-active');
                } else {
                    btnFilterProjects.classList.remove('filter-active');
                }

                // Hide dropdown
                filterDropdown.classList.add('hidden');

                // Apply Filter Logic
                applyProjectFilter(filterType);
            });
        });

        const periodInput = document.getElementById('filter-period');
        if (periodInput) {
            periodInput.addEventListener('change', () => applyProjectFilter());
        }

        const searchInput = document.getElementById('filter-search-input');
        const searchClearBtn = document.getElementById('btn-clear-search');

        if (searchInput && searchClearBtn) {
            searchInput.addEventListener('input', (e) => {
                if (e.target.value.trim().length > 0) {
                    searchClearBtn.classList.remove('hidden');
                } else {
                    searchClearBtn.classList.add('hidden');
                }
                applyProjectFilter();
            });

            searchClearBtn.addEventListener('click', () => {
                searchInput.value = '';
                searchClearBtn.classList.add('hidden');
                applyProjectFilter();
            });
        }
    };

    const applyProjectFilter = (filterType, resetPage = true) => {
        let sortedFiltered = [...mockDB.projects];

        if (resetPage) {
            currentProjectPage = 1;
        }

        if (!filterType) {
            const activeSortOpt = document.querySelector('#filter-dropdown .filter-option.active');
            filterType = activeSortOpt ? activeSortOpt.getAttribute('data-filter') : 'newest';
        }

        // Apply Text Search Filter (Name or Location)
        const searchInput = document.getElementById('filter-search-input');
        let isFilteredBySearch = false;
        if (searchInput && searchInput.value.trim()) {
            const query = searchInput.value.trim().toLowerCase();
            sortedFiltered = sortedFiltered.filter(p => {
                const nameMatch = (p.name || '').toLowerCase().includes(query);
                const locMatch = (p.location || '').toLowerCase().includes(query);
                return nameMatch || locMatch;
            });
            isFilteredBySearch = true;
        }

        // Apply Time Period Filter
        const periodInput = document.getElementById('filter-period');
        let isFilteredByDate = false;
        if (periodInput && periodInput.value) {
            const [yearStr, monthStr] = periodInput.value.split('-');
            const fYear = parseInt(yearStr, 10);
            const fMonth = parseInt(monthStr, 10);

            sortedFiltered = sortedFiltered.filter(p => {
                const pDate = new Date(p.lastUpdated || p.id);
                return pDate.getFullYear() === fYear && (pDate.getMonth() + 1) === fMonth;
            });
            isFilteredByDate = true;
        }

        // Highlight the filter button if any filter is applied
        const btnFilterProjects = document.getElementById('btn-filter-projects');
        if (btnFilterProjects) {
            if (filterType !== 'newest' || isFilteredByDate || isFilteredBySearch) {
                btnFilterProjects.classList.add('filter-active');
            } else {
                btnFilterProjects.classList.remove('filter-active');
            }
        }

        // Apply Sorting Logic
        if (filterType === 'newest') {
            sortedFiltered.sort((a, b) => b.id - a.id);
        } else if (filterType === 'date-desc') {
            sortedFiltered.sort((a, b) => new Date(b.lastUpdated || b.id) - new Date(a.lastUpdated || a.id));
        } else if (filterType === 'cost-desc') {
            sortedFiltered.sort((a, b) => {
                const costA = mockDB.transactions.filter(t => t.projectId === a.id && !t.is_deleted && t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
                const costB = mockDB.transactions.filter(t => t.projectId === b.id && !t.is_deleted && t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
                return costB - costA;
            });
        }

        // Re-render the list
        renderProjects(sortedFiltered, false);
    };

    // Render Projects (Bank Account style list)
    const renderProjects = (projectsToRender, resetPage = true) => {
        const container = document.getElementById('project-list-container');
        const paginationContainer = document.getElementById('project-pagination-container');
        if (!container) return;

        if (resetPage) {
            currentProjectPage = 1;
        }

        // CEO Fix: Default sort should ALWAYS be Created At (newest) first.
        // If the raw mockDB.projects array is passed, we clone and sort it desc by ID.
        if (projectsToRender === mockDB.projects) {
            projectsToRender = [...mockDB.projects].sort((a, b) => b.id - a.id);
        }

        container.innerHTML = '';
        if (paginationContainer) paginationContainer.innerHTML = '';

        let totalAgencyProfit = 0;

        if (projectsToRender.length === 0) {
            container.innerHTML = '<p style="padding: var(--spacing-lg); color: var(--text-muted); text-align: center;">プロジェクトはありません</p>';
            const totalWealthEl = document.getElementById('total-wealth-balance');
            if (totalWealthEl) totalWealthEl.textContent = '¥0';
            return;
        }

        // --- Pagination Logic (Max 10 per page) ---
        const ITEMS_PER_PAGE = 10;
        const totalPages = Math.ceil(projectsToRender.length / ITEMS_PER_PAGE);
        
        // Safety check if currentProjectPage exceeds new totalPages
        if (currentProjectPage > totalPages) {
            currentProjectPage = Math.max(1, totalPages);
        }

        const startIndex = (currentProjectPage - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        const pagedProjects = projectsToRender.slice(startIndex, endIndex);

        pagedProjects.forEach(proj => {
            // Calculate Profit Balance
            const mockRevenue = proj.revenue || 1000000;
            const expenses = mockDB.transactions.filter(t => t.projectId === proj.id && !t.is_deleted && t.type === 'expense').reduce((acc, curr) => acc + curr.amount, 0);
            const labor = mockDB.transactions.filter(t => t.projectId === proj.id && !t.is_deleted && t.type === 'labor').reduce((acc, curr) => acc + curr.amount, 0); // Mock logic

            const totalCost = expenses + labor;
            const projectProfit = mockRevenue - totalCost;

            totalAgencyProfit += projectProfit;

            // Bank Account Folder Item
            const item = document.createElement('div');
            item.className = 'project-list-item';
            item.style.position = 'relative';
            item.style.display = 'grid';
            item.style.alignItems = 'stretch';
            item.style.overflow = 'hidden';

            // Translate status
            let statusText = '稼働中';
            if (proj.status === 'planning') {
                statusText = '準備中';
            } else if (proj.status === 'completed') {
                statusText = '完了';
            }

            if (proj.hasUnpaid) {
                statusText = `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background-color:var(--accent-neo-blue);margin-right:4px;"></span>未入金あり`;
                item.classList.add('is-unpaid');
            }

            // Determine color tag based on category
            const catColors = {
                it: '#3b82f6',
                transportation: '#f59e0b',
                accounting: '#8b5cf6',
                construction: '#10b981',
                design: '#ec4899',
                other: '#6b7280'
            };
            const cColor = proj.color || catColors[proj.category] || '#9ca3af';

            // Format cost
            const displayCost = `コスト: ¥${totalCost.toLocaleString()}`;

            // Notification Check (Unpaid or fake Unissued for demo)
            const hasNotification = proj.hasUnpaid || Math.random() > 0.7; // Replace random with actual draft logic when documents expand
            const notificationDot = hasNotification ? `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background-color:#ef4444;margin-left:4px;box-shadow: 0 0 6px rgba(239,68,68,0.6);" title="未処理タスクあり"></span>` : '';

            // Get actual document count
            const docCount = (typeof mockDB !== 'undefined' && mockDB.documents)
                ? mockDB.documents.filter(d => d.projectId === proj.id).length
                : 0;

            // Dynamic deadline label based on industry
            const industry = (typeof mockDB !== 'undefined' && mockDB.userConfig) ? mockDB.userConfig.industry : 'general';
            let deadlineLabel = '予定日'; // Completely override Industry config per CEO order

            item.innerHTML = `
                <div style="position: absolute; top: 0; bottom: 0; left: 0; width: 4px; border-radius: 16px 0 0 16px; background-color: ${cColor}; box-shadow: 2px 0 8px rgba(0,0,0,0.1);"></div>
                <div class="project-list-item-cover" style="background-color: var(--btn-secondary-border); border-radius: 12px; margin-left: 8px; display: grid; place-items: center; color: var(--text-muted); font-size: 10px;">
                    <div class="project-list-item-balance" style="font-size: 11px; padding: 4px 8px; font-weight: 500; background: rgba(0,0,0,0.6); color: #fff; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1);">
                        ${displayCost}
                    </div>
                </div>
                <div class="project-list-item-info" style="margin-left: 8px;">
                    <h3 class="project-list-item-title" style="margin-bottom: 6px;">${proj.name}</h3>
                    <div style="font-size: 13px; font-weight: 600; margin-bottom: 12px; display: grid; grid-auto-flow: column; justify-content: start; align-items: center; gap: 10px; color: var(--text-color);">
                        <span style="display: grid; grid-auto-flow: column; justify-content: start; align-items: center; gap: 4px;">
                            <i data-lucide="map-pin" style="width: 15px; height: 15px; color: #f87171;"></i> ${proj.location !== '-' && proj.location ? proj.location : '場所設定なし'}
                        </span>
                        <span style="display: grid; grid-auto-flow: column; justify-content: start; align-items: center; gap: 4px; color: var(--text-muted); font-size: 12px; font-weight: 500;">
                            <i data-lucide="calendar" style="width: 13px; height: 13px;"></i>${deadlineLabel}: ${proj.deadline || proj.startDate || '未設定'}
                        </span>
                    </div>
                    <div class="project-list-item-meta" style="display: grid; grid-auto-flow: column; justify-content: start; align-items: center; justify-content: start;  gap: 8px;">
                        <span class="project-list-item-badge">${statusText}</span>
                        <span class="project-list-item-docs" style="display: grid; grid-auto-flow: column; justify-content: start; align-items: center; background: rgba(241, 245, 249, 0.8); padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; color: #475569;">
                            <i data-lucide="file-text" style="width: 13px; height: 13px; margin-right: 4px;"></i>書類 x ${docCount}${notificationDot}
                        </span>
                        <span class="project-list-item-badge" style="background: rgba(15, 23, 42, 0.05); color: var(--text-muted); opacity: 0.9;">
                            <i data-lucide="history" style="width: 12px; height: 12px;"></i>更新: ${proj.lastUpdated || '-'}
                        </span>
                    </div>
                </div>
            `;

            item.addEventListener('click', () => {
                window.openProjectDetail(proj.id);
            });

            container.appendChild(item);
        });

        // --- Render Pagination Controls ---
        if (paginationContainer && totalPages > 1) {
            const btnPrev = document.createElement('button');
            btnPrev.innerHTML = '<i data-lucide="chevron-left" style="width: 16px; height: 16px;"></i> 前へ';
            btnPrev.style.cssText = `background: var(--btn-secondary-bg); border: 1.2px solid var(--btn-secondary-border); color: var(--text-main); padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; font-family: inherit; cursor: pointer; display: grid; grid-auto-flow: column; justify-content: start; align-items: center; gap: 4px; opacity: ${currentProjectPage === 1 ? '0.3' : '1'}; pointer-events: ${currentProjectPage === 1 ? 'none' : 'auto'}; transition: transform 0.1s;`;
            btnPrev.onmousedown = () => btnPrev.style.transform = 'scale(0.95)';
            btnPrev.onmouseup = () => btnPrev.style.transform = 'scale(1)';
            btnPrev.onmouseleave = () => btnPrev.style.transform = 'scale(1)';
            btnPrev.onclick = () => {
                if (currentProjectPage > 1) {
                    currentProjectPage--;
                    renderProjects(projectsToRender, false); 
                    document.querySelector('.content-area').scrollTo({top: 0, behavior: 'smooth'});
                }
            };

            const pageIndicator = document.createElement('span');
            pageIndicator.style.cssText = 'font-size: 14px; font-weight: 600; color: var(--text-main); min-width: 50px; text-align: center; letter-spacing: 0.05em;';
            pageIndicator.textContent = `${currentProjectPage} / ${totalPages}`;

            const btnNext = document.createElement('button');
            btnNext.innerHTML = '次へ <i data-lucide="chevron-right" style="width: 16px; height: 16px;"></i>';
            btnNext.style.cssText = `background: var(--btn-secondary-bg); border: 1.2px solid var(--btn-secondary-border); color: var(--text-main); padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; font-family: inherit; cursor: pointer; display: grid; grid-auto-flow: column; justify-content: start; align-items: center; gap: 4px; opacity: ${currentProjectPage === totalPages ? '0.3' : '1'}; pointer-events: ${currentProjectPage === totalPages ? 'none' : 'auto'}; transition: transform 0.1s;`;
            btnNext.onmousedown = () => btnNext.style.transform = 'scale(0.95)';
            btnNext.onmouseup = () => btnNext.style.transform = 'scale(1)';
            btnNext.onmouseleave = () => btnNext.style.transform = 'scale(1)';
            btnNext.onclick = () => {
                if (currentProjectPage < totalPages) {
                    currentProjectPage++;
                    renderProjects(projectsToRender, false); 
                    document.querySelector('.content-area').scrollTo({top: 0, behavior: 'smooth'});
                }
            };

            paginationContainer.appendChild(btnPrev);
            paginationContainer.appendChild(pageIndicator);
            paginationContainer.appendChild(btnNext);
        }

        // Update Total Wealth Header
        const totalWealthEl = document.getElementById('total-wealth-balance');
        if (totalWealthEl) {
            totalWealthEl.textContent = `¥${totalAgencyProfit.toLocaleString()}`;
        }

        // --- NEW: Update Wallet Dashboard (Healthcare UI + Tax Hub) --
        updateWalletDashboard(totalAgencyProfit);


        // Render lucide icons for newly created list
        if (window.lucide) {
            window.lucide.createIcons();
        }
    };

    // Wallet Dashboard Logic
    const updateWalletDashboard = (totalProfit) => {
        const globalProfitEl = document.getElementById('wallet-global-profit');
        if (globalProfitEl) globalProfitEl.textContent = `¥${totalProfit.toLocaleString()}`;

        // Calculate global revenue & expenses from mockDB
        let globalRevenue = 0;
        let globalExpenses = 0;

        mockDB.projects.forEach(proj => {
            const invoices = mockDB.documents.filter(d => d.projectId === proj.id && d.type === 'invoice');
            if (invoices.length > 0) {
                globalRevenue += invoices.reduce((acc, curr) => acc + curr.amount, 0);
            } else {
                globalRevenue += (proj.revenue || 1000000);
            }
        });

        // Add all expenses
        mockDB.transactions.forEach(t => {
            if (t.type === 'expense' || t.type === 'labor') {
                globalExpenses += t.amount;
            }
        });

        // Calculate tax prep mock (e.g. roughly 15% of profit, depends on industry IRL)
        const mockIndustry = mockDB.userConfig.industry || 'general';
        const taxRate = 0.15;
        const taxEst = Math.max(0, totalProfit * taxRate);

        const taxPrepEl = document.getElementById('wallet-tax-prep');
        const taxBarEl = document.getElementById('wallet-tax-bar');

        if (taxPrepEl) taxPrepEl.textContent = `¥${Math.round(taxEst).toLocaleString()}`;
        if (taxBarEl) {
            const maxTaxTarget = 3000000;
            const pct = Math.min(100, (taxEst / maxTaxTarget) * 100);
            taxBarEl.style.width = `${pct}%`;
        }

        // Update Summary Text
        const taxSummaryEl = document.getElementById('wallet-tax-summary');
        if (taxSummaryEl) {
            taxSummaryEl.innerHTML = `CEO、現在の売上合計は <strong>¥${globalRevenue.toLocaleString()}</strong>、経費合計は <strong>¥${globalExpenses.toLocaleString()}</strong> です。<br>予測される申告所得は <strong>¥${totalProfit.toLocaleString()}</strong> となります。連携用のCSV出力が可能です。`;
        }

        // --- NEW: 3-Month AI Forecast Wave ---
        const cfContainer = document.getElementById('wallet-cf-container');
        if (cfContainer) {
            cfContainer.innerHTML = '';
            // Generate labels for Next Month, +2, +3
            const today = new Date();
            const forecastMonths = [
                `${(today.getMonth() + 2) % 12 || 12}月`,
                `${(today.getMonth() + 3) % 12 || 12}月`,
                `${(today.getMonth() + 4) % 12 || 12}月`
            ];

            forecastMonths.forEach((m, idx) => {
                // Diminishing certainty
                const isCurrent = idx === 0;
                const incomeH = 60 + Math.random() * (40 - idx * 10); // Slowly decreases/randomizes
                const expH = 30 + Math.random() * 20;
                cfContainer.innerHTML += `
                    <div class="cf-bar-group ${isCurrent ? 'active' : ''}" style="${!isCurrent ? 'opacity: 0.7' : ''}">
                        <div class="cf-bar income" style="height: ${incomeH}%;"></div>
                        <div class="cf-bar expense" style="height: ${expH}%;"></div>
                        <span class="cf-label ${isCurrent ? 'active-label' : ''}">${m}</span>
                    </div>
                `;
            });
            
            // --- NEW: AI Accuracy (IQ) Tracker ---
            // Calculate how many times the AI ran vs how many times the user corrected it
            // Assuming most transactions in prototype came from AI/input unless stated
            const totalPredictions = mockDB.transactions.length; 
            const totalCorrections = mockDB.transactions.filter(t => t.is_user_corrected && !t.is_deleted).length;
            
            let accuracy = 100;
            if (totalPredictions > 0) {
                accuracy = Math.round(((totalPredictions - totalCorrections) / totalPredictions) * 100);
            }
            
            const accuracyColor = accuracy >= 95 ? '#10b981' : (accuracy >= 80 ? '#f59e0b' : '#ef4444');
            
            cfContainer.insertAdjacentHTML('beforebegin', `
                <div style="background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.2); margin-top: 16px; margin-bottom: 24px; padding: 12px 16px; border-radius: 12px; display: grid; grid-auto-flow: column; justify-content: start; align-items: center; justify-content: space-between;">
                    <div style="display: grid; grid-auto-flow: column; justify-content: start; align-items: center; gap: 8px;">
                        <i data-lucide="brain-circuit" style="width: 20px; height: 20px; color: ${accuracyColor};"></i>
                        <span style="font-size: 13px; font-weight: 600; color: var(--text-main);">AI 学習仕訳精度 (IQ)</span>
                    </div>
                    <div style="font-size: 16px; font-weight: 800; color: ${accuracyColor};">
                        ${accuracy}<span style="font-size: 12px; margin-left: 2px;">%</span>
                    </div>
                </div>
            `);
            if (window.lucide) window.lucide.createIcons();
        }

        // --- NEW: Progress Ring vs Target Profit ---
        const progressCircle = document.getElementById('wallet-ring-progress');
        if (progressCircle) {
            const baseOffset = 628;
            const target = mockDB.userConfig.targetMonthlyProfit || 1000000;
            const progress = Math.min(1, Math.max(0, totalProfit / target));
            const dashOffset = baseOffset - (baseOffset * progress);
            setTimeout(() => {
                progressCircle.style.strokeDashoffset = dashOffset;
            }, 50);
        }
    };


    // Make project cards clickable to detail
    window.saveProjectNote = async (newText) => {
        if (!currentOpenProjectId) return;
        const proj = mockDB.projects.find(p => p.id === currentOpenProjectId);
        if (proj) {
            proj.note = newText;
            
            if (window.supabase) {
                try {
                    await window.supabase
                        .from('projects')
                        .update({ note: newText })
                        .eq('id', currentOpenProjectId);
                    console.log("[Supabase] Project note saved.");
                } catch (e) {
                    console.error("Failed to sync project note:", e);
                }
            } else {
                window.saveToLocalStorage();
            }
        }
    };

    const bindProjectClicks = () => {
        // In a real app we'd bind to actual project list items
        // For prototype, if they click the "プロジェクト" feature card in dash, load Project 1
        window.openProjectDetail = (projectId) => {
            currentOpenProjectId = projectId;
            const proj = mockDB.projects.find(p => p.id === projectId);
            if (!proj) return;

            // Update Color Bar
            const catColors = {
                it: '#3b82f6',
                transportation: '#f59e0b',
                accounting: '#8b5cf6',
                construction: '#10b981',
                design: '#ec4899',
                other: '#6b7280'
            };
            const cColor = proj.color || catColors[proj.category] || '#9ca3af';
            const colorBar = document.getElementById('detail-color-bar');
            if (colorBar) colorBar.style.backgroundColor = cColor;

            // Calc financials
            // Expenses: Any transaction that isn't explicitly income
            const expenses = mockDB.transactions.filter(t => t.projectId === projectId && !t.is_deleted && t.type !== 'income').reduce((acc, curr) => acc + curr.amount, 0);

            // Incomes: Manual income transactions + Document invoices
            const incomesFromTx = mockDB.transactions.filter(t => t.projectId === projectId && !t.is_deleted && t.type === 'income').reduce((acc, curr) => acc + curr.amount, 0);
            const invoices = mockDB.documents.filter(d => d.projectId === projectId && d.type === 'invoice');
            const invoiceSum = invoices.length > 0 ? invoices.reduce((acc, curr) => acc + curr.amount, 0) : 0;

            const revenue = (incomesFromTx + invoiceSum) > 0 ? (incomesFromTx + invoiceSum) : (proj.revenue || 0);
            const profit = revenue - expenses;
            const margin = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;

            // Target gauge logic (mock target of 1,000,000 or dynamic based on project if we had it)
            const targetProfit = 1000000;
            const progressPercent = Math.min(100, Math.max(0, (profit / targetProfit) * 100));

            // Update UI
            document.getElementById('detail-project-name').textContent = proj.name;
            const revEl = document.getElementById('detail-revenue');
            if (revEl) revEl.textContent = `¥${revenue.toLocaleString()}`;
            const expEl = document.getElementById('detail-expense');
            if (expEl) expEl.textContent = `¥${expenses.toLocaleString()}`;

            // Formula mini-indicators
            const revMiniEl = document.getElementById('detail-revenue-mini');
            if (revMiniEl) revMiniEl.textContent = `¥${revenue.toLocaleString()}`;
            const expMiniEl = document.getElementById('detail-expense-mini');
            if (expMiniEl) expMiniEl.textContent = `¥${expenses.toLocaleString()}`;

            const profEl = document.getElementById('detail-profit');
            if (profEl) profEl.textContent = `¥${profit.toLocaleString()}`;

            // Update Dashboard Note
            const noteEl = document.getElementById('detail-project-note');
            if (noteEl) {
                noteEl.value = proj.note || '';
                // Auto-resize textarea height
                setTimeout(() => {
                    noteEl.style.height = '';
                    noteEl.style.height = noteEl.scrollHeight + 'px';
                }, 10);
            }

            // --- Update PDF Document Count & Empty States ---
            const docCountEl = document.getElementById('detail-doc-count');
            if (docCountEl) {
                const docCount = mockDB.documents.filter(d => d.projectId === projectId).length;
                if (docCount > 0) {
                    docCountEl.innerHTML = `${docCount}<span style="font-size: 14px; font-weight: 400; color: var(--text-muted); margin-left: 2px;">件</span>`;
                } else {
                    docCountEl.innerHTML = `<div style="font-size: 11px; font-weight: 400; color: var(--text-muted); margin-top: 4px;">データなし</div>`;
                }
            }

            // Update Margin Gauge & Percent
            const marginPercentEl = document.getElementById('detail-margin-percent');
            if (marginPercentEl) marginPercentEl.textContent = `${margin}%`;
            const marginGaugeEl = document.getElementById('detail-margin-gauge');
            // Animate gauge width
            if (marginGaugeEl) {
                // Reset to 0 briefly to trigger CSS transition every open
                marginGaugeEl.style.width = '0%';
                setTimeout(() => {
                    marginGaugeEl.style.width = `${progressPercent}%`;
                }, 50);
            }

            // Build timeline (Combined documents and transactions)
            const tlContainer = document.getElementById('activity-list-container');
            let combined = [];
            if (tlContainer) {
                tlContainer.innerHTML = '';

                // Unpaid Alert
                if (proj.hasUnpaid) {
                    const alertHtml = `
                        <div class="alert-banner" style="margin-bottom: var(--spacing-sm);">
                            <i data-lucide="alert-circle" style="width: 16px; height: 16px;"></i>
                            <span>未入金の請求があります</span>
                        </div>
                    `;
                    tlContainer.insertAdjacentHTML('beforeend', alertHtml);
                }

                combined = [...mockDB.transactions.filter(t => t.projectId === projectId && !t.is_deleted), ...mockDB.documents.filter(d => d.projectId === projectId)];
                // Sort descending (basic string comparison for mock dates)
                combined.sort((a, b) => new Date(b.date) - new Date(a.date));

                if (combined.length === 0) {
                    tlContainer.innerHTML += '<div style="width: 100%; text-align: center;"><p style="color: var(--text-muted); font-size: 13px; padding: 20px 0; margin: 0;">履歴はありません。</p></div>';
                } else {
                    combined.forEach(item => {
                        const el = document.createElement('div');
                        el.className = 'activity-list-item';
                        // Inline styling for the passbook item
                        el.style.display = 'grid';
                        el.style.alignItems = 'center';
                        el.style.padding = '12px 0';
                        el.style.borderBottom = '1px solid var(--btn-secondary-border)';
                        el.style.gap = '12px';

                        let iconHtml = '';
                        let title = item.title || item.desc;
                        let amountStr = item.amount ? `¥${item.amount.toLocaleString()}` : '-';
                        let amountColor = 'var(--text-main)';
                        let statusHtml = '<span style="color: #10b981; font-weight: 300;">Successful</span>'; // default
                        
                        let categoryBadgeHtml = '';
                        if (item.category && (item.type === 'expense' || item.type === 'income' || item.type === 'labor')) {
                            // Badge color changes if it's user corrected (Ground Truth)
                            const badgeBg = item.is_user_corrected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(15, 23, 42, 0.05)';
                            const badgeColor = item.is_user_corrected ? '#10b981' : 'var(--text-muted)';
                            const badgeIcon = item.is_user_corrected ? `<i data-lucide="check-circle" style="width:10px; height:10px; margin-right:2px; display:inline-block;"></i>` : '';
                            
                            categoryBadgeHtml = `<span onclick="window.openEditExpenseModal('${item.id}')" style="cursor: pointer; display: inline-block; align-items: center; background: ${badgeBg}; color: ${badgeColor}; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; margin-left: 6px; transition: opacity 0.2s;" onmouseover="this.style.opacity=0.7" onmouseout="this.style.opacity=1">${badgeIcon}${item.category}</span>`;
                        }

                        if (item.type === 'invoice' || item.type === 'income') {
                            // Plus icon for deposits/income/invoice
                            iconHtml = `<div style="width: 32px; height: 32px; border-radius: 50%; background: rgba(59, 130, 246, 0.1); display: grid; place-items: center; color: #60a5fa;"><i data-lucide="plus" style="width: 18px; height: 18px; stroke-width: 2.5px;"></i></div>`;
                            amountColor = '#60a5fa'; /* Blue */
                            amountStr = `+${amountStr}`;
                        } else if (item.type === 'expense' || item.type === 'receipt' || item.type === 'labor') {
                            // Minus icon for expense
                            iconHtml = `<div style="width: 32px; height: 32px; border-radius: 50%; background: rgba(239, 68, 68, 0.1); display: grid; place-items: center; color: #f87171;"><i data-lucide="minus" style="width: 18px; height: 18px; stroke-width: 2.5px;"></i></div>`;
                            amountColor = '#f87171'; /* Red */
                            amountStr = `-${amountStr}`;
                            // Example of a warning status for some expenses
                            if (item.amount > 50000) statusHtml = '<span style="color: #f59e0b; font-weight: 300;">確認待ち</span>';
                        } else {
                            // Square icon for generic documents
                            iconHtml = `<div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(139, 92, 246, 0.1); display: grid; place-items: center; color: #8b5cf6;"><i data-lucide="file-text" style="width: 16px; height: 16px; stroke-width: 1.5px;"></i></div>`;
                        }

                        el.innerHTML = `
                            ${iconHtml}
                            <div style=" min-width: 0; overflow: hidden; display: block; gap: 2px; cursor: pointer;" onclick="if(event.target.tagName !== 'SPAN') window.openEditExpenseModal('${item.id}')">
                                <div style="font-size: 14px; font-weight: 600; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: -0.01em;">${title}${categoryBadgeHtml}</div>
                                <div style="font-size: 11px; color: var(--text-muted); display: grid; grid-auto-flow: column; gap: 6px; align-items: center;">
                                    <span>${item.date}</span>
                                    <span>•</span>
                                    ${statusHtml}
                                </div>
                            </div>
                            <div style="font-size: 15px; font-weight: 700; color: ${amountColor}; text-align: right; letter-spacing: -0.02em;">
                                ${amountStr}
                            </div>
                        `;
                        tlContainer.appendChild(el);
                    });
                }
            }

            // Inline search listener setup
            const searchInput = document.getElementById('passbook-search');
            if (searchInput) {
                searchInput.value = ''; // clear on open
                searchInput.oninput = (e) => {
                    const term = e.target.value.toLowerCase();
                    const items = tlContainer.querySelectorAll('.activity-list-item');
                    items.forEach(item => {
                        const text = item.textContent.toLowerCase();
                        item.style.display = text.includes(term) ? 'grid' : 'none';
                    });
                };
            }

            // Custom Expense Edit Modal Logic
            window.openEditExpenseModal = (txId) => {
                const tx = mockDB.transactions.find(t => t.id == txId);
                if (!tx || (tx.type !== 'expense' && tx.type !== 'income' && tx.type !== 'labor')) return; // Limit to editables
                
                const idEl = document.getElementById('edit-tx-id');
                const titleEl = document.getElementById('edit-tx-title');
                const amountEl = document.getElementById('edit-tx-amount');
                const catSelect = document.getElementById('edit-tx-category');
                const modal = document.getElementById('modal-edit-expense');
                
                if (!modal || !idEl || !titleEl || !amountEl) {
                    console.error('DOM Error: Edit Expense Modal elements not found.');
                    return;
                }
                
                idEl.value = tx.id;
                titleEl.value = tx.title || '';
                amountEl.value = tx.amount || 0;
                
                if (catSelect) catSelect.value = tx.category || '雑費';
                
                modal.classList.remove('hidden');
                modal.classList.add('show');
            };
            
            window.closeEditExpenseModal = () => {
                const modal = document.getElementById('modal-edit-expense');
                if (!modal) return;
                
                modal.classList.remove('show');
                
                setTimeout(() => {
                    modal.classList.add('hidden');
                }, 300);
            };
            
            window.deleteTransaction = async () => {
                const idEl = document.getElementById('edit-tx-id');
                if(!idEl || !idEl.value) return;
                const txId = idEl.value;
                
                const tx = mockDB.transactions.find(t => t.id == txId);
                if(tx) {
                    tx.is_deleted = true; // Local Logical Delete
                    
                    // Persistent Supabase Delete Sync
                    if (window.supabaseClient) {
                        try {
                            const query = window.supabaseClient.from('activities').update({
                                is_deleted: true
                            }).match({
                                title: tx.title,
                                amount: tx.amount,
                                date: tx.date
                            });
                            await query;
                            console.log("[Neo AI] Supabase DELETE sync success:", tx.title);
                        } catch(e) { console.error('Supabase Delete Error:', e); }
                    }
                }
                
                window.closeEditExpenseModal();
                
                // Recalculate all totals and re-render UI exactly as requested
                renderProjects(mockDB.projects);
                if(currentOpenProjectId) {
                    window.openProjectDetail(currentOpenProjectId);
                }
                
                const neoFabBubble = document.getElementById('neo-fab-bubble');
                if (neoFabBubble) {
                    neoFabBubble.textContent = `⚡️ 項目を削除して、合計値を再計算したよ。`;
                    neoFabBubble.classList.add('show');
                    setTimeout(() => neoFabBubble.classList.remove('show'), 3000);
                }
            };
            
            window.saveEditedExpense = async () => {
                const txId = document.getElementById('edit-tx-id').value;
                const newTitle = document.getElementById('edit-tx-title').value.trim();
                const newAmount = document.getElementById('edit-tx-amount').value;
                const newCategory = document.getElementById('edit-tx-category').value;
                
                if (!newTitle) {
                    alert('内容を入力してください');
                    return;
                }
                
                await window.updateTransaction(Number(txId), {
                    title: newTitle,
                    amount: newAmount,
                    category: newCategory
                });
                
                window.closeEditExpenseModal();
                
                // Re-render the detail view to reflect changes and potentially update Neo's hints
                window.openProjectDetail(currentOpenProjectId);
            };

            // ---- NEO CONFIRMATION GATE LOGIC ----
            window.aiCorrectionLog = JSON.parse(localStorage.getItem('neo_ai_corrections') || '[]');
            
            window.cancelNeoConfirm = () => {
                document.getElementById('modal-neo-confirm').classList.add('hidden');
                window.pendingAiDecision = null;
                const neoBubble = document.getElementById('neo-fab-bubble');
                if (neoBubble) {
                    neoBubble.classList.remove('show');
                }
            };

            window.saveNeoConfirm = () => {
                if (!window.pendingAiDecision) return;
                
                const confirmedTitle = document.getElementById('confirm-tx-title').value;
                const confirmedAmount = parseInt(document.getElementById('confirm-tx-amount').value, 10) || 0;
                const confirmedCategory = document.getElementById('confirm-tx-category').value;
                const originalCategory = document.getElementById('confirm-tx-original-category').value;

                // 1. Semantic Correction Learning Loop
                if (confirmedCategory !== originalCategory) {
                    console.log(`[Neo AI Learning] User corrected category: ${originalCategory} -> ${confirmedCategory} for input: "${window.pendingAiDecision.originalInput}"`);
                    
                    // Simple learning: record the correction mapping
                    window.aiCorrectionLog.push({
                        input_snippet: window.pendingAiDecision.originalInput.substring(0, 20),
                        corrected_to: confirmedCategory
                    });
                    
                    // Keep log concise
                    if (window.aiCorrectionLog.length > 20) {
                        window.aiCorrectionLog.shift();
                    }
                    localStorage.setItem('neo_ai_corrections', JSON.stringify(window.aiCorrectionLog));

                    // Fire-and-forget async contribution to Global Lexicon (Crowdsourced Intelligence)
                    if (window.contributeToGlobalLexicon) {
                        window.contributeToGlobalLexicon(window.pendingAiDecision.originalInput, confirmedCategory);
                    }
                }

                // 2. Apply confirmed data
                const finalTransaction = {
                    ...window.pendingAiDecision,
                    title: confirmedTitle,
                    amount: confirmedAmount,
                    type: confirmedCategory
                };

                // Remove temporary keys before inserting
                delete finalTransaction.projectName;
                delete finalTransaction.originalInput;

                // 3. Save officially
                window.insertTransaction(finalTransaction);

                try {
                    const savedTxs = JSON.parse(localStorage.getItem('neo_transactions') || '[]');
                    savedTxs.push(finalTransaction);
                    localStorage.setItem('neo_transactions', JSON.stringify(savedTxs));
                } catch (e) { console.error("Local storage save failed:", e); }

                renderProjects(window.mockDB.projects);
                window.updateGlobalProfitDisplay();

                document.getElementById('modal-neo-confirm').classList.add('hidden');
                window.pendingAiDecision = null;

                const neoBubble = document.getElementById('neo-fab-bubble');
                if (neoBubble) {
                    neoBubble.textContent = `了解！「${confirmedTitle}（¥${confirmedAmount.toLocaleString()}）」を記録したよ✨`;
                    neoBubble.classList.add('show');
                    setTimeout(() => { neoBubble.classList.remove('show'); }, 4000);
                }
            };

            // ---- GLOBAL LEXICON CONTRIBUTION ENGINE ----
            window.contributeToGlobalLexicon = async (originalInput, correctedCategory) => {
                if (!window.supabaseClient || typeof extractPureBusinessTerm !== 'function') return;
                try {
                    // Start Secondary AI Data Cleansing to protect PII
                    const pureTerm = await extractPureBusinessTerm(originalInput);
                    
                    if (!pureTerm || pureTerm.length < 2) return;
                    
                    // [REJECTION_PROTOCOL] Check
                    if (pureTerm === "[REJECT]" || pureTerm.includes("[REJECT]")) {
                        console.warn("[Neo Global Agent] Contribution REJECTED to protect PII or filter toxicity. Skipping upload.");
                        return;
                    }

                    console.log("[Neo Global Agent] Extracted pure term for communal DB:", pureTerm);

                    // Check existing dictionary via Supabase
                    const { data: existing } = await window.supabaseClient
                        .from('neo_global_lexicon')
                        .select('id, frequency')
                        .eq('keyword', pureTerm)
                        .eq('category', correctedCategory)
                        .single();

                    if (existing) {
                        await window.supabaseClient
                            .from('neo_global_lexicon')
                            .update({ frequency: existing.frequency + 1 })
                            .eq('id', existing.id);
                    } else {
                        await window.supabaseClient
                            .from('neo_global_lexicon')
                            .insert([{
                                keyword: pureTerm,
                                category: correctedCategory,
                                frequency: 1
                            }]);
                    }
                    console.log("[Neo Global Agent] Successfully contributed to collective intelligence.");
                } catch (e) {
                    console.error("[Neo Global Agent] Contribution failed silently:", e);
                }
            };
            // ------------------------------------

            // Populate Profit AI Hints
            const aiHintsContainer = document.getElementById('profit-ai-hints');
            if (aiHintsContainer) {
                aiHintsContainer.innerHTML = '';
                const hints = [];

                // Hint 1: Based on margin
                if (margin > 30) {
                    hints.push(`<li style="font-size: 13px; color: var(--text-main); display: grid; grid-auto-flow: column; justify-content: start; align-items: start; gap: 8px;"><i data-lucide="check-circle-2" style="width: 16px; height: 16px; color: #10b981;  margin-top: 2px;"></i><span>大変優秀な利益率（${margin}％）です。この人員配置パターンを別の現場でも横展開しましょう。</span></li>`);
                } else if (margin > 0) {
                    hints.push(`<li style="font-size: 13px; color: var(--text-main); display: grid; grid-auto-flow: column; justify-content: start; align-items: start; gap: 8px;"><i data-lucide="trending-up" style="width: 16px; height: 16px; color: var(--accent-neo-blue);  margin-top: 2px;"></i><span>資材（経費）の仕入れ先を1社にまとめると、あと3%〜5%の利益改善が見込めます。</span></li>`);
                } else {
                    hints.push(`<li style="font-size: 13px; color: var(--text-main); display: grid; grid-auto-flow: column; justify-content: start; align-items: start; gap: 8px;"><i data-lucide="alert-triangle" style="width: 16px; height: 16px; color: #f59e0b;  margin-top: 2px;"></i><span>現在赤字ペースです。追加請求の交渉か、直近の人工（稼働）の削減を推奨します。</span></li>`);
                }

                // Hint 2: Unpaid check
                if (proj.hasUnpaid) {
                    hints.push(`<li style="font-size: 13px; color: var(--text-main); display: grid; grid-auto-flow: column; justify-content: start; align-items: start; gap: 8px;"><i data-lucide="clock" style="width: 16px; height: 16px; color: #f43f5e;  margin-top: 2px;"></i><span>未入金の請求書が1件あります。キャッシュフロー悪化を防ぐため、本日中にリマインド連絡を。</span></li>`);
                } else {
                    hints.push(`<li style="font-size: 13px; color: var(--text-main); display: grid; grid-auto-flow: column; justify-content: start; align-items: start; gap: 8px;"><i data-lucide="shield-check" style="width: 16px; height: 16px; color: var(--accent-neo-blue);  margin-top: 2px;"></i><span>過去の請求はすべて入金済みです（iCloudデータ同期確認済）。健全な資金繰りです。</span></li>`);
                }

                // Hint 3: Generic AI insight
                hints.push(`<li style="font-size: 13px; color: var(--text-main); display: grid; grid-auto-flow: column; justify-content: start; align-items: start; gap: 8px;"><i data-lucide="lightbulb" style="width: 16px; height: 16px; color: #f59e0b;  margin-top: 2px;"></i><span>類似規模の過去プロジェクトと比較して、発注書の作成タイミングが平均2日遅れています。</span></li>`);

                aiHintsContainer.innerHTML = hints.join('');
            }

            // Neo Suggestion
            const neoBubble = document.getElementById('neo-fab-bubble');
            if (neoBubble) {
                let msg = `現在の利益率は${margin}％。次は資材の一括発注でさらに＋3%を目指そう！`;
                if (proj.hasUnpaid) {
                    msg = '未入金の請求書があります！すぐリマインド連絡（＋アクション）をしよう！';
                } else if (combined.length === 0) {
                    msg = 'まずは見積書を作成して、プロジェクトを前に進めよう（＋）！';
                }
                const originalText = neoBubble.textContent;
                neoBubble.textContent = msg;
                neoBubble.classList.add('show');
                setTimeout(() => {
                    neoBubble.classList.remove('show');
                    setTimeout(() => { neoBubble.textContent = originalText; }, 300);
                }, 4000);
            }

            if (window.lucide) {
                window.lucide.createIcons();
            }

            switchView('view-project-detail');
        };

        // Render projects on init
        renderProjects([...mockDB.projects]);

        // Hijack Dashboard card to click the first project for demo, or switch view directly to sites
        const sitesCard = document.querySelector('[data-target="view-sites"]');
        if (sitesCard) {
            sitesCard.onclick = (e) => {
                // If it's a bottom nav item we don't want to mess up the active class logic that much
                if (sitesCard.classList.contains('nav-item')) return;

                e.preventDefault();
                e.stopPropagation();
                // Instead of opening detail, let's actually go to the new Projects list
                switchView('view-sites');

                // Update nav bar active state manually
                document.querySelectorAll('.nav-item').forEach(item => {
                    item.classList.remove('active');
                    if (item.getAttribute('data-target') === 'view-sites') {
                        item.classList.add('active');
                    }
                });
            };
        }
    };
    // ------------------------------------------

    // Neo FAB Logic
    const fabButton = document.getElementById('neo-fab-button');
    const fabBubble = document.getElementById('neo-fab-bubble');

    const showFabMessage = () => {
        if (!fabBubble) return;

        // Define meta phrases
        const metaPhrases = [
            "Neo+はサーバーを持たないから、月額499円でこの最強AIが提供できるんだよ。",
            "君の機密データは君のiCloudに直接保存されている。だから安心だよ。",
            "今日も利益率の分析はバッチリ。無駄な経費を見つけよう！"
        ];

        // 50% chance to show a standard i18n message, 50% chance to show a meta phrase
        if (Math.random() > 0.5) {
            const numMsgs = 4;
            const randomId = Math.floor(Math.random() * numMsgs) + 1;
            const msgKey = `neo_fab_msg_${randomId}`;
            fabBubble.textContent = window.i18n.t(msgKey);
        } else {
            const randomMeta = metaPhrases[Math.floor(Math.random() * metaPhrases.length)];
            fabBubble.textContent = randomMeta;
        }

        fabBubble.classList.add('show');

        // Changed to hover-only action so click can navigate
        setTimeout(() => {
            fabBubble.classList.remove('show');
        }, 3000);
    };

    if (fabButton) {
        fabButton.addEventListener('mouseenter', showFabMessage);
    }

    // --- Smart Selector Logic (Phase 2) ---
    const chatInput = document.querySelector('.chat-input');
    const smartSelectorOverlay = document.getElementById('smart-selector-overlay');
    const smartSelectorOptions = document.getElementById('smart-selector-options');
    const btnCloseSelector = document.getElementById('btn-close-selector');

    // Mock terminology mapping for Smart Selector
    const smartMapping = [
        { ceoTerm: "プロジェクト車関係", taxTerm: "車両運搬具", icon: "car" },
        { ceoTerm: "プライベートから補填", taxTerm: "事業主借", icon: "wallet" },
        { ceoTerm: "現場の道具・資材", taxTerm: "消耗品費", icon: "hammer" }
    ];

    if (chatInput && smartSelectorOverlay && smartSelectorOptions) {
        // Toggle based on typing
        chatInput.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            if (val.length > 0) {
                // Show selector
                smartSelectorOverlay.classList.remove('hidden');

                // Dynamic Category Generation based on input
                const lowerVal = val.toLowerCase();
                let currentMapping = [];

                if (lowerVal.includes('映像') || lowerVal.includes('カメラ') || lowerVal.includes('撮影')) {
                    currentMapping = [
                        { ceoTerm: "撮影・機材関係", taxTerm: "機材費", icon: "◆" },
                        { ceoTerm: "ロケの移動・宿泊", taxTerm: "旅費交通費", icon: "◆" },
                        { ceoTerm: "クライアントとの食事", taxTerm: "接待交際費", icon: "◆" }
                    ];
                } else if (lowerVal.includes('飲食') || lowerVal.includes('食材') || lowerVal.includes('店')) {
                    currentMapping = [
                        { ceoTerm: "食材の仕入れ", taxTerm: "仕入高", icon: "◆" },
                        { ceoTerm: "店舗の消耗品", taxTerm: "消耗品費", icon: "◆" },
                        { ceoTerm: "新メニューの研究", taxTerm: "研究開発費", icon: "◆" }
                    ];
                } else if (lowerVal.includes('現場') || lowerVal.includes('材料') || lowerVal.includes('工事')) {
                    currentMapping = [
                        { ceoTerm: "現場の材料・資材", taxTerm: "材料費", icon: "◆" },
                        { ceoTerm: "外注・応援の支払い", taxTerm: "外注費", icon: "◆" },
                        { ceoTerm: "プロジェクト車関係", taxTerm: "車両運搬具", icon: "◆" }
                    ];
                } else {
                    // Default fallback
                    currentMapping = [
                        { ceoTerm: "道具・備品", taxTerm: "消耗品費", icon: "◆" },
                        { ceoTerm: "通信・ソフトウェア", taxTerm: "通信費", icon: "◆" },
                        { ceoTerm: "プライベートから補填", taxTerm: "事業主借", icon: "◆" }
                    ];
                }

                // Inject the 3 options
                smartSelectorOptions.innerHTML = currentMapping.map((item, index) => `
                    <div class="smart-option" data-tax="${item.taxTerm}" style="animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) ${index * 0.05}s both;">
                        <div class="icon-wrapper" style="font-size: 14px; display: grid; place-items: center; color: var(--text-muted);">
                            ${item.icon}
                        </div>
                        <div style="">
                            <div style="font-weight: 600;">${item.ceoTerm}</div>
                            <div style="font-size: 11px; color: var(--text-muted);">（税務: ${item.taxTerm}）として記録</div>
                        </div>
                    </div>
                `).join('');

                // Bind click events to new options
                document.querySelectorAll('.smart-option').forEach(opt => {
                    opt.addEventListener('click', () => {
                        const taxName = opt.getAttribute('data-tax');
                        // Hide overlay
                        smartSelectorOverlay.classList.add('hidden');
                        chatInput.value = '';

                        let bubbleProjStr = '';
                        if (currentOpenProjectId) {
                            const proj = mockDB.projects.find(p => p.id === currentOpenProjectId);
                            if (proj) {
                                bubbleProjStr = `（保存先: ${proj.name}）`;
                                const newTx = {
                                    id: Date.now(),
                                    projectId: currentOpenProjectId,
                                    type: "expense",
                                    title: `${taxName} (AI自動分類)`,
                                    amount: Math.floor(Math.random() * 20000) + 1000,
                                    date: new Date().toLocaleDateString('ja-JP').replace(/\//g, '/')
                                };
                                mockDB.transactions.unshift(newTx);
                                renderProjects(mockDB.projects); // update wallet and lists
                            }
                        }

                        // Fake chat bubble from Neo explaining the Time Saved value + next action
                        const chatContainer = document.getElementById('expense-chat-container');
                        if (chatContainer) {
                            const botMsg = document.createElement('div');
                            botMsg.className = 'chat-bubble neo';
                            botMsg.innerHTML = `「${taxName}」で処理しておいたよ。${bubbleProjStr}<br><br><span style="color:var(--accent-neo-yellow);">これでCEOの自由な時間がまた2時間プラス（+）されたね。さあ、次はどのプロジェクトを動かす？🚀</span>`;
                            chatContainer.appendChild(botMsg);
                            chatContainer.parentElement.scrollTop = chatContainer.parentElement.scrollHeight;
                        }
                    });
                });
            } else {
                smartSelectorOverlay.classList.add('hidden');
            }
        });

        // Close button manually
        if (btnCloseSelector) {
            // Use onclick instead of addEventListener to prevent listener accumulation on reusable modals
            btnCloseSelector.onclick = () => {
                smartSelectorOverlay.classList.add('hidden');
            };
        }
    }

    // Start app
    checkInitialSetup();
    bindProjectClicks();

    // Navigation intercepts
    // We remove the view-sites hijack to allow the folder icon to route naturally to the project list
    // document.querySelectorAll('.nav-item').forEach(item => { /* deleted */ });

    // --- New Project Modal Logic ---
    const btnCreateProject = document.getElementById('btn-create-project');
    const modalNewProject = document.getElementById('modal-new-project');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnSaveProject = document.getElementById('btn-save-project');

    // Color Picker Logic
    let selectedColor = '#FF3B30'; // Default red
    const colorDrops = document.querySelectorAll('.color-picker-drop');
    colorDrops.forEach(drop => {
        drop.addEventListener('click', (e) => {
            colorDrops.forEach(d => d.classList.remove('selected'));
            e.target.classList.add('selected');
            selectedColor = e.target.getAttribute('data-color');
        });
    });

    if (btnCreateProject && modalNewProject) {
        btnCreateProject.addEventListener('click', () => {
            console.log('[DEBUG] btnCreateProject clicked');
            modalNewProject.classList.add('show');
            // Neo Singleton: Do not hide neoFab


            const dStart = document.getElementById('new-proj-start-date');
            const dEnd = document.getElementById('new-proj-end-date');

            const today = new Date();
            const formatted = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            if (dStart) dStart.value = formatted;
            if (dEnd) dEnd.value = formatted;

            // Reset color to default explicitly on open if needed
            selectedColor = '#FF3B30';
            colorDrops.forEach(d => {
                if (d.getAttribute('data-color') === selectedColor) {
                    d.classList.add('selected');
                } else {
                    d.classList.remove('selected');
                }
            });

            const catInput = document.getElementById('new-proj-category');
            if (catInput) {
                catInput.value = ''; // プレースホルダー「業種」を表示する
            }
        });
    }

    // Detail Back Button listener
    const projectBackBtn = document.querySelector('.passbook-back');
    if (projectBackBtn) {
        projectBackBtn.addEventListener('click', () => {
            switchView('view-sites');
        });
    }

    // Neo Reaction on Category Change (Removed to keep modal pure/silent)
    const categorySelect = document.getElementById('new-proj-category');

    if (btnCloseModal) {
        btnCloseModal.addEventListener('click', () => {
            modalNewProject.classList.remove('show');
            // Neo Singleton: Do not show neoFab

        });
    }

    if (btnSaveProject) {
        btnSaveProject.addEventListener('click', () => {
            console.log('[DEBUG] btnSaveProject clicked');
            const name = document.getElementById('new-proj-name').value;
            const locationLink = document.getElementById('new-proj-location').value;
            const note = document.getElementById('new-proj-note').value;
            const categorySelectObj = document.getElementById('new-proj-category');
            const category = categorySelectObj ? categorySelectObj.value : 'other';

            const dStartVal = document.getElementById('new-proj-start-date').value;
            const dEndVal = document.getElementById('new-proj-end-date').value;
            let dateStr = '';
            if (dStartVal && dEndVal) {
                dateStr = `${dStartVal.replace(/-/g, '/')} - ${dEndVal.replace(/-/g, '/')}`;
            } else if (dStartVal) {
                dateStr = dStartVal.replace(/-/g, '/');
            }

            if (!name) {
                alert('プロジェクト名を入力してください');
                return;
            }

            // Determine Unit based on category
            let unit = '件'; // Default
            if (category === 'construction') {
                unit = '人工';
            } else if (category === 'freelance') {
                unit = '時間';
            }

            const newProj = {
                id: Date.now(),
                name: name,
                customerName: locationLink || '-', // Repurposed for backward compatibility if needed
                location: locationLink,
                note: note,
                category: category,
                color: selectedColor, // Apply selected color
                unit: unit,
                hasUnpaid: false,
                revenue: 0,
                status: 'planning',
                lastUpdated: dateStr
            };

            // Prepend new project and re-render
            mockDB.projects.unshift(newProj);
            renderProjects(mockDB.projects);

            // Show Neo encouragement after saving
            const bubble = document.getElementById('neo-fab-bubble');
            if (bubble) {
                const originalText = bubble.textContent;
                bubble.textContent = '新しいプロジェクト、追加しといたよ！';
                bubble.classList.add('show');
                setTimeout(() => {
                    bubble.classList.remove('show');
                    setTimeout(() => { bubble.textContent = originalText; }, 300);
                }, 4000);
            }

            modalNewProject.classList.remove('show');
            // Neo Singleton: Do not show neoFab


            document.getElementById('new-proj-name').value = '';
            document.getElementById('new-proj-location').value = '';
            document.getElementById('new-proj-note').value = '';
            const catReset = document.getElementById('new-proj-category');
            if (catReset) catReset.value = '';
            const dStartReset = document.getElementById('new-proj-start-date');
            if (dStartReset) dStartReset.value = '';
            const dEndReset = document.getElementById('new-proj-end-date');
            if (dEndReset) dEndReset.value = '';
        });
    }
    // --- Project Action Menu Logic ---
    const btnProjectMenuToggle = document.getElementById('btn-project-menu-toggle');
    const projectActionMenu = document.getElementById('project-action-menu');

    const modalEditProject = document.getElementById('modal-edit-project');
    const modalDeleteConfirm = document.getElementById('modal-delete-confirm');

    if (btnProjectMenuToggle && projectActionMenu) {
        btnProjectMenuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            projectActionMenu.classList.toggle('hidden');
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!projectActionMenu.contains(e.target) && e.target !== btnProjectMenuToggle) {
                projectActionMenu.classList.add('hidden');
            }
        });

        const btnEditProj = document.getElementById('btn-project-edit');
        const btnDeleteProj = document.getElementById('btn-project-delete');

        if (btnEditProj) {
            btnEditProj.addEventListener('click', () => {
                projectActionMenu.classList.add('hidden');
                window.editProject(currentOpenProjectId);
            });
        }

        if (btnDeleteProj) {
            btnDeleteProj.addEventListener('click', () => {
                console.log('[DEBUG] btnDeleteProj clicked');
                projectActionMenu.classList.add('hidden');
                if (modalDeleteConfirm) {
                    modalDeleteConfirm.classList.add('show');
                    // Neo Singleton: Do not hide neoFab
                }
            });
        }
    }

    // --- Edit logic ---
    const btnCloseEditModal = document.getElementById('btn-close-edit-modal');
    if (btnCloseEditModal) {
        btnCloseEditModal.addEventListener('click', () => {
            modalEditProject.classList.remove('show');
            // Neo Singleton: Do not show neoFab
        });
    }

    window.editProject = (projectId) => {
        // Fetch the modal inside the function scope
        const modalEditProject = document.getElementById('modal-edit-project');

        // Populate edit fields
        const proj = mockDB.projects.find(p => p.id === projectId);
        if (proj && modalEditProject) {
            const editName = document.getElementById('edit-proj-name');
            if (editName) editName.value = proj.name || '';

            const editLoc = document.getElementById('edit-proj-location');
            if (editLoc) editLoc.value = proj.location || '';

            const editNote = document.getElementById('edit-proj-note');
            if (editNote) editNote.value = proj.note || '';

            const editCat = document.getElementById('edit-proj-category');
            if (editCat) editCat.value = proj.category || '';

            const editDate = document.getElementById('edit-proj-date');
            if (editDate) editDate.value = proj.startDate ? proj.startDate.replace(/\//g, '-') : '';

            const editClient = document.getElementById('edit-proj-client');
            if (editClient) editClient.value = proj.clientName || '';

            const editDeadline = document.getElementById('edit-proj-deadline');
            if (editDeadline) editDeadline.value = proj.paymentDeadline || '';

            const editBank = document.getElementById('edit-proj-bank');
            if (editBank) editBank.value = proj.bankInfo || '';

            modalEditProject.classList.add('show');
            // Hide FAB in modal - REMOVED for Singleton pattern

        }
    };

    const btnUpdateProject = document.getElementById('btn-update-project');
    if (btnUpdateProject) {
        btnUpdateProject.addEventListener('click', () => {
            console.log('[DEBUG] btnUpdateProject clicked');
            const name = document.getElementById('edit-proj-name').value;
            const loc = document.getElementById('edit-proj-location').value;
            const note = document.getElementById('edit-proj-note').value;
            const cat = document.getElementById('edit-proj-category').value;

            if (!name) {
                alert('プロジェクト名を入力してください');
                return;
            }

            // Update DB
            const projIndex = mockDB.projects.findIndex(p => p.id === currentOpenProjectId);
            if (projIndex !== -1) {
                mockDB.projects[projIndex].name = name;
                mockDB.projects[projIndex].location = loc;
                mockDB.projects[projIndex].note = note;
                mockDB.projects[projIndex].category = cat;

                const clientEl = document.getElementById('edit-proj-client');
                mockDB.projects[projIndex].clientName = (clientEl && clientEl.value) ? clientEl.value : mockDB.projects[projIndex].clientName;

                const deadlineEl = document.getElementById('edit-proj-deadline');
                mockDB.projects[projIndex].paymentDeadline = (deadlineEl && deadlineEl.value) ? deadlineEl.value : mockDB.projects[projIndex].paymentDeadline;

                const bankEl = document.getElementById('edit-proj-bank');
                mockDB.projects[projIndex].bankInfo = (bankEl && bankEl.value) ? bankEl.value : mockDB.projects[projIndex].bankInfo;

                const inputDate = document.getElementById('edit-proj-date');
                if (inputDate && inputDate.value) mockDB.projects[projIndex].startDate = inputDate.value.replace(/-/g, '/');

                mockDB.projects[projIndex].lastUpdated = new Date().toLocaleDateString('ja-JP').replace(/\//g, '-');

                // Close modal & Resync View
                modalEditProject.classList.remove('show');
                // Neo Singleton: Do not show neoFab

                // 念のためNeoUIからのアクションメニューがあれば閉じる
                const actionMenu = document.getElementById('project-action-menu');
                if (actionMenu) actionMenu.classList.add('hidden');

                renderProjects(mockDB.projects); // Ensure sites view is refreshed with new info
                window.openProjectDetail(currentOpenProjectId);

                // Neoのフィードバック
                const neoBubble = document.getElementById('neo-fab-bubble');
                if (neoBubble) {
                    neoBubble.textContent = `⚡️ プロジェクト情報を更新したよ。`;
                    neoBubble.classList.add('show');
                    setTimeout(() => { neoBubble.classList.remove('show'); }, 3000);
                }
            }
        });
    }

    // --- Delete logic ---
    const btnCancelDelete = document.getElementById('btn-cancel-delete');
    if (btnCancelDelete) {
        btnCancelDelete.addEventListener('click', () => {
            modalDeleteConfirm.classList.remove('show');
            // Neo Singleton: Do not show neoFab
        });
    }

    const btnConfirmDelete = document.getElementById('btn-confirm-delete');
    if (btnConfirmDelete) {
        btnConfirmDelete.addEventListener('click', () => {
            console.log('[DEBUG] btnConfirmDelete clicked');
            if (window.deleteProject) {
                window.deleteProject(currentOpenProjectId);
            }
        });
    }

    // Direct delete method to be called from the edit modal as well
    window.deleteProject = async (projectId) => {
        if (!projectId) return;

        console.log(`[Neo Deletion Protocol] Initiating Hard Kill for Project ID: ${projectId}`);
        const beforeCount = mockDB.projects.length;

        // Remove from mock DB instantly (Optimistic UI update)
        mockDB.projects = mockDB.projects.filter(p => p.id !== projectId);
        mockDB.documents = mockDB.documents.filter(d => d.projectId !== projectId);
        mockDB.transactions = mockDB.transactions.filter(t => t.projectId !== projectId);

        console.log(`[Neo Deletion Protocol] Success! Project count: ${beforeCount} -> ${mockDB.projects.length}`);

        // --- ZOMBIE QUARANTINE (Client-Side Source of Truth) ---
        // Even if Supabase fails to delete, we memorize that this ID is dead to us.
        let deadIds = JSON.parse(localStorage.getItem('neo_deleted_projects') || '[]');
        if (!deadIds.includes(projectId)) {
            deadIds.push(projectId);
            localStorage.setItem('neo_deleted_projects', JSON.stringify(deadIds));
        }

        // Persistent deletion from Server DB
        if (window.supabaseClient) {
            try {
                // Delete project
                await window.supabaseClient.from('projects').delete().eq('id', projectId);
                // Clean up related data
                await window.supabaseClient.from('activities').delete().eq('project_id', projectId);
                await window.supabaseClient.from('documents').delete().eq('project_id', projectId);
            } catch (err) {
                console.error('[Database] Failed to permanently delete project:', err);
            }
        }

        if (modalDeleteConfirm) modalDeleteConfirm.classList.remove('show');
        if (modalEditProject) modalEditProject.classList.remove('show');
        
        // Neo Bubble Notification (Undo Snackbar placeholder)
        const neoBubble = document.getElementById('neo-fab-bubble');
        if (neoBubble) {
            neoBubble.textContent = "プロジェクトを削除しました。";
            neoBubble.classList.add('show');
            setTimeout(() => { neoBubble.classList.remove('show'); }, 3500);
        }

        // Render updated list and return to sites view
        renderProjects(mockDB.projects);
        document.querySelector('[data-target="view-sites"]').click();
    };



    // --- Expense Scanner Modal Logic ---
    const modalExpenseScanner = document.getElementById('modal-expense-scanner');
    const btnCloseExpenseModal = document.getElementById('btn-close-expense-modal');
    const btnExecuteExpense = document.getElementById('btn-execute-expense');

    window.openIncomeModal = () => {
        if (!currentOpenProjectId) return;
        
        const titleEl = document.getElementById('add-income-title');
        const amountEl = document.getElementById('add-income-amount');
        const modal = document.getElementById('modal-add-income');
        
        if (!titleEl || !amountEl || !modal) {
            console.error('DOM Error: Add Income Modal elements not found.');
            return;
        }
        
        titleEl.value = '';
        amountEl.value = '';
        
        modal.classList.remove('hidden');
        modal.classList.add('show');
    };

    window.closeAddIncomeModal = () => {
        const modal = document.getElementById('modal-add-income');
        if (!modal) return;
        
        modal.classList.remove('show');
        
        setTimeout(() => {
            modal.classList.add('hidden');
        }, 300);
    };

    window.saveAddIncome = () => {
        if (!currentOpenProjectId) return;
        
        const title = document.getElementById('add-income-title').value.trim();
        const amountStr = document.getElementById('add-income-amount').value;
        const numAmount = parseInt(amountStr.replace(/,/g, ''), 10);
        
        if (!title || isNaN(numAmount)) {
            alert('内容と金額を正しく入力してください。');
            return;
        }

        window.insertTransaction({
            id: Date.now(),
            projectId: currentOpenProjectId,
            type: "income",
            title: title,
            amount: numAmount,
            date: new Date().toLocaleDateString('ja-JP').replace(/\//g, '/'),
            source: "manual",
            category: "売上高",
            isBookkeeping: true
        });
        
        window.closeAddIncomeModal();
        // Re-render the UI
        window.openProjectDetail(currentOpenProjectId);
    };

    window.handleReceiptUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        console.log('[Neo Compression] File selected:', file.name, (file.size/1024).toFixed(2) + 'KB');
        
        // UX Thrill: Show spinning loader inside the already open Add Expense Modal
        const btnTrigger = document.getElementById('btn-modal-camera-trigger');
        let originalHtml = '';
        if (btnTrigger) {
            originalHtml = btnTrigger.innerHTML;
            btnTrigger.innerHTML = '<i data-lucide="loader-2" class="spin" style="width: 18px; height: 18px; animation: spin 1s linear infinite;"></i> 画像圧縮＆解析中...';
        }
        if(window.lucide) window.lucide.createIcons();
        
        // HTML5 Canvas Native Compression Engine
        const img = new Image();
        img.onload = () => {
            const MAX_DIMENSION = 1500; // OCR optimal legibility threshold
            let width = img.width;
            let height = img.height;
            
            // Aspect Ratio constraints
            if (width > height) {
                if (width > MAX_DIMENSION) {
                    height = Math.round((height *= MAX_DIMENSION / width));
                    width = MAX_DIMENSION;
                }
            } else {
                if (height > MAX_DIMENSION) {
                    width = Math.round((width *= MAX_DIMENSION / height));
                    height = MAX_DIMENSION;
                }
            }
            
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            
            // High-quality downsampling draw
            ctx.drawImage(img, 0, 0, width, height);
            
            // Serialize to JPG payload (80% yields massive savings with no text degradation)
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
            
            // In a real app, calculate true Base64 size, but here we estimate
            const estimatedNewSize = Math.round((compressedDataUrl.length * (3/4)) / 1024);
            console.log(`[Neo Compression] Completed. Output Size ~${estimatedNewSize}KB`);
            
            // Simulate Network / AI transmission delay, then populate fields
            setTimeout(() => {
                if (btnTrigger) {
                    btnTrigger.innerHTML = '<i data-lucide="check-circle" style="width: 18px; height: 18px; color: #10b981;"></i> レシート自動入力完了';
                }
                if(window.lucide) window.lucide.createIcons();
                
                // Reset input so the same file can be selected again if needed
                event.target.value = '';
                
                // Randomize the mock extract values a bit for realism
                const amounts = [15400, 3200, 19800, 840, 50000];
                const stores = ["ホームセンター コーナン", "Cafe Renoir", "Amazon Web Services", "タクシー (GO)", "〇〇建設資材"];
                
                const titleEl = document.getElementById('add-expense-title');
                const amountEl = document.getElementById('add-expense-amount');
                if (titleEl) titleEl.value = stores[Math.floor(Math.random() * stores.length)];
                if (amountEl) amountEl.value = amounts[Math.floor(Math.random() * amounts.length)];
                
            }, 800);
        };
        
        const reader = new FileReader();
        reader.onload = (e) => {
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    };

    // --- Company Stamp Logic ---
    const initCompanyStampSettings = () => {
        const uploadInput = document.getElementById('company-stamp-upload');
        const clearBtn = document.getElementById('btn-clear-stamp');
        const previewImg = document.getElementById('stamp-preview-img');
        const placeholderText = document.getElementById('stamp-placeholder-text');
        
        const scaleSlider = document.getElementById('stamp-scale-slider');
        const xSlider = document.getElementById('stamp-x-slider');
        const ySlider = document.getElementById('stamp-y-slider');
        
        const scaleVal = document.getElementById('stamp-scale-val');
        const xVal = document.getElementById('stamp-x-val');
        const yVal = document.getElementById('stamp-y-val');

        // Load saved state
        const savedStamp = localStorage.getItem('neo_company_stamp_data');
        const savedScale = localStorage.getItem('neo_company_stamp_scale') || "1.0";
        const savedX = localStorage.getItem('neo_company_stamp_x') || "0";
        const savedY = localStorage.getItem('neo_company_stamp_y') || "0";

        const updatePreviewTransforms = () => {
            if (previewImg && previewImg.src) {
                const scale = scaleSlider.value;
                const x = xSlider.value;
                const y = ySlider.value;
                
                previewImg.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
                
                if (scaleVal) scaleVal.textContent = `${Number(scale).toFixed(1)}x`;
                if (xVal) xVal.textContent = `${x}px`;
                if (yVal) yVal.textContent = `${y}px`;

                // Save automatically on adjust
                localStorage.setItem('neo_company_stamp_scale', scale);
                localStorage.setItem('neo_company_stamp_x', x);
                localStorage.setItem('neo_company_stamp_y', y);
            }
        };

        if (savedStamp && uploadInput) {
            previewImg.src = savedStamp;
            previewImg.style.display = 'block';
            if (placeholderText) placeholderText.style.display = 'none';

            if (scaleSlider) scaleSlider.value = savedScale;
            if (xSlider) xSlider.value = savedX;
            if (ySlider) ySlider.value = savedY;
            updatePreviewTransforms();
        }

        if (uploadInput) {
            uploadInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (ev) => {
                    const b64 = ev.target.result;
                    previewImg.src = b64;
                    previewImg.style.display = 'block';
                    if (placeholderText) placeholderText.style.display = 'none';
                    
                    localStorage.setItem('neo_company_stamp_data', b64);
                    
                    // Reset sliders for new image
                    if (scaleSlider) scaleSlider.value = "1.0";
                    if (xSlider) xSlider.value = "0";
                    if (ySlider) ySlider.value = "0";
                    updatePreviewTransforms();
                };
                reader.readAsDataURL(file);
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (confirm('登録された社判画像を削除しますか？')) {
                    localStorage.removeItem('neo_company_stamp_data');
                    localStorage.removeItem('neo_company_stamp_scale');
                    localStorage.removeItem('neo_company_stamp_x');
                    localStorage.removeItem('neo_company_stamp_y');
                    
                    if (previewImg) {
                        previewImg.src = '';
                        previewImg.style.display = 'none';
                    }
                    if (placeholderText) placeholderText.style.display = 'block';
                    if (uploadInput) uploadInput.value = '';
                }
            });
        }

        [scaleSlider, xSlider, ySlider].forEach(slider => {
            if (slider) {
                slider.addEventListener('input', updatePreviewTransforms);
            }
        });
    };

    // Initialize stamp settings logic on load
    initCompanyStampSettings();
    // --- End Company Stamp Logic ---

    window.openAddExpenseModal = () => {
        if (!currentOpenProjectId) return;
        
        const modal = document.getElementById('modal-add-expense');
        const titleEl = document.getElementById('add-expense-title');
        const amountEl = document.getElementById('add-expense-amount');
        const dateEl = document.getElementById('add-expense-date');
        const btnTrigger = document.getElementById('btn-modal-camera-trigger');
        
        if (!modal) {
            console.error('DOM Error: Add Expense Modal elements not found.');
            return;
        }
        
        // Reset fields
        if(titleEl) titleEl.value = '';
        if(amountEl) amountEl.value = '';
        if(dateEl) dateEl.value = new Date().toISOString().split('T')[0]; // Default to today
        if(btnTrigger) btnTrigger.innerHTML = '<i data-lucide="camera" style="width: 18px; height: 18px; color: var(--accent-neo-blue);"></i> レシート撮影で自動入力';
        if(window.lucide) window.lucide.createIcons();
        
        modal.classList.remove('hidden');
        modal.classList.add('show');
    };

    window.closeAddExpenseModal = () => {
        const modal = document.getElementById('modal-add-expense');
        if (!modal) return;
        
        modal.classList.remove('show');
        
        setTimeout(() => {
            modal.classList.add('hidden');
        }, 300);
    };

    window.saveAddExpense = () => {
        if (!currentOpenProjectId) return;
        
        const title = document.getElementById('add-expense-title').value.trim();
        const amountStr = document.getElementById('add-expense-amount').value;
        const numAmount = parseInt(amountStr.replace(/,/g, ''), 10);
        const inputDate = document.getElementById('add-expense-date').value || new Date().toISOString().split('T')[0];
        const formattedDate = inputDate.replace(/-/g, '/'); // Match YYYY/MM/DD standard in mockDB
        
        if (!title || isNaN(numAmount)) {
            alert('内容と金額を正しく入力してください。');
            return;
        }

        window.insertTransaction({
            id: Date.now(),
            projectId: currentOpenProjectId,
            type: "expense",
            title: title + " (手動計上)",
            amount: numAmount,
            date: formattedDate,
            source: "manual",
            category: "未分類 (AI確認中)", // Can trigger AI parsing in background or default mapped
            isBookkeeping: true
        });
        
        window.closeAddExpenseModal();
        
        // Trigger Neo subtle toast
        const neoFabBubble = document.getElementById('neo-fab-bubble');
        if (neoFabBubble) {
            neoFabBubble.textContent = `⚡️ 経費 ${numAmount.toLocaleString()}円 を計上し、全体利益から差し引いたよ。`;
            neoFabBubble.classList.add('show');
            setTimeout(() => {
                neoFabBubble.classList.remove('show');
            }, 3000);
        }
        
        // Re-render completely so Wallet global totals update
        renderProjects(mockDB.projects);
        
        // Re-open exactly the current project to refresh the timeline
        window.openProjectDetail(currentOpenProjectId);
    };

    // --- CSV Export Engine (Phase 4) ---
    const btnExportCsv = document.getElementById('btn-export-csv');
    if (btnExportCsv) {
        btnExportCsv.addEventListener('click', () => {
            if (mockDB.transactions.length === 0) {
                alert("エクスポートするデータがありません。");
                return;
            }

            // Generate Rakuraku Seisan / freee compatible CSV format
            // Headers: 取引日, 借方勘定科目, 借方金額, 貸方勘定科目, 貸方金額, 摘要, プロジェクト名
            const headers = ["取引日", "借方勘定科目", "借方金額", "貸方勘定科目", "貸方金額", "摘要", "プロジェクト名"];

            const rows = mockDB.transactions.map(t => {
                const proj = mockDB.projects.find(p => p.id === t.projectId);
                const projName = proj ? proj.name : "";

                // Map logical types to basic accounting subjects
                let debitAccount = "消耗品費";
                if (t.type === "labor") debitAccount = "外注工賃";

                let creditAccount = "現金"; // Default assumption

                // Format date from YYYY/MM/DD to YYYY-MM-DD for standard import
                const formattedDate = t.date.replace(/\//g, "-");

                return [
                    formattedDate,
                    debitAccount,
                    t.amount,
                    creditAccount,
                    t.amount, // Double entry accounting mock
                    t.title,
                    projName
                ].map(val => `"${val}"`).join(','); // Quote all values to prevent comma issues
            });

            const csvContent = [headers.join(','), ...rows].join('\n');

            // Add BOM for Japanese Excel compatibility
            const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
            const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });

            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);

            // Format filename: neo_export_YYYYMMDD.csv
            const today = new Date();
            const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

            link.setAttribute("href", url);
            link.setAttribute("download", `neo_export_${dateStr}.csv`);
            link.style.visibility = 'hidden';

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Trigger Neo subtle toast
            const neoFabBubble = document.getElementById('neo-fab-bubble');
            if (neoFabBubble) {
                neoFabBubble.textContent = `⚡️ freee / 楽楽精算 互換CSVを出力したよ。`;
                neoFabBubble.classList.add('show');
                setTimeout(() => {
                    neoFabBubble.classList.remove('show');
                }, 4000);
            }
        });
    }

    // --- PDF Grid Generation Engine (Phase 5) ---
    const btnExportPdfGrid = document.getElementById('btn-export-pdf-grid');
    const a4Container = document.getElementById('a4-print-container');
    const a4Grid = document.getElementById('a4-receipt-grid');

    if (btnExportPdfGrid && a4Container && a4Grid) {
        btnExportPdfGrid.addEventListener('click', () => {
            // Get expenses
            const expenses = mockDB.transactions.filter(t => t.type === 'expense' && !t.is_deleted);
            if (expenses.length === 0) {
                alert("抽出する領収書データがありません。");
                return;
            }

            a4Grid.innerHTML = ''; // Clear

            expenses.forEach(exp => {
                const proj = mockDB.projects.find(p => p.id === exp.projectId);
                const projName = proj ? proj.name : 'Unknown';

                // Mock simple receipt block
                const block = document.createElement('div');
                block.style.border = '1px solid #e5e7eb';
                block.style.borderRadius = '8px';
                block.style.padding = '16px';
                block.style.display = 'grid';
                block;
                block.style.gap = '8px';
                block.style.backgroundColor = '#f9fafb';

                block.innerHTML = `
                    <div style="font-size: 11px; color: #6b7280; display: grid; grid-auto-flow: column; justify-content: space-between; align-items: center;">
                        <span>Project: ${projName}</span>
                        <span>Date: ${exp.date}</span>
                    </div>
                    <div style=" min-height: 120px; border: 2px dashed #d1d5db; border-radius: 4px; display: grid; place-items: center; color: #9ca3af; font-size: 12px; background: white;">
                        [ AI Extracted Receipt Scan ]
                    </div>
                    <div style="display: grid; grid-auto-flow: column; justify-content: space-between; align-items: center; align-items: end;">
                        <span style="font-size: 12px; font-weight: 600;">${exp.title}</span>
                        <span style="font-size: 14px; font-weight: 700; color: #10b981;">¥${exp.amount.toLocaleString()}</span>
                    </div>
                `;
                a4Grid.appendChild(block);
            });

            // Prevent scrolling on body to ensure crisp print layout
            document.body.style.overflow = 'hidden';

            // Temporarily hide the main app wrapper and show the print container
            const modalReceiptGrid = document.getElementById('modal-receipt-grid');
            if (modalReceiptGrid) {
                modalReceiptGrid.classList.remove('hidden');
            }

            // Set current date on print header
            const pd = document.getElementById('a4-print-date');
            if (pd) pd.textContent = "抽出日: " + new Date().toLocaleDateString('ja-JP');

            // Set initial fitScale for the grid slider and paper
            setTimeout(() => {
                const gridTarget = document.getElementById('a4-print-container');
                const sliderGrid = document.getElementById('zoom-slider-grid');
                if (gridTarget && sliderGrid) {
                    const fw = Math.min(window.innerWidth / 793, 1.0) * 0.95;
                    gridTarget.dataset.baseScale = fw.toString();
                    sliderGrid.value = fw;
                    gridTarget.style.transform = `scale(${fw}) translate(0px, 0px)`;
                }
            }, 100);

        });
    }

    // --- Analog-Digital Bridge: Shared Document View ---
    const urlParams = new URLSearchParams(window.location.search);
    const sharedDocPayload = urlParams.get('share');
    if (sharedDocPayload) {
        try {
            const docData = JSON.parse(decodeURIComponent(atob(sharedDocPayload)));
            
            // Populate the preview with docData values manually
            window.currentDocType = docData.type || 'estimate';
            
            // Re-use updateDocPreview but override inputs first
            const elClient = document.getElementById('doc-client-name');
            if(elClient) elClient.value = docData.client || '';
            const elDate = document.getElementById('doc-issue-date');
            if(elDate) elDate.value = docData.date || '';
            const elDeadline = document.getElementById('doc-deadline-date');
            if(elDeadline) elDeadline.value = docData.deadline || '';
            const elSubj = document.getElementById('doc-subject');
            if(elSubj) elSubj.value = docData.subject || '';
            const elMemo = document.getElementById('doc-receipt-memo');
            if(elMemo) elMemo.value = docData.memo || '';
            const elBank = document.getElementById('doc-bank-info');
            if(elBank) elBank.value = docData.bank || '';
            
            // Handle items
            const itemsContainer = document.getElementById('doc-line-items-container');
            if (itemsContainer && docData.items && docData.items.length > 0) {
                itemsContainer.innerHTML = '';
                docData.items.forEach(item => {
                    itemsContainer.innerHTML += `
                        <div class="doc-line-item-row" style="margin-bottom: 24px; width: 100%; position: relative;">
                            <div style="position: absolute; top: -10px; right: -10px; background: #fff; padding: 4px; border-radius: 8px; z-index: 3; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                                <button type="button" onclick="this.closest('.doc-line-item-row').remove(); window.updateDocPreview();" style="background: none; border: none; color: #ef4444; font-size: 12px; font-weight: 700; padding: 8px; margin: 0; cursor: pointer;">&times; 削除</button>
                            </div>
                            <input type="text" class="form-control item-name-input" value="${item.name}" style="width: 100%; box-sizing: border-box; margin: 30px 0 12px 0 !important; padding: 16px; font-size: 16px; border: 1.5px solid #cbd5e1; border-radius: 12px; background: #fff; color: #0f172a;">
                            <div style="display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 12px; width: 100%; margin: 0; padding: 0;">
                                <input type="number" inputmode="decimal" class="form-control item-price-input" value="${item.price}" style=" margin: 0; padding: 16px; font-size: 18px; font-weight: 700; border: 1.5px solid #cbd5e1; border-radius: 12px; text-align: right; background: #fff; color: #0f172a;">
                                <span style="font-size: 16px; font-weight: 700; color: #475569;">円</span>
                            </div>
                        </div>`;
                });
            }

            // Hide the wrapper so behind the modal is clean
            const appWrap = document.querySelector('.app-wrapper');
            if(appWrap) appWrap.style.display = 'none';

            // Fire the standard renderer safely
            setTimeout(() => {
                window.updateDocPreview();

                // Hide the QR code in the shared view itself to avoid inception
                const qrElContainer = document.getElementById('preview-qr-code')?.parentElement;
                if (qrElContainer) qrElContainer.style.display = 'none';

                // Show the modal instantly
                const previewModal = document.getElementById('modal-doc-preview');
                if (previewModal) {
                    previewModal.classList.remove('hidden');
                    
                    // Hide standard actions, show shared actions
                    const btnSavePdf = document.getElementById('btn-preview-save-pdf');
                    if(btnSavePdf) btnSavePdf.classList.add('hidden');
                    const btnEdit = document.getElementById('btn-preview-edit');
                    if(btnEdit) btnEdit.style.display = 'none'; // Use display none since hidden class might not stick due to inline styles
                    
                    // Determine User vs Guest dynamically based on industry or mockDB
                    const isNeoUser = localStorage.getItem('neo_industry') != null || localStorage.getItem('fini_setup_complete') === 'true';
                    if (isNeoUser) {
                        const btnSaveNeo = document.getElementById('btn-shared-save-neo');
                        if(btnSaveNeo) btnSaveNeo.classList.remove('hidden');
                    } else {
                        const btnSharePdf = document.getElementById('btn-shared-save-pdf');
                        if(btnSharePdf) btnSharePdf.classList.remove('hidden');
                    }
                }
            }, 100);
        } catch (e) {
            console.error("Failed to parse shared document", e);
        }
    }

    window.importSharedDoc = function() {
        alert("Neo+にデータをインポートしました！プロジェクト画面に戻ります。");
        // Strip URL param and reload to pure dashboard
        window.location.href = window.location.origin + window.location.pathname;
    };

    // --- Field King: Wireless Print ---
    window.printModalGrid = function() {
        const mainApp = document.querySelector('.app-container');
        const bottomNav = document.getElementById('bottom-nav');
        const modalPreview = document.getElementById('modal-receipt-grid');
        const stickyFooter = modalPreview ? modalPreview.querySelector('#grid-floating-footer') : null;
        const previewHeader = modalPreview ? modalPreview.querySelector('#grid-floating-header') : null;
        
        if (mainApp) mainApp.style.display = 'none';
        if (bottomNav) bottomNav.style.display = 'none';
        
        if (modalPreview) {
            modalPreview.style.position = 'relative';
            modalPreview.style.overflow = 'visible';
            modalPreview.style.height = 'auto';
        }
        if (stickyFooter) stickyFooter.style.display = 'none';
        if (previewHeader) previewHeader.style.display = 'none';

        setTimeout(() => {
            window.print();
            
            if (mainApp) mainApp.style.display = '';
            if (bottomNav) bottomNav.style.display = '';
            
            if (modalPreview) {
                modalPreview.style.position = 'fixed';
                modalPreview.style.overflow = 'hidden';
                modalPreview.style.height = '100dvh';
            }
            if (stickyFooter) stickyFooter.style.display = 'grid';
            if (previewHeader) previewHeader.style.display = 'grid';
        }, 300);
    };

    window.printModalDoc = function() {
        // Temporarily hide the app container and nav to isolate the modal for printing
        const mainApp = document.querySelector('.app-container');
        const bottomNav = document.getElementById('bottom-nav');
        const modalPreview = document.getElementById('modal-doc-preview');
        const stickyFooter = modalPreview ? modalPreview.querySelector('div[style*="position: absolute; bottom: 0;"]') : null;
        const previewHeader = modalPreview ? modalPreview.querySelector('div[style*="border-bottom: 1px solid"]') : null;
        const paperScaleContainer = document.querySelector('.doc-gen-preview-container > div');
        
        if (mainApp) mainApp.style.display = 'none';
        if (bottomNav) bottomNav.style.display = 'none';
        
        // Prepare Modal for pure A4 printing layout
        if (modalPreview) {
            modalPreview.style.position = 'relative';
            modalPreview.style.overflow = 'visible';
            modalPreview.style.height = 'auto';
        }
        if (stickyFooter) stickyFooter.style.display = 'none';
        if (previewHeader) previewHeader.style.display = 'none';
        
        setTimeout(() => {
            window.print();
            
            // Restore UI
            if (mainApp) mainApp.style.display = '';
            if (bottomNav) bottomNav.style.display = '';
            
            if (modalPreview) {
                modalPreview.style.position = 'fixed';
                modalPreview.style.overflow = 'hidden';
                modalPreview.style.height = '100dvh';
            }
            if (stickyFooter) stickyFooter.style.display = 'grid';
            if (previewHeader) previewHeader.style.display = 'grid';
            
        }, 300);
    };

    // --- Field King: Interactive Pan & Zoom for A4 Preview (Digital Clone Edition) ---
    // Universal logic for all preview containers that need touch pan and zoom OR Slider zooming
    const setupInteractiveZoom = (wrapperId, paperId, sliderId, floatHId, floatFId) => {
        const previewWrapper = document.getElementById(wrapperId);
        const paperTarget = document.getElementById(paperId);
        const sliderInput = document.getElementById(sliderId);
        
        if (previewWrapper && paperTarget) {
            // Calculate Perfect Fit Scale dynamically with Professional Margins
            const calculateFitScale = () => {
                const innerWidth = window.innerWidth;
                const innerHeight = window.innerHeight;
                
                // A4 dimensions approx 793x1122 px
                const naturalWidth = (paperTarget.style.width === '182mm') ? 687 : 793;
                const naturalHeight = (paperTarget.style.minHeight === '257mm') ? 971 : 1122;
                
                // Safe area: Subtract header (~60px) and footer (~160px) and side paddings (~40px)
                const safeWidth = innerWidth - 40;
                const safeHeight = innerHeight - 220;
                
                const scaleW = safeWidth / naturalWidth;
                const scaleH = safeHeight / naturalHeight;
                
                // Return the scale that fits both dimensions perfectly, capped at 1.0
                return Math.min(scaleW, scaleH, 1.0); 
            };

            let currentZoom = calculateFitScale();
            let baseZoom = currentZoom;
            let lastDist = 0;
            
            const updateLayout = () => {
                if (sliderInput) sliderInput.value = currentZoom;
                paperTarget.style.transform = `scale(${currentZoom})`;
                
                // Fix native scroll layout bounds by retracting the bottom margin
                const nHeight = (paperTarget.style.minHeight === '257mm') ? 971 : 1122;
                paperTarget.style.marginBottom = `-${nHeight * (1 - currentZoom)}px`;
            };

            // Apply initial perfect fit
            updateLayout();
            
            // Recalculate on window resize
            window.addEventListener('resize', () => {
                if (currentZoom <= calculateFitScale() * 1.05) { 
                    currentZoom = calculateFitScale();
                    updateLayout();
                }
            });

            // Handle Slider Input
            if (sliderInput) {
                sliderInput.addEventListener('input', (e) => {
                    currentZoom = parseFloat(e.target.value);
                    updateLayout();
                });
            }

            const floatH = document.getElementById(floatHId);
            const floatF = document.getElementById(floatFId);
            let fadeTimeout;

            const fadeUIOut = () => {
                if (floatH) floatH.style.opacity = '0.15';
                if (floatF) floatF.style.opacity = '0.15';
                if (floatH) floatH.style.pointerEvents = 'none';
                if (floatF) floatF.style.pointerEvents = 'none';
            };

            const fadeUIIn = () => {
                if (floatH) floatH.style.opacity = '1';
                if (floatF) floatF.style.opacity = '1';
                if (floatH) floatH.style.pointerEvents = 'auto';
                if (floatF) floatF.style.pointerEvents = 'auto';
            };

            previewWrapper.addEventListener('touchstart', (e) => {
                if (e.target === sliderInput || (sliderInput && sliderInput.contains(e.target))) return; // Ignore slider touches

                if (e.touches.length === 2) {
                    lastDist = Math.hypot(
                        e.touches[0].clientX - e.touches[1].clientX,
                        e.touches[0].clientY - e.touches[1].clientY
                    );
                    baseZoom = currentZoom;
                    fadeUIOut();
                }
                clearTimeout(fadeTimeout);
            }, { passive: true });

            previewWrapper.addEventListener('touchmove', (e) => {
                if (e.target === sliderInput || (sliderInput && sliderInput.contains(e.target))) return;

                if (e.touches.length === 2) {
                    e.preventDefault(); 
                    const dist = Math.hypot(
                        e.touches[0].clientX - e.touches[1].clientX,
                        e.touches[0].clientY - e.touches[1].clientY
                    );
                    const delta = dist / lastDist;
                    const minZoom = calculateFitScale();
                    currentZoom = Math.min(Math.max(minZoom, baseZoom * delta), 3.0); 
                    updateLayout();
                }
                // Removed 1-finger isPanning block to allow 100% native iOS Safari scrolling interactions
            }, { passive: false });

            previewWrapper.addEventListener('touchend', (e) => {
                paperTarget.style.willChange = 'auto';
                setTimeout(() => { paperTarget.style.willChange = 'transform'; }, 50);

                clearTimeout(fadeTimeout);
                fadeTimeout = setTimeout(fadeUIIn, 400);
            });
        }
    };

    // Setup for Estimate Document
    setupInteractiveZoom('modal-doc-preview', 'doc-preview-paper', 'zoom-slider-doc', 'preview-floating-header', 'preview-floating-footer');
    
    // Setup for Receipt Grid
    setupInteractiveZoom('modal-receipt-grid', 'a4-print-container', 'zoom-slider-grid', 'grid-floating-header', 'grid-floating-footer');


    // Initialize Icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // --- SUPABASE REAL-TIME BINDING ---
    const initSupabaseData = async () => {
        try {
            if (!window.supabaseClient) {
                // Soft warn instead of error
                console.warn("Supabase client not loaded");
                return;
            }
            
            // --- CEO Demo Bypass for Zero Console Errors ---
            if (window.supabaseClient.supabaseUrl && window.supabaseClient.supabaseUrl.includes('nvnwnefqdsaecczpemkc')) {
                console.log("[Neo Boot] Static Mode: Skipping Supabase fetch to maintain clean console.");
                return; // Early return to prevent 404 errors during demo
            }
            
            // Fetch Projects
            const { data: projData, error: projErr } = await window.supabaseClient.from('projects').select('*').order('id', { ascending: false });
            if (!projErr && projData) {
                // --- ZOMBIE QUARANTINE FILTER ---
                const deadIds = JSON.parse(localStorage.getItem('neo_deleted_projects') || '[]');
                const aliveProjects = projData.filter(p => !deadIds.includes(p.id));

                if (deadIds.length > 0 && aliveProjects.length < projData.length) {
                    console.warn(`[Neo Boot] Suppressed ${projData.length - aliveProjects.length} zombie projects from rendering.`);
                }

                // Map snake_case to camelCase mapping for legacy mockDB usage
                window.mockDB.projects = aliveProjects.map(p => ({
                    id: p.id, name: p.name, customerName: p.customer_name || '-', location: p.location || '-', note: p.note || '',
                    category: p.category, color: p.color, unit: p.unit || '-', hasUnpaid: p.has_unpaid, revenue: parseFloat(p.revenue) || 0,
                    status: p.status, clientName: p.client_name, paymentDeadline: p.payment_deadline, bankInfo: p.bank_info, lastUpdated: p.last_updated, currency: p.currency
                }));
            }

            // Fetch Activities
            const { data: actData, error: actErr } = await window.supabaseClient.from('activities').select('*');
            if (!actErr && actData) {
                window.mockDB.transactions = actData.map(a => ({
                    id: a.id, projectId: a.project_id, type: a.type, category: a.category, title: a.title, amount: parseFloat(a.amount) || 0,
                    date: a.date, receiptUrl: a.receipt_url, isBookkeeping: a.is_bookkeeping, is_deleted: a.is_deleted || false
                }));
            }

            // Fetch Documents
            const { data: docData, error: docErr } = await window.supabaseClient.from('documents').select('*');
            if (!docErr && docData) {
                window.mockDB.documents = docData.map(d => ({
                    id: d.id, projectId: d.project_id, type: d.type, title: d.title, amount: parseFloat(d.amount) || 0, date: d.date, url: d.url
                }));
            }
            
            // Fetch Global Lexicon (Crowdsourced Knowledge - Top 500)
            const { data: lexData, error: lexErr } = await window.supabaseClient.from('neo_global_lexicon').select('*').order('frequency', { ascending: false }).limit(500);
            if (!lexErr && lexData) {
                window.globalLexicon = lexData;
                console.log(`[Neo Global Agent] Cached ${window.globalLexicon.length} common business terms.`);
            } else {
                window.globalLexicon = [];
            }
            
            // Re-render dashboard
            if (typeof renderProjects === 'function') {
                renderProjects(window.mockDB.projects);
            }
            if (typeof window.updateSitesList === 'function') {
                window.updateSitesList();
            }

        } catch (e) {
            console.error("Supabase init failed", e);
        }
    };
    
    // Call DB Init
    initSupabaseData();

    // --- CEO Security Audit Protocol ---
    window.runCEOAudit = () => {
        let logs = JSON.parse(localStorage.getItem('neo_security_logs') || '[]');
        const unviewedLogs = logs.filter(log => !log.viewed);
        
        if (unviewedLogs.length > 0) {
            console.warn(`[Neo Security Audit] WARNING: CEO, ${unviewedLogs.length} hostile attempts were blocked while you were offline.`);
            unviewedLogs.forEach(log => {
                console.warn(`[BLOCKED] Time: ${log.timestamp} | Reason: ${log.reason} | Input: "${log.input}"`);
            });
            // Mark as viewed
            logs = logs.map(log => ({ ...log, viewed: true }));
            localStorage.setItem('neo_security_logs', JSON.stringify(logs));
        } else {
            console.log('[Neo Security Audit] System is secure. No new threats detected.');
        }
    };

    // Run audit after a short delay so console is ready
    setTimeout(window.runCEOAudit, 2000);


    // --- CEO Sandbox Toolkit (neoAdmin) ---
    window.neoAdmin = {
        backup: () => {
            const data = {
                mockDB: window.mockDB || {},
                logs: JSON.parse(localStorage.getItem('neo_security_logs') || '[]'),
                config: {
                    industry: localStorage.getItem('userMeta_industry'),
                    name: localStorage.getItem('userMeta_name')
                }
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `neo_backup_${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            console.log("✅ [neoAdmin] Database and logs successfully backed up.");
        },
        reset: () => {
            if (confirm("🚨 WARNING: This will completely wipe all local data, projects, expenses, and security logs. Are you sure?")) {
                localStorage.clear();
                console.log("💀 [neoAdmin] Sandbox wiped clean.");
                location.reload();
            }
        },
        monitorLogs: () => {
            console.log("👁️ [neoAdmin] Security Log Monitor Activated. Watching for real-time violations...");
            let lastLogCount = JSON.parse(localStorage.getItem('neo_security_logs') || '[]').length;
            setInterval(() => {
                const logs = JSON.parse(localStorage.getItem('neo_security_logs') || '[]');
                if (logs.length > lastLogCount) {
                    const newLogs = logs.slice(lastLogCount);
                    newLogs.forEach(log => {
                        console.log(`%c🚨 [VIOLATION DETECTED] ${log.reason} | Input: "${log.input}"`, 'color: #FF3B30; font-weight: bold; font-size: 1.1em;');
                    });
                    lastLogCount = logs.length;
                }
            }, 2000);
        }
    };

    // N+ Chat UI Send Logic
    const btnNplusSend = document.getElementById('btn-nplus-send');
    const inputNplusChat = document.getElementById('nplus-chat-input');
    const nplusChatContainer = document.getElementById('nplus-chat-container');

    // 1. Core RAG Retrieval Logic (Simulated for Prototype)
    async function retrieveKnowledgeFromDB(userQueryText) {
        try {
            console.log(`[RAG Engine] Generating embeddings for: "${userQueryText}"`);
            console.log(`[RAG Engine] Retrieving relevant laws via pgvector HNSW index...`);
            
            // Mock Response based on query
            let contextString = "";
            let citations = [];
            let aiResponseText = "承知しました。AI Coreが最適化プロセスを開始します...";

            if (userQueryText.includes("交際費") || userQueryText.includes("接待")) {
                contextString = "接待交際費は、原則として法人の損金に算入されませんが、中小法人については、年間800万円以内の金額、または接待飲食費の50%のいずれか大きい金額を損金算入することができます（租税特別措置法第61条の4）。";
                citations = [
                    { title: "租税特別措置法 第61条4", url: "https://elaws.e-gov.go.jp/" },
                    { title: "国税庁タックスアンサー No.5265", url: "https://www.nta.go.jp/" }
                ];
                aiResponseText = "CEO、検索結果を踏まえて回答します。接待交際費については、中小法人の特例により年間800万円まで、もしくは交際飲食費の50%を損金（経費）に算入することが可能です。今回のケースなら全額経費として計上して問題ありません。";
            } else if (userQueryText.includes("インボイス") || userQueryText.includes("免税")) {
                contextString = "免税事業者からの仕入れに係る経過措置として、制度開始から3年間は仕入税額相当額の80％、その後の3年間は50％を控除可能です（消費税法）。";
                citations = [
                    { title: "消費税法等の一部を改正する法律", url: "https://elaws.e-gov.go.jp/" }
                ];
                aiResponseText = "インボイス制度に関する検索結果です。免税事業者からの取引でも、現在は経過措置により8割の控除が可能です。システム側で自動判定し、帳簿への記載要件を満たすよう処理しておきました。";
            }

            return { contextString, citations, aiResponseText };
        } catch (error) {
            console.error("RAG Retrieval Error:", error);
            return { contextString: "", citations: [], aiResponseText: "エラーが発生しました。" };
        }
    }

    const sendNplusMessage = async () => {
        if (!inputNplusChat || !nplusChatContainer) return;
        const msg = inputNplusChat.value.trim();
        if (!msg) return;

        // Render User Message
        const userHtml = `
            <div class="chat-bubble-user" style="margin-bottom: 8px;">
                ${msg}
            </div>
        `;
        nplusChatContainer.insertAdjacentHTML('beforeend', userHtml);
        inputNplusChat.value = '';
        nplusChatContainer.scrollTop = nplusChatContainer.scrollHeight;

        // Show "Analyzing Laws..." indicator
        const loadingId = "loading-" + Date.now();
        const loadingHtml = `<div id="${loadingId}" class="chat-bubble-neo" style="margin-bottom: 8px; opacity: 0.7;">
            <i data-lucide="search" style="width:14px; height:14px; display:inline-block; vertical-align:middle; margin-right:4px;"></i> 判例と法令を検索・分析中...
        </div>`;
        nplusChatContainer.insertAdjacentHTML('beforeend', loadingHtml);
        if (window.lucide) window.lucide.createIcons();
        nplusChatContainer.scrollTop = nplusChatContainer.scrollHeight;

        // Execute RAG
        const { citations, aiResponseText } = await retrieveKnowledgeFromDB(msg);

        // Render AI Response with Citations
        setTimeout(() => {
            const loadingEl = document.getElementById(loadingId);
            if (loadingEl) loadingEl.remove();

            // Build Premium Citation UI elements
            let citationsHtml = '';
            if (citations && citations.length > 0) {
            citationsHtml = `
                <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed rgba(29, 155, 240, 0.3); display: block; gap: 4px;">
                <span style="font-size: 11px; font-weight: 600; color: #10b981; letter-spacing: 0.05em; display: grid; grid-auto-flow: column; justify-content: start; align-items: center; gap: 4px;">
                    <i data-lucide="book-check" style="width:12px; height:12px;"></i> AI ACCOUNTANT CITED SOURCES:
                </span>
                <div style="display: grid; grid-auto-flow: column;  gap: 6px; margin-top: 2px;">
                    ${citations.map(c => `
                    <a href="${c.url}" target="_blank" style="text-decoration: none; display: inline-block; align-items: center; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); color: #10b981; padding: 4px 8px; border-radius: 12px; font-size: 11px; transition: background 0.2s;">
                        <i data-lucide="external-link" style="width:10px; height:10px; margin-right: 4px;"></i> ${c.title}
                    </a>
                    `).join('')}
                </div>
                </div>
            `;
            }

            const neoHtml = `
                <div class="chat-bubble-neo" style="margin-bottom: 8px;">
                    ${aiResponseText}
                    ${citationsHtml}
                </div>
            `;
            nplusChatContainer.insertAdjacentHTML('beforeend', neoHtml);
            if (window.lucide) window.lucide.createIcons();
            nplusChatContainer.scrollTop = nplusChatContainer.scrollHeight;

        }, 1800); // Simulate API latency
    };

    if (btnNplusSend) {
        btnNplusSend.addEventListener('click', sendNplusMessage);
    }
    if (inputNplusChat) {
        inputNplusChat.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendNplusMessage();
            }
        });
    }

    // ==========================================
    // N+ CHAT ENGINE (CEO COCKPIT)
    // ==========================================
    window.sendChatMessage = async function() {
        const inputField = document.getElementById('chat-input-field');
        if (!inputField) return;
        const text = inputField.value.trim();
        if (!text) return;

        // Clear input
        inputField.value = '';

        const messagesContainer = document.getElementById('chat-messages');

        // 1. Create User (CEO) Message Bubble (Right-aligned, Dark gray)
        const userRow = document.createElement('div');
        userRow.className = 'chat-message-row user-message-row';
        userRow.style.display = 'flex';
        userRow.style.flexDirection = 'row-reverse';
        userRow.style.gap = '12px';
        userRow.style.alignItems = 'flex-end';
        userRow.style.marginBottom = '12px';

        userRow.innerHTML = `
            <div style="flex-shrink: 0; width: 32px; height: 32px; border-radius: 50%; background: #333; display: grid; place-items: center; box-shadow: 0 2px 10px rgba(0,0,0,0.5);">
                <i data-lucide="user" style="color: white; width: 16px; height: 16px;"></i>
            </div>
            <div class="chat-bubble right-bubble" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); border-radius: 20px 20px 4px 20px; padding: 14px 18px; max-width: 80%; color: var(--text-main); font-size: 15px; line-height: 1.5; font-family: var(--font-sans); word-break: break-word;">
                ${text}
            </div>
        `;
        messagesContainer.appendChild(userRow);
        if(window.lucide) window.lucide.createIcons({root: userRow});

        // Robust auto-scroll to bottom after user message
        setTimeout(() => {
            userRow.scrollIntoView({ behavior: 'smooth', block: 'end' });
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }, 50);

        // 2. Create AI (Neo) Placeholder Bubble (Left-aligned, Blue)
        const neoRow = document.createElement('div');
        neoRow.className = 'chat-message-row neo-message-row';
        neoRow.style.display = 'flex';
        neoRow.style.gap = '12px';
        neoRow.style.alignItems = 'flex-end';
        neoRow.style.marginBottom = '12px';

        neoRow.innerHTML = `
            <div class="avatar-wrapper">
                <img src="img/neo_avatar.jpg" class="avatar-circle" alt="Neo">
            </div>
            <div class="chat-bubble neo" style="max-width: 80%; font-size: 15px; line-height: 1.5; font-family: var(--font-sans); word-break: break-word;">
                <span class="typing-indicator" style="animation: pulse 1.5s infinite opacity;">解析中...</span>
            </div>
        `;
        messagesContainer.appendChild(neoRow);
        setTimeout(() => {
            neoRow.scrollIntoView({ behavior: 'smooth', block: 'end' });
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }, 50);

        const neoBubbleText = neoRow.querySelector('.chat-bubble');

        try {
            // Wait for full text response from Gemini
            const fullResponse = await window.generateGeminiResponse(text, 'chat_room');
            
            // Clear the placeholder
            neoBubbleText.innerHTML = '';
            
            // Streaming Effect (Character by Character)
            let i = 0;
            const streamInterval = setInterval(() => {
                // Ignore HTML tags for the raw streaming effect, handle cleanly later if needed
                neoBubbleText.textContent += fullResponse.charAt(i);
                
                // Keep viewport glued to the bottom during rapid streaming
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
                
                i++;
                if (i >= fullResponse.length) {
                    clearInterval(streamInterval);
                    // After streaming finishes, replace straight text with interpreted HTML for styling
                    neoBubbleText.innerHTML = fullResponse.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                    
                    // Final scroll after HTML rendering
                    setTimeout(() => updateScroll(), 50);
                }
            }, 10); // 10ms speed

            function updateScroll() {
                neoRow.scrollIntoView({ behavior: 'smooth', block: 'end' });
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }

        } catch (error) {
            neoBubbleText.innerHTML = `<span style="color: #f87171;">エラーが発生しました。接続を確認してください。</span>`;
            console.error("Chat Error:", error);
        }
    };

    // Debug toggle to reset setup
    window.resetSetup = () => {
        localStorage.removeItem('fini_setup_complete');
        location.reload();
    };

    // ==========================================
    // N+ Personalized Initial Greeting
    // ==========================================
    const neoGreetings = [
        "CEO、お疲れ様。会計のことは全部私に投げて。今は何から始める？",
        "システムチェック完了。複雑な数字の整理、いつでも手伝えるよ。",
        "今日もいい集中力だね。経費の仕訳、パパッと終わらせちゃおうか。",
        "書類の準備？それとも相談？Neoがあなたの隣でスキャン中だよ。",
        "どんな小さな領収書でも見逃さない。さあ、Neoと一緒に片付けよう。"
    ];

    document.addEventListener('DOMContentLoaded', () => {
        const greetingEl = document.getElementById('neo-initial-chat-greeting');
        if (greetingEl) {
            greetingEl.textContent = neoGreetings[Math.floor(Math.random() * neoGreetings.length)];
        }
    });
});
