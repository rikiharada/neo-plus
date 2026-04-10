/**
 * app/api/accounting/action/route.ts
 * Agentic アクション実行エンドポイント — スケルトン（Step 2 以降）
 *
 * Step 2 で実装予定の機能:
 *   - Agentic Loop の pendingActions 実行（自動仕分け・DB 保存）
 *   - 「Neoに全部任せる」モードの実際のアクション適用
 *   - 仕訳エントリの一括作成 / 更新
 *   - 書類 OCR 結果からの Activity レコード生成
 *
 * セキュリティ要件（Step 2 実装時に必ず追加）:
 *   1. requireAuth() — ユーザー認証
 *   2. checkRateLimit() — chatAgenticConfirm プリセット（12/min）
 *   3. Zod バリデーション — actionType, payload
 *   4. HMAC 署名検証 — verifyPendingActionsApproval()
 *   5. Nonce クレーム — claimAgenticPendingNonce() でリプレイ防止
 *   6. RLS + .eq('user_id', user.id) — Supabase 書き込み
 *
 * POST /api/accounting/action
 * Body: { actionType, payload, approvalToken, nonce }
 * Returns: { ok: true, result } | { ok: false, error: string }
 */

import { NextRequest, NextResponse } from 'next/server';

// ─── スケルトン ──────────────────────────────────────────────────

export async function POST(_req: NextRequest) {
  // TODO Step 2: 上記セキュリティ要件をすべて実装してから本体を書く
  return NextResponse.json(
    {
      ok:    false,
      error: 'このエンドポイントは Step 2 で実装予定です。',
      code:  'NOT_IMPLEMENTED',
    },
    { status: 501 },
  );
}

export const dynamic = 'force-dynamic';
