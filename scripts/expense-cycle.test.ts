import assert from 'node:assert/strict';
import {
  EXPENSE_CYCLE_START_DAY,
  currentExpenseCycleKey,
  expenseCycleEndKey,
  expenseCycleKey,
  expenseCycleLabel,
  expenseCycleRuleText,
  isInCurrentExpenseCycle,
  isSameExpenseCycle,
  legacyMonthToCycleKey
} from '../lib/goals/expense-cycle';
import { amountToPaise, buildDailyExpenseTotals, expenseDateIsAllowed } from '../lib/goals/expenses';

assert.equal(EXPENSE_CYCLE_START_DAY, 30);
assert.equal(expenseCycleRuleText(), 'the 30th to the 29th (last day of February when there is no 30th)');

// --- boundaries: 29th 23:59 IST vs 30th 00:00 IST ---
assert.equal(currentExpenseCycleKey(new Date('2026-10-29T23:59:59+05:30')), '2026-09-30');
assert.equal(currentExpenseCycleKey(new Date('2026-10-30T00:00:00+05:30')), '2026-10-30');
assert.equal(currentExpenseCycleKey(new Date('2026-10-29T18:29:59Z')), '2026-09-30'); // UTC view of the same edge
assert.equal(currentExpenseCycleKey(new Date('2026-10-29T18:30:00Z')), '2026-10-30');
assert.equal(expenseCycleKey('2026-10-01'), '2026-09-30');
assert.equal(expenseCycleKey('2026-10-26'), '2026-09-30');
assert.equal(expenseCycleKey('2026-10-31'), '2026-10-30');
assert.equal(expenseCycleEndKey('2026-09-30'), '2026-10-29');
assert.equal(expenseCycleLabel('2026-09-30'), '30 Sep – 29 Oct 2026');

// --- February: cycle starts on Feb's last day ---
assert.equal(expenseCycleKey('2027-02-27'), '2027-01-30');
assert.equal(expenseCycleEndKey('2027-01-30'), '2027-02-27');
assert.equal(expenseCycleKey('2027-02-28'), '2027-02-28');
assert.equal(expenseCycleEndKey('2027-02-28'), '2027-03-29');
assert.equal(expenseCycleLabel('2027-02-28'), '28 Feb – 29 Mar 2027');
assert.equal(expenseCycleKey('2028-02-28'), '2028-01-30'); // leap year
assert.equal(expenseCycleKey('2028-02-29'), '2028-02-29');
assert.equal(expenseCycleEndKey('2028-01-30'), '2028-02-28');
// 31st belongs to the cycle that started on the 30th
assert.equal(expenseCycleKey('2027-03-31'), '2027-03-30');

// --- year end: 30 Dec – 29 Jan ---
assert.equal(expenseCycleKey('2026-12-30'), '2026-12-30');
assert.equal(expenseCycleKey('2027-01-01'), '2026-12-30');
assert.equal(expenseCycleKey('2027-01-29'), '2026-12-30');
assert.equal(expenseCycleEndKey('2026-12-30'), '2027-01-29');
assert.equal(expenseCycleLabel('2026-12-30'), '30 Dec 2026 – 29 Jan 2027');
assert.equal(currentExpenseCycleKey(new Date('2026-12-29T23:59:00+05:30')), '2026-11-30');
assert.equal(currentExpenseCycleKey(new Date('2026-12-30T00:00:00+05:30')), '2026-12-30');

// --- no gaps / overlaps over several years: each day's cycle is either the previous day's or starts that day ---
const cursor = new Date('2026-01-01T12:00:00Z');
let previousKey = expenseCycleKey('2025-12-31');
let cycles = 0;
while (cursor < new Date('2030-12-31T12:00:00Z')) {
  const dateKey = cursor.toISOString().slice(0, 10);
  const key = expenseCycleKey(dateKey);
  assert.ok(key <= dateKey && dateKey <= expenseCycleEndKey(key), `${dateKey} inside its cycle`);
  if (key !== previousKey) {
    cycles += 1;
    assert.equal(key, dateKey, `a new cycle starts on ${dateKey}`);
    const dayBefore = new Date(cursor.getTime() - 86_400_000).toISOString().slice(0, 10);
    assert.equal(expenseCycleEndKey(previousKey), dayBefore, `previous cycle ends the day before ${dateKey}`);
  }
  previousKey = key;
  cursor.setUTCDate(cursor.getUTCDate() + 1);
}
assert.equal(cycles, 60, 'one cycle per month');

// --- helpers ---
assert.equal(isSameExpenseCycle('2026-09-30', '2026-10-29'), true);
assert.equal(isSameExpenseCycle('2026-09-29', '2026-10-29'), false);
assert.equal(isSameExpenseCycle('junk', '2026-10-29'), false);
assert.equal(isInCurrentExpenseCycle('2026-10-01', new Date('2026-10-26T15:00:00+05:30')), true);
assert.equal(isInCurrentExpenseCycle('2026-09-29', new Date('2026-10-26T15:00:00+05:30')), false);
assert.equal(legacyMonthToCycleKey('2026-10'), '2026-09-30');
assert.equal(legacyMonthToCycleKey('2027-03'), '2027-02-28');
assert.equal(expenseCycleLabel('2026-09'), 'September 2026'); // old calendar-month totals still readable

// --- expense form/API date rule follows the cycle ---
const oct26 = new Date('2026-10-26T15:00:00+05:30');
assert.equal(expenseDateIsAllowed('2026-09-30', oct26), true);
assert.equal(expenseDateIsAllowed('2026-09-29', oct26), false);
assert.equal(expenseDateIsAllowed('2026-10-27', oct26), false); // future
const oct30 = new Date('2026-10-30T00:00:00+05:30');
assert.equal(expenseDateIsAllowed('2026-10-30', oct30), true);
assert.equal(expenseDateIsAllowed('2026-10-29', oct30), false); // previous cycle is closed
assert.equal(expenseDateIsAllowed('2026-10-31', new Date('2026-11-02T10:00:00+05:30')), true);

// --- daily chart runs from the cycle start ---
const days = buildDailyExpenseTotals(
  [
    { id: '__expense__:a', dateKey: '2026-09-30', amountPaise: amountToPaise(100)!, category: 'Food', note: '', updatedAt: '' },
    { id: '__expense__:b', dateKey: '2026-10-02', amountPaise: 5000, category: 'Food', note: '', updatedAt: '' },
    { id: '__expense__:c', dateKey: '2026-09-29', amountPaise: 999, category: 'Food', note: '', updatedAt: '' }
  ],
  '2026-10-02'
);
assert.deepEqual(days.map((day) => [day.dateKey, day.amountPaise]), [['2026-09-30', 10000], ['2026-10-01', 0], ['2026-10-02', 5000]]);

console.log('Expense cycle tests passed.');
