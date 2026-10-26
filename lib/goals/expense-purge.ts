import { parseExpenseNote } from '@/lib/goals/expenses';
import { currentExpenseCycleKey, expenseCycleKey, isExpenseCycleKey, isInCurrentExpenseCycle, isLegacyExpenseMonthKey } from '@/lib/goals/expense-cycle';

// A spending "month" is a cycle (see expense-cycle.ts: 30th to 29th, IST midnight), the same
// rule the expense form, API and budget use to decide which dates belong to "this month".
export const EXPENSE_SCOPE = '__expense__';
export const EXPENSE_MONTH_SCOPE = '__expense_month__';
export const EXPENSE_MONTH_ID_PREFIX = '__expense_month__:';

export type MonthlyExpenseTotal = {
  /** Cycle start date YYYY-MM-DD. Older rows may hold a calendar month YYYY-MM; both are accepted. */
  monthKey: string;
  totalPaise: number;
  entryCount: number;
  purgedAt: string;
};

export type StoredRow = { id: string; note: string | null; updatedAt: Date | string };

export type ExpensePurgePlan = {
  currentCycleKey: string;
  summaries: MonthlyExpenseTotal[]; // final values to write (existing total + newly purged)
  deleteIds: string[];
};

export function monthlyTotalId(monthKey: string) {
  return `${EXPENSE_MONTH_ID_PREFIX}${monthKey}`;
}

export function isCurrentCycleDateKey(dateKey: string, now: Date | number | string = new Date()) {
  return isInCurrentExpenseCycle(dateKey, now);
}

export function parseMonthlyTotalNote(note: string | null | undefined): MonthlyExpenseTotal | null {
  if (!note) return null;
  try {
    const value = JSON.parse(note) as Partial<MonthlyExpenseTotal>;
    if (
      typeof value.monthKey !== 'string' || !(isExpenseCycleKey(value.monthKey) || isLegacyExpenseMonthKey(value.monthKey)) ||
      typeof value.totalPaise !== 'number' || !Number.isInteger(value.totalPaise) || value.totalPaise < 0 ||
      typeof value.entryCount !== 'number' || !Number.isInteger(value.entryCount) || value.entryCount < 0 ||
      typeof value.purgedAt !== 'string'
    ) return null;
    return { monthKey: value.monthKey, totalPaise: value.totalPaise, entryCount: value.entryCount, purgedAt: value.purgedAt };
  } catch {
    return null;
  }
}

/**
 * Pure planning step. Every parsed expense dated before the current spending cycle is
 * rolled into its cycle's total and marked for deletion. Entries from the current
 * cycle (or later), and rows whose note cannot be parsed, are never touched.
 * If a total for that cycle already exists (e.g. a late write after a previous purge),
 * the new entries are added to it rather than replacing it.
 */
export function planExpensePurge(expenseRows: StoredRow[], summaryRows: StoredRow[], now: Date = new Date()): ExpensePurgePlan {
  const currentCycleKey = currentExpenseCycleKey(now);
  const existing = new Map<string, MonthlyExpenseTotal>();
  summaryRows.forEach((row) => {
    const parsed = parseMonthlyTotalNote(row.note);
    if (parsed) existing.set(parsed.monthKey, parsed);
  });

  const additions = new Map<string, { totalPaise: number; entryCount: number }>();
  const deleteIds: string[] = [];
  expenseRows.forEach((row) => {
    const expense = parseExpenseNote(row.id, row.note, row.updatedAt);
    if (!expense) return;
    if (!isExpenseCycleKey(expense.dateKey)) return;
    const monthKey = expenseCycleKey(expense.dateKey);
    if (monthKey >= currentCycleKey) return; // never purge the current cycle
    const sum = additions.get(monthKey) ?? { totalPaise: 0, entryCount: 0 };
    sum.totalPaise += expense.amountPaise;
    sum.entryCount += 1;
    additions.set(monthKey, sum);
    deleteIds.push(row.id);
  });

  const purgedAt = now.toISOString();
  const summaries = [...additions.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, sum]) => {
      const prior = existing.get(monthKey);
      return {
        monthKey,
        totalPaise: (prior?.totalPaise ?? 0) + sum.totalPaise,
        entryCount: (prior?.entryCount ?? 0) + sum.entryCount,
        purgedAt
      };
    });

  return { currentCycleKey, summaries, deleteIds };
}

/** Minimal storage interface so the purge can run against Prisma or an in-memory fake. */
export interface ExpensePurgeStore {
  listExpenseRows(): Promise<StoredRow[]>;
  listMonthlyTotalRows(): Promise<StoredRow[]>;
  upsertMonthlyTotal(total: MonthlyExpenseTotal): Promise<void>;
  deleteExpenseRows(ids: string[]): Promise<number>;
}

/**
 * Saves each closed cycle's total FIRST, then deletes that cycle's entries.
 * Callers should run this inside one DB transaction (see expense-purge-prisma.ts).
 * Idempotent: a second run finds no closed-cycle entries and does nothing.
 */
export async function purgeClosedExpenseMonths(store: ExpensePurgeStore, now: Date = new Date()) {
  const plan = planExpensePurge(await store.listExpenseRows(), await store.listMonthlyTotalRows(), now);
  for (const summary of plan.summaries) await store.upsertMonthlyTotal(summary);
  const deleted = plan.deleteIds.length ? await store.deleteExpenseRows(plan.deleteIds) : 0;
  return {
    currentCycleKey: plan.currentCycleKey,
    purgedCycles: plan.summaries.map((summary) => summary.monthKey),
    deleted
  };
}

export function sortMonthlyTotals(totals: MonthlyExpenseTotal[]) {
  return [...totals].sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}
