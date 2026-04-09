/**
 * lib/soul.ts
 * Neo+ Soul Container — Supabase Soul ローダー
 *
 * 機能:
 *   - Supabase `souls` テーブルからユーザーSoulまたはデフォルトSoulを読み込む
 *   - インメモリキャッシュ（TTL: 5分）で過剰なDB呼び出しを防止
 *   - ユーザーSoulが存在しない場合はデフォルトSoulにフォールバック
 *   - SoulOverride のマージ処理
 *   - 将来のカスタムSoul設計に対応した拡張ポイント
 *
 * Supabase テーブル設計（参考）:
 * ```sql
 * create table souls (
 *   id           text primary key,
 *   version      text not null,
 *   persona      jsonb not null,
 *   traits       jsonb not null,
 *   voice        jsonb not null,
 *   response_style jsonb not null,
 *   behavior_rules jsonb not null,
 *   is_active    boolean not null default true,
 *   user_id      uuid references auth.users(id),
 *   created_at   timestamptz not null default now(),
 *   updated_at   timestamptz not null default now()
 * );
 * -- デフォルトSoulは user_id = null
 * -- ユーザーSoulは user_id = <uuid>
 * create index on souls (user_id, is_active);
 * ```
 */

import type { NeoSoul, SoulRow, SoulOverride } from '../soul/config.ts';
import { NEO_DEFAULT_SOUL } from '../soul/config.ts';

// ─── Supabase クライアント型（軽量インターフェース） ──────────────

/**
 * supabase-js v2 の最小インターフェース。
 * Next.js では `createClient` 、vanilla では `window.supabaseClient` を注入する。
 */
export interface SupabaseLike {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string | null): {
        eq(col: string, val: boolean): {
          maybeSingle(): Promise<{ data: unknown; error: unknown }>;
          limit(n: number): {
            maybeSingle(): Promise<{ data: unknown; error: unknown }>;
          };
        };
        limit(n: number): {
          maybeSingle(): Promise<{ data: unknown; error: unknown }>;
        };
        order(col: string, opts?: { ascending: boolean }): {
          limit(n: number): {
            maybeSingle(): Promise<{ data: unknown; error: unknown }>;
          };
        };
      };
    };
  };
}

// ─── キャッシュ層 ────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5分

interface CacheEntry {
  soul: NeoSoul;
  expiresAt: number;
}

/** インメモリキャッシュ: key = userId | 'default' */
const soulCache = new Map<string, CacheEntry>();

const getCached = (key: string): NeoSoul | null => {
  const entry = soulCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    soulCache.delete(key);
    return null;
  }
  return entry.soul;
};

const setCache = (key: string, soul: NeoSoul): void => {
  soulCache.set(key, { soul, expiresAt: Date.now() + CACHE_TTL_MS });
};

/** テスト・リセット用にキャッシュをクリアする */
export const clearSoulCache = (): void => {
  soulCache.clear();
};

// ─── DB Row → NeoSoul 変換 ───────────────────────────────────────

/**
 * Supabase から返る snake_case の Row を camelCase の NeoSoul に変換する。
 * DB に保存された JSON は既に型に合った構造であることを前提とする。
 */
const rowToSoul = (row: SoulRow): NeoSoul => ({
  id:            row.id,
  version:       row.version,
  persona:       row.persona,
  traits:        row.traits,
  voice:         row.voice,
  responseStyle: row.response_style,
  behaviorRules: row.behavior_rules,
  isActive:      row.is_active,
  userId:        row.user_id,
  createdAt:     row.created_at,
  updatedAt:     row.updated_at,
});

/**
 * SoulOverride をベースSoulにディープマージする。
 * traits / responseStyle は個別フィールドレベルでマージする。
 */
export const mergeSoulOverride = (base: NeoSoul, override: SoulOverride): NeoSoul => ({
  ...base,
  traits: override.traits
    ? { ...base.traits, ...override.traits }
    : base.traits,
  responseStyle: override.responseStyle
    ? { ...base.responseStyle, ...override.responseStyle }
    : base.responseStyle,
  voice: override.voice
    ? {
        sentenceEndings:    override.voice.sentenceEndings    ?? base.voice.sentenceEndings,
        encouragementPhrases: override.voice.encouragementPhrases ?? base.voice.encouragementPhrases,
        transitionPhrases:  override.voice.transitionPhrases  ?? base.voice.transitionPhrases,
        praisePhrases:      override.voice.praisePhrases      ?? base.voice.praisePhrases,
        alertPrefixes:      override.voice.alertPrefixes      ?? base.voice.alertPrefixes,
      }
    : base.voice,
});

// ─── ローダー関数 ────────────────────────────────────────────────

/**
 * デフォルトSoulをSupabaseから取得する。
 * DB に存在しない場合はコードにハードコードされた NEO_DEFAULT_SOUL を返す。
 */
export const loadDefaultSoul = async (
  supabase: SupabaseLike,
): Promise<NeoSoul> => {
  const cacheKey = 'default';
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const { data, error } = await supabase
      .from('souls')
      .select('*')
      .eq('user_id', null as unknown as string)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      console.info('[Soul] Default soul not found in DB; using bundled NEO_DEFAULT_SOUL.');
      setCache(cacheKey, NEO_DEFAULT_SOUL);
      return NEO_DEFAULT_SOUL;
    }

    const soul = rowToSoul(data as SoulRow);
    setCache(cacheKey, soul);
    return soul;
  } catch (e) {
    console.warn('[Soul] Failed to fetch default soul:', e);
    return NEO_DEFAULT_SOUL;
  }
};

/**
 * ユーザーごとのカスタムSoulを取得する。
 *
 * 解決優先度:
 *   1. キャッシュ
 *   2. Supabase `souls` テーブル（user_id = userId）
 *   3. デフォルトSoul（ユーザーSoulが未作成の場合）
 *
 * @param supabase - Supabase クライアント
 * @param userId   - Supabase Auth の user UUID
 * @param override - UI設定等から動的に適用する差分（省略可）
 */
export const loadSoulForUser = async (
  supabase: SupabaseLike,
  userId: string,
  override?: SoulOverride,
): Promise<NeoSoul> => {
  const cacheKey = `user:${userId}`;
  let soul = getCached(cacheKey);

  if (!soul) {
    try {
      const { data, error } = await supabase
        .from('souls')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        soul = rowToSoul(data as SoulRow);
        setCache(cacheKey, soul);
      } else {
        // ユーザーSoulが存在しない → デフォルトにフォールバック
        soul = await loadDefaultSoul(supabase);
      }
    } catch (e) {
      console.warn(`[Soul] Failed to load soul for user ${userId}:`, e);
      soul = NEO_DEFAULT_SOUL;
    }
  }

  // オーバーライドがあればマージ
  return override ? mergeSoulOverride(soul, override) : soul;
};

/**
 * loadSoul — 統合エントリポイント。
 *
 * - userId が指定されていればユーザーSoulを試みる
 * - なければデフォルトSoulを返す
 * - supabase が null の場合（オフライン・テスト環境）はバンドル済みデフォルトを返す
 *
 * @example Next.js Server Component
 * ```ts
 * import { createClient } from '@/lib/supabase/server'
 * import { loadSoul } from '@/lib/soul'
 *
 * export default async function ChatPage() {
 *   const supabase = createClient()
 *   const { data: { user } } = await supabase.auth.getUser()
 *   const soul = await loadSoul(supabase, user?.id)
 *   // ...
 * }
 * ```
 *
 * @example Vanilla JS (gemini.js)
 * ```js
 * const soul = await window.NeoSoul.loadSoul(window.supabaseClient, uid);
 * ```
 */
export const loadSoul = async (
  supabase: SupabaseLike | null | undefined,
  userId?: string | null,
  override?: SoulOverride,
): Promise<NeoSoul> => {
  if (!supabase) {
    console.info('[Soul] No Supabase client; returning bundled default.');
    return override ? mergeSoulOverride(NEO_DEFAULT_SOUL, override) : NEO_DEFAULT_SOUL;
  }

  if (userId) {
    return loadSoulForUser(supabase, userId, override);
  }

  const defaultSoul = await loadDefaultSoul(supabase);
  return override ? mergeSoulOverride(defaultSoul, override) : defaultSoul;
};

// ─── Next.js 15 Server Action ラッパー ──────────────────────────

/**
 * Next.js Server Action としてクライアントから呼び出す場合のファクトリ。
 *
 * @example
 * ```ts
 * // app/actions/soul.ts
 * 'use server'
 * import { createClient } from '@/lib/supabase/server'
 * import { createSoulServerAction } from '@/lib/soul'
 *
 * export const getSoul = createSoulServerAction();
 * ```
 */
export const createSoulServerAction = () => {
  return async (userId?: string): Promise<NeoSoul> => {
    // Next.js Server Action 内では動的に supabase を生成する
    // （import は呼び出し元で行い、このファクトリは型のみ保証）
    console.warn('[Soul] createSoulServerAction: supabase client must be injected by caller.');
    return NEO_DEFAULT_SOUL;
  };
};

// ─── Soul 診断ユーティリティ ─────────────────────────────────────

/**
 * 現在のキャッシュ状態を返す（デバッグ用）。
 */
export const getSoulCacheStatus = (): Record<string, { expiresIn: number }> => {
  const status: Record<string, { expiresIn: number }> = {};
  for (const [key, entry] of soulCache.entries()) {
    status[key] = { expiresIn: Math.max(0, entry.expiresAt - Date.now()) };
  }
  return status;
};

/**
 * Soul の設定を人間が読みやすい形でコンソールに出力する（開発時のみ）。
 */
export const debugSoul = (soul: NeoSoul): void => {
  if (process.env.NODE_ENV === 'production') return;
  console.group(`[Soul Debug] ${soul.persona.name} v${soul.version}`);
  console.log('Traits:',        soul.traits);
  console.log('Response Style:', soul.responseStyle);
  console.log('Rules:',         soul.behaviorRules.map((r) => `[P${r.priority}] ${r.id}`));
  console.groupEnd();
};
