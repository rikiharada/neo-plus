-- Neo コア知識の再投入（既存行は上書きしない・同一 key が無いときだけ INSERT）
-- Supabase SQL Editor で postgres ロール実行推奨（RLS バイパス）

-- ── グローバル行用: user_id を NULL 許可 + 一意制約の整理 ─────────────────────
ALTER TABLE public.semantic_cache ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.semantic_cache DROP CONSTRAINT IF EXISTS semantic_cache_user_id_cache_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS semantic_cache_global_cache_key_uq
    ON public.semantic_cache (cache_key)
    WHERE user_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS semantic_cache_user_cache_key_uq
    ON public.semantic_cache (user_id, cache_key)
    WHERE user_id IS NOT NULL;

ALTER TABLE public.vector_embeddings ALTER COLUMN user_id DROP NOT NULL;

-- 認証ユーザーがグローバル行を読めるように RLS を分割
DROP POLICY IF EXISTS semantic_cache_own ON public.semantic_cache;
CREATE POLICY semantic_cache_select_global_or_own ON public.semantic_cache
    FOR SELECT TO authenticated
    USING (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY semantic_cache_insert_own ON public.semantic_cache
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY semantic_cache_update_own ON public.semantic_cache
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY semantic_cache_delete_own ON public.semantic_cache
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS vector_embeddings_own ON public.vector_embeddings;
CREATE POLICY vector_embeddings_select_global_or_own ON public.vector_embeddings
    FOR SELECT TO authenticated
    USING (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY vector_embeddings_insert_own ON public.vector_embeddings
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY vector_embeddings_update_own ON public.vector_embeddings
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY vector_embeddings_delete_own ON public.vector_embeddings
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════════
-- neo_knowledge（本文は JSON。key が既にあればスキップ）
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.neo_knowledge (user_id, namespace, key, body)
SELECT NULL, 'neo_core', 'tax.consumption_jp', $j${
  "title": "日本の消費税（標準・軽減）",
  "locale": "ja-JP",
  "summary": "標準税率10%、軽減税率8%。インボイス制度下では適格請求書等の保存が重要。",
  "standard_rate": 0.10,
  "reduced_rate": 0.08,
  "reduced_examples": ["飲食料品（持ち帰り等条件あり）", "新聞（定期購読）"],
  "notes": "取引区分・課税・非課税・不課税の判断は個別要件に依存するため、最終判断は税理士等へ。"
}$j$::jsonb
WHERE NOT EXISTS (
    SELECT 1 FROM public.neo_knowledge nk
    WHERE nk.user_id IS NULL AND nk.namespace = 'neo_core' AND nk.key = 'tax.consumption_jp'
);

INSERT INTO public.neo_knowledge (user_id, namespace, key, body)
SELECT NULL, 'neo_core', 'expense.categories_jp', $j${
  "title": "経費の代表的な科目分類（日本の中小・フリーランス想定）",
  "locale": "ja-JP",
  "categories": [
    {"code": "travel_transport", "label": "旅費交通費", "examples": ["電車・タクシー・ガソリン・高速代"]},
    {"code": "labor_outsource", "label": "外注費・人件費", "examples": ["業務委託・アルバイト代・現場応援"]},
    {"code": "supplies", "label": "消耗品費・備品", "examples": ["文具・工具・ソフト（低額）"]},
    {"code": "entertainment", "label": "接待交際費", "examples": ["取引先との会食（要要件確認）"]},
    {"code": "taxes_dues", "label": "租税公課", "examples": ["印紙・固定資産税（事業用部分）"]},
    {"code": "communication", "label": "通信費", "examples": ["スマホ・回線・クラウド（事業用按分）"]},
    {"code": "utilities", "label": "水道光熱費", "examples": ["事務所・在宅の按分"]},
    {"code": "rent", "label": "地代家賃", "examples": ["事務所賃料・倉庫"]},
    {"code": "misc", "label": "雑費", "examples": ["少額で科目に乏しい支出"]}
  ],
  "note": "実務では金額・頻度・業種で科目が変わる。Neo+ではユーザー入力と学習辞書で補助する。"
}$j$::jsonb
WHERE NOT EXISTS (
    SELECT 1 FROM public.neo_knowledge nk
    WHERE nk.user_id IS NULL AND nk.namespace = 'neo_core' AND nk.key = 'expense.categories_jp'
);

INSERT INTO public.neo_knowledge (user_id, namespace, key, body)
SELECT NULL, 'neo_core', 'doc.invoice_receipt_required_jp', $j${
  "title": "請求書・領収書で押さえるべき必須・推奨項目",
  "locale": "ja-JP",
  "invoice_recommended": [
    "発行日",
    "宛名（取引先名）",
    "品目・件名",
    "数量・単価",
    "金額（税抜・税込の区分）",
    "消費税額（または税率の明示）",
    "合計金額",
    "振込先・支払条件",
    "発行者名義・住所・登録番号（インボイス登録事業者の場合）"
  ],
  "receipt_minimum": [
    "発行日",
    "宛名または「上様」等の確認可能な記載",
    "支払金額",
    "発行者の識別（店名・登録番号等）"
  ],
  "neo_ui_hint": "Neo+の書類プレビューでは doc-client-name, doc-subject, doc-issue-date, 明細行、税額、合計を整合させる。"
}$j$::jsonb
WHERE NOT EXISTS (
    SELECT 1 FROM public.neo_knowledge nk
    WHERE nk.user_id IS NULL AND nk.namespace = 'neo_core' AND nk.key = 'doc.invoice_receipt_required_jp'
);

INSERT INTO public.neo_knowledge (user_id, namespace, key, body)
SELECT NULL, 'neo_core', 'tax.freelancer_filing_overview_jp', $j${
  "title": "フリーランスの確定申告（超要約）",
  "locale": "ja-JP",
  "summary": "事業所得として必要経費を差し引いた所得を申告。e-Tax やマイナンバーカード等の手続きが一般的。",
  "points": [
    "青色申告（承認申請・複式簿記等の要件）で控除メリットが出る場合あり",
    "事業と私生活の按分（家賃・通信費等）は合理的基準で記録を残す",
    "所得税のほか住民税・個人事業税（要件あり）に注意",
    "納期限・延納・予定納税は税務署・自治体の案内を確認"
  ],
  "disclaimer": "本項は一般情報であり、個別の税務アドバイスではない。判断は税理士・国税庁等の一次情報を参照。"
}$j$::jsonb
WHERE NOT EXISTS (
    SELECT 1 FROM public.neo_knowledge nk
    WHERE nk.user_id IS NULL AND nk.namespace = 'neo_core' AND nk.key = 'tax.freelancer_filing_overview_jp'
);

INSERT INTO public.neo_knowledge (user_id, namespace, key, body)
SELECT NULL, 'neo_core', 'app.neo_plus_transaction_flow', $j${
  "title": "Neo+ 基本動作（経費・取引）",
  "locale": "ja-JP",
  "flow": [
    "1. ユーザーが経費を入力（チャット・モーダル・Desk 等）",
    "2. intentRouter / ローカルパーサで ADD_EXPENSE 等に正規化",
    "3. insertTransaction が mockDB.activities に追加し persistLocalBody で端末キャッシュ同期",
    "4. 認証時は lib/data/transactionHandler 等から Supabase public.transactions へ INSERT（user_id, project_id, amount, date, memo, category）",
    "5. project_id は resolveExpenseProjectId / 現在開いているプロジェクト / 単一プロジェクトで解決"
  ],
  "constraints": [
    "FK のため project_id は存在するプロジェクトに紐づける",
    "未ログイン時はローカル activities のみの場合あり"
  ]
}$j$::jsonb
WHERE NOT EXISTS (
    SELECT 1 FROM public.neo_knowledge nk
    WHERE nk.user_id IS NULL AND nk.namespace = 'neo_core' AND nk.key = 'app.neo_plus_transaction_flow'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- semantic_cache（短縮キャッシュ・グローバル key 一意）
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.semantic_cache (user_id, cache_key, payload, expires_at)
SELECT NULL, 'neo_global:tax.consumption_jp', $j${"summary": "消費税 10% 標準、8% 軽減。インボイス・証憑管理を意識。"}$j$::jsonb, NULL
WHERE NOT EXISTS (
    SELECT 1 FROM public.semantic_cache sc
    WHERE sc.user_id IS NULL AND sc.cache_key = 'neo_global:tax.consumption_jp'
);

INSERT INTO public.semantic_cache (user_id, cache_key, payload, expires_at)
SELECT NULL, 'neo_global:expense.categories_jp', $j${"summary": "交通費・人件費/外注・備品/消耗品・交際費・租税公課・通信・光熱・地代・雑費 等"}$j$::jsonb, NULL
WHERE NOT EXISTS (
    SELECT 1 FROM public.semantic_cache sc
    WHERE sc.user_id IS NULL AND sc.cache_key = 'neo_global:expense.categories_jp'
);

INSERT INTO public.semantic_cache (user_id, cache_key, payload, expires_at)
SELECT NULL, 'neo_global:doc.invoice_receipt', $j${"summary": "必須: 発行日・宛名・金額・消費税・合計。請求書は品目・振込先・登録番号等も推奨。"}$j$::jsonb, NULL
WHERE NOT EXISTS (
    SELECT 1 FROM public.semantic_cache sc
    WHERE sc.user_id IS NULL AND sc.cache_key = 'neo_global:doc.invoice_receipt'
);

INSERT INTO public.semantic_cache (user_id, cache_key, payload, expires_at)
SELECT NULL, 'neo_global:tax.freelancer', $j${"summary": "事業所得＝売上−必要経費。青色・按分・e-Tax。個別は税理士へ。"}$j$::jsonb, NULL
WHERE NOT EXISTS (
    SELECT 1 FROM public.semantic_cache sc
    WHERE sc.user_id IS NULL AND sc.cache_key = 'neo_global:tax.freelancer'
);

INSERT INTO public.semantic_cache (user_id, cache_key, payload, expires_at)
SELECT NULL, 'neo_global:app.transaction_flow', $j${"summary": "経費追加→insertTransaction→activities/Supabase transactions・project_id 紐づけ。"}$j$::jsonb, NULL
WHERE NOT EXISTS (
    SELECT 1 FROM public.semantic_cache sc
    WHERE sc.user_id IS NULL AND sc.cache_key = 'neo_global:app.transaction_flow'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- vector_embeddings（実ベクトルは後続パイプラインで差し替え可。meta にテキスト保持）
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.vector_embeddings (user_id, source_ref, embedding, meta)
SELECT NULL, 'neo_core:tax.consumption_jp', NULL,
    $j${"chunk": "日本 消費税 10% 標準 8% 軽減 インボイス", "neo_knowledge_key": "tax.consumption_jp"}$j$::jsonb
WHERE NOT EXISTS (
    SELECT 1 FROM public.vector_embeddings ve
    WHERE ve.user_id IS NULL AND ve.source_ref = 'neo_core:tax.consumption_jp'
);

INSERT INTO public.vector_embeddings (user_id, source_ref, embedding, meta)
SELECT NULL, 'neo_core:expense.categories_jp', NULL,
    $j${"chunk": "経費科目 交通費 人件費 外注 備品 消耗品 交際費 租税公課 通信 光熱 地代 雑費", "neo_knowledge_key": "expense.categories_jp"}$j$::jsonb
WHERE NOT EXISTS (
    SELECT 1 FROM public.vector_embeddings ve
    WHERE ve.user_id IS NULL AND ve.source_ref = 'neo_core:expense.categories_jp'
);

INSERT INTO public.vector_embeddings (user_id, source_ref, embedding, meta)
SELECT NULL, 'neo_core:doc.invoice_receipt_required_jp', NULL,
    $j${"chunk": "請求書 領収書 発行日 宛名 金額 消費税 合計 登録番号", "neo_knowledge_key": "doc.invoice_receipt_required_jp"}$j$::jsonb
WHERE NOT EXISTS (
    SELECT 1 FROM public.vector_embeddings ve
    WHERE ve.user_id IS NULL AND ve.source_ref = 'neo_core:doc.invoice_receipt_required_jp'
);

INSERT INTO public.vector_embeddings (user_id, source_ref, embedding, meta)
SELECT NULL, 'neo_core:tax.freelancer_filing_overview_jp', NULL,
    $j${"chunk": "確定申告 フリーランス 事業所得 必要経費 青色 按分 e-Tax", "neo_knowledge_key": "tax.freelancer_filing_overview_jp"}$j$::jsonb
WHERE NOT EXISTS (
    SELECT 1 FROM public.vector_embeddings ve
    WHERE ve.user_id IS NULL AND ve.source_ref = 'neo_core:tax.freelancer_filing_overview_jp'
);

INSERT INTO public.vector_embeddings (user_id, source_ref, embedding, meta)
SELECT NULL, 'neo_core:app.neo_plus_transaction_flow', NULL,
    $j${"chunk": "Neo+ 経費 insertTransaction transactions project_id activities", "neo_knowledge_key": "app.neo_plus_transaction_flow"}$j$::jsonb
WHERE NOT EXISTS (
    SELECT 1 FROM public.vector_embeddings ve
    WHERE ve.user_id IS NULL AND ve.source_ref = 'neo_core:app.neo_plus_transaction_flow'
);
