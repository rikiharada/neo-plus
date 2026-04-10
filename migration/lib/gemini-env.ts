/**
 * Gemini API key (server-only) — same contract as `lib/supabase/public-env.ts`:
 * **missing value → throw** so failures are never silent.
 *
 * ─── How to verify env ───────────────────────────────────────────
 *
 * Local (next dev):
 * 1. Open or create `migration/.env.local`.
 * 2. Add one of (quoted, one line, not commented with `#`):
 *    - GEMINI_API_KEY="..." (recommended — Google AI Studio)
 *    - GOOGLE_GENERATIVE_AI_API_KEY="..."
 *    - GOOGLE_API_KEY="..." (only if not used for another Google product)
 * 3. Fully stop the dev server, then start again (env is inlined at build/start).
 * 4. Open GET /api/chat/health — `gemini.configured` should be true.
 *
 * Vercel:
 * 1. Project → Settings → Environment Variables.
 * 2. Add GEMINI_API_KEY for Production / Preview / Development as needed.
 * 3. Redeploy after saving.
 * 4. Visit https://<your-host>/api/chat/health and confirm configured: true.
 *
 * プライマリは **Gemini 3 Flash**（既定 `gemini-3-flash`。`GEMINI_MODEL_PRIMARY` で上書き可。404 時は `_callGemini` 内で `gemini-3-flash-preview` を 1 回試行）。
 * それでも失敗時は **1 回** `gemini-1.5-flash`（`GEMINI_MODEL_FALLBACK` で上書き可）。401/403・安全ブロックは除く。
 * REST の API 版は `GEMINI_API_VERSION`（`v1` | `v1beta`、**未設定は `v1beta`** — `@google/generative-ai` の既定と一致）。
 *
 * Common mistakes:
 * - Using NEXT_PUBLIC_GEMINI_API_KEY (server secrets must NOT use NEXT_PUBLIC_).
 * - Editing .env but the app loads .env.local from `migration/`.
 * - Forgetting restart / redeploy after changing env.
 */

const DEV = process.env.NODE_ENV === 'development';

/** Gemini 3 Flash（ユーザー指定 ID。環境・リージョンにより `gemini-3-flash-preview` が必要な場合あり） */
export const DEFAULT_GEMINI_MODEL = 'gemini-3-flash' as const;

/** `gemini-3-flash` が 404 のとき、`_callGemini` が試す別名（Google公式プレビュー表記） */
export const GEMINI_3_FLASH_ALIAS_PREVIEW = 'gemini-3-flash-preview' as const;

/** プライマリ（およびプレビュー別名）がともに失敗したときの安定版 Flash */
export const DEFAULT_GEMINI_MODEL_FALLBACK = 'gemini-1.5-flash' as const;

export type GeminiApiVersion = 'v1' | 'v1beta';

/**
 * チャット用プライマリモデル — 既定 {@link DEFAULT_GEMINI_MODEL}（`gemini-3-flash`）。
 * `GEMINI_MODEL_PRIMARY` があれば最優先。
 */
export function resolveGeminiModel(): string {
  const raw = process.env.GEMINI_MODEL_PRIMARY?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_GEMINI_MODEL;
}

/**
 * プライマリ失敗時のフォールバック（{@link DEFAULT_GEMINI_MODEL_FALLBACK}）。
 * `GEMINI_MODEL_FALLBACK` で上書き可。
 */
export function resolveGeminiModelFallback(): string {
  const raw = process.env.GEMINI_MODEL_FALLBACK?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_GEMINI_MODEL_FALLBACK;
}

/** Reads `GEMINI_API_VERSION`: `v1` or `v1beta`; otherwise defaults to `v1beta` (SDK default). */
export function resolveGeminiApiVersion(): GeminiApiVersion {
  const v = process.env.GEMINI_API_VERSION?.trim().toLowerCase();
  if (v === 'v1beta' || v === 'v1') return v;
  return 'v1beta';
}

export type GeminiEnvSource =
  | 'GEMINI_API_KEY'
  | 'GOOGLE_GENERATIVE_AI_API_KEY'
  | 'GOOGLE_API_KEY'
  | null;

/** Thrown when no Gemini key is configured — catch in `_callGemini` and map to Soul `config`. */
export class GeminiEnvConfigurationError extends Error {
  override name = 'GeminiEnvConfigurationError';
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, GeminiEnvConfigurationError.prototype);
  }
}

let _geminiEnvDebugLogged = false;

function debugLogGeminiEnvOnce(): void {
  const enabled =
    process.env.NEO_DEBUG_GEMINI === '1' || process.env.NODE_ENV === 'development';
  if (!enabled || _geminiEnvDebugLogged) return;
  _geminiEnvDebugLogged = true;

  const { key, source } = resolveGeminiApiKeyWithSource();
  const configured = Boolean(key);
  const model = resolveGeminiModel();
  console.log('[gemini-env]', {
    resolvedSource: source ?? 'none',
    configured,
    model,
    apiVersion: resolveGeminiApiVersion(),
    keyLength:  key ? key.length : 0,
    checkedNames: [
      'GEMINI_API_KEY',
      'GOOGLE_GENERATIVE_AI_API_KEY',
      'GOOGLE_API_KEY',
    ].map((n) => ({
      name:    n,
      present: Boolean(process.env[n as keyof NodeJS.ProcessEnv]?.trim()),
    })),
  });
}

/**
 * First non-empty env var wins (diagnostics only — never log the secret).
 */
export function resolveGeminiApiKeyWithSource(): {
  key:    string | null;
  source: GeminiEnvSource;
} {
  const pairs: Array<{ name: GeminiEnvSource; value: string | undefined }> = [
    { name: 'GEMINI_API_KEY', value: process.env.GEMINI_API_KEY },
    {
      name: 'GOOGLE_GENERATIVE_AI_API_KEY',
      value: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    },
    { name: 'GOOGLE_API_KEY', value: process.env.GOOGLE_API_KEY },
  ];

  for (const { name, value } of pairs) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return { key: value.trim(), source: name };
    }
  }
  return { key: null, source: null };
}

export function resolveGeminiApiKey(): string | null {
  return resolveGeminiApiKeyWithSource().key;
}

/**
 * Required for Gemini calls. Throws `GeminiEnvConfigurationError` if unset.
 */
export function getGeminiApiKey(): string {
  debugLogGeminiEnvOnce();
  const { key, source } = resolveGeminiApiKeyWithSource();
  if (!key) {
    const msg =
      'Gemini env missing: set GEMINI_API_KEY (recommended), or GOOGLE_GENERATIVE_AI_API_KEY, or GOOGLE_API_KEY in migration/.env.local (local) or Vercel Environment Variables. Restart dev server or redeploy after changes.';
    console.error('[gemini-env]', msg);
    throw new GeminiEnvConfigurationError(msg);
  }
  if (DEV) {
    console.info(`[gemini-env] using ${source} (key length=${key.length})`);
  }
  return key;
}

/** Dev-only helper log at arbitrary call sites. */
export function logGeminiEnvDiagnostics(context: string): void {
  if (!DEV) return;
  const { key, source } = resolveGeminiApiKeyWithSource();
  console.info(
    `[gemini-env] ${context} — source=${source ?? 'none'} configured=${Boolean(key)}` +
      (key ? ` keyLength=${key.length}` : ''),
  );
}
