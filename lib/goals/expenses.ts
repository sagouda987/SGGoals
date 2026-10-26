import { istCalendarDateKey } from '@/lib/wake-timer';
import { expenseCycleKey } from '@/lib/goals/expense-cycle';

/**
 * Money entries for the Monthly tab. Spending and income ("Received") share the same rows
 * (scope __expense__, id __expense__:...). The stored note carries `kind`; rows saved before
 * income existed have no kind and are always 'spent'.
 */
export type MoneyKind = 'spent' | 'received';

export type ExpenseEntry = {
  id: string;
  dateKey: string;
  amountPaise: number;
  category: string;
  note: string;
  updatedAt: string;
  kind: MoneyKind;
};

export const SPENT_CATEGORIES = ['Food', 'Travel', 'Shopping', 'Health', 'Bills', 'Education', 'Entertainment', 'Other'] as const;
export const RECEIVED_CATEGORIES = ['Salary', 'Freelance', 'YouTube', 'Refund/Cashback', 'Interest/Dividend', 'Other'] as const;

export function moneyKind(value: unknown): MoneyKind {
  return value === 'received' ? 'received' : 'spent';
}

export function isReceived(entry: { kind?: unknown }) {
  return moneyKind(entry.kind) === 'received';
}

export function isSpent(entry: { kind?: unknown }) {
  return !isReceived(entry);
}

/** Cleans entries from older browser caches (no kind) so they count as spending. */
export function normalizeMoneyEntries(entries: unknown): ExpenseEntry[] {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((entry): entry is ExpenseEntry => Boolean(entry) && typeof entry === 'object' && typeof (entry as ExpenseEntry).id === 'string' && typeof (entry as ExpenseEntry).amountPaise === 'number' && typeof (entry as ExpenseEntry).dateKey === 'string')
    .map((entry) => ({ ...entry, kind: moneyKind(entry.kind) }));
}

export type CycleMoneySummary = {
  receivedPaise: number;
  receivedCount: number;
  spentPaise: number;
  spentCount: number;
  /** received - spent; negative means more went out than came in. */
  netPaise: number;
  /** Whole percent of income kept (net / received), rounded; null when nothing was received. */
  savingsRatePercent: number | null;
};

export function summarizeMoney(entries: Array<Pick<ExpenseEntry, 'amountPaise'> & { kind?: unknown }>): CycleMoneySummary {
  let receivedPaise = 0;
  let receivedCount = 0;
  let spentPaise = 0;
  let spentCount = 0;
  entries.forEach((entry) => {
    if (isReceived(entry)) {
      receivedPaise += entry.amountPaise;
      receivedCount += 1;
    } else {
      spentPaise += entry.amountPaise;
      spentCount += 1;
    }
  });
  return { receivedPaise, receivedCount, spentPaise, spentCount, ...netAndRate(receivedPaise, spentPaise) };
}

export function netAndRate(receivedPaise: number, spentPaise: number) {
  const netPaise = receivedPaise - spentPaise;
  return { netPaise, savingsRatePercent: receivedPaise > 0 ? Math.round((netPaise * 100) / receivedPaise) : null };
}

/** Most recent Salary entry (by date, then save time), for "Salary received on <date>". */
export function latestSalary(entries: ExpenseEntry[]) {
  return entries
    .filter((entry) => isReceived(entry) && entry.category === 'Salary')
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey) || b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
}

export function expenseDateIsAllowed(dateKey: string, now: Date = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  const today = istCalendarDateKey(now);
  // Any date from the start of the current spending cycle (30th, IST) up to today.
  return dateKey >= expenseCycleKey(today) && dateKey <= today;
}

export function amountToPaise(value: unknown) {
  if (value === '' || value === null || value === undefined) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) return null;
  return Math.round(amount * 100);
}

export function formatRupees(amountPaise: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amountPaise / 100);
}

export function buildDailyExpenseTotals(expenses: Array<Omit<ExpenseEntry, 'kind'> & { kind?: MoneyKind }>, throughDateKey: string) {
  const cycleStart = expenseCycleKey(throughDateKey);
  const totals = new Map<string, number>();
  expenses.forEach((expense) => {
    if (isSpent(expense) && expense.dateKey >= cycleStart && expense.dateKey <= throughDateKey) totals.set(expense.dateKey, (totals.get(expense.dateKey) || 0) + expense.amountPaise);
  });
  const days: Array<{ dateKey: string; amountPaise: number }> = [];
  const cursor = new Date(`${cycleStart}T12:00:00Z`);
  const end = new Date(`${throughDateKey}T12:00:00Z`);
  while (cursor <= end) {
    const dateKey = cursor.toISOString().slice(0, 10);
    days.push({ dateKey, amountPaise: totals.get(dateKey) || 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export function parseExpenseNote(id: string, note: string | null | undefined, updatedAt: Date | string): ExpenseEntry | null {
  if (!id.startsWith('__expense__:') || !note) return null;
  try {
    const value = JSON.parse(note) as Partial<Omit<ExpenseEntry, 'kind'>> & { kind?: unknown };
    if (
      typeof value.dateKey !== 'string' ||
      typeof value.amountPaise !== 'number' ||
      !Number.isInteger(value.amountPaise) ||
      value.amountPaise <= 0 ||
      typeof value.category !== 'string' ||
      typeof value.note !== 'string'
    ) return null;
    return { id, dateKey: value.dateKey, amountPaise: value.amountPaise, category: value.category, note: value.note, updatedAt: new Date(updatedAt).toISOString(), kind: moneyKind(value.kind) };
  } catch {
    return null;
  }
}
