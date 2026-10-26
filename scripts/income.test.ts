import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildDailyExpenseTotals,
  isReceived,
  latestSalary,
  netAndRate,
  normalizeMoneyEntries,
  parseExpenseNote,
  RECEIVED_CATEGORIES,
  summarizeMoney,
  type ExpenseEntry
} from '../lib/goals/expenses';
import { budgetStatus } from '../lib/goals/expense-budget';
import { isSameExpenseCycle } from '../lib/goals/expense-cycle';

const at = '2026-10-26T10:00:00.000Z';
const entry = (id: string, dateKey: string, rupees: number, kind: 'spent' | 'received', category = kind === 'received' ? 'Salary' : 'Food'): ExpenseEntry => ({
  id: `__expense__:${id}`,
  dateKey,
  amountPaise: rupees * 100,
  category,
  note: '',
  updatedAt: at,
  kind
});

// --- old records: rows saved before income existed have no kind and stay spending ---
const old = parseExpenseNote('__expense__:old', JSON.stringify({ dateKey: '2026-10-01', amountPaise: 5000, category: 'Food', note: 'Lunch' }), at);
assert.equal(old?.kind, 'spent');
const received = parseExpenseNote('__expense__:sal', JSON.stringify({ dateKey: '2026-10-01', amountPaise: 9000000, category: 'Salary', note: '', kind: 'received' }), at);
assert.equal(received?.kind, 'received');
assert.equal(parseExpenseNote('__expense__:x', JSON.stringify({ dateKey: '2026-10-01', amountPaise: 1, category: 'Food', note: '', kind: 'weird' }), at)?.kind, 'spent');
assert.deepEqual(normalizeMoneyEntries([{ id: 'a', dateKey: '2026-10-01', amountPaise: 1, category: 'Food', note: '', updatedAt: at }]).map((e) => e.kind), ['spent']);
assert.deepEqual(normalizeMoneyEntries('junk'), []);
assert.deepEqual([...RECEIVED_CATEGORIES], ['Salary', 'Freelance', 'YouTube', 'Refund/Cashback', 'Interest/Dividend', 'Other']);

// --- separation + cycle totals (30 Sep – 29 Oct 2026) ---
const entries = [
  entry('s1', '2026-10-02', 1200, 'spent'),
  entry('s2', '2026-10-10', 45000, 'spent'),
  entry('i1', '2026-10-01', 90000, 'received'),
  entry('i2', '2026-10-15', 2500, 'received', 'YouTube'),
  entry('prev', '2026-09-29', 999, 'received') // previous cycle
];
const cycle = entries.filter((e) => isSameExpenseCycle(e.dateKey, '2026-10-26'));
const money = summarizeMoney(cycle);
assert.deepEqual(money, { receivedPaise: 9250000, receivedCount: 2, spentPaise: 4620000, spentCount: 2, netPaise: 4630000, savingsRatePercent: 50 });
// budget % is spending only: ₹46,200 of ₹80,000 = 57%, income does not lower it
assert.equal(budgetStatus(money.spentPaise, 8_000_000).percent, 57);
// the daily spending graph ignores income
assert.deepEqual(buildDailyExpenseTotals(cycle, '2026-10-02').map((d) => d.amountPaise), [0, 0, 120000]);

// --- net / savings maths ---
assert.deepEqual(netAndRate(10_000_00, 2_500_00), { netPaise: 7_500_00, savingsRatePercent: 75 });
assert.deepEqual(netAndRate(10_000_00, 12_000_00), { netPaise: -2_000_00, savingsRatePercent: -20 }); // overspent: red
assert.deepEqual(netAndRate(0, 500_00), { netPaise: -500_00, savingsRatePercent: null }); // nothing received yet
assert.deepEqual(netAndRate(3_00, 1_00), { netPaise: 2_00, savingsRatePercent: 67 }); // rounded
assert.equal(summarizeMoney([]).savingsRatePercent, null);

// --- salary line ---
assert.equal(latestSalary(cycle)?.dateKey, '2026-10-01');
assert.equal(latestSalary([entry('f', '2026-10-03', 100, 'received', 'Freelance')]), null);
assert.ok(isReceived(entry('r', '2026-10-03', 1, 'received')));

// --- income stays out of AI context / daily review / MCP (same hidden scope as expenses) ---
for (const file of ['lib/ai/context-builder.ts', 'lib/ai/daily-review-store.ts', 'lib/mcp/service.ts']) {
  assert.match(readFileSync(join(__dirname, '..', file), 'utf8'), /notIn: \['__connection__', '__expense__', '__expense_month__', '__expense_budget__'\]/, file);
}

console.log('Income tests passed.');
