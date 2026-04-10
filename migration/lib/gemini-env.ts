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
 * Optional (server): `GEMINI_MODEL` (default `gemini-2.0-flash`) and
 * `GEMINI_MODEL_FALLBACK` (default `gemini-1.5-flash`) — primary が HTTP エラーのとき 1 回だけフォールバックします（401/403 は除く）。
 *
 * Common mistakes:
 * - Using NEXT_PUBLIC_GEMINI_API_KEY (server secrets must NOT use NEXT_PUBLIC_).
 * - Editing .env but the app loads .env.local from `migration/`.
 * - Forgetting restart / redeploy after changing env.
 */

const DEV = process.env.NODE_ENV === 'development';

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
  console.log('[gemini-env]', {
    resolvedSource: source ?? 'none',
    configured:     Boolean(key),
    keyLength:      key ? key.length : 0,
    checkedNames:   [
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
