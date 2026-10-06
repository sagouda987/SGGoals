import { istCalendarDateKey } from '@/lib/wake-timer';

export type ExpenseEntry = {
  id: string;
  dateKey: string;
  amountPaise: number;
  category: string;
  note: string;
  updatedAt: string;
};

export function expenseDateIsAllowed(dateKey: string, now: Date = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  const today = istCalendarDateKey(now);
  return dateKey.slice(0, 7) === today.slice(0, 7) && dateKey <= today;
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

export function parseExpenseNote(id: string, note: string | null | undefined, updatedAt: Date | string): ExpenseEntry | null {
  if (!id.startsWith('__expense__:') || !note) return null;
  try {
    const value = JSON.parse(note) as Partial<ExpenseEntry>;
    if (
      typeof value.dateKey !== 'string' ||
      typeof value.amountPaise !== 'number' ||
      !Number.isInteger(value.amountPaise) ||
      value.amountPaise <= 0 ||
      typeof value.category !== 'string' ||
      typeof value.note !== 'string'
    ) return null;
    return { id, dateKey: value.dateKey, amountPaise: value.amountPaise, category: value.category, note: value.note, updatedAt: new Date(updatedAt).toISOString() };
  } catch {
    return null;
  }
}
