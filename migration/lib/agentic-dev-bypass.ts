/**
 * Development only: when `agentic_pending_nonces` insert fails (RLS, missing migration, etc.),
 * still allow the approval path that relies on HMAC + TTL.
 * Production: always off (NODE_ENV !== 'development').
 *
 * Opt out: NEO_DEV_BYPASS_AGENTIC_NONCE=0
 */

export function isAgenticNonceDevBypassEnabled(): boolean {
  if (process.env.NODE_ENV !== 'development') return false;
  if (process.env.NEO_DEV_BYPASS_AGENTIC_NONCE === '0') return false;
  return true;
}
