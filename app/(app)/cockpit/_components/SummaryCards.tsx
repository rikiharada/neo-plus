/**
 * コックピット — 収支サマリーカード（純表示）
 */

import type { CockpitSummary } from './types';

function formatYen(n: number): string {
  return new Intl.NumberFormat('ja-JP', {
    style:    'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(n);
}

export function SummaryCards({ summary }: { summary: CockpitSummary }) {
  return (
    <div className="cockpit-summary-grid">
      <article className="summary-card">
        <h2 className="summary-card__label">入金合計</h2>
        <p className="summary-card__value summary-card__value--income">
          {formatYen(summary.totalIncome)}
        </p>
      </article>
      <article className="summary-card">
        <h2 className="summary-card__label">支出合計</h2>
        <p className="summary-card__value summary-card__value--expense">
          {formatYen(summary.totalExpense)}
        </p>
      </article>
      <article className="summary-card">
        <h2 className="summary-card__label">収支バランス</h2>
        <p
          className={
            'summary-card__value ' +
            (summary.balance >= 0
              ? 'summary-card__value--income'
              : 'summary-card__value--expense')
          }
        >
          {formatYen(summary.balance)}
        </p>
      </article>
      <article className="summary-card summary-card--labor">
        <h2 className="summary-card__label">人件費</h2>
        <p className="summary-card__value summary-card__value--muted">
          {formatYen(summary.laborExpense)}
        </p>
        <p className="summary-card__hint">科目「人件費」の支出合計</p>
      </article>
    </div>
  );
}
