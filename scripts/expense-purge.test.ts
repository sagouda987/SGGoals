import assert from 'node:assert/strict';
import {
  isCurrentMonthDateKey,
  istMonthKey,
  monthlyTotalId,
  parseMonthlyTotalNote,
  planExpensePurge,
  purgeClosedExpenseMonths,
  type ExpensePurgeStore,
  type MonthlyExpenseTotal,
  type StoredRow
} from '../lib/goals/expense-purge';

function expenseRow(id: string, dateKey: string, amountPaise: number): StoredRow {
  return { id: `__expense__:${id}`, note: JSON.stringify({ dateKey, amountPaise, category: 'Food', note: '' }), updatedAt: new Date('2026-10-01T00:00:00Z') };
}

class MemoryStore implements ExpensePurgeStore {
  log: string[] = [];
  constructor(public expenses: StoredRow[], public totals = new Map<string, StoredRow>()) {}
  async listExpenseRows() { return [...this.expenses]; }
  async listMonthlyTotalRows() { return [...this.totals.values()]; }
  async upsertMonthlyTotal(total: MonthlyExpenseTotal) {
    this.log.push(`upsert:${total.monthKey}`);
    this.totals.set(total.monthKey, { id: monthlyTotalId(total.monthKey), note: JSON.stringify(total), updatedAt: new Date() });
  }
  async deleteExpenseRows(ids: string[]) {
    this.log.push(`delete:${ids.length}`);
    const before = this.expenses.length;
    this.expenses = this.expenses.filter((row) => !ids.includes(row.id));
    return before - this.expenses.length;
  }
  total(monthKey: string) { return parseMonthlyTotalNote(this.totals.get(monthKey)?.note); }
}

async function main() {
  // --- IST month boundary ---
  assert.equal(istMonthKey(new Date('2026-10-31T23:59:00+05:30')), '2026-10');
  assert.equal(istMonthKey(new Date('2026-11-01T00:00:00+05:30')), '2026-11'); // = 2026-10-31T18:30Z
  assert.equal(istMonthKey(new Date('2026-10-31T18:29:59Z')), '2026-10');
  assert.equal(istMonthKey(new Date('2026-10-31T18:30:00Z')), '2026-11');
  assert.equal(istMonthKey(new Date('2026-12-31T19:00:00Z')), '2027-01'); // year rollover

  // --- current-month filter ---
  const now = new Date('2026-11-01T03:00:00+05:30'); // nightly cron time on the 1st
  assert.equal(isCurrentMonthDateKey('2026-11-01', now), true);
  assert.equal(isCurrentMonthDateKey('2026-10-31', now), false);
  assert.equal(isCurrentMonthDateKey('2025-11-05', now), false);

  // --- plan: keeps current month, sums past months, skips unparseable rows ---
  const rows = [
    expenseRow('a', '2026-10-01', 5000),
    expenseRow('b', '2026-10-31', 2550),
    expenseRow('c', '2026-09-15', 10000),
    expenseRow('d', '2026-11-01', 999),
    { id: '__expense__:broken', note: 'not json', updatedAt: new Date() }
  ];
  const plan = planExpensePurge(rows, [], now);
  assert.equal(plan.currentMonthKey, '2026-11');
  assert.deepEqual(plan.summaries.map((s) => [s.monthKey, s.totalPaise, s.entryCount]), [['2026-09', 10000, 1], ['2026-10', 7550, 2]]);
  assert.deepEqual(plan.deleteIds.sort(), ['__expense__:a', '__expense__:b', '__expense__:c']);

  // --- rollover purge: total saved BEFORE delete, correct total, current month kept ---
  const store = new MemoryStore(rows);
  const result = await purgeClosedExpenseMonths(store, now);
  assert.deepEqual(result.purgedMonths, ['2026-09', '2026-10']);
  assert.equal(result.deleted, 3);
  assert.deepEqual(store.log, ['upsert:2026-09', 'upsert:2026-10', 'delete:3']);
  assert.equal(store.total('2026-10')?.totalPaise, 7550);
  assert.equal(store.total('2026-10')?.entryCount, 2);
  assert.equal(store.total('2026-09')?.totalPaise, 10000);
  assert.deepEqual(store.expenses.map((r) => r.id).sort(), ['__expense__:broken', '__expense__:d']);
  assert.equal(store.total('2026-11'), null);

  // --- idempotency: second run changes nothing ---
  const again = await purgeClosedExpenseMonths(store, now);
  assert.equal(again.deleted, 0);
  assert.deepEqual(again.purgedMonths, []);
  assert.equal(store.total('2026-10')?.totalPaise, 7550);
  assert.deepEqual(store.log, ['upsert:2026-09', 'upsert:2026-10', 'delete:3']);

  // --- late entry for an already-purged month is ADDED to the stored total, not overwritten ---
  store.expenses.push(expenseRow('late', '2026-10-20', 450));
  await purgeClosedExpenseMonths(store, now);
  assert.equal(store.total('2026-10')?.totalPaise, 8000);
  assert.equal(store.total('2026-10')?.entryCount, 3);

  // --- never purge the current month, even on its last minute ---
  const lastMinute = new Date('2026-11-30T23:59:00+05:30');
  const current = new MemoryStore([expenseRow('x', '2026-11-30', 100), expenseRow('y', '2026-11-01', 200)]);
  const none = await purgeClosedExpenseMonths(current, lastMinute);
  assert.equal(none.deleted, 0);
  assert.equal(current.expenses.length, 2);
  // ...and one IST minute later (Dec 1, 00:00 IST = Nov 30 18:30 UTC) November is closed
  const closed = await purgeClosedExpenseMonths(current, new Date('2026-11-30T18:30:00Z'));
  assert.equal(closed.deleted, 2);
  assert.equal(current.total('2026-11')?.totalPaise, 300);

  // --- before the IST month ends (Nov 30 18:29 UTC), nothing goes even though UTC/other zones might differ ---
  const edge = new MemoryStore([expenseRow('z', '2026-11-30', 100)]);
  assert.equal((await purgeClosedExpenseMonths(edge, new Date('2026-11-30T18:29:59Z'))).deleted, 0);

  // --- bad summary notes are ignored ---
  assert.equal(parseMonthlyTotalNote('{"monthKey":"2026-10","totalPaise":-1,"entryCount":0,"purgedAt":"x"}'), null);

  console.log('Expense month purge tests passed.');
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
