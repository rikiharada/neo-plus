/**
 * Project cards — shared 6 tag tones and JPY formatting (Day theme).
 */

import { projectCanonicalId, type ProjectRow } from '@/lib/supabase/types';
import { isValidUuidString } from '@/lib/validation';

/**
 * 詳細 URL は **正規 UUID（id_uuid）** のみ。
 * 数値だけの legacy id は `/projects` にフォールバック（移行期の安全策）。
 */
export function hrefForProjectDetail(
  id: string | number | null | undefined,
): string {
  const t = String(id ?? '').trim();
  return isValidUuidString(t) ? `/projects/${t}` : '/projects';
}

/** 1行から詳細 URL を取る（`projectCanonicalId` 経由で統一） */
export function hrefForProjectRow(row: Pick<ProjectRow, 'id_uuid'>): string {
  return hrefForProjectDetail(projectCanonicalId(row));
}

/**
 * fetch 後のクライアント側のガード: `id_uuid` が UUID の行だけ残す。
 * Server の `fetchProjects` が検証するため、通常は全行が通る。
 */
export function filterProjectsWithValidUuidIds(
  rows: ProjectRow[],
): ProjectRow[] {
  return rows.filter((p) =>
    isValidUuidString(String(p?.id_uuid ?? '').trim()),
  );
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
