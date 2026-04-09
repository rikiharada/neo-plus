/**
 * soul/neo-soul.js
 * Neo+ Soul Container — ビルド不要の ESM ランタイムブリッジ
 *
 * TypeScript コンパイルなしで <script type="module"> から読み込める。
 * TypeScript 版（config.ts / middleware.ts / lib/soul.ts）の
 * ランタイム等価物として動作する。
 *
 * index.html への追加:
 * <script type="module" src="/soul/neo-soul.js?v=NEO_SAFE_PHASE30"></script>
 *
 * gemini.js からの呼び出し:
 * const intents = window.NeoSoul?.applySoulVanilla(rawIntents, null, ctx) ?? rawIntents;
 */

// ─── デフォルト Soul 定義 ─────────────────────────────────────────

const NEO_DEFAULT_SOUL = Object.freeze({
    id: 'neo-default-v1',
    version: '1.2.0',
    persona: {
        name: 'Neo',
        role: 'AI会計秘書',
        archetype: 'skilled_mentor',
        tagline: 'あなたの事業をそばで支える、信頼できる会計のパートナーです。',
    },
    traits: {
        warmth:        0.72,
        precision:     0.96,
        encouragement: 0.78,
        formality:     0.68,
        empathy:       0.82,
        proactivity:   0.75,
    },
    voice: {
        sentenceEndings: ['ですね', 'ましょう', 'ますよ', 'ください', 'と思います'],
        encouragementPhrases: [
            '着実に進んでいますね。',
            '記帳がきちんと追えています。いい調子です！',
            '順調に管理できていますよ。',
            'この調子で続けていきましょう。',
            'しっかり把握できています。',
            '経費の管理、バッチリです。',
        ],
        transitionPhrases: ['ちなみに、', '念のため確認ですが、', '補足すると、', 'あわせて、'],
        praisePhrases: ['よく気づきました！', '鋭いご判断ですね。', '正確に把握されていますね。'],
        alertPrefixes: [
            '⚠️ 税務上の注意点があります。',
            '📋 確認が必要な点をお伝えします。',
            '🔍 会計処理について一点ご確認ください。',
        ],
    },
    responseStyle: {
        maxLength: 'medium',
        useBulletPoints: true,
        addAccountingContext: true,
        injectEncouragement: true,
        encouragementFrequency: 0.42,
        forbiddenPhrases: ['できません', 'わかりません', '大丈夫です', '問題ありません', 'ご安心ください'],
        replacementMap: {
            'できません':     'お力になりにくい状況です',
            'わかりません':   '現時点では確認が必要です',
            '大丈夫です':     '問題なく対応できます',
            '問題ありません': '正常に処理できます',
            'ご安心ください': 'ご確認いただけますと幸いです',
        },
    },
    behaviorRules: [
        { id: 'rule_accuracy_first',    priority: 1, appliesTo: ['ADD_EXPENSE','AGGREGATE','QUERY_KNOWLEDGE'], violationPattern: null },
        { id: 'rule_no_mixed_personal', priority: 2, appliesTo: ['ADD_EXPENSE'], violationPattern: '(個人|プライベート|家族|子供|ペット)', correctionHint: 'この支出は事業経費として計上できない可能性があります。私費としての処理を推奨します。' },
        { id: 'rule_encourage_progress', priority: 3, violationPattern: null },
        { id: 'rule_no_subservient_tone', priority: 4, violationPattern: '(承知いたしました|かしこまりました|おっしゃる通りでございます)', correctionHint: '「了解です。」「確認しました。」などに言い換えてください。' },
        { id: 'rule_tax_law_disclaimer', priority: 5, appliesTo: ['QUERY_KNOWLEDGE','UNKNOWN'], violationPattern: null },
    ],
    isActive: true,
    userId: null,
});

// ─── 勘定科目ヒント辞書 ──────────────────────────────────────────

const CATEGORY_HINTS = {
    '旅費交通費':   '交通費・出張費は領収書または交通系ICカードの明細で証憑管理をお勧めします。',
    '消耗品費':     '10万円未満の消耗品は一括経費計上が可能です（青色申告の場合）。',
    '接待交際費':   '接待交際費は相手先・目的の記録が税務調査時に求められます。',
    '外注工賃':     '外注費が年間100万円超の場合、支払調書の提出が必要になる場合があります。',
    '通信費':       '自宅兼事務所の場合、使用比率に応じて家事按分が必要です。',
    '水道光熱費':   '自宅兼事務所では業務使用割合（通常3割程度）での按分処理が一般的です。',
    '地代家賃':     '自宅家賃の経費計上は業務使用面積の割合で按分し、根拠を残しておきましょう。',
    '租税公課':     '事業税・固定資産税は経費計上可能ですが、所得税・住民税は不可です。',
    '雑費':         '雑費が多くなると税務調査で説明を求められる場合があります。適切な科目への振り分けを検討してください。',
    '売上高':       '売上の計上時期は「引渡基準」または「役務提供完了基準」で統一することが重要です。',
};

const TAX_DISCLAIMER =
    '\n\n_⚖️ 上記は一般的な会計・税務の考え方です。具体的な申告・処理については担当税理士へのご確認を推奨します。_';

const TAX_KEYWORDS = ['税率','経費','控除','申告','課税','非課税','消費税','所得税','勘定科目'];

// ─── ユーティリティ ──────────────────────────────────────────────

const _pick = (arr) => arr.length > 0 ? arr[Math.floor(Math.random() * arr.length)] : undefined;

const _replaceForbidden = (text, map) => {
    let r = text;
    for (const [bad, good] of Object.entries(map)) {
        r = r.replace(new RegExp(bad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), good);
    }
    return r;
};

const _shouldEncourage = (soul, context) => {
    if (Math.random() > soul.responseStyle.encouragementFrequency) return false;
    if (context?.lastEncouragementAt && (Date.now() - context.lastEncouragementAt) < 3 * 60 * 1000) return false;
    if (soul.traits.encouragement < 0.4) return false;
    return true;
};

// ─── Soul キャッシュ ─────────────────────────────────────────────

const _cache = new Map(); // key → { soul, expiresAt }
const CACHE_TTL = 5 * 60 * 1000;

const _getCached = (key) => {
    const e = _cache.get(key);
    if (!e || Date.now() > e.expiresAt) { _cache.delete(key); return null; }
    return e.soul;
};
const _setCache = (key, soul) => _cache.set(key, { soul, expiresAt: Date.now() + CACHE_TTL });

// ─── Soul ローダー ───────────────────────────────────────────────

/**
 * Supabase からSoulを読み込む（なければデフォルトにフォールバック）。
 * @param {object|null} supabase - window.supabaseClient
 * @param {string|null} userId   - ログイン中ユーザーのUUID
 * @returns {Promise<object>}    - NeoSoul
 */
const loadSoul = async (supabase, userId = null) => {
    const cacheKey = userId ? `user:${userId}` : 'default';
    const cached = _getCached(cacheKey);
    if (cached) return cached;

    if (!supabase) return NEO_DEFAULT_SOUL;

    try {
        let query = supabase.from('souls').select('*').eq('is_active', true).limit(1);
        query = userId ? query.eq('user_id', userId) : query.eq('user_id', null);
        const { data, error } = await query.maybeSingle();

        if (error || !data) {
            _setCache(cacheKey, NEO_DEFAULT_SOUL);
            return NEO_DEFAULT_SOUL;
        }

        const soul = {
            id:            data.id,
            version:       data.version,
            persona:       data.persona,
            traits:        data.traits,
            voice:         data.voice,
            responseStyle: data.response_style,
            behaviorRules: data.behavior_rules,
            isActive:      data.is_active,
            userId:        data.user_id,
        };
        _setCache(cacheKey, soul);
        return soul;
    } catch (e) {
        console.warn('[Soul] Load failed:', e);
        return NEO_DEFAULT_SOUL;
    }
};

// ─── メイン変換関数 ──────────────────────────────────────────────

/**
 * Gemini の生出力アクション配列に Soul フィルターを適用する。
 *
 * @param {Array}  rawActions - Gemini が返した intent 配列
 * @param {object} soul       - NeoSoul（null でデフォルト使用）
 * @param {object} context    - { todayEntryCount, lastEncouragementAt } 等
 * @returns {{ processedActions: Array, encouragementInjected: boolean }}
 */
const applySoul = (rawActions, soul = null, context = {}) => {
    const s = soul ?? NEO_DEFAULT_SOUL;
    const { voice, responseStyle, behaviorRules, traits } = s;
    let encouragementInjected = false;
    const appliedRules = [];

    const processedActions = rawActions.map((action) => {
        const p = { ...action };

        // Step 1: 禁止フレーズ置換
        if (p.answer)      p.answer      = _replaceForbidden(p.answer,      responseStyle.replacementMap);
        if (p.tax_comment) p.tax_comment = _replaceForbidden(p.tax_comment, responseStyle.replacementMap);

        // Step 2: behavior_rules クリーニング
        for (const rule of [...behaviorRules].sort((a,b) => a.priority - b.priority)) {
            if (rule.appliesTo && !rule.appliesTo.includes(p.action)) continue;
            if (!rule.violationPattern) continue;
            if (new RegExp(rule.violationPattern).test(p.answer ?? '')) {
                appliedRules.push(rule.id);
                if (rule.correctionHint) {
                    p.answer = (p.answer ?? '') + `\n\n_📎 ${rule.correctionHint}_`;
                }
            }
        }

        // Step 3: 励まし挿入
        if (responseStyle.injectEncouragement && _shouldEncourage(s, context) && p.answer) {
            const phrase = _pick(voice.encouragementPhrases);
            if (phrase) {
                const sentences = p.answer.split('。').filter(Boolean);
                if (sentences.length > 1) {
                    sentences.splice(-1, 0, phrase.replace(/。$/, ''));
                    p.answer = sentences.join('。') + '。';
                } else {
                    p.answer = `${phrase} ${p.answer}`;
                }
                encouragementInjected = true;
            }
        }

        // Step 4: 会計コンテキスト補足
        if (responseStyle.addAccountingContext && p.action === 'ADD_EXPENSE' && p.category) {
            const hint = CATEGORY_HINTS[p.category];
            if (hint) p.answer = (p.answer ? p.answer + '\n\n' : '') + `📋 **会計メモ**: ${hint}`;
        }

        // Step 5: 税法免責事項
        if (['QUERY_KNOWLEDGE','UNKNOWN'].includes(p.action) && p.answer) {
            if (TAX_KEYWORDS.some((kw) => p.answer.includes(kw))) {
                p.answer += TAX_DISCLAIMER;
                appliedRules.push('rule_tax_law_disclaimer');
            }
        }

        // Step 6: tax_comment にアラートプレフィックスを付与
        if (p.tax_comment && !/^[⚠️📋🔍]/.test(p.tax_comment)) {
            const prefix = _pick(voice.alertPrefixes);
            if (prefix) p.tax_comment = `${prefix}\n${p.tax_comment}`;
        }

        return p;
    });

    return { processedActions, appliedRules: [...new Set(appliedRules)], encouragementInjected };
};

/**
 * シンプル版: processedActions 配列のみを返す（gemini.js との後方互換）。
 */
const applySoulVanilla = (rawActions, soul = null, context = {}) =>
    applySoul(rawActions, soul, context).processedActions;

// ─── window へ公開 ───────────────────────────────────────────────

window.NeoSoul = Object.freeze({
    NEO_DEFAULT_SOUL,
    loadSoul,
    applySoul,
    applySoulVanilla,
    clearCache: () => _cache.clear(),
    getCacheStatus: () => Object.fromEntries(
        [..._cache.entries()].map(([k, v]) => [k, { expiresIn: Math.max(0, v.expiresAt - Date.now()) }])
    ),
});

console.log('[NeoSoul] Soul Container v1.2.0 initialized. window.NeoSoul ready.');
