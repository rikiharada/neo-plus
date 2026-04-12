/**
 * OAuth リダイレクト後の ?drive=connected / ?drive_error を表示し、
 * 読みやすい時間のあと URL から除去。初回連携後は「反映中」→「Drive連携済み」へ切替を自然に。
 * DB の連携状態（driveLinked）は Server から props で渡す。
 */

'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/** 成功時の表示（秒）— 3〜4 秒の体感で微調整 */
const DELAY_SUCCESS_MS = 3800;
/** エラー時は少し長めに読めてから */
const DELAY_ERROR_MS = 4000;

function friendlyOAuthError(code: string | null): string {
  if (!code) {
    return 'Driveとのつながりが、いまひと息みたい…。落ち着いて、下のボタンからもう一度試してみようか？';
  }
  const map: Record<string, string> = {
    token_exchange:
      'Google 側との確認がうまくいかなかったみたい。少し時間をおいてから、もう一度「Google Driveを接続」から試してみようか？',
    folder:
      'Neo用フォルダの準備で一瞬つまずいたみたい。時間をおいてから、もう一度「Google Driveを接続」から試してみてね。',
    db:
      'Neo側への保存に失敗しちゃった。接続が不安定なときは、少し待ってからもう一度お試しください。',
    missing_code: '連携の途中で中断されたみたい。もう一度、最初から試してみて。',
    invalid_state:
      'セッションの有効期限が切れたみたい。もう一度、「Google Driveを接続」から試してみて。',
  };
  return map[code] ?? 'Driveとのつながりが、いまひと息みたい…。もう一度試してみようか？';
}

const CONNECT_HREF = '/api/auth/google';

const btnStyle: CSSProperties = {
  display:        'inline-block',
  padding:        '8px 16px',
  fontSize:       13,
  fontWeight:    600,
  borderRadius:   999,
  background:     'var(--color-neo-primary, #4F46E5)',
  color:          '#fff',
  textDecoration: 'none',
};

export function DriveConnectionBanner({
  driveLinked,
  variant = 'default',
  /** コックピットのヒーローカードで未連携 CTA を出す場合、帯の重複を避ける */
  suppressUnlinkedCta = false,
}: {
  driveLinked: boolean;
  variant?: 'default' | 'settings';
  suppressUnlinkedCta?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const drive = searchParams.get('drive');
  const driveError = searchParams.get('drive_error');
  const refreshedRef = useRef(false);

  /** クエリ除去後、refresh 完了までの一瞬で「未連携」に見えないようにする */
  const [syncingAfterOAuth, setSyncingAfterOAuth] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (drive !== 'connected') {
      refreshedRef.current = false;
    }
  }, [drive]);

  useEffect(() => {
    if (drive === 'connected') {
      setSyncingAfterOAuth(true);
    }
  }, [drive]);

  /** 連携直後に Server Component の driveLinked を確実に反映 */
  useEffect(() => {
    if (drive !== 'connected' || refreshedRef.current) return;
    refreshedRef.current = true;
    router.refresh();
  }, [drive, router]);

  /** driveLinked が来たら同期状態を終える */
  useEffect(() => {
    if (!syncingAfterOAuth) return;
    if (!driveLinked) return;
    const t = window.setTimeout(() => setSyncingAfterOAuth(false), 480);
    return () => window.clearTimeout(t);
  }, [syncingAfterOAuth, driveLinked]);

  /** 長時間 linked が来ない場合のフェイルセーフ（誤表示防止） */
  useEffect(() => {
    if (!syncingAfterOAuth || driveLinked) return;
    const t = window.setTimeout(() => setSyncingAfterOAuth(false), 9000);
    return () => window.clearTimeout(t);
  }, [syncingAfterOAuth, driveLinked]);

  /** フラッシュを読める時間を確保してからクエリ除去 */
  useEffect(() => {
    if (drive == null && driveError == null) return;
    const delayMs = drive === 'connected' ? DELAY_SUCCESS_MS : DELAY_ERROR_MS;
    const t = window.setTimeout(() => {
      const u = new URL(window.location.href);
      u.searchParams.delete('drive');
      u.searchParams.delete('drive_error');
      router.replace(u.pathname + u.search, { scroll: false });
      router.refresh();
    }, delayMs);
    return () => window.clearTimeout(t);
  }, [drive, driveError, router]);

  const margin = variant === 'settings' ? '0' : '0 0 16px';

  if (!mounted) {
    return null;
  }

  if (drive === 'connected') {
    return (
      <div
        role="status"
        className="drive-oauth-flash drive-oauth-flash--ok drive-banner-anim"
        style={{
          margin,
          padding:      '12px 14px',
          fontSize:     14,
          lineHeight:   1.55,
          borderRadius: 12,
          background:   'rgba(16, 185, 129, 0.1)',
          border:       '1px solid rgba(16, 185, 129, 0.3)',
          color:        'var(--text-main, #0F1419)',
        }}
      >
        <strong>Google Drive と連携できました。</strong>
        {' '}
        チャットからファイルを保存すると、Neo専用フォルダに置けます。あと数秒でこのメッセージは消えて、下に「Drive連携済み」と出ます。
      </div>
    );
  }

  if (driveError != null && driveError.length > 0) {
    return (
      <div
        role="alert"
        className="drive-oauth-flash drive-oauth-flash--err drive-banner-anim"
        style={{
          margin,
          padding:      '12px 14px',
          fontSize:     14,
          lineHeight:   1.55,
          borderRadius: 12,
          background:   'rgba(245, 158, 11, 0.1)',
          border:       '1px solid rgba(245, 158, 11, 0.35)',
          color:        'var(--text-main, #0F1419)',
        }}
      >
        <p style={{ margin: '0 0 10px' }}>{friendlyOAuthError(driveError)}</p>
        <a href={CONNECT_HREF} style={btnStyle}>
          Google Driveを接続
        </a>
      </div>
    );
  }

  if (syncingAfterOAuth && !driveLinked) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="drive-oauth-syncing drive-banner-anim"
        style={{
          margin,
          padding:      '10px 14px',
          fontSize:     13,
          lineHeight:   1.45,
          borderRadius: 12,
          background:   'rgba(79, 70, 229, 0.06)',
          border:       '1px solid rgba(79, 70, 229, 0.18)',
          color:        'var(--text-muted, #536471)',
        }}
      >
        連携を反映しています…
      </div>
    );
  }

  if (suppressUnlinkedCta && !driveLinked && drive == null && driveError == null && !syncingAfterOAuth) {
    return null;
  }

  if (driveLinked) {
    return (
      <div
        className="drive-linked-badge"
        style={{
          margin,
          padding:      '10px 14px',
          fontSize:     13,
          lineHeight:   1.45,
          borderRadius: 12,
          background:   'rgba(79, 70, 229, 0.06)',
          border:       '1px solid rgba(79, 70, 229, 0.2)',
          color:        'var(--text-muted, #536471)',
        }}
      >
        <span aria-label="Google Drive 連携済み">Drive連携済み</span>
        {' · '}
        <a href={CONNECT_HREF} style={{ color: 'var(--color-neo-primary, #4F46E5)' }}>
          権限の再確認・再接続
        </a>
      </div>
    );
  }

  return (
    <div
      className="drive-connect-cta drive-banner-anim"
      style={{
        margin,
        padding:      '12px 14px',
        fontSize:     14,
        lineHeight:   1.55,
        borderRadius: 12,
        background:   'var(--panel-bg, rgba(0,0,0,0.03))',
        border:       '1px solid rgba(0,0,0,0.08)',
      }}
    >
      <p style={{ margin: '0 0 10px', color: 'var(--text-main, #0F1419)' }}>
        {variant === 'settings'
          ? 'Google アカウントと連携すると、Neo専用フォルダに領収書などを保存できます。'
          : '領収書を Google Drive の Neo 専用フォルダに置いておきたいときは、まず連携から。'}
      </p>
      <a href={CONNECT_HREF} style={btnStyle}>
        Google Driveを接続
      </a>
    </div>
  );
}
