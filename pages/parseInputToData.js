/**
 * Neo+ Tag Extraction Engine v2.0
 * 8-category structured tagging from free-form Japanese text.
 *
 * Layer 1: Keyword rule-based (instant, offline)
 * Layer 2: Gemini LLM fallback (async, for ambiguous cases)
 *
 * Output schema:
 * {
 *   date:        string|null,       // 日付 "YYYY/MM/DD"
 *   amount:      number|null,       // 金額 (yen integer)
 *   amounts:     [{value, label}],  // 複数金額 (交通費10000, 人件費20000 etc.)
 *   category:    string|null,       // 科目/カテゴリ (交通費, 人件費 etc.)
 *   location:    string|null,       // 場所/地名
 *   projectName: string|null,       // 作業/プロジェクト名
 *   entities:    string[],          // 固有名詞 (people, companies, products)
 *   isRevenue:   boolean,           // 売上/収入フラグ
 *   docType:     string|null,       // 書類関連 (請求書, 見積書 etc.)
 *   intent:      string,            // CREATE_PROJECT | ADD_EXPENSE | ADD_REVENUE | GENERATE_DOCUMENT | QUERY | UNKNOWN
 *   raw:         string             // original input
 * }
 */

// ─── Constants ───────────────────────────────────────────────────────────────

const REVENUE_KEYWORDS = [
    '売上', '入金', '振込', '受取', '頂いた', 'いただいた', '収入', '報酬', '請求', '回収',
    '売れた', '売った', '受注', '受注金', '契約金', 'もらった', '入った'
];

const EXPENSE_KEYWORDS = [
    '経費', '支払', '払った', '購入', '買った', '代金', '費用', '支出', '出費',
    '代', '費', '料', '代', '交通費', '人件費', '材料費', '外注費', '消耗品', '雑費'
];

const DOC_TYPE_MAP = {
    '請求書': '請求書', '請求': '請求書',
    '見積書': '見積書', '見積もり': '見積書', '見積': '見積書',
    '領収書': '領収書', '領収': '領収書',
    '納品書': '納品書', '納品': '納品書',
    '発注書': '発注書', '発注': '発注書',
    '契約書': '契約書', '契約': '契約書',
};

const PROJECT_SUFFIX_PATTERNS = [
    '撮影', '工事', '案件', '作業', '業務', 'プロジェクト', 'ロケ', '取材',
    '制作', '編集', '設計', '施工', '取付', '修理', '改修', 'イベント',
    '打合せ', '打ち合わせ', 'ミーティング', '会議', '商談', '現場'
];

// Known entity patterns (company/person markers)
const ENTITY_PATTERNS = [
    /([A-Za-zぁ-ん一-龯ァ-ン]+(?:株式会社|有限会社|合同会社|さん|氏|様|代表|監督|プロデューサー|ディレクター|クライアント))/g,
    /(?:株式会社|有限会社|合同会社|㈱|㈲)\s*([A-Za-zぁ-ん一-龯ァ-ン・]+)/g,
];

// Expanded category keyword map (Layer 1)
const CATEGORY_MAP = [
    { keywords: ['タクシー', '電車', '新幹線', 'バス', '飛行機', '高速', '駐車場', 'パーキング', 'Suica', '交通'], category: '旅費交通費' },
    { keywords: ['人件費', '人工', '応援', '職人', '外注', '下請け', 'スタッフ', 'キャスト', 'モデル', 'スタッフ費', '人夫'], category: '人件費' },
    { keywords: ['材料', '木材', '鉄筋', 'セメント', '建材', '資材', 'コンクリ', '塗料', '床材', '壁材', '合板'], category: '材料費' },
    { keywords: ['消耗品', 'ペン', 'コピー用紙', 'インク', 'USB', 'ファイル', 'バインダー'], category: '消耗品費' },
    { keywords: ['接待', '会食', '飲み会', '手土産', 'ゴルフ', '接客'], category: '接待交際費' },
    { keywords: ['通信', 'インターネット', 'スマホ', '携帯', 'AWS', 'サーバー', 'ドメイン', 'Adobe', 'Slack', 'サブスク'], category: '通信費' },
    { keywords: ['撮影', 'カメラ', 'ロケ', '機材', 'スタジオ', '照明', 'レンズ', 'レンタル機材', '編集', 'VFX'], category: '撮影費' },
    { keywords: ['光熱費', '電気', 'ガス', '水道', '電気代', 'ガス代', '水道代'], category: '水道光熱費' },
    { keywords: ['家賃', '地代', 'テナント', '事務所', 'オフィス', '駐車場代'], category: '地代家賃' },
    { keywords: ['備品', 'パソコン', 'PC', 'MacBook', 'モニター', '椅子', 'デスク', '什器'], category: '備品費' },
    { keywords: ['広告', '宣伝', 'SNS', 'インスタ', 'YouTube', 'チラシ', 'ポスター', 'HP制作'], category: '広告宣伝費' },
    { keywords: ['税', '印紙', '登録', '許可', '申請', '手数料'], category: '租税公課' },
    { keywords: ['弁当', '飲み物', 'お茶', '昼食', '福利', 'ジュース'], category: '福利厚生費' },
];

// Location suffixes / known city names
const LOCATION_PATTERNS = [
    /([一-龯ぁ-んァ-ン]{1,8}(?:区|市|町|村|都|府|県|駅|橋|ビル|センター|スタジオ|タワー|モール|工場|邸|宅|丁目|番地))/,
    /(新宿|渋谷|池袋|品川|銀座|六本木|赤坂|青山|表参道|原宿|秋葉原|上野|浅草|丸の内|大手町|日比谷|有楽町|神田|秋葉原|吉祥寺|二子玉川|自由が丘|恵比寿|目黒|五反田|大崎|天王洲|豊洲|東京|大阪|名古屋|福岡|札幌|横浜|京都|神戸|仙台|広島|天神|梅田|難波|博多|栄)/,
];

// ─── Text Normalization (全角・漢字数字 → 半角アラビア数字) ─────────────────

function kanjiToNum(str) {
    const K = { '一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9 };
    // 三十一 → 31, 二十 → 20, 十二 → 12, 十 → 10, 六 → 6 etc.
    if (!str) return 0;
    if (str === '十') return 10;
    if (str.startsWith('十') && str.length === 2) return 10 + (K[str[1]] || 0); // 十二 → 12
    if (str.endsWith('十') && str.length === 2) return (K[str[0]] || 1) * 10;   // 二十 → 20
    if (str.length === 3 && str[1] === '十') return (K[str[0]] || 1) * 10 + (K[str[2]] || 0); // 二十一 → 21
    return K[str] || 0;
}

function normalizeText(text) {
    // 全角数字 → 半角 (０→0 ... ９→9)
    text = text.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 全角スラッシュ
    text = text.replace(/／/g, '/');
    // 漢字数字を年月日の直前で変換: 六月四日 → 6月4日, 令和三年 → 令和3年 etc.
    text = text.replace(/([一二三四五六七八九十]{1,3})([年月日])/g,
        (_, num, unit) => kanjiToNum(num) + unit);
    return text;
}

// ─── Layer 1: Rule-Based Extraction ─────────────────────────────────────────

function extractTags(text) {
    const result = {
        date: null,
        amount: null,
        amounts: [],
        category: null,
        location: null,
        projectName: null,
        entities: [],
        isRevenue: false,
        docType: null,
        intent: 'UNKNOWN',
        raw: text
    };

    if (!text || text.trim() === '') return result;

    // Normalize full-width / kanji numerals before any matching
    const normalized = normalizeText(text);
    let remaining = normalized;

    // ── 1. 日付 (Date) ──────────────────────────────────────────────────────
    const dateMatch = remaining.match(/(?:令和|R)?(\d{1,2})[年\/](\d{1,2})[月\/](\d{1,2})日?|(\d{1,2})[月\/](\d{1,2})日?/);
    if (dateMatch) {
        const now = new Date();
        let yy, mm, dd;
        if (dateMatch[1] && dateMatch[2] && dateMatch[3]) {
            // Year included
            yy = parseInt(dateMatch[1]) > 30 ? 2000 + parseInt(dateMatch[1]) : now.getFullYear();
            mm = dateMatch[2]; dd = dateMatch[3];
        } else {
            yy = now.getFullYear(); mm = dateMatch[4] || dateMatch[1]; dd = dateMatch[5] || dateMatch[2];
        }
        result.date = `${yy}/${String(mm).padStart(2,'0')}/${String(dd).padStart(2,'0')}`;
        remaining = remaining.replace(dateMatch[0], '');
    }

    // ── 2. 金額 (Amount) — 複数対応 ─────────────────────────────────────────
    // Use `remaining` (date already stripped) to avoid date digits like "6月4" being parsed.
    const multiAmounts = [];
    const rawForAmt = remaining;

    // 集計行フィルター: 「総経費」「合計」「小計」等の上位概念ラベルは個別明細ではない
    const AGGREGATE_RE = /^(総|合計|小計|費用合計|費用計|うち|内訳|概算|見込|税込|税抜)/;

    // ── Phase 1: 厳密マッチ — ラベル直後の金額 ───────────────────────────
    // ラベルは漢字・カタカナのみ (ひらがな除外) → 助詞「は」「と」がラベルに混入しない
    // ✅ 材料費50万 / 材料費は50万 / タクシー代3000円
    // ✅ 経費は材料費50万 → 「経費」がラベルとして試みるが直後が数字でないので不採用、
    //                      次の「材料費」がラベルとして正しくマッチ
    const PARTICLE = '(?:[はがでをにのもへ]|として|に対する|として)?';
    const AMT_NUM  = '([¥￥]?\\d[\\d,]*(?:\\.\\d+)?\\s*万?円?)';
    const strictAmt = new RegExp(
        `([一-龯ァ-ヴー]{1,6}(?:費|代|金))${PARTICLE}\\s*${AMT_NUM}`,
        'g'
    );
    let sm;
    while ((sm = strictAmt.exec(rawForAmt)) !== null) {
        const label = sm[1];
        const val   = parseYen(sm[2]);
        // ① 金額 > 0, ② 集計行ラベル除外, ③ 重複除外
        if (val > 0
            && !AGGREGATE_RE.test(label)
            && !multiAmounts.some(a => a.value === val && a.label === label)) {
            multiAmounts.push({ label, value: val });
        }
    }

    // ── Phase 2: ルーズマッチ — ラベルと金額の間にテキストがある場合 ─────
    // e.g. "材料費は今回50万で" / "人件費が確定次第10万"
    // Gap 上限 12文字、句点・改行で区切る
    if (multiAmounts.length === 0) {
        const looseAmt = new RegExp(
            `([一-龯ァ-ヴー]{1,6}(?:費|代|金))[^¥￥\\d。\\n]{0,12}${AMT_NUM}`,
            'g'
        );
        let lm2;
        while ((lm2 = looseAmt.exec(rawForAmt)) !== null) {
            const label = lm2[1];
            const val   = parseYen(lm2[2]);
            if (val > 0
                && !AGGREGATE_RE.test(label)
                && !multiAmounts.some(a => a.value === val && a.label === label)) {
                multiAmounts.push({ label, value: val });
            }
        }
    }

    // ── Phase 3: ラベルなし単体金額 ("5万", "50,000円", "¥10000") ─────────
    if (multiAmounts.length === 0) {
        const manMatch = rawForAmt.match(/[¥￥]?([\d,]+(?:\.\d+)?)\s*万/);
        if (manMatch) {
            const val = Math.round(parseFloat(manMatch[1].replace(/,/g,'')) * 10000);
            multiAmounts.push({ label: null, value: val });
        } else {
            const yenMatch = rawForAmt.match(/[¥￥]([\d,]+)|(\d[\d,]+)\s*円/);
            if (yenMatch) {
                const val = parseInt((yenMatch[1]||yenMatch[2]).replace(/,/g,''));
                multiAmounts.push({ label: null, value: val });
            }
        }
    }

    result.amounts = multiAmounts;
    result.amount = multiAmounts.reduce((s, a) => s + a.value, 0) || null;

    // ── 3. 書類関連 (Document Type) ──────────────────────────────────────────
    for (const [kw, type] of Object.entries(DOC_TYPE_MAP)) {
        if (normalized.includes(kw)) { result.docType = type; break; }
    }

    // ── 4. 売上/収入フラグ ────────────────────────────────────────────────────
    result.isRevenue = REVENUE_KEYWORDS.some(kw => normalized.includes(kw))
        && !EXPENSE_KEYWORDS.some(kw => normalized.includes(kw));

    // ── 5. 科目/カテゴリ ─────────────────────────────────────────────────────
    // Check labeled amounts first
    if (multiAmounts.length > 0 && multiAmounts[0].label) {
        result.category = multiAmounts.map(a => a.label).join('・');
    } else {
        // Fall through to keyword matching
        for (const { keywords, category } of CATEGORY_MAP) {
            if (keywords.some(kw => normalized.includes(kw))) {
                result.category = category;
                break;
            }
        }
        // StaticLexicon fallback
        if (!result.category && window.StaticLexicon) {
            const industry = window.mockDB?.userConfig?.industry || 'general';
            const lexCat = window.StaticLexicon.categorizeExpense(normalized, industry);
            if (lexCat && lexCat !== '雑費') result.category = lexCat;
        }
        if (!result.category) result.category = '雑費';
    }

    // ── 6. 場所/地名 ─────────────────────────────────────────────────────────
    // First: before で/にて pattern
    const locDePattern = remaining.match(/(?:[には])?([^、。\s]{1,10}?)(?:で|にて)/);
    if (locDePattern) {
        result.location = locDePattern[1].trim();
        remaining = remaining.replace(locDePattern[0], '');
    }
    // Fallback: known location suffix/city
    if (!result.location) {
        for (const pat of LOCATION_PATTERNS) {
            const m = normalized.match(pat);
            if (m) { result.location = m[1] || m[0]; break; }
        }
    }

    // ── 7. 作業/プロジェクト名 ──────────────────────────────────────────────
    // Look for "〇〇撮影", "〇〇工事" etc. Use `remaining` (date+location stripped) for clean match.
    for (const suffix of PROJECT_SUFFIX_PATTERNS) {
        const pat = new RegExp(`([^、。\\s]{1,12}${suffix})`);
        const m = remaining.match(pat);
        if (m) { result.projectName = m[1]; break; }
    }
    // If nothing found, use remaining meaningful text as project name
    if (!result.projectName) {
        let cleanRemain = remaining
            .replace(/[¥￥\d,万円。、\s]/g, ' ')
            .replace(/(経費|追加|計上|作成|フォルダ|プロジェクト|してください|してほしい|して|ください|ほしい)/g, '')
            .replace(/\s+/g, ' ').trim();
        if (cleanRemain.length > 1 && cleanRemain !== result.location) {
            result.projectName = cleanRemain.substring(0, 20);
        }
    }

    // ── 8. 固有名詞 (Named Entities) ─────────────────────────────────────────
    const foundEntities = new Set();
    for (const pat of ENTITY_PATTERNS) {
        const re = new RegExp(pat.source, 'g');
        let m;
        while ((m = re.exec(normalized)) !== null) {
            const e = (m[1] || m[0]).trim();
            if (e.length > 1) foundEntities.add(e);
        }
    }
    // Katakana words ≥4 chars that aren't category keywords or common words
    const COMMON_KATA_BLOCKLIST = new Set([
        'フォルダ', 'ファイル', 'プロジェクト', 'データ', 'メモ', 'コード',
        'テスト', 'サンプル', 'アプリ', 'システム', 'ページ', 'メール',
        'スタート', 'スタッフ', 'スケジュール', 'タスク', 'リスト',
        'コメント', 'ノート', 'レポート', 'フォーム', 'テンプレート',
        'インボイス', 'レシート', 'クライアント', 'パートナー',
        'サービス', 'プラン', 'オプション', 'タイプ', 'カテゴリ',
        'アカウント', 'ログイン', 'パスワード', 'ユーザー',
        'キャンセル', 'エラー', 'ステータス', 'バージョン',
        'コンテンツ', 'フォーマット', 'メッセージ', 'リンク',
        'ダウンロード', 'アップロード', 'インポート', 'エクスポート'
    ]);
    const kataMatch = normalized.match(/[ァ-ヴー]{4,}/g) || [];
    const knownCategoryWords = new Set(CATEGORY_MAP.flatMap(c => c.keywords));
    kataMatch.forEach(w => {
        if (!knownCategoryWords.has(w) && !COMMON_KATA_BLOCKLIST.has(w)) foundEntities.add(w);
    });
    result.entities = [...foundEntities].slice(0, 4);

    // Fallback: If no location was found, rely on the first entity
    if (!result.location && result.entities.length > 0) {
        result.location = result.entities[0];
    }

    // ── Intent Routing (Layer 1) ───────────────────────────────────────────
    result.intent = routeIntent(normalized, result);

    console.log('[parseInputToData] Tags:', JSON.stringify(result, null, 2));
    return result;
}

// ─── Intent Routing ────────────────────────────────────────────────────────

function routeIntent(text, parsed) {
    // Document generation
    if (parsed.docType && /(作成|作って|出して|発行|送って)/.test(text)) return 'GENERATE_DOCUMENT';
    // Revenue entry
    if (parsed.isRevenue) return 'ADD_REVENUE';
    // Expense entry
    if (parsed.amounts.length > 0 && !parsed.isRevenue) return 'ADD_EXPENSE';
    // Project creation
    if (/(作って|新規|作成|立ち上げ|フォルダ|プロジェクト)/.test(text)) return 'CREATE_PROJECT';
    // Query
    if (/[？?]$|教えて|知りたい|どう|いくら/.test(text)) return 'QUERY';
    return 'UNKNOWN';
}

// ─── Helper: Parse yen string to integer ──────────────────────────────────

function parseYen(str) {
    if (!str) return 0;
    str = str.replace(/[¥￥,\s]/g, '');
    if (str.includes('万')) {
        return Math.round(parseFloat(str.replace('万', '').replace('円', '')) * 10000);
    }
    return parseInt(str.replace('円', '')) || 0;
}

// ─── Layer 2: LLM Fallback (Gemini) ─────────────────────────────────────────

async function extractTagsWithLLM(text) {
    // First run Layer 1
    const layer1 = extractTags(text);

    // LLM を呼ぶのは Layer 1 で完全に解析できなかった時のみ
    // (意図不明 OR 金額・プロジェクト・書類いずれも未取得)
    const needsLLM = layer1.intent === 'UNKNOWN'
        || (layer1.amounts.length === 0
            && layer1.projectName === null
            && layer1.docType === null);

    if (!needsLLM) return layer1;

    const apiKey = (typeof getGeminiApiKey === 'function') ? getGeminiApiKey() : null;
    if (!apiKey) return layer1;

    try {
        const prompt = `あなたはフリーランス向け会計アプリ「Neo+」の経費認識AIです。日本語の自由記述テキストから、経費・収入情報を構造化JSONとして抽出してください。

【抽出ルール】
1. 「経費は〜」「費用内訳:」などの前置きは無視し、後続の個別項目のみ抽出する
2. 複数経費は amounts に【必ず別々のオブジェクト】として格納する（結合しない）
3. 「総額」「合計」「小計」などの集計行は amounts に含めない
4. ラベルには助詞（は・が・で・を・に・と）を含めない（例: 「材料費は」→ label は「材料費」）
5. 金額は円整数に変換する（50万→500000、1.5万→15000、5,000円→5000）
6. amounts が複数ある場合、amount フィールドはそれらの合計値とする

【入力テキスト】
"${text}"

【出力形式 (JSONのみ、前後の説明文なし)】
{
  "date": "YYYY/MM/DD or null",
  "amount": <合計円整数 or null>,
  "amounts": [{"label": "<科目名 or null>", "value": <円整数>}],
  "category": "<旅費交通費|人件費|材料費|外注費|消耗品費|撮影費|備品費|接待交際費|通信費|水道光熱費|地代家賃|広告宣伝費|租税公課|福利厚生費|雑費|null>",
  "location": "<地名 or null>",
  "projectName": "<作業/プロジェクト名 or null>",
  "entities": ["<固有名詞リスト>"],
  "isRevenue": <true|false>,
  "docType": "<請求書|見積書|領収書|納品書|発注書|契約書|null>",
  "intent": "<CREATE_PROJECT|ADD_EXPENSE|ADD_REVENUE|GENERATE_DOCUMENT|QUERY|UNKNOWN>"
}

【few-shot 例】
入力: 「経費は材料費50万。人件費が10万。」
出力: {"amounts":[{"label":"材料費","value":500000},{"label":"人件費","value":100000}],"amount":600000,"category":"材料費","intent":"ADD_EXPENSE","isRevenue":false,"date":null,"location":null,"projectName":null,"entities":[],"docType":null}

入力: 「今月の工事費: 材料費30万、外注費20万、交通費5万」
出力: {"amounts":[{"label":"材料費","value":300000},{"label":"外注費","value":200000},{"label":"交通費","value":50000}],"amount":550000,"category":"材料費","intent":"ADD_EXPENSE","isRevenue":false,"date":null,"location":null,"projectName":"工事","entities":[],"docType":null}`;

        const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0, maxOutputTokens: 512 }
                })
            }
        );

        const data = await resp.json();
        const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const jsonStr = raw.replace(/```json\n?|```/g, '').trim();
        const llmResult = JSON.parse(jsonStr);

        // Merge: Layer 1 strong fields take priority, LLM fills gaps
        const merged = {
            ...llmResult,
            date:        layer1.date        || llmResult.date,
            amount:      layer1.amount      || llmResult.amount,
            amounts:     layer1.amounts.length > 0 ? layer1.amounts : (llmResult.amounts || []),
            location:    layer1.location    || llmResult.location,
            isRevenue:   layer1.isRevenue   || llmResult.isRevenue,
            docType:     layer1.docType     || llmResult.docType,
            entities:    [...new Set([...layer1.entities, ...(llmResult.entities || [])])].slice(0,4),
            raw: text,
            _layer: 'L2_LLM'
        };
        console.log('[parseInputToData] L2 LLM Tags:', JSON.stringify(merged, null, 2));
        return merged;

    } catch (err) {
        console.warn('[parseInputToData] LLM fallback failed, using Layer 1:', err.message);
        return layer1;
    }
}

// ─── Exports ──────────────────────────────────────────────────────────────

window.extractTags = extractTags;
window.extractTagsWithLLM = extractTagsWithLLM;
window.parseYen = parseYen;
