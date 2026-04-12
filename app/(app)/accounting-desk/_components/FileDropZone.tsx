/**
 * app/(app)/accounting-desk/_components/FileDropZone.tsx
 * ファイルドロップゾーン — drag & drop + クリックで選択
 *
 * 'use client' 必須（onDrop / onChange イベント）
 *
 * 対応ファイル: CSV, TSV, Excel, PDF, 画像
 * - ドラッグ中は青枠でハイライト
 * - 複数ファイルは1件ずつ処理（最初のファイルのみ）
 * - ファイルサイズ上限 12MB（Drive 側と合わせる）
 */

'use client';

import {
  useRef,
  useState,
  useCallback,
  type DragEvent,
  type ChangeEvent,
} from 'react';

// ─── 定数 ────────────────────────────────────────────────────────

const ACCEPTED_MIME = [
  'text/csv',
  'application/csv',
  'text/tab-separated-values',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
].join(',');

const MAX_BYTES = 12 * 1024 * 1024; // 12MB

// ─── 型定義 ─────────────────────────────────────────────────────

interface FileDropZoneProps {
  onFileDrop:   (file: File) => void;
  disabled?:    boolean;
  /** ドロップゾーンの追加 className */
  className?:   string;
}

// ─── コンポーネント ──────────────────────────────────────────────

export function FileDropZone({ onFileDrop, disabled, className }: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dropError,  setDropError]  = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ─ バリデーション ──────────────────────────────────────────
  const validate = useCallback((file: File): string | null => {
    if (file.size > MAX_BYTES) {
      return `ファイルサイズが12MBを超えています（${(file.size / 1024 / 1024).toFixed(1)}MB）`;
    }
    return null;
  }, []);

  const handleFile = useCallback((file: File) => {
    const err = validate(file);
    if (err) { setDropError(err); return; }
    setDropError(null);
    onFileDrop(file);
  }, [validate, onFileDrop]);

  // ─ Drag ハンドラー ─────────────────────────────────────────

  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // 子要素への移動では離脱と見なさない
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    // 複数ドロップは先頭のみ処理
    handleFile(files[0]);
    if (files.length > 1) {
      setDropError(`${files.length}ファイルがドロップされましたが、1ファイルずつ処理します。`);
    }
  }, [disabled, handleFile]);

  // ─ クリック選択ハンドラー ──────────────────────────────────

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // 同じファイルを再選択できるようにリセット
    e.target.value = '';
  }, [handleFile]);

  const handleClick = useCallback(() => {
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  // ─ キーボードアクセシビリティ ──────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }, [handleClick]);

  // ─ スタイル計算 ────────────────────────────────────────────

  const zoneClass = [
    'desk-dropzone',
    isDragging ? 'desk-dropzone--dragging' : '',
    disabled   ? 'desk-dropzone--disabled'  : '',
    className  ?? '',
  ].filter(Boolean).join(' ');

  return (
    <div className="desk-dropzone-wrapper">
      {/* ─ ドロップゾーン本体 ─ */}
      <div
        className={zoneClass}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="ファイルをドロップまたはクリックして選択"
        aria-disabled={disabled}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* 隠しファイル入力 */}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_MIME}
          onChange={handleChange}
          disabled={disabled}
          style={{ display: 'none' }}
          aria-hidden="true"
          tabIndex={-1}
        />

        {/* アイコン */}
        <div className="desk-dropzone-icon" aria-hidden="true">
          {isDragging ? <DropActiveIcon /> : <DropIdleIcon />}
        </div>

        {/* テキスト */}
        <div className="desk-dropzone-text">
          {isDragging ? (
            <p className="desk-dropzone-hint--active">ここにドロップ</p>
          ) : (
            <>
              <p className="desk-dropzone-title">
                {disabled ? '処理中…' : 'ファイルをドロップ、またはクリックして選択'}
              </p>
              <p className="desk-dropzone-hint">
                CSV・Excel・PDF・画像（JPEG/PNG/HEIC）対応 ／ 最大 12MB
              </p>
            </>
          )}
        </div>
      </div>

      {/* エラーメッセージ */}
      {dropError && (
        <p className="desk-dropzone-error" role="alert">
          <WarningIcon /> {dropError}
          <button
            type="button"
            className="desk-dropzone-error-close"
            onClick={() => setDropError(null)}
            aria-label="エラーを閉じる"
          >
            ✕
          </button>
        </p>
      )}
    </div>
  );
}

// ─── アイコン ───────────────────────────────────────────────────

function DropIdleIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function DropActiveIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
      <circle cx="12" cy="3" r="2" fill="currentColor" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  );
}
