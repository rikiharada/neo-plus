/**
 * GET /api/chat/health
 * Server-only Gemini env check（キー本体は返さない）。Vercel / ローカルでの注入確認用。
 */

import { NextResponse } from 'next/server';
import {
  GeminiEnvConfigurationError,
  getGeminiApiKey,
  resolveGeminiApiKeyWithSource,
  resolveGeminiModel,
  resolveGeminiApiVersion,
} from '@/lib/gemini-env';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    getGeminiApiKey();
    const { source } = resolveGeminiApiKeyWithSource();
    return NextResponse.json({
      ok:     true,
      gemini: {
        configured: true,
        envSource:  source,
        model:      resolveGeminiModel(),
        apiVersion: resolveGeminiApiVersion(),
      },
    });
  } catch (e) {
    const devHint =
      process.env.NODE_ENV === 'development' && e instanceof GeminiEnvConfigurationError
        ? e.message
        : undefined;
    return NextResponse.json({
      ok:     true,
      gemini: {
        configured: false,
        envSource:  null,
        ...(devHint ? { devHint } : {}),
      },
    });
  }
}
