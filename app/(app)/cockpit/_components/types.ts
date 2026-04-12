/**
 * コックピット — サマリー型（page と SummaryCards で共有）
 */
export interface CockpitSummary {
  totalIncome:    number;
  totalExpense:   number;
  balance:        number;
  activityCount:  number;
  /** 勘定「人件費」の支出合計 */
  laborExpense:   number;
}
