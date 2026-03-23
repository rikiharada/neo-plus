# localhost 検証: 知識リセットとユーザーデータの分離

## 前提

- `supabase/migrations/20260325120000_neo_knowledge_and_rls.sql` を本番／ステージング Supabase に適用済み
- ローカルで `index.html` をサーブ（例: `npx serve .`）
- ログイン済みセッションがあると RPC / RLS が検証しやすい

## 手順

1. **データ作成**  
   ホーム／プロジェクトからプロジェクトを 1 件以上作成し、経費を 1 件以上追加する。

2. **コンソールで知識キャッシュを擬似投入**（任意）  
   ```js
   localStorage.setItem('neo_long_term_soul', JSON.stringify({ likes: ['test'], dislikes: [] }));
   ```

3. **初期化（知識のみ）**  
   ```js
   await window.neoHardReset();
   // または
   await window.resetData();
   ```

4. **期待結果**
   - `localStorage.getItem('neo_long_term_soul')` → `null`
   - `window.mockDB.projects.length` → **リセット前と同じ（0 増減なし）**
   - コンソールに `[Neo][KnowledgeReset]` のログがあり、「projects / activities は変更しません」と出る

5. **スクリーンショット**  
   - プロジェクト一覧が消えていない画面  
   - DevTools Console に上記ログが見えている状態  

## 報告用コンソールログ例（貼り付け用）

成功時の目安:

```
[Neo][KnowledgeReset] 知識レイヤのみクリアします（projects / activities / ローカルボディは変更しません）。
[Neo][KnowledgeReset] RPC reset_neo_knowledge_for_current_user 成功。
```

未マイグレーション時は RPC 失敗後に direct DELETE のログが出るか、テーブル未定義の警告が出る（ローカル知識キーは消えていること）。
