# Neo+ データ初期化ルール（Antigravity / 自動エージェント向け）

## 絶対に守ること

1. **知識系 Supabase テーブル**（`neo_knowledge`, `semantic_cache`, `vector_embeddings`）および **`neo_global_lexicon` の安易な TRUNCATE / 全件 DELETE** は禁止。初期化・Day1・リセットのコードパスからは **DELETE を発行しない**。
2. **ユーザー固有データ**は `projects`, `activities`, `transactions`, `documents` および **`neo_local_body_*`（localStorage）**。**Day 1 / クリーン / ユーザーデータ消去** の指示では、これらを空にする（`window.neoHardReset()` がリモート＋ローカルボディを対象。完了後 `window.refreshNeoUserDataFromRemote()` で再同期）。
3. **`neoHardReset()` / `resetData()`**（`lib/core/neoKnowledgeReset.js` の `neoHardResetKnowledge`）の契約:
   - **消す**: 現在のセッションで RLS により **SELECT できる** `projects` 行と、その `project_id` にぶら下がる子、`user_id = 現在ユーザー` に紐づく行、ローカル `neo_local_body_*` / `mockDB` のユーザーデータ。
   - **消さない**: 上記知識系テーブル。
4. **レガシー行**（`user_id IS NULL` など）は `.eq('user_id')` だけでは消えない。**プロジェクト ID 列挙 → 子テーブル `project_id` で削除 → `projects` 削除** の順を踏む（実装済み）。それでも RLS で DELETE が拒否される場合は、ダッシュボードの SQL または `SECURITY DEFINER` RPC で対応。

## テーブル役割の分離

| 区分 | テーブル / ストレージ | 説明 |
|------|------------------------|------|
| 知識系 | `neo_knowledge`, `semantic_cache`, `vector_embeddings` | AI キャッシュ・ルール・埋め込み（リセット対象外） |
| データ系 | `projects`, `activities`, `transactions`, `documents` | ユーザー固有（RLS。Day 1 で削除対象） |
| ローカル同期 | `neo_local_body_*` | 端末キャッシュ（ユーザーデータ） |

## 実装参照

- Day 1 / ユーザーデータリセット: `window.neoHardReset()` / `window.resetData()` → `neoHardResetKnowledge()`
- 再同期: `window.refreshNeoUserDataFromRemote()`（`js/app.js` の `initSupabaseData` と同一）
- ローカルのみ緊急: `window.neoDangerZoneWipeUserLocalBody()` — リモートに行が残ると再フェッチで復活する

## マイグレーション

`supabase/migrations/20260325120000_neo_knowledge_and_rls.sql` を Supabase に適用後、RPC `reset_neo_knowledge_for_current_user` が利用可能になる（知識系用。ユーザーデータの一括削除が RLS で足りない場合は別 RPC を検討）。
