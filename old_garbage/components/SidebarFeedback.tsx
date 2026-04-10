/**
 * サイドバー下部 — ベータフィードバック（ワンクリックでモーダル）
 */

'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useId, useState } from 'react';
import { submitFeedback } from '@/features/feedback/actions';

type Kind = 'bug' | 'idea' | 'other';

export function SidebarFeedback() {
  const pathname = usePathname();
  const dialogTitleId = useId();
  const [open, setOpen]   = useState(false);
  const [kind, setKind]   = useState<Kind>('bug');
  const [text, setText]   = useState('');
  const [busy, setBusy]   = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr]     = useState<string | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setErr(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await submitFeedback({
      kind,
      message: text.trim(),
      pagePath: pathname ?? undefined,
    });
    setBusy(false);
    if (res.ok) {
      setToast('送信しました。開発チームに届きます。ありがとうございます。');
      setText('');
      setOpen(false);
      window.setTimeout(() => setToast(null), 5200);
    } else {
      setErr(res.error ?? '送信に失敗しました');
    }
  };

  return (
    <>
      <div className="sidebar-feedback">
        <button
          type="button"
          className="sidebar-feedback__trigger"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <span className="sidebar-feedback__icon" aria-hidden>
            ✦
          </span>
          フィードバック
        </button>
        <p className="sidebar-feedback__hint">バグ・感想を CEO 宛に送れます</p>
      </div>

      {toast != null && (
        <div className="neo-toast" role="status">
          {toast}
        </div>
      )}

      {open && (
        <div
          className="neo-modal-backdrop"
          role="presentation"
          onClick={(ev) => {
            if (ev.target === ev.currentTarget) close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            className="neo-modal"
          >
            <h2 id={dialogTitleId} className="neo-modal__title">
              フィードバックを送る
            </h2>
            <p className="neo-modal__lead">
              いま見ている画面（{pathname ?? '—'}）の文脈で記録されます。
            </p>
            <form onSubmit={onSubmit} className="neo-modal__form">
              <fieldset className="neo-modal__kinds">
                <legend className="neo-sr-only">種類</legend>
                {(
                  [
                    ['bug', '不具合・バグ'],
                    ['idea', 'アイデア'],
                    ['other', 'その他'],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className={
                      'neo-radio-label' +
                      (kind === value ? ' neo-radio-label--active' : '')
                    }
                  >
                    <input
                      type="radio"
                      name="kind"
                      value={value}
                      checked={kind === value}
                      onChange={() => setKind(value)}
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
              <label htmlFor="fb-msg" className="neo-modal__label">
                内容
              </label>
              <textarea
                id="fb-msg"
                className="neo-modal__textarea"
                rows={5}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="再現手順や画面の感想など、自由にどうぞ"
                required
                maxLength={4000}
              />
              {err != null && (
                <p className="neo-modal__error" role="alert">
                  {err}
                </p>
              )}
              <div className="neo-modal__actions">
                <button type="button" className="neo-btn-secondary" onClick={close}>
                  キャンセル
                </button>
                <button type="submit" className="neo-btn-primary" disabled={busy}>
                  {busy ? '送信中…' : '送信'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
