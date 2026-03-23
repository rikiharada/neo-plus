-- ═══════════════════════════════════════════════════════════════════════════
-- Advanced Domain Knowledge Seed (Law, Global Business, FP, Consulting)
-- ユーザーデータには干渉せず、グローバル(user_id=NULL)として永遠に保護される設計
-- Supabase SQL Editor で postgres ロール実行推奨（RLS バイパス）
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. 日本の法律 (Japanese Law)
INSERT INTO public.neo_knowledge (user_id, namespace, key, body)
SELECT NULL, 'neo_core', 'law.jp_corporate_tax_labor', $j${
  "title": "日本の法律（会社法・税法・労働基準法・個人情報保護法）",
  "locale": "ja-JP",
  "summary": "日本の企業運営における必須法的要件の基本ルール",
  "company_law": "会社法: 株主総会・取締役会の運営、資本金、役員の責任。スタートアップは株式譲渡制限条項を設けることが多い。",
  "tax_law": "税法: 消費税（標準10%・軽減8%）、所得税（累進課税）、法人税（実効税率約30%）。インボイス制度対応と青色申告承認が必須。",
  "labor_law": "労働基準法: 法定労働時間（週40時間/1日8時間）、36協定必須、有給休暇義務、割増賃金（残業・深夜・休日）。",
  "privacy_law": "個人情報保護法: 取得時の利用目的の明示、第三者提供の制限、漏えい時の報告義務、安全管理措置が全事業者に適用。"
}$j$::jsonb
WHERE NOT EXISTS (
    SELECT 1 FROM public.neo_knowledge nk
    WHERE nk.user_id IS NULL AND nk.namespace = 'neo_core' AND nk.key = 'law.jp_corporate_tax_labor'
);

-- 2. 海外ビジネス知識 (Overseas Business Knowledge)
INSERT INTO public.neo_knowledge (user_id, namespace, key, body)
SELECT NULL, 'neo_core', 'business.global_trade_tax', $j${
  "title": "海外ビジネス知識（インコタームズ・VAT・国際税務）",
  "locale": "ja-JP",
  "incoterms": "インコタームズ: 貿易条件の国際規則（FOB・CIF・EXW・DDP等）。費用とリスクの移転時期を明確にする。",
  "int_tax_vat": "国際税務＆VAT: 租税条約による二重課税排除、外国税額控除。欧州等での付加価値税（VAT）やリバースチャージ方式の理解。",
  "transfer_pricing": "移転価格税制: 海外関連企業との取引価格を独立企業間価格（ALP）と同等にし、所得移転を防ぐ税制。",
  "exchange_risk": "為替リスク管理: 為替予約契約や先物で決済時の為替変動リスクを固定・軽減する手法。",
  "contracts_wto": "WTOルール＆海外契約: 非差別原則。海外契約では準拠法、裁判管轄、仲裁条項（Force Majeure含む）の規定が致命的に重要。"
}$j$::jsonb
WHERE NOT EXISTS (
    SELECT 1 FROM public.neo_knowledge nk
    WHERE nk.user_id IS NULL AND nk.namespace = 'neo_core' AND nk.key = 'business.global_trade_tax'
);

-- 3. Financial Planner知識 (Financial Planner)
INSERT INTO public.neo_knowledge (user_id, namespace, key, body)
SELECT NULL, 'neo_core', 'finance.fp_level3_core', $j${
  "title": "Financial Planner知識（FP3級相当の家計・投資・税務）",
  "locale": "ja-JP",
  "budgeting": "家計診断＆資金計画: ライフイベント表・キャッシュフロー表作成、住宅ローン（固定vs変動）や教育資金設計。",
  "insurance": "保険商品: 生命保険（定期・終身・養老）、損害保険、第三分野（医療・がん）。必要保障額の算定が要。",
  "investment": "投資信託・株式運用: NISA/iDeCoの非課税メリット活用。複利効果・ポートフォリオ理論による分散投資。",
  "pension": "年金制度: 国民年金（基礎）＋厚生年金の2階建て。マクロ経済スライド、繰り上げ・繰り下げ受給の損益分岐点。",
  "inheritance": "相続・贈与税: 法定相続分、遺留分、基礎控除（3000万＋600万×法定相続人数）、暦年贈与（110万）、相続時精算課税。"
}$j$::jsonb
WHERE NOT EXISTS (
    SELECT 1 FROM public.neo_knowledge nk
    WHERE nk.user_id IS NULL AND nk.namespace = 'neo_core' AND nk.key = 'finance.fp_level3_core'
);

-- 4. ビジネスコンサルティング知識 (Business Consulting)
INSERT INTO public.neo_knowledge (user_id, namespace, key, body)
SELECT NULL, 'neo_core', 'consulting.business_strategy_models', $j${
  "title": "ビジネスコンサルティング知識（戦略フレーム・KPI・資金調達）",
  "locale": "ja-JP",
  "frameworks": "SWOT分析（強み・弱み・機会・脅威）、ビジネスモデルキャンバス（9要素で事業を俯瞰するフレームワーク）。",
  "kpi_kgi": "KPI設定: KGI（最終目標）達成のための先行指標。SMARTの法則（Specific, Measurable, Achievable, Relevant, Time-bound）。",
  "funding": "資金調達方法: デットファイナンス（銀行借入）、エクイティ（VC・エンジェルからの出資）、助成金・補助金等。",
  "growth_pricing": "成長戦略＆価格戦略: アンゾフの成長マトリクス、ペネトレーション（浸透）価格、スキミング（上積み）価格。値決めの心理学。",
  "org_design": "組織設計: 機能別組織、事業部制、マトリクス組織、ティール組織。事業フェーズに応じたガバナンスと権限移譲。"
}$j$::jsonb
WHERE NOT EXISTS (
    SELECT 1 FROM public.neo_knowledge nk
    WHERE nk.user_id IS NULL AND nk.namespace = 'neo_core' AND nk.key = 'consulting.business_strategy_models'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Semantic Cache Updates
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.semantic_cache (user_id, cache_key, payload, expires_at)
SELECT NULL, 'neo_global:law.jp_corporate_tax_labor', $j${"summary": "会社法、税法、労基法（36協定・残業）、個人情報保護漏えいの対処等のまとめ。"}$j$::jsonb, NULL
WHERE NOT EXISTS (
    SELECT 1 FROM public.semantic_cache sc WHERE sc.user_id IS NULL AND sc.cache_key = 'neo_global:law.jp_corporate_tax_labor'
);

INSERT INTO public.semantic_cache (user_id, cache_key, payload, expires_at)
SELECT NULL, 'neo_global:business.global_trade_tax', $j${"summary": "インコタームズ、移転価格、VAT、為替リスク先物、WTO、準拠法などグローバル要件。"}$j$::jsonb, NULL
WHERE NOT EXISTS (
    SELECT 1 FROM public.semantic_cache sc WHERE sc.user_id IS NULL AND sc.cache_key = 'neo_global:business.global_trade_tax'
);

INSERT INTO public.semantic_cache (user_id, cache_key, payload, expires_at)
SELECT NULL, 'neo_global:finance.fp_level3_core', $j${"summary": "家計簿、保険、NISA/iDeCo投資、公的年金、相続税・贈与税控除などFP知識。"}$j$::jsonb, NULL
WHERE NOT EXISTS (
    SELECT 1 FROM public.semantic_cache sc WHERE sc.user_id IS NULL AND sc.cache_key = 'neo_global:finance.fp_level3_core'
);

INSERT INTO public.semantic_cache (user_id, cache_key, payload, expires_at)
SELECT NULL, 'neo_global:consulting.business_strategy', $j${"summary": "SWOT、ビジネスモデルキャンバス、KPI/KGI、エクイティ調達、組織論などコンサル知見。"}$j$::jsonb, NULL
WHERE NOT EXISTS (
    SELECT 1 FROM public.semantic_cache sc WHERE sc.user_id IS NULL AND sc.cache_key = 'neo_global:consulting.business_strategy'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Vector Embeddings Dummies (Ready for AI retrieval pipeline)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.vector_embeddings (user_id, source_ref, embedding, meta)
SELECT NULL, 'neo_core:law.jp_corporate_tax_labor', NULL,
    $j${"chunk": "日本の法律 会社法 税法 労働基準法 36協定 個人情報保護法 法人税", "neo_knowledge_key": "law.jp_corporate_tax_labor"}$j$::jsonb
WHERE NOT EXISTS (
    SELECT 1 FROM public.vector_embeddings ve WHERE ve.user_id IS NULL AND ve.source_ref = 'neo_core:law.jp_corporate_tax_labor'
);

INSERT INTO public.vector_embeddings (user_id, source_ref, embedding, meta)
SELECT NULL, 'neo_core:business.global_trade_tax', NULL,
    $j${"chunk": "海外ビジネス 国際 インコタームズ VAT 移転価格 為替リスク WTO 海外契約 準拠法", "neo_knowledge_key": "business.global_trade_tax"}$j$::jsonb
WHERE NOT EXISTS (
    SELECT 1 FROM public.vector_embeddings ve WHERE ve.user_id IS NULL AND ve.source_ref = 'neo_core:business.global_trade_tax'
);

INSERT INTO public.vector_embeddings (user_id, source_ref, embedding, meta)
SELECT NULL, 'neo_core:finance.fp_level3_core', NULL,
    $j${"chunk": "ファイナンシャルプランナー お金 FP ライフプラン 保険 投資信託 NISA iDeCo 年金 相続税 贈与税", "neo_knowledge_key": "finance.fp_level3_core"}$j$::jsonb
WHERE NOT EXISTS (
    SELECT 1 FROM public.vector_embeddings ve WHERE ve.user_id IS NULL AND ve.source_ref = 'neo_core:finance.fp_level3_core'
);

INSERT INTO public.vector_embeddings (user_id, source_ref, embedding, meta)
SELECT NULL, 'neo_core:consulting.business_strategy_models', NULL,
    $j${"chunk": "コンサルティング 戦略 SWOT キャンバス KPI 資金調達 エクイティ デット 成長戦略 価格戦略 組織論", "neo_knowledge_key": "consulting.business_strategy_models"}$j$::jsonb
WHERE NOT EXISTS (
    SELECT 1 FROM public.vector_embeddings ve WHERE ve.user_id IS NULL AND ve.source_ref = 'neo_core:consulting.business_strategy_models'
);
