/**
 * app/api/accounting/analyze/route.ts
 * ファイル解析メタデータ記録エンドポイント
 *
 * ⚠️ 実際のファイル解析はブラウザ側（file-analyzer.ts）で完結している。
 *    このエンドポイントは:
 *      1. 認証チェック（誰が何を解析したか）
 *      2. Zod バリデーション
 *      3. 解析メタをサーバー側でロギング（audit trail）
 *      4. 将来の OCR エンドポイントの土台
 *
 * POST /api/accounting/analyze
 * Body: { fileName, fileKind, fileSize }
 * Returns: { ok: true } | { ok: false, error: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z }                         from 'zod';
import { requireAuth }               from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';

// ─── バリデーションスキーマ ──────────────────────────────────────

const AnalyzeRequestSchema = z.object({
  /** ドロップされたファイル名（サニタイズ済み想定） */
  fileName: z.string().min(1).max(260),
  /** file-analyzer.ts が判定した種別 */
  fileKind: z.enum(['csv', 'excel', 'pdf', 'image', 'unknown']),
  /** バイト数 */
  fileSize: z.number().int().nonnegative().max(12 * 1024 * 1024), // 12MB 上限
});

type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

// ─── Route Handler ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ① 認証
  let userId: string;
  try {
    const user = await requireAuth();
    userId = user.id;
  } catch {
    return NextResponse.json({ ok: false, error: '認証が必要です' }, { status: 401 });
  }

  // ② レート制限（driveFileUpload プリセット: 15/min）
  try {
    await checkRateLimit(`accounting:analyze:${userId}`, RATE_LIMIT_PRESETS.driveFileUpload);
  } catch {
    return NextResponse.json(
      { ok: false, error: 'リクエストが多すぎます。少し待ってから再試行してください。' },
      { status: 429 },
    );
  }

  // ③ JSON パース
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'リクエストボディが不正です' }, { status: 400 });
  }

  // ④ Zod バリデーション
  const parsed = AnalyzeRequestSchema.safeParse(body);
  if (!parsed.success) {
    const errorMsg = parsed.error.errors[0]?.message ?? '入力が正しくありません';
    return NextResponse.json({ ok: false, error: errorMsg }, { status: 400 });
  }

  const { fileName, fileKind, fileSize }: AnalyzeRequest = parsed.data;

  // ⑤ 監査ログ（開発時は console、本番は structured logging / Supabase に保存）
  console.info('[API] /api/accounting/analyze', {
    userId,
    fileName: fileName.slice(0, 80), // PII を最小化
    fileKind,
    fileSizeKb: Math.round(fileSize / 1024),
    ts: new Date().toISOString(),
  });

  // ─ 将来: Step 2 でここに OCR / Gemini Vision 呼び出しを追加 ─

  return NextResponse.json({ ok: true });
}

// HEAD / OPTIONS は Next.js が自動処理
export const dynamic = 'force-dynamic';
