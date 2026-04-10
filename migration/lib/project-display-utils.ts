/**
 * Project cards — shared 6 tag tones and JPY formatting (Day theme).
 */

import type { ProjectRow } from '@/lib/supabase/types';
import { isValidUuidString } from '@/lib/validation';

/** 詳細 URL は UUID のみ。非 UUID（数値型 id 含む）は常に `/projects` */
export function hrefForProjectDetail(
  id: string | number | null | undefined,
): string {
  const t = String(id ?? '').trim();
  return isValidUuidString(t) ? `/projects/${t}` : '/projects';
}

/** fetch / RSC: keep rows whose id is a UUID (avoids client crashes). */
export function filterProjectsWithValidUuidIds(
  rows: ProjectRow[],
): ProjectRow[] {
  return rows.filter((p) => isValidUuidString(String(p?.id ?? '').trim()));
}

export function projectTagToneIndex(seed: string | number | null | undefined): number {
  const s = String(seed ?? '');
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h + s.charCodeAt(i)) % 6;
  }
  return h;
}

export function formatProjectYen(n: number): string {
  return new Intl.NumberFormat('ja-JP', {
    style:                 'currency',
    currency:              'JPY',
    maximumFractionDigits: 0,
  }).format(n);
}
