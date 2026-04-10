/**
 * lib/rate-limit.ts
 * サーバーサイド レート制限
 *
 * アーキテクチャ:
 *   - 開発/単一サーバー: インメモリ LRU キャッシュ（デフォルト）
 *   - 本番/複数インスタンス: Upstash Redis（環境変数で切り替え）
 *
 * ⚠️ 注意:
 *   Next.js の Edge Runtime ではインメモリキャッシュが各エッジノードに分散する。
 *   本番では UPSTASH_REDIS_REST_URL を設定して Redis に切り替えること。
 *
 * 使い方（Server Action の先頭で呼ぶ）:
 *   await checkRateLimit(`chat:${userId}`, { limit: 20, windowMs: 60_000 });
 *   // 超過時は Error('RATE_LIMITED') をスロー
 */

import { headers } from 'next/headers';

// ─── 型定義 ─────────────────────────────────────────────────────

export interface RateLimitConfig {
  /** ウィンドウ内の最大リクエスト数 */
  limit:     number;
  /** ウィンドウの長さ（ミリ秒） */
  windowMs:  number;
}

export interface RateLimitResult {
  success:    boolean;
  remaining:  number;
  resetAt:    Date;
}

// ─── インメモリストア ─────────────────────────────────────────────

interface StoreEntry {
  count:    number;
  resetAt:  number;
}

// モジュールレベルのシングルトン（インスタンス間でリセットされるため開発専用）
const _store = new Map<string, StoreEntry>();
const MAX_STORE_SIZE = 10_000;  // メモリリーク防止

function _storeGet(key: string): StoreEntry | undefined {
  return _store.get(key);
}

function _storeSet(key: string, entry: StoreEntry): void {
  if (_store.size >= MAX_STORE_SIZE) {
    // 最も古いエントリを削除（LRU の簡易実装）
    const firstKey = _store.keys().next().value;
    if (firstKey) _store.delete(firstKey);
  }
  _store.set(key, entry);
}

// ─── Redis ストア（本番向け） ─────────────────────────────────────

let _redisClient: RedisLikeClient | null = null;

interface RedisLikeClient {
  incr:   (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<void>;
  ttl:    (key: string) => Promise<number>;
}

/**
 * Upstash Redis クライアントを遅延初期化する。
 * UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN が設定されている場合のみ有効。
 */
async function _getRedisClient(): Promise<RedisLikeClient | null> {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  if (!_redisClient) {
    // ⚠️ @upstash/redis は optional dependency — 本番で使う場合は npm install @upstash/redis
    try {
      const { Redis } = await import('@upstash/redis');
      const client = new Redis({ url, token });
      _redisClient = {
        incr:   (key) => client.incr(key),
        expire: (key, sec) => client.expire(key, sec).then(() => {}),
        ttl:    (key) => client.ttl(key),
      };
    } catch {
      console.warn('[RateLimit] @upstash/redis not available, falling back to in-memory');
      return null;
    }
  }
  return _redisClient;
}

// ─── レート制限チェック ──────────────────────────────────────────

/**
 * レート制限チェックを行い、超過時は Error をスローする。
 *
 * @param key       一意なキー（例: `chat:${userId}`, `insert:${userId}`）
 * @param config    制限設定
 */
export async function checkRateLimit(
  key:    string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const result = await _checkRateLimitInternal(key, config);

  if (!result.success) {
    const resetInSec = Math.ceil((result.resetAt.getTime() - Date.now()) / 1000);
    const error = new Error('RATE_LIMITED') as Error & {
      resetAt:   Date;
      resetInSec: number;
    };
    error.resetAt    = result.resetAt;
    error.resetInSec = resetInSec;
    throw error;
  }

  return result;
}

async function _checkRateLimitInternal(
  key:    string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const { limit, windowMs } = config;
  const windowSec = Math.ceil(windowMs / 1000);
  const now = Date.now();

  // ─ Redis 優先 ─────────────────────────────────────────────────
  const redis = await _getRedisClient();
  if (redis) {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSec);
    }
    const ttlSec = await redis.ttl(key);
    const resetAt = new Date(now + ttlSec * 1000);
    return {
      success:   count <= limit,
      remaining: Math.max(0, limit - count),
      resetAt,
    };
  }

  // ─ インメモリフォールバック ────────────────────────────────────
  const existing = _storeGet(key);
  if (!existing || now > existing.resetAt) {
    // 新規 or ウィンドウリセット
    const resetAt = now + windowMs;
    _storeSet(key, { count: 1, resetAt });
    return { success: true, remaining: limit - 1, resetAt: new Date(resetAt) };
  }

  existing.count++;
  _storeSet(key, existing);
  return {
    success:   existing.count <= limit,
    remaining: Math.max(0, limit - existing.count),
    resetAt:   new Date(existing.resetAt),
  };
}

// ─── IP アドレス取得 ────────────────────────────────────────────

/**
 * リクエストの IP アドレスを取得する。
 * 未認証エンドポイントのレート制限に使用。
 */
export async function getClientIp(): Promise<string> {
  const headerStore = await headers();
  return (
    headerStore.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headerStore.get('x-real-ip') ??
    'unknown'
  );
}

// ─── プリセット設定 ─────────────────────────────────────────────

/** Server Action ごとの推奨レート制限設定 */
export const RATE_LIMIT_PRESETS = {
  /** チャット: 1分間に20メッセージ */
  chat:           { limit: 20,  windowMs: 60_000 } satisfies RateLimitConfig,
  /** Agentic 承認実行（pending + 承認ワード）: 1分間に12回 */
  chatAgenticConfirm: { limit: 12, windowMs: 60_000 } satisfies RateLimitConfig,
  /** 収支挿入: 1分間に60件（高速一括登録を許容） */
  activityInsert: { limit: 60,  windowMs: 60_000 } satisfies RateLimitConfig,
  /** 収支更新: 1分間に60件 */
  activityUpdate: { limit: 60,  windowMs: 60_000 } satisfies RateLimitConfig,
  /** 収支削除: 1分間に40件 */
  activityDelete: { limit: 40,  windowMs: 60_000 } satisfies RateLimitConfig,
  /** 収支一覧取得: 1分間に120件（チャット等からの連続呼び出し） */
  activityFetch:  { limit: 120, windowMs: 60_000 } satisfies RateLimitConfig,
  /** プロジェクト一覧取得（コックピット Realtime 連動の再取得含む） */
  projectFetch:   { limit: 120, windowMs: 60_000 } satisfies RateLimitConfig,
  /** Drive アップロード後 Soul メッセージ: 1分間に30件 */
  driveSoulMessage: { limit: 30, windowMs: 60_000 } satisfies RateLimitConfig,
  /** Drive へファイル本体アップロード: 1分間に15件（レシート連投対策） */
  driveFileUpload: { limit: 15, windowMs: 60_000 } satisfies RateLimitConfig,
  /** フィードバック送信: 1時間に20件 */
  feedback:       { limit: 20, windowMs: 60 * 60_000 } satisfies RateLimitConfig,
  /** ログイン試行: 15分間に10回（ブルートフォース対策） */
  login:          { limit: 10,  windowMs: 15 * 60_000 } satisfies RateLimitConfig,
  /** パスワードリセット: 1時間に5回 */
  passwordReset:  { limit: 5,   windowMs: 60 * 60_000 } satisfies RateLimitConfig,
} as const;
