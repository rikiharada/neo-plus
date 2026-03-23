# Neo コア知識シードの検証

## 適用方法

1. Supabase ダッシュボード → **SQL Editor**
2. `supabase/migrations/20260326200000_seed_neo_core_knowledge.sql` の内容を貼り付けて **Run**（`20260325120000` が未適用なら先にそちらを実行）

再実行しても **同一 `key` / `cache_key` / `source_ref` は追加されません**（`WHERE NOT EXISTS`）。

## 確認用 SELECT（Table Editor のスクショでも可）

```sql
-- neo_knowledge（グローバル・neo_core）
SELECT namespace, key, body->>'title' AS title, updated_at
FROM neo_knowledge
WHERE user_id IS NULL AND namespace = 'neo_core'
ORDER BY key;

-- semantic_cache（グローバル）
SELECT cache_key, payload
FROM semantic_cache
WHERE user_id IS NULL AND cache_key LIKE 'neo_global:%'
ORDER BY cache_key;

-- vector_embeddings（グローバル・embedding は NULL 可）
SELECT source_ref, meta->>'chunk' AS chunk_preview
FROM vector_embeddings
WHERE user_id IS NULL AND source_ref LIKE 'neo_core:%'
ORDER BY source_ref;
```

## 期待される key / cache_key（サンプル）

| neo_knowledge.key | 概要 |
|-------------------|------|
| `tax.consumption_jp` | 消費税 10% / 8% |
| `expense.categories_jp` | 経費科目一覧 |
| `doc.invoice_receipt_required_jp` | 請求書・領収書の項目 |
| `tax.freelancer_filing_overview_jp` | 確定申告概要 |
| `app.neo_plus_transaction_flow` | Neo+ 取引フロー |

`semantic_cache.cache_key` は `neo_global:...` プレフィックス。

---

**注:** このリポジトリからはあなたの Supabase に直接接続できないため、**実際のテーブルスクショは上記 SQL 実行後にご取得ください。** `neoHardReset()` は **あなたの user_id の行だけ**削除するため、`user_id IS NULL` の本シードは消えません。
