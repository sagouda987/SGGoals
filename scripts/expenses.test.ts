import assert from 'node:assert/strict';
import { amountToPaise, buildDailyExpenseTotals, defaultExpenseDateKey, expenseDateIsAllowed, formatRupees, parseExpenseNote } from '../lib/goals/expenses';

const now = new Date('2026-10-07T10:00:00+05:30');
assert.equal(expenseDateIsAllowed('2026-10-01', now), true);
assert.equal(expenseDateIsAllowed('2026-10-07', now), true);
assert.equal(expenseDateIsAllowed('2026-10-08', now), false);
assert.equal(expenseDateIsAllowed('2026-09-30', now), false);
assert.equal(amountToPaise('12.50'), 1250);
assert.equal(amountToPaise('0'), null);
assert.match(formatRupees(123450), /1,234\.50/);
assert.equal(parseExpenseNote('__expense__:1', JSON.stringify({ dateKey: '2026-10-01', amountPaise: 5000, category: 'Food', note: 'Lunch' }), now)?.amountPaise, 5000);
assert.equal(parseExpenseNote('task', '{}', now), null);
const daily = buildDailyExpenseTotals([
  { id: '1', dateKey: '2026-10-01', amountPaise: 5000, category: 'Food', note: '', updatedAt: now.toISOString() },
  { id: '2', dateKey: '2026-10-01', amountPaise: 2500, category: 'Travel', note: '', updatedAt: now.toISOString() },
  { id: '3', dateKey: '2026-10-03', amountPaise: 1000, category: 'Food', note: '', updatedAt: now.toISOString() }
], '2026-10-03');
assert.deepEqual(daily.map((day) => day.amountPaise), [7500, 0, 1000]);
assert.equal(defaultExpenseDateKey('2026-10-07'), '2026-10-06');
assert.equal(defaultExpenseDateKey('2026-10-01'), '2026-10-01');

console.log('Expense tracker tests passed.');
