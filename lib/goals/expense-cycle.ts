import { istCalendarDateKey } from '@/lib/wake-timer';

/**
 * Spending cycle ("month") used by the Monthly tab, the budget and the purge.
 *
 * Rule: a cycle starts on EXPENSE_CYCLE_START_DAY of a month at 00:00 IST and ends the day
 * before the next cycle starts. In a month that has fewer days than the start day (February
 * for 30), the cycle starts on that month's last day instead. Examples with 30:
 *   30 Sep – 29 Oct, 30 Dec – 29 Jan, 30 Jan – 27 Feb 2027, 28 Feb – 29 Mar 2027,
 *   29 Feb – 29 Mar 2028 (leap year). Every date belongs to exactly one cycle.
 *
 * Change this one constant to move the start day (1 = calendar months).
 */
export const EXPENSE_CYCLE_START_DAY = 30;

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const LEGACY_MONTH_KEY = /^\d{4}-\d{2}$/;

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate(); // month is 1..12
}

function startDayIn(year: number, month: number) {
  return Math.min(Math.max(1, EXPENSE_CYCLE_START_DAY), daysInMonth(year, month));
}

function shiftMonth(year: number, month: number, delta: number) {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function parseDateKey(dateKey: string) {
  const match = DATE_KEY.exec(dateKey);
  if (!match) throw new Error(`Invalid date key: ${dateKey}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function isExpenseCycleKey(value: string) {
  return DATE_KEY.test(value);
}

export function isLegacyExpenseMonthKey(value: string) {
  return LEGACY_MONTH_KEY.test(value);
}

/** Cycle key = the cycle's first date (YYYY-MM-DD, IST). */
export function expenseCycleKey(dateKey: string) {
  const { year, month, day } = parseDateKey(dateKey);
  const start = startDayIn(year, month);
  if (day >= start) return `${year}-${pad(month)}-${pad(start)}`;
  const previous = shiftMonth(year, month, -1);
  return `${previous.year}-${pad(previous.month)}-${pad(startDayIn(previous.year, previous.month))}`;
}

/** Last date (inclusive) of the cycle that starts on cycleKey. */
export function expenseCycleEndKey(cycleKey: string) {
  const { year, month } = parseDateKey(expenseCycleKey(cycleKey));
  const next = shiftMonth(year, month, 1);
  const nextStart = new Date(Date.UTC(next.year, next.month - 1, startDayIn(next.year, next.month)));
  nextStart.setUTCDate(nextStart.getUTCDate() - 1);
  return nextStart.toISOString().slice(0, 10);
}

export function currentExpenseCycleKey(now: Date | number | string = new Date()) {
  return expenseCycleKey(istCalendarDateKey(now));
}

export function isInCurrentExpenseCycle(dateKey: string, now: Date | number | string = new Date()) {
  if (!DATE_KEY.test(dateKey)) return false;
  return expenseCycleKey(dateKey) === currentExpenseCycleKey(now);
}

/** True when both dates are valid and fall in the same cycle (safe for unvalidated cached data). */
export function isSameExpenseCycle(dateKey: string, referenceDateKey: string) {
  if (!DATE_KEY.test(dateKey) || !DATE_KEY.test(referenceDateKey)) return false;
  return expenseCycleKey(dateKey) === expenseCycleKey(referenceDateKey);
}

/** Old calendar-month keys (YYYY-MM) map to the cycle that contains the 1st of that month. */
export function legacyMonthToCycleKey(monthKey: string) {
  return expenseCycleKey(`${monthKey}-01`);
}

// Fixed English month names so the label is identical on the server and in every browser.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function dayMonth(dateKey: string) {
  const { month, day } = parseDateKey(dateKey);
  return `${day} ${MONTHS[month - 1]}`;
}

/** "30 Sep – 29 Oct 2026", "30 Dec 2026 – 29 Jan 2027"; legacy "2026-09" -> "September 2026". */
export function expenseCycleLabel(key: string) {
  if (isLegacyExpenseMonthKey(key)) return `${LONG_MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
  const end = expenseCycleEndKey(key);
  const startYear = key.slice(0, 4);
  const endYear = end.slice(0, 4);
  return startYear === endYear ? `${dayMonth(key)} – ${dayMonth(end)} ${endYear}` : `${dayMonth(key)} ${startYear} – ${dayMonth(end)} ${endYear}`;
}

function ordinal(day: number) {
  const tens = day % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10] ?? 'th';
  return `${day}${suffix}`;
}

/** Plain-English rule for the UI, e.g. "30th to the 29th (last day of February when there is no 30th)". */
export function expenseCycleRuleText() {
  const start = Math.max(1, EXPENSE_CYCLE_START_DAY);
  if (start === 1) return 'the 1st to the last day of each month';
  const febNote = start > 28 ? ` (last day of February when there is no ${ordinal(start)})` : '';
  return `the ${ordinal(start)} to the ${ordinal(start - 1)}${febNote}`;
}
