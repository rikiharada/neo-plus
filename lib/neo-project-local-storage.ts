/**
 * Legacy cleanup: remove non-UUID / numeric junk stored as project id.
 * Does not touch theme keys (e.g. neo-theme).
 */

import { isValidUuidString } from '@/lib/validation';

const EXACT_KEYS = [
  'neo:lastProjectId',
  'neo_last_project_id',
  'neoLastProjectId',
  'lastProjectId',
  'neo-last-open-project',
];

export function sanitizeLegacyProjectIdsInLocalStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    for (const key of EXACT_KEYS) {
      const v = localStorage.getItem(key);
      if (v == null) continue;
      const t = String(v).trim();
      if (t === '' || /^\d+$/.test(t) || !isValidUuidString(t)) {
        localStorage.removeItem(key);
      }
    }

    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key || !key.toLowerCase().startsWith('neo-project')) continue;
      const v = localStorage.getItem(key);
      if (v == null) continue;
      const t = String(v).trim();
      if (t === '' || /^\d+$/.test(t) || !isValidUuidString(t)) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    /* プライベートモード等 */
  }
}
