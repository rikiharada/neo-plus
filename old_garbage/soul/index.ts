/**
 * soul/index.ts
 * Neo+ Soul Container — Vanilla JS ブリッジ
 *
 * このファイルは TypeScript をトランスパイルせずに使うための
 * 「つなぎ役」です。
 *
 * 現在の gemini.js（vanilla JS）から呼び出すには:
 *   1. このファイルを esbuild 等で bundle してブラウザ向けにビルドする
 *   2. または index.html に <script type="module"> で読み込む
 *   3. ビルド後は window.NeoSoul として参照できる
 *
 * 使用例（gemini.js 内）:
 * ```js
 * // Gemini 生出力を Soul でフィルタリング
 * if (window.NeoSoul) {
 *   const uid = window.GlobalStore?.state?.user?.id ?? null;
 *   const soul = await window.NeoSoul.loadSoul(window.supabaseClient, uid);
 *   intents = window.NeoSoul.applySoulVanilla(intents, soul, {
 *     todayEntryCount: window.mockDB?.activities?.length ?? 0,
 *     lastEncouragementAt: window._lastSoulEncouragementAt,
 *   });
 *   if (window.NeoSoul._lastOutput?.encouragementInjected) {
 *     window._lastSoulEncouragementAt = Date.now();
 *   }
 * }
 * ```
 */

export { NEO_DEFAULT_SOUL }        from './config.ts';
export type {
  NeoSoul,
  SoulTraits,
  SoulVoice,
  SoulResponseStyle,
  SoulPersona,
  BehaviorRule,
  SoulOverride,
  SoulRow,
  TraitScore,
}                                   from './config.ts';
export { traitScore }              from './config.ts';

export {
  applySoul,
  applySoulServerAction,
  applySoulVanilla,
}                                   from './middleware.ts';
export type {
  GeminiIntentAction,
  SoulMiddlewareInput,
  SoulMiddlewareOutput,
  SoulContext,
}                                   from './middleware.ts';

export {
  loadSoul,
  loadDefaultSoul,
  loadSoulForUser,
  mergeSoulOverride,
  clearSoulCache,
  getSoulCacheStatus,
  debugSoul,
  createSoulServerAction,
}                                   from '../lib/soul.ts';
export type { SupabaseLike }       from '../lib/soul.ts';
