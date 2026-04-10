import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import {
  requireAuth,
  createServerComponentClient,
  isNextRedirectError,
} from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Wallet | Neo+',
};

export const dynamic = 'force-dynamic';

function isNextDynamicServerError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.message.includes('Dynamic server usage')) return true;
  const d = (err as Error & { digest?: string }).digest;
  return d === 'DYNAMIC_SERVER_USAGE';
}

export default async function WalletPage() {
  try {
    const [user, supabase] = await Promise.all([
      requireAuth(),
      createServerComponentClient(),
    ]);

    const { data: rows, error } = await supabase
      .from('activities')
      .select('type, amount')
      .eq('user_id', user.id)
      .eq('is_deleted', false);

    if (error) {
      console.warn('[wallet]', error.message);
    }

    let income = 0;
    let expense = 0;
    for (const r of rows ?? []) {
      if (r.type === 'income') income += r.amount;
      if (r.type === 'expense') expense += r.amount;
    }
    const balance = income - expense;

    return (
      <div className="feature-placeholder-page" style={{ maxWidth: 640 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 12px' }}>Wallet</h1>
        <p style={{ margin: '0 0 20px', fontSize: 14, lineHeight: 1.6, color: 'var(--text-muted, #536471)' }}>
          おおまかにサマリー（<code>activities</code> から集計）。
        </p>
        <div
          style={{
            display:      'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap:          12,
          }}
        >
          <article style={card}>
            <div style={label}>入金合計</div>
            <div style={valueIn}>¥{income.toLocaleString('ja-JP')}</div>
          </article>
          <article style={card}>
            <div style={label}>支出合計</div>
            <div style={valueOut}>¥{expense.toLocaleString('ja-JP')}</div>
          </article>
          <article style={card}>
            <div style={label}>バランス</div>
            <div style={balance >= 0 ? valueIn : valueOut}>
              ¥{balance.toLocaleString('ja-JP')}
            </div>
          </article>
        </div>
      </div>
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    if (isNextDynamicServerError(error)) throw error;
    console.error('[wallet] page error:', error);
    return (
      <div style={{ padding: '1rem 0' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Wallet</h1>
        <p style={{ color: 'var(--text-muted)' }}>データの読み込みに失敗しました。</p>
      </div>
    );
  }
}

const card: CSSProperties = {
  padding:      '14px 16px',
  borderRadius: 12,
  border:       '1px solid rgba(0,0,0,0.08)',
  background:   'var(--panel-bg, rgba(0,0,0,0.02))',
};

const label: CSSProperties = {
  fontSize:   12,
  color:      'var(--text-muted, #536471)',
  marginBottom: 6,
};

const valueIn: CSSProperties = {
  fontSize:   18,
  fontWeight: 700,
  color:      '#059669',
};

const valueOut: CSSProperties = {
  fontSize:   18,
  fontWeight: 700,
  color:      '#dc2626',
};
