// Monthly spending budget. Stored as one settings row (scope __expense_budget__) in the
// existing goalTask table, like the monthly expense totals, so no schema change is needed.
// Spending always means the current spending cycle (30th to 29th, IST; see expense-cycle.ts),
// the same cycle the purge keeps.
import { isExpenseCycleKey, isLegacyExpenseMonthKey, legacyMonthToCycleKey } from '@/lib/goals/expense-cycle';

export const EXPENSE_BUDGET_SCOPE = '__expense_budget__';
export const EXPENSE_BUDGET_ID = '__expense_budget__:default';
export const DEFAULT_BUDGET_PAISE = 80_000 * 100;
export const BUDGET_WARNING_PERCENT = 80;
export const MIN_BUDGET_RUPEES = 1_000;
export const MAX_BUDGET_RUPEES = 1_00_00_000;

export type BudgetLevel = 'ok' | 'warning' | 'over';
export type BudgetAlertLevel = 80 | 100;

export type ExpenseBudget = {
  limitPaise: number;
  warningPercent: number;
  /** cycle key (cycle start YYYY-MM-DD) -> highest alert already sent in that cycle. Old cycles are pruned. */
  notified: Record<string, BudgetAlertLevel>;
  updatedAt: string;
};

export type BudgetStatus = {
  spentPaise: number;
  limitPaise: number;
  warningAtPaise: number;
  percent: number; // whole percent, floored, so 79.99% never shows as 80%
  barPercent: number; // 0..100 for the progress bar
  level: BudgetLevel;
  remainingPaise: number; // 0 once over
  overPaise: number; // 0 until over
};

export function defaultExpenseBudget(): ExpenseBudget {
  return { limitPaise: DEFAULT_BUDGET_PAISE, warningPercent: BUDGET_WARNING_PERCENT, notified: {}, updatedAt: new Date(0).toISOString() };
}

export function budgetLimitFromRupees(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const rupees = Number(typeof value === 'string' ? value.replace(/[,\s₹]/g, '') : value);
  if (!Number.isFinite(rupees) || rupees < MIN_BUDGET_RUPEES || rupees > MAX_BUDGET_RUPEES) return null;
  return Math.round(rupees) * 100;
}

function isAlertLevel(value: unknown): value is BudgetAlertLevel {
  return value === 80 || value === 100;
}

export function parseExpenseBudgetNote(note: string | null | undefined): ExpenseBudget {
  const fallback = defaultExpenseBudget();
  if (!note) return fallback;
  try {
    const value = JSON.parse(note) as Partial<ExpenseBudget>;
    const limitPaise =
      typeof value.limitPaise === 'number' && Number.isInteger(value.limitPaise) &&
      value.limitPaise >= MIN_BUDGET_RUPEES * 100 && value.limitPaise <= MAX_BUDGET_RUPEES * 100
        ? value.limitPaise
        : fallback.limitPaise;
    const notified: Record<string, BudgetAlertLevel> = {};
    if (value.notified && typeof value.notified === 'object') {
      Object.entries(value.notified).forEach(([key, level]) => {
        if (!isAlertLevel(level)) return;
        // Old calendar-month records (YYYY-MM) move to the cycle holding that month's 1st,
        // e.g. "2026-10" -> "2026-09-30", so an alert already sent is not sent again.
        const cycleKey = isExpenseCycleKey(key) ? key : isLegacyExpenseMonthKey(key) ? legacyMonthToCycleKey(key) : null;
        if (cycleKey) notified[cycleKey] = Math.max(level, notified[cycleKey] ?? 0) as BudgetAlertLevel;
      });
    }
    return {
      limitPaise,
      warningPercent: BUDGET_WARNING_PERCENT,
      notified,
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : fallback.updatedAt
    };
  } catch {
    return fallback;
  }
}

/** Integer maths only: warning at spent*100 >= limit*80, over at spent >= limit. */
export function budgetStatus(spentPaise: number, limitPaise: number, warningPercent = BUDGET_WARNING_PERCENT): BudgetStatus {
  const spent = Math.max(0, Math.round(spentPaise));
  const limit = Math.max(1, Math.round(limitPaise));
  const level: BudgetLevel = spent >= limit ? 'over' : spent * 100 >= limit * warningPercent ? 'warning' : 'ok';
  const percent = Math.floor((spent * 100) / limit);
  return {
    spentPaise: spent,
    limitPaise: limit,
    warningAtPaise: Math.ceil((limit * warningPercent) / 100),
    percent,
    barPercent: Math.min(100, percent),
    level,
    remainingPaise: Math.max(0, limit - spent),
    overPaise: Math.max(0, spent - limit)
  };
}

export function budgetAlertLevel(status: BudgetStatus): BudgetAlertLevel | null {
  return status.level === 'over' ? 100 : status.level === 'warning' ? 80 : null;
}

/**
 * Which notification (if any) to send now. One per threshold per cycle: 80% once, 100% once.
 * Jumping straight past 100% sends only the over-budget alert. A new cycle starts clean.
 */
export function budgetNotificationToSend(status: BudgetStatus, monthKey: string, notified: Record<string, BudgetAlertLevel>): BudgetAlertLevel | null {
  const level = budgetAlertLevel(status);
  if (!level) return null;
  const already = notified[monthKey] ?? 0;
  return level > already ? level : null;
}

/** Records an alert and keeps only the current and previous few cycles. */
export function markBudgetNotified(notified: Record<string, BudgetAlertLevel>, monthKey: string, level: BudgetAlertLevel) {
  const next: Record<string, BudgetAlertLevel> = { ...notified, [monthKey]: Math.max(level, notified[monthKey] ?? 0) as BudgetAlertLevel };
  Object.keys(next).sort().slice(0, -3).forEach((key) => delete next[key]);
  return next;
}

/** Whole rupees, Indian grouping: 10185153 paise -> "₹1,01,852". */
export function formatBudgetRupees(amountPaise: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(Math.round(amountPaise / 100));
}

export function budgetMessage(status: BudgetStatus) {
  const limit = formatBudgetRupees(status.limitPaise);
  if (status.level === 'over') return `Over budget by ${formatBudgetRupees(status.overPaise)} (${status.percent}% of your ${limit} budget)`;
  if (status.level === 'warning') return `You've used ${status.percent}% of your ${limit} budget, ${formatBudgetRupees(status.remainingPaise)} left`;
  return `${formatBudgetRupees(status.remainingPaise)} left of your ${limit} budget`;
}

export function budgetNotificationText(level: BudgetAlertLevel, status: BudgetStatus) {
  return level === 100
    ? { title: 'Monthly budget exceeded', body: budgetMessage(status) }
    : { title: `Budget warning: ${status.percent}% used`, body: budgetMessage(status) };
}
