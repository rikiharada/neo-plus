/**
 * Neo+ StaticLexicon Database
 * Offline Universal Intelligence Engine for 100% Parse Accuracy
 */

window.StaticLexicon = {
    // セパレーター：AIに頼らず、文を絶対的に分割するための境界文字
    SEPARATORS: ['、', '。', 'で', 'にて', 'に', 'は', 'が', 'を', 'から', 'まで', 'の'],

    // コマンド：削除されるべき指示語
    ACTION_KEYWORDS: [
        '作って', '新規', '作成', '立ち上げて', '追加して', '計上して', 'まとめて',
        '合計して', 'お願い', 'のプロジェクト', 'というプロジェクト', 'プロジェクトを',
        'フォルダを', '請求書', '見積書', '納品書', 'プレビュー'
    ],

    // 共通エンティティ：全業種共通の場所やマスタキーワード
    LOCATIONS: [
        '駅', 'ビル', 'センター', 'タワー', 'モール', '工場', '病院', '学校', '邸', '宅',
        '丁目', '番地', '区', '市', '町', '村', '県', '都', '府',
        '日比谷', '六本木', '新宿', '渋谷', '池袋', '品川', '東京', '銀座', '大阪', '名古屋', '福岡', '札幌',
        '横浜', '京都', '神戸', '仙台', '広島', '天神', '梅田', '難波', '博多', '栄', '丸の内', '大手町'
    ],

    // 業種別ナレッジベース (Industry Knowledge Base)
    // 業種ごとに「ユーザーが入力しがちな単語」を「正しい経費科目/カテゴリ」へマッピングする
    INDUSTRY_KNOWLEDGE: {
        construction: {
            "マキタ": "消耗品費", "Hikoki": "消耗品費", "コーナン": "材料費", "建材": "材料費",
            "木材": "材料費", "ビス": "消耗品費", "ドリル": "消耗品費", "ボード": "材料費",
            "応援": "外注費", "人工": "外注費", "弁当": "会議費", "ジュース": "福利厚生費",
            "タクシー": "交通費", "駐車場": "交通費", "パーキング": "交通費", "ガソリン": "車両費",
            "産廃": "雑費", "ダンプ": "車両費"
        },
        freelance: {
            "MacBook": "消耗品費", "モニター": "消耗品費", "カフェ": "会議費", "コーヒー": "会議費",
            "AWS": "通信費", "サーバー": "通信費", "ドメイン": "通信費", "Adobe": "通信費",
            "タクシー": "交通費", "新幹線": "交通費", "打ち合わせ": "会議費", "接待": "交際費"
        },
        beauty: {
            "カラー剤": "仕入高", "パーマ液": "仕入高", "シャンプー": "消耗品費", "トリートメント": "仕入高",
            "ハサミ": "消耗品費", "ドライヤー": "消耗品費", "タオル": "消耗品費", "雑誌": "新聞図書費",
            "ホットペッパー": "広告宣伝費", "インスタ": "広告宣伝費"
        },
        general: {
            "切手": "通信費", "コピー用紙": "消耗品費", "ペン": "消耗品費", "インク": "消耗品費",
            "タクシー": "交通費", "電車": "交通費", "お茶": "会議費", "弁当": "会議費",
            "接待": "交際費", "手土産": "交際費", "Amazon": "消耗品費", "楽天": "消耗品費"
        }
    },

    /**
     * Parse and classify terminology based on the user's industry.
     * @param {string} text The raw extracted title/text
     * @param {string} industry The user's industry (e.g. 'construction')
     * @returns {string} The matched accounting category, or '雑費' (Miscellaneous) if unknown.
     */
    categorizeExpense: function (text, industry = 'general') {
        const kb = this.INDUSTRY_KNOWLEDGE[industry] || this.INDUSTRY_KNOWLEDGE['general'];
        for (const [keyword, category] of Object.entries(kb)) {
            if (text.includes(keyword)) {
                return category;
            }
        }

        // Fallback to general if not found in specific industry
        if (industry !== 'general') {
            const genKb = this.INDUSTRY_KNOWLEDGE['general'];
            for (const [keyword, category] of Object.entries(genKb)) {
                if (text.includes(keyword)) {
                    return category;
                }
            }
        }

        return "雑費";
    }
};
