import { istCalendarDateKey } from '@/lib/wake-timer';
import { parseExpenseNote } from '@/lib/goals/expenses';

// Months use the IST calendar (midnight IST), the same rule the expense form
// and API already use to decide which dates belong to "this month".
export const EXPENSE_SCOPE = '__expense__';
export const EXPENSE_MONTH_SCOPE = '__expense_month__';
export const EXPENSE_MONTH_ID_PREFIX = '__expense_month__:';

export type MonthlyExpenseTotal = {
  monthKey: string; // YYYY-MM (IST calendar month)
  totalPaise: number;
  entryCount: number;
  purgedAt: string;
};

export type StoredRow = { id: string; note: string | null; updatedAt: Date | string };

export type ExpensePurgePlan = {
  currentMonthKey: string;
  summaries: MonthlyExpenseTotal[]; // final values to write (existing total + newly purged)
  deleteIds: string[];
};

export function istMonthKey(now: Date | number | string = new Date()) {
  return istCalendarDateKey(now).slice(0, 7);
}

export function monthlyTotalId(monthKey: string) {
  return `${EXPENSE_MONTH_ID_PREFIX}${monthKey}`;
}

export function isCurrentMonthDateKey(dateKey: string, now: Date | number | string = new Date()) {
  return dateKey.slice(0, 7) === istMonthKey(now);
}

export function parseMonthlyTotalNote(note: string | null | undefined): MonthlyExpenseTotal | null {
  if (!note) return null;
  try {
    const value = JSON.parse(note) as Partial<MonthlyExpenseTotal>;
    if (
      typeof value.monthKey !== 'string' || !/^\d{4}-\d{2}$/.test(value.monthKey) ||
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
 * Pure planning step. Every parsed expense dated before the current IST month is
 * rolled into its month's total and marked for deletion. Entries from the current
 * month (or later), and rows whose note cannot be parsed, are never touched.
 * If a total for that month already exists (e.g. a late write after a previous purge),
 * the new entries are added to it rather than replacing it.
 */
export function planExpensePurge(expenseRows: StoredRow[], summaryRows: StoredRow[], now: Date = new Date()): ExpensePurgePlan {
  const currentMonthKey = istMonthKey(now);
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
    const monthKey = expense.dateKey.slice(0, 7);
    if (monthKey >= currentMonthKey) return; // never purge the current month
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

  return { currentMonthKey, summaries, deleteIds };
}

/** Minimal storage interface so the purge can run against Prisma or an in-memory fake. */
export interface ExpensePurgeStore {
  listExpenseRows(): Promise<StoredRow[]>;
  listMonthlyTotalRows(): Promise<StoredRow[]>;
  upsertMonthlyTotal(total: MonthlyExpenseTotal): Promise<void>;
  deleteExpenseRows(ids: string[]): Promise<number>;
}

/**
 * Saves each closed month's total FIRST, then deletes that month's entries.
 * Callers should run this inside one DB transaction (see expense-purge-prisma.ts).
 * Idempotent: a second run finds no closed-month entries and does nothing.
 */
export async function purgeClosedExpenseMonths(store: ExpensePurgeStore, now: Date = new Date()) {
  const plan = planExpensePurge(await store.listExpenseRows(), await store.listMonthlyTotalRows(), now);
  for (const summary of plan.summaries) await store.upsertMonthlyTotal(summary);
  const deleted = plan.deleteIds.length ? await store.deleteExpenseRows(plan.deleteIds) : 0;
  return {
    currentMonthKey: plan.currentMonthKey,
    purgedMonths: plan.summaries.map((summary) => summary.monthKey),
    deleted
  };
}

export function sortMonthlyTotals(totals: MonthlyExpenseTotal[]) {
  return [...totals].sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}
