/**
 * 連携未済ユーザー向け — コックピット中央の浮遊感ある Drive 連携カード（Day テーマ）
 */

import Link from 'next/link';

const CONNECT_HREF = '/api/auth/google';

export function DriveOnboardingHero() {
  return (
    <section
      className="neo-drive-onboarding-hero"
      aria-labelledby="neo-drive-onboarding-title"
    >
      <div className="neo-drive-onboarding-card neo-float-12">
        <div className="neo-drive-onboarding-card__accent" aria-hidden />
        <p className="neo-drive-onboarding-card__eyebrow">はじめの一歩</p>
        <h2 id="neo-drive-onboarding-title" className="neo-drive-onboarding-card__title">
          Neo と Drive をつなぐ
        </h2>
        <p className="neo-drive-onboarding-card__body">
          領収書や資料を <strong>あなた専用の Google Drive フォルダ</strong> に置いておけるようになります。
          連携は Google の許可画面から一度だけ。Neo はファイルの置き場所を案内します。
        </p>
        <div className="neo-drive-onboarding-card__chips" aria-label="連携後にできること">
          <span className="neo-chip neo-chip--aqua">保存</span>
          <span className="neo-chip neo-chip--gold">記帳へ</span>
          <span className="neo-chip neo-chip--violet">チャット連携</span>
        </div>
        <Link href={CONNECT_HREF} className="neo-drive-onboarding-card__cta">
          Google Drive を接続
        </Link>
        <p className="neo-drive-onboarding-card__note">
          いつでも設定から権限の再確認・再接続ができます。
        </p>
      </div>
    </section>
  );
}
