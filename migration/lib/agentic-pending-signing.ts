/**
 * Agentic 保留アクション承認の HMAC 署名（サーバーのみ）
 *
 * クライアントが送り返す pendingActionsToConfirm をそのまま信頼しない。
 * userId + 正規化したアクション列 + issuedAt + nonce をサーバー秘密で署名する。
 */

import { createHash, createHmac, timingSafeEqual } from 'crypto';

import type { ParsedAction } from '@/lib/agentic-types';

const PAYLOAD_VERSION = 'v1';

function getSigningSecret(): string {
  const s = process.env.AGENTIC_PENDING_SIGNING_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === 'development') {
    console.warn(
      '[agentic-pending-signing] AGENTIC_PENDING_SIGNING_SECRET unset; using insecure dev fallback',
    );
    return 'neo-agentic-dev-only-signing-secret-min-32-chars!!';
  }
  throw new Error(
    'AGENTIC_PENDING_SIGNING_SECRET must be set (at least 32 characters)',
  );
}

/** オブジェクトをキー順で安定化（ネスト対応） */
function sortRecord(obj: Record<string, unknown>): Record<string, unknown> {
  const keys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = obj[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = sortRecord(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * アクション配列を順序非依存で正規化し、同一内容なら同一文字列になる。
 * （改ざんで順序だけ入れ替えても同じハッシュになる）
 */
export function canonicalizePendingActions(actions: ParsedAction[]): string {
  const normalized = actions.map((a) => ({
    type:        a.type,
    autoExecute: a.autoExecute ?? false,
    payload:     sortRecord(
      (a.payload ?? {}) as Record<string, unknown>,
    ),
  }));
  normalized.sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));
  return JSON.stringify(normalized);
}

function hashCanonical(canonical: string): string {
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function buildPayload(
  userId: string,
  actions: ParsedAction[],
  issuedAt: number,
  nonce: string,
): string {
  const canonical = canonicalizePendingActions(actions);
  const h           = hashCanonical(canonical);
  return `${PAYLOAD_VERSION}|${userId}|${issuedAt}|${nonce}|${h}`;
}

export function signPendingActionsApproval(
  userId: string,
  actions: ParsedAction[],
  issuedAt: number,
  nonce: string,
): string {
  const payload = buildPayload(userId, actions, issuedAt, nonce);
  const mac       = createHmac('sha256', getSigningSecret())
    .update(payload, 'utf8')
    .digest();
  return Buffer.from(mac).toString('base64url');
}

export function verifyPendingActionsApproval(
  userId: string,
  actions: ParsedAction[],
  issuedAt: number,
  nonce: string,
  token: string,
): boolean {
  try {
    const expected = signPendingActionsApproval(userId, actions, issuedAt, nonce);
    const a        = Buffer.from(expected, 'base64url');
    const b        = Buffer.from(token.trim(), 'base64url');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** 既定 15 分（環境変数で上書き可、ミリ秒） */
export function getAgenticPendingTtlMs(): number {
  const raw = process.env.AGENTIC_PENDING_TTL_MS;
  if (raw && /^\d+$/.test(raw)) {
    const n = parseInt(raw, 10);
    if (n >= 60_000 && n <= 86_400_000) return n;
  }
  return 15 * 60_000;
}
