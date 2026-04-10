/**
 * features/drive/DriveUploadForm.tsx
 * レシート・請求書・現場写真などを Neo 専用 Drive フォルダへ（参考 UI）
 *
 * Server Action `uploadToDriveAndCreateActivity` に FormData を渡すだけの最小実装。
 */

'use client';

import { useState } from 'react';
import {
  uploadToDriveAndCreateActivity,
  type UploadToDriveResult,
} from '@/features/drive/actions';

interface DriveUploadFormProps {
  /** アップロード完了時（成功・失敗）。チャット連携で pendingDrive を渡す */
  onComplete?: (result: UploadToDriveResult) => void;
}

export function DriveUploadForm({ onComplete }: DriveUploadFormProps) {
  const [pending, setPending] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const [showRetryHint, setShowRetryHint] = useState(false);

  return (
    <form
      id="neo-drive-upload"
      className="neo-drive-upload-form"
      aria-label="Google Drive へファイルを保存"
      onSubmit={async (e) => {
        e.preventDefault();
        setLine(null);
        setShowRetryHint(false);
        const fd = new FormData(e.currentTarget);
        setPending(true);
        try {
          const r = await uploadToDriveAndCreateActivity(fd);
          onComplete?.(r);
          if (!onComplete) {
            setLine(
              r.ok
                ? (r.message ?? '保存できたよ。')
                : (r.error ??
                  'ちょっと接続が不安定みたい…。一息ついて、もう一度試してみようか？'),
            );
            setShowRetryHint(!r.ok);
          } else if (r.ok) {
            setLine(null);
            setShowRetryHint(false);
          } else {
            setLine(
              r.error ??
                'ちょっと接続が不安定みたい…。一息ついて、もう一度試してみようか？',
            );
            setShowRetryHint(true);
          }
          if (r.ok) e.currentTarget.reset();
        } finally {
          setPending(false);
        }
      }}
    >
      <input type="hidden" name="kind" value="receipt" />
      <label className="neo-drive-upload-label">
        <span className="neo-drive-upload-label-text">ファイル</span>
        <input
          type="file"
          name="file"
          required
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
          disabled={pending}
        />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? '保存中…' : 'NeoのDriveフォルダに保存'}
      </button>
      {line && (
        <p className="neo-drive-upload-status" role="status" aria-live="polite">
          {line}
        </p>
      )}
      {showRetryHint && (
        <p
          className="neo-drive-upload-retry-hint"
          style={{
            fontSize:   12,
            marginTop:  8,
            lineHeight: 1.45,
            color:      'var(--text-muted, #536471)',
          }}
        >
          連携の確認は{' '}
          <a href="/settings">設定</a>
          {' '}から。準備ができたら、もう一度ファイルを選んで保存してみてね。
        </p>
      )}
    </form>
  );
}
