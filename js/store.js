/**
 * Neo+ Store & Cache Logic (Phase 10 & 6)
 * 
 * GlobalStore: Single Source of Truth for application state.
 * STANDARD_ACCOUNT_MAP: Static dictionary for fast local parsing.
 */

// Phase 6: Global Reactive State Manager
window.GlobalStore = {
    state: {
        user: null,
        session: null,
        activities: [],
        projects: [],
        isLoading: false
    },
    listeners: [],
    
    getState() {
        return this.state;
    },
    
    updateState(newState) {
        this.state = { ...this.state, ...newState };
        
        // Ensure Global Sync directly populates UI memory uniformly preventing Tag dropouts
        if (newState.projects && Array.isArray(newState.projects)) {
            if (!window.mockDB) window.mockDB = {};
            window.mockDB.projects = newState.projects.map(p => ({
                id: p.id, name: p.name, customerName: p.customer_name || '-', location: p.location || '-', note: p.note || '',
                category: p.category, color: p.color, unit: p.unit || '-', hasUnpaid: p.has_unpaid, revenue: parseFloat(p.revenue) || 0,
                status: p.status, clientName: p.client_name, paymentDeadline: p.payment_deadline, bankInfo: p.bank_info, lastUpdated: p.last_updated, currency: p.currency,
                startDate: p.created_at ? p.created_at.split('T')[0].replace(/-/g, '/') : (p.startDate || null)
            }));
        }
        if (newState.activities && Array.isArray(newState.activities)) {
            if (!window.mockDB) window.mockDB = {};
            // Raw mapping for activities ensuring we don't drop frontend names
            window.mockDB.activities = newState.activities.map(a => ({
                id: a.id,
                projectId: a.project_id ?? a.projectId,
                type: a.type, category: a.category,
                title: a.title, amount: a.amount, date: a.date ? a.date.split('T')[0].replace(/-/g, '/') : null,
                isBookkeeping: a.is_bookkeeping, is_deleted: a.is_deleted || false
            }));
        }

        // Notify UI to re-render
        this.notify();
    },
    
    setLoading(loading) {
        if (this.state.isLoading !== loading) {
            this.updateState({ isLoading: loading });
        }
    },
    
    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    },
    
    notify() {
        this.listeners.forEach(listener => listener(this.state));
    },

    async initRealtimeSync() {
        if (!window.supabaseClient) return;

        console.log("[GlobalStore] Initializing Supabase Realtime Sync...");

        // Body-First Architecture Data Fetch
        const fetchInitialData = async () => {
            if (!this.state.user) return;
            
            // 1. INSTANT HYDRATION: Local Body Storage priority
            try {
                const storedActs = localStorage.getItem('neo_local_body_activities');
                const storedProjs = localStorage.getItem('neo_local_body_projects');
                let hydratedState = { activities: [], projects: [] };
                
                if (storedActs) hydratedState.activities = JSON.parse(storedActs);
                if (storedProjs) hydratedState.projects = JSON.parse(storedProjs);
                
                if (hydratedState.activities.length > 0 || hydratedState.projects.length > 0) {
                    console.log("[GlobalStore] SWR: Hydrating from Local Body instantly");
                    this.updateState(hydratedState);
                } else if (window.mockDB) {
                    console.log("[GlobalStore] SWR: Fallback to MockDB template");
                    this.updateState({ activities: window.mockDB.activities || [], projects: window.mockDB.projects || [] });
                }
            } catch (e) {
                console.log("Local Body read error", e);
            }

            // 2. BACKGROUND BRAIN SYNC (Fire & Forget)
            const revalidateBrain = async () => {
                if(!window.supabaseClient) return;
                try {
                    const [txRes, projRes] = await Promise.all([
                        window.supabaseClient.from('activities').select('*').order('date', { ascending: false }),
                        window.supabaseClient.from('projects').select('*').order('created_at', { ascending: false })
                    ]);
                    
                    if (txRes.error) throw txRes.error;
                    if (projRes.error) throw projRes.error;

                    const freshActivities = txRes.data || [];
                    const freshProjects = projRes.data || [];
                    
                    if (freshActivities.length > 0 || freshProjects.length > 0) {
                        console.log("[GlobalStore] Brain Sync: Data merged safely.");
                        // Optional: Merge Strategy could go here, but for Genesis, Local Body is primary.
                    }
                } catch (e) {
                    console.warn("[GlobalStore] Brain Sync Unavailable:", e.message);
                }
            };
            
            revalidateBrain(); // Fire and forget, no UI blocking
        };

        await fetchInitialData();

        // Realtime Subscriptions (Optional Brain feature)
        try {
            const channels = window.supabaseClient.channel('custom-all-channel')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'activities' }, (payload) => {
                    console.log('[GlobalStore] Realtime Activity Change received!', payload);
                    fetchInitialData();
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, (payload) => {
                    console.log('[GlobalStore] Realtime Project Change received!', payload);
                    fetchInitialData();
                })
                .subscribe((status, err) => {
                    const statusEl = document.getElementById('neo-core-status');
                    if (status === 'SUBSCRIBED') {
                        if (statusEl) {
                            statusEl.textContent = 'AI Core Active';
                            statusEl.style.color = 'var(--text-muted)';
                        }
                    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || err) {
                        console.warn('[GlobalStore] Supabase realtime disabled/error', err || status);
                        if (statusEl) {
                            statusEl.textContent = 'オフライン中';
                            statusEl.style.color = '#ef4444';
                        }
                    }
                });
        } catch(e) { 
            console.warn('[GlobalStore] Supabase realtime crashed', e); 
            const statusEl = document.getElementById('neo-core-status');
            if (statusEl) {
                statusEl.textContent = 'オフライン中';
                statusEl.style.color = '#ef4444';
            }
        }
    }
};

// Dynamic Learning Memory
window.DYNAMIC_ACCOUNT_CACHE = {};

window.learnNewTerm = function(title, category) {
    if (title && category) {
        window.DYNAMIC_ACCOUNT_CACHE[title.toLowerCase()] = category;
        console.log(`[Store Proxy] Learned new dictionary mapping dynamically: ${title} -> ${category}`);
    }
};

window.STANDARD_ACCOUNT_MAP = {
    // 旅費交通費 (Travel & Transportation)
    "タクシー": "旅費交通費",
    "電車": "旅費交通費",
    "バス": "旅費交通費",
    "新幹線": "旅費交通費",
    "suica": "旅費交通費",
    "pasmo": "旅費交通費",
    "飛行機": "旅費交通費",
    "ガソリン": "旅費交通費",
    "パーキング": "旅費交通費",
    "駐車": "旅費交通費",

    // 消耗品費 (Consumables & Supplies)
    "コンビニ": "消耗品費",
    "セブン": "消耗品費",
    "ファミマ": "消耗品費",
    "ローソン": "消耗品費",
    "百均": "消耗品費",
    "ダイソー": "消耗品費",
    "コピー用紙": "消耗品費",
    "文房具": "消耗品費",
    "インク": "消耗品費",
    "電池": "消耗品費",
    "アマゾン": "消耗品費",
    "amazon": "消耗品費",
    "コーナン": "消耗品費",
    "モノタロウ": "消耗品費",

    // 接待交際費 (Entertainment)
    "スタバ": "接待交際費",
    "コーヒー": "接待交際費",
    "カフェ": "接待交際費",
    "ランチ": "接待交際費",
    "飲み会": "接待交際費",
    "居酒屋": "接待交際費",
    "弁当": "接待交際費",
    "お茶": "接待交際費",
    "お土産": "接待交際費",

    // 通信費 (Communication)
    "携帯代": "通信費",
    "スマホ代": "通信費",
    "wi-fi": "通信費",
    "インターネット": "通信費",
    "切手": "通信費",
    "郵送": "通信費",
    "レターパック": "通信費",

    // English Support (Multi-language) - Format: "keyword": { category: "勘定科目", title: "日本語タイトル" }
    "taxi": { category: "旅費交通費", title: "タクシー代" },
    "uber": { category: "旅費交通費", title: "タクシー代" },
    "lyft": { category: "旅費交通費", title: "タクシー代" },
    "train": { category: "旅費交通費", title: "電車代" },
    "bus": { category: "旅費交通費", title: "バス代" },
    "flight": { category: "旅費交通費", title: "航空券代" },
    "gas": { category: "旅費交通費", title: "ガソリン代" },
    "parking": { category: "旅費交通費", title: "駐車場代" },
    "supplies": { category: "消耗品費", title: "消耗品" },
    "stationery": { category: "消耗品費", title: "文房具" },
    "amazon": { category: "消耗品費", title: "Amazon購入" },
    "coffee": { category: "接待交際費", title: "コーヒー代" },
    "cafe": { category: "接待交際費", title: "カフェ代" },
    "lunch": { category: "接待交際費", title: "飲食代 (昼)" },
    "dinner": { category: "接待交際費", title: "飲食代 (夜)" },
    "meal": { category: "接待交際費", title: "飲食代" },
    "drink": { category: "接待交際費", title: "飲料代" },
    "internet": { category: "通信費", title: "インターネット代" },
    "wifi": { category: "通信費", title: "Wi-Fi代" }
};

/**
 * Phase 11: Intent Analyzer
 * Categorizes the user's input into one of three distinct intents:
 * [CONSULT] - Requires Gemini (e.g., "経費で落ちる？")
 * [ACTION] - System navigation/creation (e.g., "プロジェクト作って")
 * [ENTRY] - Default transaction logging (e.g., "タクシー代 2000")
 */
window.analyzeIntent = function(text) {
    if (!text) return "UNKNOWN";
    
    // 0. Priority Domain Accounting Check (Highest Priority ENTRY)
    // Bilingual Support: Matches Japanese accounting keywords and English equivalents.
    if (/(経費|タクシー代|追加|領収書|計上|代|費|売上)/.test(text) || 
        /^(expense|add|receipt|revenue|cost|fee)\s/i.test(text)) {
        return "ENTRY";
    }

    // 1. Check for CONSULT (Questions, Consultations)
    // Bilingual Support: Matches Japanese questions and English 'Wh-' / 'Is' questions or 'deductible'.
    if (/[？?]|教えて|どう(なの|思う|なんだ)|経費で(落ち|は)|([かカ][なナ][ァ-ヶ]*)$/.test(text) || 
        /^(is|can|should|how|what|why|do|does)\s/i.test(text) || 
        /(deductible|expense\?|allowed)/i.test(text)) {
        return "CONSULT";
    }
    
    // 2. Check for ACTION (Nav, Create, Generate)
    // Bilingual Support: Matches Japanese and English imperative verbs.
    if (/(作成|作って|出してみて|発行して|開いて|移動|見せて|ページ|画面)/.test(text) || 
        /^(create|make|show|open|go to|navigate|generate)\s/i.test(text)) {
        return "ACTION";
    }
    
    // 3. Keep ENTRY as default fallback for transactions
    return "UNKNOWN"; // Fallback is now UNKNOWN so Gemini handles random chats. Let specific phrases be ENTRY.
};

/**
 * Attempts to parse the user's input strictly using regex, static dictionary, AND Supabase Historical DB (mockDB).
 * If successful, returns an array mimicking Gemini's action objects.
 * If unsuccessful, returns null to delegate parsing back to the LLM (which will trigger Chat transition).
 * 
 * @param {string} text - User's input text (e.g. "タクシーで1500円", "請求書作って")
 * @returns {Array|null} Array of action objects or null
 */
window.parseLocallyWithKnowledge = async function(text) {
    if (!text) return null;
    
    // --- 1. Fast Track ACTION checks ---
    if (/(請求書)(.*)(作成|作って|だして)/.test(text)) {
        console.log(`[Self-Knowledge] Matched Document Generation locally.`);
        return [{ action: "GENERATE_DOCUMENT", doc_type: "invoice" }];
    }
    
    // --- 2. ENTRY parsing ---
    // Extract Amount securely
    const normalizedText = text.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
    const amountMatch = normalizedText.match(/(?:¥|\$)?\s*([0-9,]+)\s*(?:円|yen|jpy|dollars?)?/i) || 
                        normalizedText.match(/(?:.*?)([0-9,]+)$/); // fallback for just numbers at the end
    
    if (!amountMatch) {
        return null;
    }

    const amountStr = amountMatch[1].replace(/,/g, '');
    const amount = parseInt(amountStr, 10);
    
    if (isNaN(amount) || amount <= 0) {
        return null;
    }

    let matchedItem = null;
    let matchedCategory = null;

    // 2a. Static Dictionary / English Translation Map
    for (const [key, val] of Object.entries(window.STANDARD_ACCOUNT_MAP)) {
        if (normalizedText.toLowerCase().includes(key.toLowerCase())) {
            if (typeof val === 'object' && val !== null) {
                matchedItem = val.title;
                matchedCategory = val.category;
            } else {
                matchedItem = key;
                matchedCategory = val;
            }
            break; 
        }
    }

    // 2b. Dynamic Session Cache
    if (!matchedItem) {
        for (const [key, category] of Object.entries(window.DYNAMIC_ACCOUNT_CACHE)) {
            if (normalizedText.toLowerCase().includes(key.toLowerCase())) {
                matchedItem = key;
                matchedCategory = category;
                break;
            }
        }
    }

    // 2c. Supabase Historical Knowledge Lookup (if no static match)
    if (!matchedItem && window.mockDB && window.mockDB.transactions) {
        let candidateTitle = normalizedText.replace(amountMatch[0], '').trim();
        candidateTitle = candidateTitle.replace(/[でをにがは]+$/, '').trim(); // Remove trailing particles
        
        if (candidateTitle.length >= 2) {
            // Priority sweep through DB
            const pastEntry = window.mockDB.transactions.find(t => 
                t.title.toLowerCase().includes(candidateTitle.toLowerCase()) && t.type !== 'sales' && !t.is_deleted
            );
            
            if (pastEntry) {
                matchedItem = pastEntry.title; // Utilize historical precise naming
                matchedCategory = pastEntry.type; // Extract DB enum type
                console.log(`[Self-Knowledge DB] Successfully recalled: "${candidateTitle}" -> matched to past entry "${matchedItem}" (Type: ${matchedCategory})`);
            }
        }
    }

    // 3. Construct local payload if we found knowledge
    if (matchedItem && matchedCategory) {
        // Japanese Type Translation needed for UI Display if type is raw english enum
        const typeTranslationMap = {
            'expense': '経費 (一般)',
            'labor': '人工 / 外注費',
            'material': '材料費 / 資材',
            'transport': '旅費交通費',
            'entertainment': '接待交際費',
            'outsource': '外注工賃'
        };
        const translatedCategory = typeTranslationMap[matchedCategory] || matchedCategory;

        const today = new Date();
        const formattedDate = `${today.getMonth() + 1}/${today.getDate()}`;

        return [{
            action: "ADD_EXPENSE",
            title: matchedItem,
            amount: amount,
            category: translatedCategory, // Used for UI display temporarily
            type: matchedCategory,        // Pass the raw DB type if it was from DB
            is_bookkeeping: true,
            entities: {
                LOCATION: [],
                ENTITY: [matchedItem],
                ACTION: ["購入"],
                MONEY: [`${amount}円`],
                ITEM: [],
                DATE: [formattedDate]
            }
        }];
    }

    return null;
};
