/**
 * app/(app)/accounting-desk/_components/FileListPanel.tsx
 * 左ペイン — アップロード済みファイル一覧 + ステータスバッジ
 *
 * 'use client' 必須（状態管理・インタラクション）
 *
 * ステータス遷移:
 *   idle → uploading → analyzing → done
 *                               → error
 */

'use client';

import { memo } from 'react';
import type { DeskFileEntry } from './types';

// ─── 型定義 ─────────────────────────────────────────────────────
// （DeskFileEntry は types.ts で定義）

interface FileListPanelProps {
  files:           DeskFileEntry[];
  selectedId:      string | null;
  onSelect:        (id: string) => void;
  /** 件数ゼロのときに表示する空状態 */
  className?:      string;
}

// ─── コンポーネント ──────────────────────────────────────────────

export const FileListPanel = memo(function FileListPanel({
  files,
  selectedId,
  onSelect,
  className,
}: FileListPanelProps) {
  return (
    <aside
      className={['desk-file-list-panel', className].filter(Boolean).join(' ')}
      aria-label="アップロード済みファイル一覧"
    >
      <h2 className="desk-file-list-heading">
        ファイル
        {files.length > 0 && (
          <span className="desk-file-list-count" aria-label={`${files.length}件`}>
            {files.length}
          </span>
        )}
      </h2>

      {files.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="desk-file-list" role="listbox" aria-label="ファイルを選択">
          {files.map((entry) => (
            <FileListItem
              key={entry.id}
              entry={entry}
              isSelected={entry.id === selectedId}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </aside>
  );
});

// ─── リストアイテム ───────────────────────────────────────────────

interface FileListItemProps {
  entry:      DeskFileEntry;
  isSelected: boolean;
  onSelect:   (id: string) => void;
}

function FileListItem({ entry, isSelected, onSelect }: FileListItemProps) {
  const { id, fileName, status, fileSizeKb, analysis } = entry;

  return (
    <li
      role="option"
      aria-selected={isSelected}
      className={[
        'desk-file-item',
        isSelected ? 'desk-file-item--selected' : '',
        `desk-file-item--${status}`,
      ].filter(Boolean).join(' ')}
      onClick={() => onSelect(id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(id); } }}
      tabIndex={0}
    >
      {/* ─ ファイルアイコン ─ */}
      <div className="desk-file-icon" aria-hidden="true">
        <FileKindIcon kind={analysis?.kind ?? _guessKind(fileName)} />
      </div>

      {/* ─ ファイル情報 ─ */}
      <div className="desk-file-info">
        <p className="desk-file-name" title={fileName}>
          {_truncate(fileName, 28)}
        </p>
        <p className="desk-file-meta">
          {fileSizeKb > 0 ? `${fileSizeKb} KB` : ''}
          {analysis && (
            <span className="desk-file-kind-hint">
              {' · '}
              {_kindLabel(analysis.kind)}
              {analysis.kind === 'csv' ? ` ${analysis.rowCount}行` : ''}
              {analysis.kind === 'excel' ? ` ${analysis.sheetCount}シート` : ''}
            </span>
          )}
        </p>
      </div>

      {/* ─ ステータスバッジ ─ */}
      <div className="desk-file-status">
        <StatusBadge status={status} />
      </div>
    </li>
  );
}

// ─── ステータスバッジ ─────────────────────────────────────────────

function StatusBadge({ status }: { status: DeskFileEntry['status'] }) {
  const config: Record<DeskFileEntry['status'], { label: string; className: string; icon: React.ReactNode }> = {
    idle:      { label: '待機中',    className: 'badge--idle',      icon: <CircleIcon /> },
    uploading: { label: 'アップロード中', className: 'badge--uploading', icon: <SpinnerIcon /> },
    analyzing: { label: '解析中',    className: 'badge--analyzing', icon: <SpinnerIcon /> },
    done:      { label: '処理済み',  className: 'badge--done',      icon: <CheckIcon /> },
    error:     { label: 'エラー',    className: 'badge--error',     icon: <XIcon /> },
  };

  const { label, className, icon } = config[status];

  return (
    <span
      className={`desk-status-badge ${className}`}
      aria-label={`ステータス: ${label}`}
    >
      {icon}
      <span className="badge-label">{label}</span>
    </span>
  );
}

// ─── 空状態 ─────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="desk-file-list-empty" aria-label="ファイルがありません">
      <div className="desk-file-list-empty-icon" aria-hidden="true">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
          <polyline points="13 2 13 9 20 9"/>
        </svg>
      </div>
      <p className="desk-file-list-empty-text">
        ファイルをドロップすると<br />ここに表示されます
      </p>
    </div>
  );
}

// ─── ファイル種別アイコン ────────────────────────────────────────

function FileKindIcon({ kind }: { kind: string }) {
  switch (kind) {
    case 'csv':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="8" y1="13" x2="16" y2="13"/>
          <line x1="8" y1="17" x2="16" y2="17"/>
          <line x1="8" y1="9"  x2="10" y2="9"/>
        </svg>
      );
    case 'excel':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <path d="M8 13l8 5M16 13l-8 5"/>
        </svg>
      );
    case 'pdf':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      );
    case 'image':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
      );
    default:
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      );
  }
}

// ─── 小アイコン ─────────────────────────────────────────────────

const iconProps = { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.5, 'aria-hidden': true as const };

function CircleIcon()  { return <svg {...iconProps}><circle cx="12" cy="12" r="9"/></svg>; }
function CheckIcon()   { return <svg {...iconProps}><polyline points="20 6 9 17 4 12"/></svg>; }
function XIcon()       { return <svg {...iconProps}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>; }
function SpinnerIcon() {
  return (
    <svg {...iconProps} className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  );
}

// ─── ユーティリティ ──────────────────────────────────────────────

function _truncate(str: string, max: number): string {
  return str.length <= max ? str : `${str.slice(0, max - 1)}…`;
}

function _guessKind(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.tsv')) return 'csv';
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.xlsm')) return 'excel';
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.match(/\.(jpg|jpeg|png|webp|heic|heif)$/)) return 'image';
  return 'unknown';
}

function _kindLabel(kind: string): string {
  const map: Record<string, string> = { csv: 'CSV', excel: 'Excel', pdf: 'PDF', image: '画像', unknown: 'ファイル' };
  return map[kind] ?? kind;
}
