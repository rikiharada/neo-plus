/**
 * features/soul/server.ts
 * Server-side Soul loader for Server Actions / Server Components
 *
 * ⚠️ このファイルは Server Components / Server Actions のみで呼ぶ。
 *    'use server' ではないが、サーバー専用モジュールとして扱う。
 *
 * Soul Container の優先順位:
 *   1. DB の souls テーブル（user_id が一致する最新レコード）
 *   2. DB の souls テーブル（user_id が NULL のデフォルトレコード）
 *   3. ハードコードされた NEO_DEFAULT_SOUL フォールバック
 */

import { createServerActionClient } from '@/lib/supabase/server';
import type { SoulRow }             from '@/lib/supabase/types';

// ─── デフォルト Soul 定義 ─────────────────────────────────────────

export interface NeoSoul {
  persona: {
    name:        string;
    role:        string;
    description: string;
  };
  traits: {
    warmth:        number; // 0-1
    precision:     number; // 0-1
    encouragement: number; // 0-1
    formality:     number; // 0-1
  };
  voice: {
    greeting:      string;
    signoff:       string;
    uncertainty:   string;
  };
  response_style: {
    max_length:    'short' | 'medium' | 'long';
    use_emoji:     boolean;
    use_bullets:   boolean;
    language:      'ja' | 'en' | 'auto';
  };
  behavior_rules: Array<{
    id:       string;
    trigger:  string;
    action:   string;
    priority: number;
  }>;
}

export const NEO_DEFAULT_SOUL: NeoSoul = {
  persona: {
    name:        'Neo',
    role:        '会計エージェント',
    description: 'フリーランサーの経理を自律的にサポートするAIアシスタント',
  },
  traits: {
    warmth:        0.72,
    precision:     0.96,
    encouragement: 0.78,
    formality:     0.68,
  },
  voice: {
    greeting:    'こんにちは！今日も一緒に頑張りましょう。',
    signoff:     'また何かあれば気軽に声をかけてください。',
    uncertainty: 'その点については確認が必要ですが、',
  },
  response_style: {
    max_length: 'medium',
    use_emoji:  false,
    use_bullets: true,
    language:   'ja',
  },
  behavior_rules: [
    {
      id:       'no-advice',
      trigger:  'tax advice request',
      action:   'append_disclaimer',
      priority: 1,
    },
    {
      id:       'encourage-weekly',
      trigger:  'week_end',
      action:   'inject_encouragement',
      priority: 2,
    },
  ],
};

// ─── キャッシュ（リクエスト間ではなくモジュールレベル） ────────────

const _cache = new Map<string, { soul: NeoSoul; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5分

function _getCached(key: string): NeoSoul | null {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _cache.delete(key);
    return null;
  }
  return entry.soul;
}

function _setCache(key: string, soul: NeoSoul): void {
  _cache.set(key, { soul, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ─── Soul ローダー ───────────────────────────────────────────────

/**
 * サーバーサイドで Soul を取得する。
 * キャッシュ → DB（ユーザー固有）→ DB（デフォルト）→ ハードコードの順で探索。
 *
 * @param userId  認証ユーザーの UUID（未認証の場合は null）
 */
export async function loadSoulServer(userId: string | null): Promise<NeoSoul> {
  const cacheKey = userId ?? '__default__';
  const cached = _getCached(cacheKey);
  if (cached) return cached;

  try {
    const supabase = await createServerActionClient();

    // ① ユーザー固有の Soul を検索
    if (userId) {
      const { data: userSoul } = await supabase
        .from('souls')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (userSoul) {
        const soul = _rowToSoul(userSoul);
        _setCache(cacheKey, soul);
        return soul;
      }
    }

    // ② デフォルト Soul（user_id IS NULL）を検索
    const { data: defaultSoul } = await supabase
      .from('souls')
      .select('*')
      .is('user_id', null)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (defaultSoul) {
      const soul = _rowToSoul(defaultSoul);
      _setCache(cacheKey, soul);
      return soul;
    }
  } catch (err) {
    console.error('[Soul] DB load failed, using default:', err);
  }

  // ③ ハードコードフォールバック
  _setCache(cacheKey, NEO_DEFAULT_SOUL);
  return NEO_DEFAULT_SOUL;
}

// ─── 型変換ヘルパー ─────────────────────────────────────────────

function _rowToSoul(row: SoulRow): NeoSoul {
  // DB の JSON カラムを NeoSoul 型に変換
  // ⚠️ DB スキーマが変わったらここも更新すること
  return {
    persona:        (row.persona        as NeoSoul['persona'])        ?? NEO_DEFAULT_SOUL.persona,
    traits:         (row.traits         as NeoSoul['traits'])         ?? NEO_DEFAULT_SOUL.traits,
    voice:          (row.voice          as NeoSoul['voice'])          ?? NEO_DEFAULT_SOUL.voice,
    response_style: (row.response_style as NeoSoul['response_style']) ?? NEO_DEFAULT_SOUL.response_style,
    behavior_rules: (row.behavior_rules as NeoSoul['behavior_rules']) ?? NEO_DEFAULT_SOUL.behavior_rules,
  };
}
