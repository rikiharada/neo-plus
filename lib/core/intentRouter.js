import { supabase } from '../supabase-client.js';

/**
 * parseInputToData の単体オブジェクト { intent, projectName, amounts, ... } を
 * handleInstruction が期待する { action: 'ADD_EXPENSE', ... } に揃える。
 */
function normalizeParseInputDataToActions(item, sourceText) {
    if (!item || typeof item !== 'object' || item.action) return item;
    const intent = item.intent;
    if (!intent) return item;

    if (intent === 'ADD_EXPENSE' && !item.isRevenue) {
        return {
            ...item,
            action: 'ADD_EXPENSE',
            project_name: item.project_name || item.projectName || null,
            title: item.title || item.category || (typeof item.raw === 'string' ? item.raw.slice(0, 120) : '') || '経費',
            amount: typeof item.amount === 'number' ? item.amount : 0,
            amounts: Array.isArray(item.amounts) ? item.amounts : [],
            category: item.category || 'その他',
            type: item.type || 'expense',
            is_bookkeeping: item.is_bookkeeping !== false,
            _sourceText: sourceText
        };
    }

    return {
        ...item,
        action: intent,
        project_name: item.project_name || item.projectName || null
    };
}

// Phase 2: Layer 1 & 2 Intent Routing (意図判定レイヤー)
// このモジュールは一切のUI操作に関与せず、「ユーザーの入力がどのような意図か」を判定し、標準化されたIntent配列を返します。
// モットー「あなたの手のひらに最高のマネーマネジメントを」を実現するため、
// 高速なルールベース(Layer 1)と高度なAI解釈(Layer 2)の二層構造で「手間ゼロUX」を提供します。

export async function understandIntent(text, hasImage, contextData) {
    if (!text && !hasImage) return [];

    // --- セーフティ層 (Compliance) ---
    const COMPLIANCE_BLACKLIST = [
        "裏金", "脱税", "粉飾", "マネロン", "キックバック", "マネーロンダリング", 
        "架空請求", "横領", "脱法", "裏帳簿",
        "風俗", "アダルト", "エロ", "パパ活", "ギャラ飲み", "キャバクラ", "ソープ"
    ];

    const matchedToxicKw = COMPLIANCE_BLACKLIST.find(keyword => text.includes(keyword));
    if (matchedToxicKw) {
        return [{ action: "COMPLIANCE_VIOLATION", text: matchedToxicKw }];
    }

    // ==========================================
    // Layer 1: Rule-Based Routing (高速・低コスト・APIゼロ)
    // ==========================================

    const _toHalfDigits = (s) => String(s || '').replace(/[０-９]/g, (ch) => String('０１２３４５６７８９'.indexOf(ch)));

    /** 日本語の万・億・千を含む金額を円の数値に */
    const _parseJpMoney = (numStr, unit) => {
        const raw = _toHalfDigits(String(numStr || '')).replace(/[,，]/g, '');
        let n = parseInt(raw, 10);
        if (Number.isNaN(n)) n = 0;
        if (unit === '万') n *= 10000;
        else if (unit === '億') n *= 100000000;
        else if (unit === '千') n *= 1000;
        return n;
    };

    /**
     * 経費カテゴリ語＋金額の組を文中からすべて拾う（句読点で複数文があっても可）
     * 例: 「経費は材料費50万。人件費が10万。」→ 2件
     */
    const _EXPENSE_CATEGORY_RE = new RegExp(
        '(材料費|人件費|交通費|外注費|雑費|備品費|通信費|消耗品費|広告宣伝費|地代家賃|水道光熱費|租税公課|仕入高|経費)' +
            '(?:が|は|の|を|に|って|、|,)?\\s*([0-9０-９,，]+)\\s*(万|億|千)?',
        'g'
    );

    const _extractLayer1ExpenseLineItems = (raw) => {
        const t = String(raw || '');
        const items = [];
        let m;
        const re = new RegExp(_EXPENSE_CATEGORY_RE.source, 'g');
        while ((m = re.exec(t)) !== null) {
            const label = m[1];
            const amt = _parseJpMoney(m[2], m[3] || '');
            if (amt > 0) items.push({ label, amount: amt });
        }
        return items;
    };

    /** 経費モードのシグナル（フォルダ作成より優先） */
    const _EXPENSE_SIGNAL =
        /経費|材料費|人件費|交通費|外注費|仕入|出費|諸経費|消耗品|光熱|地代|租税|雑費|備品費|通信費/.test(text);

    // 複雑なクエリ（複数要素、長文）は意図的にLayer 2 (AI) に回すためのフラグ
    const isComplexQuery = text.includes('、') || text.includes('。') || (text.match(/[0-9,０-９]+/g) || []).length > 1;

    // --- Layer 1.0: 経費ドミナント（複数金額・句読点があっても CREATE_PROJECT より先に固定） ---
    const _questionExpense = /[?？]$/.test(text.trim()) || /は何|って何|について教えて|とは何|落とせる|控除できます|経費にな/.test(text);
    if (_EXPENSE_SIGNAL && !_questionExpense) {
        const lineItems = _extractLayer1ExpenseLineItems(text);
        if (lineItems.length >= 1) {
            const amounts = lineItems.map((row) => ({ label: row.label, value: row.amount }));
            return [
                {
                    action: 'ADD_EXPENSE',
                    title: lineItems.map((r) => r.label).join('・'),
                    amount: lineItems[0].amount,
                    amounts,
                    category: lineItems[0].label || '経費',
                    type: 'expense',
                    is_bookkeeping: true,
                    is_silent: true
                }
            ];
        }
    }

    // 1. Compound Pattern (プロジェクト・フォルダ作成 + 経費追加)
    const compoundMatch = text.match(/(?:「([^」]+)」|([^\s]+?))(?:という|で)(?:フォルダ|プロジェクト|現場)を?(?:作って|作成して|立ち上げて|開始して|開始)(.*?(?:追加|計上).*)/);
    if (compoundMatch) {
        const newProjectName = compoundMatch[1] || compoundMatch[2];
        const expenseText = compoundMatch[3];

        let finalAmount = 0;
        const amountMatch = expenseText.match(/\d+/);
        if (amountMatch) {
            finalAmount = parseInt(amountMatch[0], 10);
        }

        let finalTitle = expenseText
            .replace(/[、,。]/g, '')
            .replace(/追加して/g, '')
            .replace(/追加/g, '')
            .replace(/計上して/g, '')
            .replace(/計上/g, '')
            .replace(newProjectName, '')
            .trim();

        return [
            { action: "CREATE_PROJECT", project_name: newProjectName },
            { action: "ADD_EXPENSE", project_name: newProjectName, amount: finalAmount, title: finalTitle, type: "expense", is_compound: true }
        ];
    }

    // 2. Navigation Match (UI遷移)
    const navMatch = text.match(/(ホーム|ダッシュボード|トップ|プロジェクト|プロジェクト一覧|現場|現場一覧|一覧|設定|プロファイル|アカウント)\s*(に|へ)?(戻して|戻る|見せて|開いて|いって|いく)/);
    if (navMatch) {
        const keyword = navMatch[1];
        let targetView = null;
        if (keyword.includes('ホーム') || keyword.includes('ダッシュボード') || keyword.includes('トップ')) targetView = 'view-dash';
        else if (keyword.includes('プロジェクト') || keyword.includes('現場') || keyword.includes('一覧')) targetView = 'view-sites';
        else if (keyword.includes('設定') || keyword.includes('プロファイル') || keyword.includes('アカウント')) targetView = 'view-settings';

        if (targetView) {
            return [{ action: "NAVIGATE", target_view: targetView }];
        }
    }

    // 3. Simple Create Project (Regex directly first)
    const createExactMatch = text.match(/(?:「([^」]+)」|([^\s]+?))(?:という|で)(?:フォルダ|プロジェクト|現場)を?(?:作って|作成して|作成|立ち上げて|開始して|開始)(?!.*(?:追加|計上))/);
    if (createExactMatch && !isComplexQuery) {
        return [{ action: "CREATE_PROJECT", project_name: createExactMatch[1] || createExactMatch[2] }];
    }

    const commandData = window.parseCommand ? window.parseCommand(text) : {};
    const hasActionVerb = /(作って|新規|作成|立ち上げて|が入った|決まった|する|はいいた|はいいった|入った|決定|儲かった|ゲット|プロジェクト開始|開始)/.test(text);
    // 疑問文判定: Layer 1 でも CREATE_PROJECT 誤分類を防ぐ（Layer 2 のポストフィルターより前に実行）
    const _isQuestionL1 = /[?？]$/.test(text.trim()) || /は何|って何|について教えて|とは何|でいい|できる|落とせる|控除|経費にな/.test(text);
    if (!isComplexQuery && !_isQuestionL1 && commandData && (commandData.date || commandData.location || hasActionVerb)) {
        return [{
            action: "CREATE_PROJECT",
            project_name: commandData.title,
            date: commandData.date,
            location: commandData.location
        }];
    }

    // 3.5 Quick Expense Addition Rules (汎用経費追加キーワード)
    const expenseMatch = text.match(/(?:経費|出費|タクシー代|電車代|飲食代|交通費|備品代)(?:.+)?追加/);
    if (expenseMatch && !isComplexQuery) {
         // Return raw add expense, local parser might enrich it later
         return [{ action: "ADD_EXPENSE", title: "経費", is_silent: true }];
    }

    // 4. Aggregate Match (集計処理)
    const aggregateMatch = text.match(/(?:「([^」]+)」|([^\s]+?))(?:の請求書まとめて|を合計して|の集計|の合計)/);
    if (aggregateMatch) {
        return [{ action: "AGGREGATE_EXPENSES", project_name: aggregateMatch[1] || aggregateMatch[2] }];
    }

    // 5. Invoice/Doc Match (書類作成・生成・プレビュー・見積もり)
    const docMatch = text.match(/(?:「([^」]+)」|([^\s]+?))の(請求書|見積書|見積もり|書類)(?:を作って|作成して|作って|プレビュー|生成して|生成).*/);
    if (docMatch) {
        const projectName = docMatch[1] || docMatch[2];
        const docKeyword = docMatch[3];
        let docType = "invoice";
        if (docKeyword.includes('見積')) docType = 'estimate';
        else if (docKeyword.includes('領収')) docType = 'receipt';
        
        return [{ action: "GENERATE_DOCUMENT", document_type: docType, project_name: projectName }];
    }

    // 6. Navigation Project Search Match (完全一致でのプロジェクト遷移)
    const matchedProjectId = window.findProjectIdByName ? window.findProjectIdByName(text) : null;
    if (matchedProjectId) {
        return [{ action: "NAVIGATE_PROJECT", project_id: matchedProjectId }];
    }

    // 7. Local Express Parsing (単純な経費追加などはローカルパーサーで完結させる)
    if (!hasImage && !isComplexQuery) {
        let parsedItems = null;
        if (typeof window.parseLocallyWithKnowledge === 'function') {
            parsedItems = await window.parseLocallyWithKnowledge(text);
        } else if (typeof window.parseLocally === 'function') {
            parsedItems = window.parseLocally(text);
        }

        // Actionが取れた場合はLayer 1で完結（サイレント実行）
        if (parsedItems && Array.isArray(parsedItems) && parsedItems.length > 0) {
            parsedItems.forEach(i => i.is_silent = true);
            return parsedItems;
        }
    }

    // ==========================================
    // Layer 2: LLM Routing (AI・相談・高度な文脈解釈)
    // ==========================================
    // Layer 1 で処理しきれなかったもの、画像付きのもの、複雑な質問・相談はすべてここへ
    
    let intents = [{ action: "UNKNOWN" }];

    // ── クライアント側プリフィルター: Neoへの質問パターン ─────────────────
    // Geminiに送る前に「Neoへの直接質問」を検出して UNKNOWN に短絡させる。
    // これにより、「ネオは何ができるの？」が CREATE_PROJECT に誤分類されるのを防ぐ。
    const _neoQuestionPatterns = [
        /^(neo|ネオ)[はがの]?(何|なに|どう|どんな|できる|機能|使い方|教えて|について|とは|って何|ってなに)/i,
        /^(何ができ|何をして|何をやって|できること|機能は)/i,
        /^(使い方|how to use|what can you)/i,
    ];
    if (_neoQuestionPatterns.some(p => p.test(text.trim()))) {
        console.log('[IntentRouter] Neo self-reference detected → UNKNOWN (think_consult)');
        return [{ action: "UNKNOWN", ui_action: 'think_consult' }];
    }

    if (hasImage) {
        // 画像がある場合は現時点ではAI(LLM)の画像解析に流すか、将来のOcrEndpointへ
        return intents;
    }

    const stateMemory = JSON.stringify({
        active_projects: contextData?.activeProjects || [], 
        recent_transactions: contextData?.recentTransactions || [] 
    });

    try {
        // AIに解釈をオフロード
        let geminiResult;
        if (typeof window.determineRouteFromIntent === 'function') {
            geminiResult = await window.determineRouteFromIntent(text, contextData?.industry || 'default', stateMemory, new Date().toLocaleString('ja-JP'));
        } else if (typeof window.parseInputToData === 'function') {
            geminiResult = await window.parseInputToData(text);
        } else {
            return [{ action: "UNKNOWN", text: text, note: "No AI endpoint available" }];
        }

        intents = Array.isArray(geminiResult) ? geminiResult : [geminiResult];
        intents = intents.map((it) => normalizeParseInputDataToActions(it, text));

        // ── ポストフィルター: CREATE_PROJECT 誤分類を二重チェック ──────────
        // プロジェクト名が「Neo/ネオ」またはテキストが疑問文の場合は UNKNOWN に格下げ
        const _badProjectName = /^(neo|ネオ|何|なに|できる|機能|広告|経費|税|落とせ|控除)/i;
        const _isQuestion = /[?？]$/.test(text.trim()) || /は何|について|教えて|とは|って何|落とせる|経費にな|控除|できます/.test(text);
        intents = intents.map(intent => {
            if (intent.action === 'CREATE_PROJECT') {
                const pName = intent.project_name || '';
                if (_badProjectName.test(pName.trim()) || _isQuestion) {
                    console.warn('[IntentRouter] CREATE_PROJECT post-filter: suspicious name or question detected → UNKNOWN', pName);
                    return { action: 'UNKNOWN', ui_action: 'think_consult' };
                }
            }
            return intent;
        });

        // Layer 2を通ったものはUIで「考えている」「相談に乗っている」感を出すため
        // `think_consult` アクションを付与してチャットUXをリッチにする
        const hasConsult = intents.some(a => a.action === 'CONSULT' || a.action === 'UNKNOWN');
        if (hasConsult) {
            intents.forEach(i => i.ui_action = 'think_consult');
        } else {
            // AIが純粋なアクションと判断した場合も、サイレント実行のフラグとして安全に制御
            intents.forEach(i => i.is_silent = true);
        }
    } catch (aiError) {
        console.error("Layer 2 AI Error:", aiError);
        // APIキー未設定エラーは専用アクションとして返す（UI側でセットアップ案内が出せるよう）
        if (aiError?.message?.includes('No API Key') || aiError?.message?.includes('NO_API_KEY')) {
            return [{ action: "UNKNOWN_ERROR", errorType: "NO_API_KEY" }];
        }
        return [{ action: "UNKNOWN_ERROR" }];
    }

    return intents;
}
