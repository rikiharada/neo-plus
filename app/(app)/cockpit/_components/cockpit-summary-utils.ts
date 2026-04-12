/**
 * Cockpit summary totals (shared server/client).
 */

import type { ActivityRow } from '@/lib/supabase/types';
import type { CockpitSummary } from './types';

export function calcCockpitSummary(activities: ActivityRow[]): CockpitSummary {
  let totalIncome = 0;
  let totalExpense = 0;
  let laborExpense = 0;

  for (const a of activities) {
    if (a.type === 'income') totalIncome += a.amount;
    if (a.type === 'expense') totalExpense += a.amount;
    if (a.type === 'expense' && a.category === '人件費') {
      laborExpense += a.amount;
    }
  }

  return {
    totalIncome,
    totalExpense,
    balance:       totalIncome - totalExpense,
    activityCount: activities.length,
    laborExpense,
  };
}
