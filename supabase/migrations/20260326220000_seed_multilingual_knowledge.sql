-- ═══════════════════════════════════════════════════════════════════════════
-- Multilingual Business Knowledge Seed (7 Languages)
-- ユーザーデータには干渉せず、グローバル(user_id=NULL)として一意に保護される設計
-- Supabase SQL Editor で postgres ロール実行推奨（RLS バイパス）
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. 英語 (English)
INSERT INTO public.neo_knowledge (user_id, namespace, key, body)
SELECT NULL, 'neo_core', 'lang.english_business_docs', $j${
  "title": "ビジネス英語（契約書・請求書・メール）",
  "locale": "en-US",
  "summary": "ビジネス英単語、Invoice (請求書), Receipt (領収書), NDA (秘密保持契約) の文例と基本用語",
  "terms": ["Invoice", "Due Date", "Amount Due", "Subtotal", "Tax", "Terms and Conditions"],
  "email_expressions": ["Please find attached the invoice for...", "I am writing to inquire about...", "Best regards,"],
  "contract_terms": ["Hereinafter referred to as...", "Force Majeure", "Confidentiality", "Governing Law"]
}$j$::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.neo_knowledge WHERE user_id IS NULL AND key = 'lang.english_business_docs');

-- 2. 中国語 (Chinese)
INSERT INTO public.neo_knowledge (user_id, namespace, key, body)
SELECT NULL, 'neo_core', 'lang.chinese_business_docs', $j${
  "title": "ビジネス中国語（簡体字・繁体字、契約書・請求書）",
  "locale": "zh-CN",
  "summary": "发票 (Fāpiào, 請求書), 收据 (Shōujù, 領収書), 合同 (Hétong, 契約書) 等の中国語ビジネス語彙",
  "terms": ["账单 (Billing)", "付款截止日期 (Due Date)", "总计 (Total)", "增值税 (VAT)"],
  "email_expressions": ["附件是本月的账单", "期盼您的回复 (Looking forward to your reply)", "敬祝 商祺 (Best regards)"],
  "contract_terms": ["甲方 / 乙方 (Party A / Party B)", "不可抗力 (Force Majeure)", "保密条款 (Confidentiality)"]
}$j$::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.neo_knowledge WHERE user_id IS NULL AND key = 'lang.chinese_business_docs');

-- 3. 韓国語 (Korean)
INSERT INTO public.neo_knowledge (user_id, namespace, key, body)
SELECT NULL, 'neo_core', 'lang.korean_business_docs', $j${
  "title": "ビジネス韓国語（K-コンテンツ関連・請求書）",
  "locale": "ko-KR",
  "summary": "청구서 (Cheonggu-seo, 請求書), 영수증 (Yeongsu-jeung, 領収書), 계약서 (Gyeyak-seo, 契約書) 및 K-콘텐츠 용어",
  "terms": ["지급 기한 (Due Date)", "합계 (Total)", "부가세 (VAT)", "엔터테인먼트 (Entertainment)", "라이선스 (License)"],
  "email_expressions": ["청구서를 첨부합니다", "빠른 회신 부탁드립니다 (Please reply soon)"],
  "contract_terms": ["갑 / 을", "비밀유지 (Confidentiality)", "관할 법원 (Jurisdiction)"]
}$j$::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.neo_knowledge WHERE user_id IS NULL AND key = 'lang.korean_business_docs');

-- 4. スペイン語 (Spanish)
INSERT INTO public.neo_knowledge (user_id, namespace, key, body)
SELECT NULL, 'neo_core', 'lang.spanish_business_latam', $j${
  "title": "スペイン語（中南米・スペインのビジネス用語）",
  "locale": "es-ES",
  "summary": "Factura (請求書), Recibo (領収書), Contrato (契約書) 等のスペイン語基礎",
  "terms": ["Fecha de vencimiento (Due Date)", "Total a Pagar (Total Amount)", "IVA (Value Added Tax)"],
  "email_expressions": ["Adjunto la factura correspondiente", "Quedo a la espera de sus comentarios", "Atentamente,"],
  "contract_terms": ["Fuerza Mayor", "Confidencialidad", "Jurisdicción"]
}$j$::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.neo_knowledge WHERE user_id IS NULL AND key = 'lang.spanish_business_latam');

-- 5. フランス語 (French)
INSERT INTO public.neo_knowledge (user_id, namespace, key, body)
SELECT NULL, 'neo_core', 'lang.french_business_eu', $j${
  "title": "フランス語（欧州圏のビジネス用語）",
  "locale": "fr-FR",
  "summary": "Facture (請求書), Reçu (領収書), Contrat (契約書) 等の欧州取引におけるフランス語基礎",
  "terms": ["Date d'échéance (Due Date)", "Montant Total (Total Amount)", "TVA (VAT)"],
  "email_expressions": ["Veuillez trouver ci-joint la facture", "Dans l'attente de votre réponse", "Cordialement,"],
  "contract_terms": ["Force Majeure", "Clause de Confidentialité", "Droit Applicable"]
}$j$::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.neo_knowledge WHERE user_id IS NULL AND key = 'lang.french_business_eu');

-- 6. ドイツ語 (German)
INSERT INTO public.neo_knowledge (user_id, namespace, key, body)
SELECT NULL, 'neo_core', 'lang.german_business_mfg', $j${
  "title": "ドイツ語（製造業・精密機器関連・欧州ビジネス）",
  "locale": "de-DE",
  "summary": "Rechnung (請求書), Quittung (領収書), Vertrag (契約) などのドイツ語基礎および製造業特化",
  "terms": ["Fälligkeitsdatum (Due Date)", "Gesamtbetrag (Total Amount)", "MwSt (VAT)", "Lieferkette (Supply Chain)"],
  "email_expressions": ["Anbei erhalten Sie die Rechnung", "Mit freundlichen Grüßen,", "Wir freuen uns auf Ihre Rückmeldung"],
  "contract_terms": ["Höhere Gewalt", "Vertraulichkeit", "Gerichtsstand"]
}$j$::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.neo_knowledge WHERE user_id IS NULL AND key = 'lang.german_business_mfg');

-- 7. ポルトガル語 (Portuguese)
INSERT INTO public.neo_knowledge (user_id, namespace, key, body)
SELECT NULL, 'neo_core', 'lang.portuguese_business_br', $j${
  "title": "ポルトガル語（ブラジル・南米ビジネス用語）",
  "locale": "pt-BR",
  "summary": "Fatura / Nota Fiscal (請求書), Recibo (領収書), Contrato (契約書) などのポルトガル語基礎",
  "terms": ["Data de vencimento (Due Date)", "Valor Total (Total Amount)", "Impostos (Taxes)"],
  "email_expressions": ["Segue em anexo a fatura", "Fico no aguardo de um retorno", "Atenciosamente,"],
  "contract_terms": ["Força Maior", "Confidencialidade", "Foro Competente"]
}$j$::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.neo_knowledge WHERE user_id IS NULL AND key = 'lang.portuguese_business_br');

-- ═══════════════════════════════════════════════════════════════════════════
-- Semantic Cache
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.semantic_cache (user_id, cache_key, payload, expires_at)
SELECT NULL, 'neo_global:lang.english_business', $j${"summary": "英語の請求・契約実務。Invoice, NDA等。"}$j$::jsonb, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.semantic_cache WHERE user_id IS NULL AND cache_key = 'neo_global:lang.english_business');

INSERT INTO public.semantic_cache (user_id, cache_key, payload, expires_at)
SELECT NULL, 'neo_global:lang.chinese_business', $j${"summary": "中国語の請求・契約実務。发票, 合同等。"}$j$::jsonb, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.semantic_cache WHERE user_id IS NULL AND cache_key = 'neo_global:lang.chinese_business');

INSERT INTO public.semantic_cache (user_id, cache_key, payload, expires_at)
SELECT NULL, 'neo_global:lang.korean_business', $j${"summary": "韓国語の請求・契約実務。청구서, 계약서 및 K-콘텐츠 용어."}$j$::jsonb, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.semantic_cache WHERE user_id IS NULL AND cache_key = 'neo_global:lang.korean_business');

INSERT INTO public.semantic_cache (user_id, cache_key, payload, expires_at)
SELECT NULL, 'neo_global:lang.spanish_business', $j${"summary": "スペイン語（ラテンアメリカ経理）。Factura, Contrato等。"}$j$::jsonb, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.semantic_cache WHERE user_id IS NULL AND cache_key = 'neo_global:lang.spanish_business');

INSERT INTO public.semantic_cache (user_id, cache_key, payload, expires_at)
SELECT NULL, 'neo_global:lang.french_business', $j${"summary": "フランス語（欧州経理）。Facture, TVA等。"}$j$::jsonb, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.semantic_cache WHERE user_id IS NULL AND cache_key = 'neo_global:lang.french_business');

INSERT INTO public.semantic_cache (user_id, cache_key, payload, expires_at)
SELECT NULL, 'neo_global:lang.german_business', $j${"summary": "ドイツ語（製造業・欧州経理）。Rechnung, MwSt等。"}$j$::jsonb, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.semantic_cache WHERE user_id IS NULL AND cache_key = 'neo_global:lang.german_business');

INSERT INTO public.semantic_cache (user_id, cache_key, payload, expires_at)
SELECT NULL, 'neo_global:lang.portuguese_business', $j${"summary": "ポルトガル語（ブラジル経理）。Nota Fiscal, Fatura等。"}$j$::jsonb, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.semantic_cache WHERE user_id IS NULL AND cache_key = 'neo_global:lang.portuguese_business');

-- ═══════════════════════════════════════════════════════════════════════════
-- Vector Embeddings Dummies
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.vector_embeddings (user_id, source_ref, embedding, meta)
SELECT NULL, 'neo_core:lang.english_business', NULL, $j${"chunk": "English invoices receipts contracts taxes", "neo_knowledge_key": "lang.english_business_docs"}$j$::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.vector_embeddings WHERE user_id IS NULL AND source_ref = 'neo_core:lang.english_business');

INSERT INTO public.vector_embeddings (user_id, source_ref, embedding, meta)
SELECT NULL, 'neo_core:lang.chinese_business', NULL, $j${"chunk": "中文 发票 合同 增值税", "neo_knowledge_key": "lang.chinese_business_docs"}$j$::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.vector_embeddings WHERE user_id IS NULL AND source_ref = 'neo_core:lang.chinese_business');

INSERT INTO public.vector_embeddings (user_id, source_ref, embedding, meta)
SELECT NULL, 'neo_core:lang.korean_business', NULL, $j${"chunk": "한국어 청구서 영수증 계약서 부가세", "neo_knowledge_key": "lang.korean_business_docs"}$j$::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.vector_embeddings WHERE user_id IS NULL AND source_ref = 'neo_core:lang.korean_business');

INSERT INTO public.vector_embeddings (user_id, source_ref, embedding, meta)
SELECT NULL, 'neo_core:lang.spanish_business', NULL, $j${"chunk": "Español Factura Recibo Contrato IVA", "neo_knowledge_key": "lang.spanish_business_latam"}$j$::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.vector_embeddings WHERE user_id IS NULL AND source_ref = 'neo_core:lang.spanish_business');

INSERT INTO public.vector_embeddings (user_id, source_ref, embedding, meta)
SELECT NULL, 'neo_core:lang.french_business', NULL, $j${"chunk": "Français Facture Contrat TVA Reçu", "neo_knowledge_key": "lang.french_business_eu"}$j$::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.vector_embeddings WHERE user_id IS NULL AND source_ref = 'neo_core:lang.french_business');

INSERT INTO public.vector_embeddings (user_id, source_ref, embedding, meta)
SELECT NULL, 'neo_core:lang.german_business', NULL, $j${"chunk": "Deutsch Rechnung Vertrag MwSt Quittung", "neo_knowledge_key": "lang.german_business_mfg"}$j$::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.vector_embeddings WHERE user_id IS NULL AND source_ref = 'neo_core:lang.german_business');

INSERT INTO public.vector_embeddings (user_id, source_ref, embedding, meta)
SELECT NULL, 'neo_core:lang.portuguese_business', NULL, $j${"chunk": "Português Fatura Nota Fiscal Contrato Impostos", "neo_knowledge_key": "lang.portuguese_business_br"}$j$::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.vector_embeddings WHERE user_id IS NULL AND source_ref = 'neo_core:lang.portuguese_business');
