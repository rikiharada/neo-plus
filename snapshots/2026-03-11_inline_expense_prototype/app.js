document.addEventListener('DOMContentLoaded', async () => {
    // Initialize i18n
    await window.i18n.loadLocale('ja'); // Load default 'ja' locale

    // Setup Views
    const setupView = document.getElementById('view-setup');
    const dashView = document.getElementById('view-dash');

    // Setup Elements
    const btnStart = document.getElementById('btn-start');
    const selectFontSize = document.getElementById('select-font-size');

    // Dashboard Elements
    const neoDashContainer = document.getElementById('neo-dash');

    let neo;
    let currentOpenProjectId = null;

    // Initial state logic
    const checkInitialSetup = () => {
        // For MVP, we always show setup first unless skipped via local storage
        const hasSetup = localStorage.getItem('fini_setup_complete');
        if (!hasSetup) {
            showSetup();
        } else {
            showDash();
        }
    };

    const applyFontSize = (size) => {
        document.documentElement.style.fontSize = size;
    };

    // Listeners
    selectFontSize.addEventListener('change', (e) => {
        if (e.target.value === 'huge') {
            applyFontSize('120%');
        } else {
            applyFontSize('100%');
        }
    });

    btnStart.addEventListener('click', () => {
        // Save settings
        localStorage.setItem('fini_setup_complete', 'true');
        showDash();
    });

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

    // Navigation Logic
    const allViews = [
        setupView,
        dashView,
        document.getElementById('view-sites'),
        document.getElementById('view-expense'),
        document.getElementById('view-wallet'),
        document.getElementById('view-settings'),
        document.getElementById('view-project-detail')
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
        const allViewIds = ['view-setup', 'view-dash', 'view-sites', 'view-expense', 'view-wallet', 'view-settings', 'view-project-detail'];
        allViewIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.classList.add('hidden');
                el.style.display = 'none';
                el.style.opacity = '';
            }
        });

        const targetViewElement = document.getElementById(targetId);

        if (targetId === 'view-sites') {
            const listContainer = document.getElementById('project-list-container');
            if (listContainer) {
                listContainer.classList.remove('hidden');
                listContainer.style.display = 'flex';
                listContainer.style.visibility = 'visible';
            }
            if (targetViewElement) {
                targetViewElement.classList.remove('hidden');
                targetViewElement.style.display = 'block';
            }
        } else if (targetViewElement) {
            targetViewElement.classList.remove('hidden');
            targetViewElement.style.display = targetId === 'view-dash' ? 'flex' : 'block';
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

        // Ensure Lucide icons are rendered for newly displayed elements across views
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }; // close switchView()

    // Expose to window for inline onclick in HTML
    window.switchView = switchView;

    // Instruction Box Logic (Intelligent Cockpit)
    const instructionInput = document.getElementById('main-instruction-input');
    const instructionMic = document.getElementById('main-mic-btn');
    const btnAttachImage = document.getElementById('btn-attach-image');

    const triggerNeoSyncGlow = () => {
        const iconsToGlow = document.querySelectorAll('[data-target="view-sites"] i, [data-target="view-wallet"] i');
        iconsToGlow.forEach(icon => {
            icon.classList.add('neo-sync-glow');
            setTimeout(() => {
                icon.classList.remove('neo-sync-glow');
            }, 1500); // Glow lasts 1.5 seconds
        });
    };

    const handleInstruction = async (text, hasImage = false) => {
        if (!text && !hasImage) return;

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

            // --- Home Parsing Logic for Projects (Fuzzy Match / あいまい検索) ---
            const matchedProject = mockDB.projects.find(p => {
                const textLower = text.toLowerCase();
                const pNameLower = p.name.toLowerCase();
                // ユーザー入力にプロジェクト名が含まれるか、プロジェクト名にユーザー入力が含まれれば一致とみなす
                return textLower.includes(pNameLower) || pNameLower.includes(textLower);
            });
            if (matchedProject) {
                currentOpenProjectId = matchedProject.id;
            }

            // Artificial delay to simulate complex parsing
            await new Promise(resolve => setTimeout(resolve, 800));

            // Trigger the Neo-Sync glowing effect -> Data is being distributed
            triggerNeoSyncGlow();

            // Allow glow to be visible for a moment before switching views
            await new Promise(resolve => setTimeout(resolve, 600));

            // Logic to determine route based on input type
            let intentData = { route: 'view-expense', force_inline: false }; // Default to expense if image attached

            if (!hasImage) {
                // Call Gemini API from gemini.js just for text routing
                intentData = await determineRouteFromIntent(text);
                if (typeof intentData === 'string') {
                    intentData = { route: intentData, force_inline: false }; // For safety
                }
            }

            const targetView = intentData.route;
            // デバッグ用全出力
            console.log('Gemini Result:', intentData);

            // 成功判定の優先: force_inline が true なら絶対に画面を動かさない
            const isInline = intentData.force_inline === true || targetView === 'inline-expense';

            if (isInline) {
                // Background processing: 強制保存処理
                // ID強制指定: もしプロジェクト名が曖昧なら、迷わず currentProjectId（今開いているプロジェクト）か、ID:1（未分類）に無理やりねじ込む
                const projId = currentOpenProjectId || 1;
                const projName = mockDB.projects.find(p => p.id === projId)?.name || '未分類';

                // Transaction object
                const newTransaction = {
                    id: Date.now(),
                    projectId: projId,
                    type: "expense",
                    title: intentData.title || text,
                    amount: intentData.amount || 0,
                    date: new Date().toLocaleDateString('ja-JP').replace(/\//g, '/'),
                    source: "inline"
                };

                // 即時保存 1: 配列にプッシュ
                mockDB.transactions.push(newTransaction);

                // 即時保存 2: localStorageへの書き込み (MVP用簡易保存)
                try {
                    const savedTxs = JSON.parse(localStorage.getItem('neo_transactions') || '[]');
                    savedTxs.push(newTransaction);
                    localStorage.setItem('neo_transactions', JSON.stringify(savedTxs));
                    console.log("Inline expense forcefully saved to localStorage.");
                    // 強制保存の再点検
                    alert('保存完了：' + newTransaction.amount + '円');
                } catch (e) {
                    console.error("Local storage save failed:", e);
                }

                // Render projects to update UI data totals
                renderProjects(mockDB.projects);

                // Show inline confirmation via Neo fab bubble
                const neoBubble = document.getElementById('neo-fab-bubble');
                if (neoBubble) {
                    neoBubble.textContent = `保存先：${projName} に記録したよ⚡️`;
                    neoBubble.classList.add('show');
                    setTimeout(() => {
                        neoBubble.classList.remove('show');
                    }, 4000);
                }

                // Clear input
                if (instructionInput) {
                    instructionInput.value = '';
                }

                // 完全なる遷移ブロック
                return;
            } else {
                // インラインでない場合のみ遷移を実施
                if (targetView && !isInline) {
                    if (targetView === 'view-expense') {
                        // 『逃げのコード』を物理的にコメントアウト（遷移させない）
                        // switchView(targetView);

                        // 代わりに強制的に未分類に保存してエラーメッセージを出す
                        const projId = 1; // 1 = 未分類 or fallback
                        const newTransaction = {
                            id: Date.now(),
                            projectId: projId,
                            type: "expense",
                            title: text, // 生テキストをそのまま保存
                            amount: 0,
                            date: new Date().toLocaleDateString('ja-JP').replace(/\//g, '/'),
                            source: "inline-fallback"
                        };

                        mockDB.transactions.push(newTransaction);

                        try {
                            const savedTxs = JSON.parse(localStorage.getItem('neo_transactions') || '[]');
                            savedTxs.push(newTransaction);
                            localStorage.setItem('neo_transactions', JSON.stringify(savedTxs));
                            console.log("Fallback expense forcefully saved to localStorage.");
                            // 強制保存の再点検
                            alert('保存完了：' + newTransaction.amount + '円 (未分類)');
                        } catch (e) { /* ignore */ }

                        renderProjects(mockDB.projects);

                        const neoBubble = document.getElementById('neo-fab-bubble');
                        if (neoBubble) {
                            neoBubble.textContent = `内容が不明確なため、「未分類」として仮保存したよ⚡️`;
                            neoBubble.classList.add('show');
                            setTimeout(() => { neoBubble.classList.remove('show'); }, 4000);
                        }
                    } else {
                        // その他の画面（ダッシュボードや設定）は通常通り遷移
                        switchView(targetView);
                    }
                }
                // Clear input only on successful action
                if (instructionInput) {
                    instructionInput.value = '';
                }
            }
        } catch (error) {
            console.error("Failed to route via Gemini:", error);
            alert("AI連携に失敗しました。\nエラー: " + error.message);
            // 逃げのコードを物理的にコメントアウト
            // switchView('view-expense');

            const neoBubble = document.getElementById('neo-fab-bubble');
            if (neoBubble) {
                neoBubble.textContent = `エラーが発生したため、変更は保存されませんでした。`;
                neoBubble.classList.add('show');
                setTimeout(() => { neoBubble.classList.remove('show'); }, 4000);
            }
        } finally {
            // Restore input UI state
            if (instructionInput) {
                instructionInput.style.borderColor = '';
                instructionInput.style.boxShadow = '';
                instructionInput.disabled = false;
                instructionInput.focus();
            }
            if (neo) neo.speak('neo_idle');
        }
    };

    if (instructionInput) {
        instructionInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault(); // イベントの無効化（デフォルトの改行や送信を防ぐ）
                handleInstruction(e.target.value.trim());
            }
        });
    }

    if (instructionMic) {
        instructionMic.addEventListener('click', (e) => {
            e.preventDefault();
            // Mock text input
            const val = instructionInput.value || 'タクシー代 2500円 六本木';
            instructionInput.value = val;
            handleInstruction(val, false);
        });
    }

    if (btnAttachImage) {
        btnAttachImage.addEventListener('click', (e) => {
            e.preventDefault();
            // Mock image attachment + text
            const val = instructionInput.value || 'このレシートを経費に入れておいて';
            instructionInput.value = "[📸 画像添付済み]\n" + val;
            handleInstruction(instructionInput.value, true);
        });
    }

    // Nav Item Listeners
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            switchView(item.getAttribute('data-target'));
        });
    });

    const showSetup = () => {
        switchView('view-setup');
        if (bottomNav) bottomNav.classList.add('hidden');

        const neoFab = document.getElementById('neo-fab-container');
        if (neoFab) neoFab.classList.add('hidden');
    };

    const showDash = () => {
        switchView('view-dash');
        if (bottomNav) bottomNav.classList.remove('hidden');

        const neoStyleBadge = document.getElementById('neo-fab-container');
        if (neoStyleBadge) neoStyleBadge.classList.remove('hidden');

        // Restore size preference if reloading dash directly
        const storedSize = document.getElementById('select-font-size').value;
        if (storedSize === 'huge') applyFontSize('120%');
    };

    // --- Neo-Sync v2.0 Base Data Model ---
    const mockDB = {
        userConfig: {
            industry: localStorage.getItem('neo_industry') || "construction",
            cloudProvider: localStorage.getItem('neo_cloud') || "icloud",
            targetMonthlyProfit: 1000000
        },
        projects: [
            {
                id: 1,
                name: "六本木ヒルズ改装工事 第3期",
                customerName: "-",
                location: "港区六本木",
                note: "夜間作業メイン",
                category: "construction",
                color: "#FF3B30",
                unit: "人工",
                hasUnpaid: true, /* Force unpaid for demo */
                revenue: 850000,
                status: 'active',
                lastUpdated: '2026/03/01 - 2026/03/15'
            },
            {
                id: 2,
                name: "渋谷スクランブル店舗内装",
                customerName: "-",
                location: "渋谷区道玄坂",
                note: "最終確認待ち",
                category: "design",
                color: "#007AFF",
                unit: "時間",
                hasUnpaid: false,
                revenue: 400000,
                status: 'planning',
                lastUpdated: '2026/03/10'
            }
        ],
        transactions: [
            { id: 101, projectId: 1, type: "labor", title: "鈴木 人工", amount: 20000, date: "2026/03/05", source: "manual" },
            { id: 102, projectId: 1, type: "labor", title: "田中 人工", amount: 20000, date: "2026/03/05", source: "manual" },
            { id: 103, projectId: 1, type: "expense", title: "資材費（コーナン）", amount: 45000, date: "2026/03/06", source: "manual" },
            { id: 104, projectId: 2, type: "expense", title: "外注デザイン費", amount: 150000, date: "2026/03/08", source: "manual" }
        ],
        documents: [
            { id: 201, projectId: 1, type: "invoice", title: "着手金 請求", amount: 400000, date: "2026/03/01", url: "local" }
        ]
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
                if (filterType !== 'date-desc') {
                    btnFilterProjects.classList.add('filter-active');
                } else {
                    btnFilterProjects.classList.remove('filter-active');
                }

                // Hide dropdown
                filterDropdown.classList.add('hidden');

                // Apply Filter Logic (Mock implementation)
                applyProjectFilter(filterType);
            });
        });
        // In a real app, this would re-render the view-sites list based on sortedFiltered
    };

    const applyProjectFilter = (filterType) => {
        let sortedFiltered = [...mockDB.projects];

        // Apply Filter Logic

        if (filterType === 'date-desc') {
            sortedFiltered.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
        } else if (filterType === 'name-asc') {
            sortedFiltered.sort((a, b) => a.customerName.localeCompare(b.customerName, 'ja'));
        } else if (filterType === 'unpaid') {
            sortedFiltered = sortedFiltered.filter(p => p.hasUnpaid);
        }

        // Re-render the list
        renderProjects(sortedFiltered);
    };

    // Render Projects (Bank Account style list)
    const renderProjects = (projectsToRender) => {
        const container = document.getElementById('project-list-container');
        if (!container) return;

        container.innerHTML = '';

        let totalAgencyProfit = 0;

        if (projectsToRender.length === 0) {
            container.innerHTML = '<p style="padding: var(--spacing-lg); color: var(--text-muted); text-align: center;">アカウントがありません</p>';
            const totalWealthEl = document.getElementById('total-wealth-balance');
            if (totalWealthEl) totalWealthEl.textContent = '¥0';
            return;
        }

        projectsToRender.forEach(proj => {
            // Calculate Profit Balance
            const mockRevenue = proj.revenue || 1000000;
            const expenses = mockDB.transactions.filter(t => t.projectId === proj.id && t.type === 'expense').reduce((acc, curr) => acc + curr.amount, 0);
            const labor = mockDB.transactions.filter(t => t.projectId === proj.id && t.type === 'labor').reduce((acc, curr) => acc + curr.amount, 0); // Mock logic

            const totalCost = expenses + labor;
            const projectProfit = mockRevenue - totalCost;

            totalAgencyProfit += projectProfit;

            // Bank Account Folder Item
            const item = document.createElement('div');
            item.className = 'project-list-item';

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

            // Format balance
            const balanceSign = projectProfit >= 0 ? '' : '-';
            const balanceClass = projectProfit >= 0 ? 'positive' : 'negative';
            const displayBalance = `${balanceSign}¥${Math.abs(projectProfit).toLocaleString()}`;

            item.innerHTML = `
                <div class="project-list-item-cover" style="background-color: var(--btn-secondary-border); background-image: url('images/mock-site${(proj.id % 3) + 1}.jpg');">
                    <div class="project-list-item-balance ${balanceClass}">
                        ${displayBalance}
                    </div>
                </div>
                <div class="project-list-item-info">
                    <h3 class="project-list-item-title">${proj.name}</h3>
                    <div class="project-list-item-meta">
                        <span class="project-list-item-badge">${statusText}</span>
                        <span class="project-list-item-docs">
                            <i data-lucide="file-text" style="width: 14px; height: 14px;"></i>書類 x ${Math.floor(Math.random() * 5) + 1}
                        </span>
                    </div>
                </div>
            `;

            item.addEventListener('click', () => {
                window.openProjectDetail(proj.id);
            });

            container.appendChild(item);
        });

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
            const expenses = mockDB.transactions.filter(t => t.projectId === projectId).reduce((acc, curr) => acc + curr.amount, 0);
            // For mock: use invoice amount sum if exists, otherwise fallback to project's mock revenue
            const invoices = mockDB.documents.filter(d => d.projectId === projectId && d.type === 'invoice');
            const revenue = invoices.length > 0 ? invoices.reduce((acc, curr) => acc + curr.amount, 0) : (proj.revenue || 0);
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
            const profEl = document.getElementById('detail-profit');
            if (profEl) profEl.textContent = `¥${profit.toLocaleString()}`;

            // Update Dashboard Note
            const noteEl = document.getElementById('detail-project-note');
            if (noteEl) noteEl.textContent = proj.note || 'プロジェクトのメモがありません。';

            // --- NEW: Update PDF Document Count ---
            const docCountEl = document.getElementById('detail-doc-count');
            if (docCountEl) {
                const docCount = mockDB.documents.filter(d => d.projectId === projectId).length;
                docCountEl.innerHTML = `${docCount}<span style="font-size: 14px; font-weight: 400; color: var(--text-muted); margin-left: 2px;">件</span>`;
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

                combined = [...mockDB.transactions.filter(t => t.projectId === projectId), ...mockDB.documents.filter(d => d.projectId === projectId)];
                // Sort descending (basic string comparison for mock dates)
                combined.sort((a, b) => new Date(b.date) - new Date(a.date));

                if (combined.length === 0) {
                    tlContainer.innerHTML += '<div style="width: 100%; text-align: center;"><p style="color: var(--text-muted); font-size: 13px; padding: 20px 0; margin: 0;">履歴はありません。</p></div>';
                } else {
                    combined.forEach(item => {
                        const el = document.createElement('div');
                        el.className = 'activity-list-item';
                        // Inline styling for the passbook item
                        el.style.display = 'flex';
                        el.style.alignItems = 'center';
                        el.style.padding = '12px 0';
                        el.style.borderBottom = '1px solid var(--btn-secondary-border)';
                        el.style.gap = '12px';

                        let iconHtml = '';
                        let title = item.title || item.desc;
                        let amountStr = item.amount ? `¥${item.amount.toLocaleString()}` : '-';
                        let amountColor = 'var(--text-main)';
                        let statusHtml = '<span style="color: #10b981; font-weight: 300;">Successful</span>'; // default

                        if (item.type === 'invoice' || item.type === 'income') {
                            // Circular icon for deposit/income/invoice
                            iconHtml = `<div style="width: 32px; height: 32px; border-radius: 50%; background: rgba(29, 155, 240, 0.1); display: grid; place-items: center; color: var(--accent-neo-blue);"><i data-lucide="arrow-down-left" style="width: 16px; height: 16px; stroke-width: 2px;"></i></div>`;
                            amountColor = 'var(--accent-neo-blue)';
                            amountStr = `+${amountStr}`;
                        } else if (item.type === 'expense' || item.type === 'receipt' || item.type === 'labor') {
                            // Triangular icon for expense
                            iconHtml = `<div style="width: 32px; height: 32px; clip-path: polygon(50% 0%, 0% 100%, 100% 100%); background: rgba(245, 158, 11, 0.1); display: grid; place-items: center; color: #f59e0b; padding-top: 6px;"><i data-lucide="arrow-up-right" style="width: 14px; height: 14px; stroke-width: 2px;"></i></div>`;
                            amountStr = `-${amountStr}`;
                            // Example of a warning status for some expenses
                            if (item.amount > 50000) statusHtml = '<span style="color: #f59e0b; font-weight: 300;">Warning: High</span>';
                        } else {
                            // Square icon for generic documents
                            iconHtml = `<div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(139, 92, 246, 0.1); display: grid; place-items: center; color: #8b5cf6;"><i data-lucide="file-text" style="width: 16px; height: 16px; stroke-width: 1.5px;"></i></div>`;
                        }

                        el.innerHTML = `
                            ${iconHtml}
                            <div style=" min-width: 0; overflow: hidden; display: block; gap: 2px;">
                                <div style="font-size: 14px; font-weight: 600; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: -0.01em;">${title}</div>
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
                        item.style.display = text.includes(term) ? 'flex' : 'none';
                    });
                };
            }

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

    const onFabClick = (e) => {
        if (!fabButton) return;

        // 1. Add Bounce Animation
        fabButton.classList.remove('neo-bounce');
        // Trigger reflow to restart animation
        void fabButton.offsetWidth;
        fabButton.classList.add('neo-bounce');

        // 2. Hide bubble if open
        if (fabBubble) fabBubble.classList.remove('show');

        // 3. Navigate to chat after a brief delay for effect
        setTimeout(() => {
            switchView('view-expense');
            fabButton.classList.remove('neo-bounce'); // cleanup
        }, 600); // Wait for bounce to finish
    }

    if (fabButton) {
        fabButton.addEventListener('mouseenter', showFabMessage);
        fabButton.addEventListener('click', onFabClick);
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
            btnCloseSelector.addEventListener('click', () => {
                smartSelectorOverlay.classList.add('hidden');
            });
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
            modalNewProject.classList.add('show');
            const neoFab = document.getElementById('neo-fab-container');
            if (neoFab) neoFab.classList.add('hidden');

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
            const neoFab = document.getElementById('neo-fab-container');
            if (neoFab) neoFab.classList.remove('hidden');
        });
    }

    if (btnSaveProject) {
        btnSaveProject.addEventListener('click', () => {
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
            const neoFab = document.getElementById('neo-fab-container');
            if (neoFab) neoFab.classList.remove('hidden');

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

                // Populate edit fields
                const proj = mockDB.projects.find(p => p.id === currentOpenProjectId);
                if (proj && modalEditProject) {
                    document.getElementById('edit-proj-name').value = proj.name || '';
                    document.getElementById('edit-proj-location').value = proj.location || '';
                    document.getElementById('edit-proj-note').value = proj.note || '';
                    const editCat = document.getElementById('edit-proj-category');
                    if (editCat) editCat.value = proj.category || '';

                    modalEditProject.classList.add('show');
                    // Hide FAB in modal
                    document.getElementById('neo-fab-container')?.classList.add('hidden');
                }
            });
        }

        if (btnDeleteProj) {
            btnDeleteProj.addEventListener('click', () => {
                projectActionMenu.classList.add('hidden');
                if (modalDeleteConfirm) {
                    modalDeleteConfirm.classList.add('show');
                    document.getElementById('neo-fab-container')?.classList.add('hidden');
                }
            });
        }
    }

    // --- Edit logic ---
    const btnCloseEditModal = document.getElementById('btn-close-edit-modal');
    if (btnCloseEditModal) {
        btnCloseEditModal.addEventListener('click', () => {
            modalEditProject.classList.remove('show');
            document.getElementById('neo-fab-container')?.classList.remove('hidden');
        });
    }

    const btnUpdateProject = document.getElementById('btn-update-project');
    if (btnUpdateProject) {
        btnUpdateProject.addEventListener('click', () => {
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

                // Keep the color unchanged from creation, or default
                // Keep the unit logic unchanged or update based on category (optional, skipping complex logic here for brevity)

                // Close modal & Resync View
                modalEditProject.classList.remove('show');
                document.getElementById('neo-fab-container')?.classList.remove('hidden');

                renderProjects(mockDB.projects); // Ensure sites view is refreshed with new info
                window.openProjectDetail(currentOpenProjectId);
            }
        });
    }

    // --- Delete logic ---
    const btnCancelDelete = document.getElementById('btn-cancel-delete');
    if (btnCancelDelete) {
        btnCancelDelete.addEventListener('click', () => {
            modalDeleteConfirm.classList.remove('show');
            document.getElementById('neo-fab-container')?.classList.remove('hidden');
        });
    }

    const btnConfirmDelete = document.getElementById('btn-confirm-delete');
    if (btnConfirmDelete) {
        btnConfirmDelete.addEventListener('click', () => {
            // Remove from mock DB
            mockDB.projects = mockDB.projects.filter(p => p.id !== currentOpenProjectId);

            // Clean up related (optional, mock level)
            mockDB.documents = mockDB.documents.filter(d => d.projectId !== currentOpenProjectId);
            mockDB.transactions = mockDB.transactions.filter(t => t.projectId !== currentOpenProjectId);

            modalDeleteConfirm.classList.remove('show');
            document.getElementById('neo-fab-container')?.classList.remove('hidden');

            // Render updated list and return to sites view
            renderProjects(mockDB.projects);
            document.querySelector('[data-target=\'view-sites\']').click();
        });
    }

    // --- Document Generation Half-Modal Logic ---
    const modalDocGen = document.getElementById('modal-doc-gen');
    const btnCloseDocModal = document.getElementById('btn-close-doc-modal');
    const btnExecuteDocGen = document.getElementById('btn-execute-doc-gen');

    // Fallback amount logic for standard 1 million JPY per project (if missing)
    const TARGET_REVENUE = 1000000;

    window.openDocGenModal = () => {
        if (!currentOpenProjectId) return;

        const proj = mockDB.projects.find(p => p.id === currentOpenProjectId);
        if (!proj) return;

        // Reset steps
        const step1 = document.getElementById('doc-gen-step-1');
        const step2 = document.getElementById('doc-gen-step-2');
        if (step1 && step2) {
            step1.classList.remove('hidden');
            step2.classList.add('hidden');
        }

        // --- NEW: Dynamic Document Templates based on Industry ---
        const docSelect = document.getElementById('doc-gen-type');
        if (docSelect) {
            docSelect.innerHTML = ''; // Clear default
            const industry = mockDB.userConfig.industry || 'general';

            let optionsHTML = '';
            if (industry === 'construction') {
                optionsHTML = `
                    <option value="estimate">見積書 (人工指定)</option>
                    <option value="purchase_order">注文書 (材料費込み)</option>
                    <option value="invoice" selected>請求書 (出来高合算)</option>
                    <option value="delivery_note">完了報告書/納品書</option>
                    <option value="receipt">領収書</option>
                `;
            } else if (industry === 'freelance') {
                optionsHTML = `
                    <option value="estimate">見積書 (プロジェクト一式)</option>
                    <option value="invoice" selected>請求書 (源泉徴収対応)</option>
                    <option value="delivery_note">納品書 (データリンク記載)</option>
                    <option value="receipt">領収書</option>
                `;
            } else {
                // General Business
                optionsHTML = `
                    <option value="estimate">お見積書 (Estimate)</option>
                    <option value="purchase_order">ご発注書 (Purchase Order)</option>
                    <option value="invoice" selected>ご請求書 (Invoice)</option>
                    <option value="delivery_note">納品書 (Delivery Note)</option>
                    <option value="receipt">領収書 (Receipt)</option>
                `;
            }
            docSelect.innerHTML = optionsHTML;
        }

        // Auto-fill context
        document.getElementById('doc-gen-project-name').textContent = proj.name;

        // Calculate unbilled
        const invoices = mockDB.documents.filter(d => d.projectId === currentOpenProjectId && d.type === 'invoice');
        const billed = invoices.reduce((acc, curr) => acc + curr.amount, 0);
        const unbilled = Math.max(0, (proj.revenue || TARGET_REVENUE) - billed);

        document.getElementById('doc-gen-unbilled').textContent = `¥${unbilled.toLocaleString()}`;
        document.getElementById('doc-gen-amount').value = unbilled;

        // Show Modal
        if (modalDocGen) {
            modalDocGen.classList.add('show');
        }
    };

    window.closeDocGenModal = () => {
        if (modalDocGen) {
            modalDocGen.classList.remove('show');
        }
    };

    if (btnCloseDocModal) {
        btnCloseDocModal.addEventListener('click', window.closeDocGenModal);
    }

    // Close on backdrop click
    if (modalDocGen) {
        modalDocGen.addEventListener('click', (e) => {
            if (e.target === modalDocGen) {
                window.closeDocGenModal();
            }
        });
    }

    window.executeDocGen = () => {
        if (!currentOpenProjectId) return;

        const docSelect = document.getElementById('doc-gen-type');
        const docType = docSelect.value;
        const amount = parseInt(document.getElementById('doc-gen-amount').value) || 0;

        // Get the actual text label for the title
        const selectedOptionLabel = docSelect.options[docSelect.selectedIndex].text;

        // Create new mock document
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');

        const newDoc = {
            id: Date.now(),
            projectId: currentOpenProjectId,
            type: docType,
            title: `${selectedOptionLabel}発行 (Neo連携)`,
            amount: amount,
            date: `${yyyy}/${mm}/${dd}`,
            url: "local"
        };

        mockDB.documents.unshift(newDoc); // Add to beginning of mock db

        // Update the success title
        const successTitle = document.getElementById('success-doc-title');
        if (successTitle) successTitle.textContent = `${selectedOptionLabel}の生成完了`;

        // Switch to Step 2
        const step1 = document.getElementById('doc-gen-step-1');
        const step2 = document.getElementById('doc-gen-step-2');
        if (step1 && step2) {
            step1.classList.add('hidden');
            step2.classList.remove('hidden');
        }

        // Re-render the dashboard to see the new item
        window.openProjectDetail(currentOpenProjectId);
    };

    if (btnExecuteDocGen) {
        btnExecuteDocGen.addEventListener('click', window.executeDocGen);
    }

    // Wire up the Done button on Step 2
    const btnDoneDocModal = document.getElementById('btn-done-doc-modal');
    if (btnDoneDocModal) {
        btnDoneDocModal.addEventListener('click', window.closeDocGenModal);
    }

    // --- Expense Scanner Modal Logic ---
    const modalExpenseScanner = document.getElementById('modal-expense-scanner');
    const btnCloseExpenseModal = document.getElementById('btn-close-expense-modal');
    const btnExecuteExpense = document.getElementById('btn-execute-expense');

    window.openExpenseScannerModal = () => {
        if (!currentOpenProjectId) return;

        // Randomize the mock extract values a bit for realism
        const amounts = [15400, 3200, 19800, 840, 50000];
        const stores = ["ホームセンター コーナン", "Cafe Renoir", "Amazon Web Services", "タクシー (GO)", "〇〇建設資材"];
        document.getElementById('expense-modal-amount').value = amounts[Math.floor(Math.random() * amounts.length)];
        document.getElementById('expense-modal-store').value = stores[Math.floor(Math.random() * stores.length)];

        if (modalExpenseScanner) {
            modalExpenseScanner.classList.add('show');
        }
    };

    window.closeExpenseScannerModal = () => {
        if (modalExpenseScanner) {
            modalExpenseScanner.classList.remove('show');
        }
    };

    if (btnCloseExpenseModal) {
        btnCloseExpenseModal.addEventListener('click', window.closeExpenseScannerModal);
    }

    if (modalExpenseScanner) {
        modalExpenseScanner.addEventListener('click', (e) => {
            if (e.target === modalExpenseScanner) {
                window.closeExpenseScannerModal();
            }
        });
    }

    if (btnExecuteExpense) {
        btnExecuteExpense.addEventListener('click', () => {
            if (!currentOpenProjectId) return;

            const dateStr = document.getElementById('expense-modal-date').value || "2026/03/11";
            const storeName = document.getElementById('expense-modal-store').value || "経費";
            const amount = parseInt(document.getElementById('expense-modal-amount').value) || 0;

            const newTx = {
                id: Date.now(),
                projectId: currentOpenProjectId,
                type: "expense",
                title: `${storeName} (領収書AI抽出)`,
                amount: amount,
                date: dateStr
            };

            // Add the new transaction to mock data
            mockDB.transactions.unshift(newTx);

            window.closeExpenseScannerModal();

            // Re-render completely so Wallet global totals update
            renderProjects(mockDB.projects);

            // Re-open exactly the current project to refresh the timeline
            window.openProjectDetail(currentOpenProjectId);

            // Trigger Neo subtle toast
            const neoFabBubble = document.getElementById('neo-fab-bubble');
            if (neoFabBubble) {
                neoFabBubble.textContent = `⚡️ 経費 ${amount.toLocaleString()}円 を計上し、全体利益から差し引いたよ。`;
                neoFabBubble.classList.add('show');
                setTimeout(() => {
                    neoFabBubble.classList.remove('show');
                }, 3000);
            }
        });
    }

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
            const expenses = mockDB.transactions.filter(t => t.type === 'expense');
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
                block.style.display = 'flex';
                block.style.flexDirection = 'column';
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
            const mainApp = document.querySelector('.app-container');
            const bottomNav = document.getElementById('bottom-nav');
            if (mainApp) mainApp.style.display = 'none';
            if (bottomNav) bottomNav.style.display = 'none';
            a4Container.classList.remove('hidden');

            // Set current date on print header
            const pd = document.getElementById('a4-print-date');
            if (pd) pd.textContent = "抽出日: " + new Date().toLocaleDateString('ja-JP');

            // Delay print slightly for DOM to settle
            setTimeout(() => {
                window.print();

                // Restore view after print dialog closes
                if (mainApp) mainApp.style.display = '';
                if (bottomNav) bottomNav.style.display = '';
                a4Container.classList.add('hidden');
                document.body.style.overflow = '';

                // Feedback
                const neoFabBubble = document.getElementById('neo-fab-bubble');
                if (neoFabBubble) {
                    neoFabBubble.textContent = `⚡️ 税理士専用PDFファイルレイアウトを生成したよ。`;
                    neoFabBubble.classList.add('show');
                    setTimeout(() => {
                        neoFabBubble.classList.remove('show');
                    }, 4000);
                }
            }, 300);
        });
    }

    // Initialize Icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // Debug toggle to reset setup
    window.resetSetup = () => {
        localStorage.removeItem('fini_setup_complete');
        location.reload();
    };
});
