import { supabase } from '../supabase-client.js';

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
    
    // 複雑なクエリ（複数要素、長文）は意図的にLayer 2 (AI) に回すためのフラグ
    const isComplexQuery = text.includes('、') || text.includes('。') || (text.match(/[0-9,０-９]+/g) || []).length > 1;

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
    if (!isComplexQuery && commandData && (commandData.date || commandData.location || hasActionVerb)) {
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
        return [{ action: "UNKNOWN_ERROR" }];
    }

    return intents;
}
