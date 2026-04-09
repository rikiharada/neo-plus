/**
 * 設定 — Google Drive 連携を中心にした実用的なページ（Server Component）
 */

import type { Metadata }               from 'next';
import { Suspense }                    from 'react';
import Link                            from 'next/link';
import { requireAuth }                 from '@/lib/supabase/server';
import { getGoogleDriveLinkedForUser } from '@/lib/drive-integration-status';
import { DriveConnectionBanner }       from '../cockpit/_components/DriveConnectionBanner';

export const metadata: Metadata = {
  title: '設定 | Neo+',
};

export default async function SettingsPage() {
  const user = await requireAuth();
  const driveLinked = await getGoogleDriveLinkedForUser(user.id);

  return (
    <div className="settings-page" style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: 24, margin: '0 0 6px', fontWeight: 700 }}>設定</h1>
      <p style={{ margin: '0 0 28px', color: 'var(--text-muted, #536471)', fontSize: 14, lineHeight: 1.5 }}>
        連携とプライバシーに関する設定です。まずは Google Drive の状態を確認できます。
      </p>

      <section
        aria-labelledby="drive-heading"
        style={{
          marginBottom: 28,
          padding:      '18px 18px 20px',
          borderRadius: 14,
          border:       '1px solid rgba(0,0,0,0.08)',
          background:   'var(--panel-bg, rgba(0,0,0,0.02))',
        }}
      >
        <h2 id="drive-heading" style={{ fontSize: 17, margin: '0 0 6px', fontWeight: 600 }}>
          Google Drive 連携
        </h2>
        <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.6, color: 'var(--text-main, #0F1419)' }}>
          領収書や PDF の<strong>ファイル実体</strong>は、あなたの Google Drive 内の Neo 専用フォルダに置かれます。
          Neo+ のサーバーには<strong>中身のバイナリは保存しません</strong>（Zero-Server）。メタデータとリンクだけを扱います。
        </p>
        <ul
          style={{
            margin:      '0 0 16px',
            paddingLeft: 20,
            fontSize:    13,
            lineHeight:  1.55,
            color:       'var(--text-muted, #536471)',
          }}
        >
          <li>未連携のときだけ「Google Driveを接続」が表示されます。</li>
          <li>連携後はチャットのフォームから、そのまま保存・記帳の確認ができます。</li>
        </ul>
        <Suspense fallback={<div style={{ fontSize: 13, color: 'var(--text-muted)' }}>読み込み中…</div>}>
          <DriveConnectionBanner driveLinked={driveLinked} variant="settings" />
        </Suspense>
      </section>

      <section aria-labelledby="next-heading" style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--text-muted, #536471)' }}>
        <h2 id="next-heading" style={{ fontSize: 14, margin: '0 0 8px', fontWeight: 600, color: 'var(--text-main, #0F1419)' }}>
          次のステップ
        </h2>
        <p style={{ margin: 0 }}>
          連携が済んだら{' '}
          <Link href="/chat" style={{ color: 'var(--color-neo-primary, #4F46E5)' }}>
            チャット
          </Link>
          {' '}でファイルをアップロードし、記帳の確認まで進められます。
        </p>
      </section>
    </div>
  );
}
