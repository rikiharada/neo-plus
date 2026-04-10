/**
 * Dev startup: one-line Gemini config check (no API key material).
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (process.env.NODE_ENV !== 'development') return;
  const { resolveGeminiModel, resolveGeminiApiKeyWithSource } = await import(
    '@/lib/gemini-env'
  );
  const { key } = resolveGeminiApiKeyWithSource();
  console.log(
    `[gemini-env] configured: ${Boolean(key)}, model: ${resolveGeminiModel()}`,
  );
}
