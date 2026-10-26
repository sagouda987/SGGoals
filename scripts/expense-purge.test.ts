import assert from 'node:assert/strict';
import {
  isCurrentCycleDateKey,
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
  // Cycles run 30th -> 29th (IST midnight). Real data today: 128 entries dated 1-26 Oct 2026,
  // all in the cycle 30 Sep – 29 Oct 2026, so nothing purges until 30 Oct 03:00 IST.

  // --- current-cycle filter ---
  const oct26 = new Date('2026-10-26T15:00:00+05:30');
  assert.equal(isCurrentCycleDateKey('2026-10-01', oct26), true);
  assert.equal(isCurrentCycleDateKey('2026-09-30', oct26), true);
  assert.equal(isCurrentCycleDateKey('2026-09-29', oct26), false);
  assert.equal(isCurrentCycleDateKey('2025-10-05', oct26), false);

  // --- today's real situation: nothing to purge ---
  const octEntries = Array.from({ length: 26 }, (_, index) => expenseRow(`oct${index}`, `2026-10-${String(index + 1).padStart(2, '0')}`, 1000));
  const today = planExpensePurge(octEntries, [], oct26);
  assert.equal(today.currentCycleKey, '2026-09-30');
  assert.deepEqual(today.deleteIds, []);
  // ...still nothing at 29 Oct 23:59 IST, and nothing on 1 Nov would have been the old rule; new rule purges on 30 Oct.
  assert.deepEqual(planExpensePurge(octEntries, [], new Date('2026-10-29T23:59:59+05:30')).deleteIds, []);
  const firstPurge = planExpensePurge(octEntries, [], new Date('2026-10-30T03:00:00+05:30')); // nightly cron on the 30th
  assert.equal(firstPurge.currentCycleKey, '2026-10-30');
  assert.equal(firstPurge.deleteIds.length, 26);
  assert.deepEqual(firstPurge.summaries.map((s) => [s.monthKey, s.totalPaise, s.entryCount]), [['2026-09-30', 26000, 26]]);

  // --- plan: keeps current cycle, sums closed cycles, skips unparseable rows ---
  const now = new Date('2026-10-30T03:00:00+05:30');
  const rows = [
    expenseRow('a', '2026-10-01', 5000),
    expenseRow('b', '2026-10-29', 2550),
    expenseRow('c', '2026-09-15', 10000), // cycle 30 Aug – 29 Sep
    expenseRow('d', '2026-10-30', 999), // new cycle: kept
    expenseRow('e', '2026-09-30', 450), // first day of the closed cycle
    { id: '__expense__:broken', note: 'not json', updatedAt: new Date() }
  ];
  const plan = planExpensePurge(rows, [], now);
  assert.deepEqual(plan.summaries.map((s) => [s.monthKey, s.totalPaise, s.entryCount]), [['2026-08-30', 10000, 1], ['2026-09-30', 8000, 3]]);
  assert.deepEqual(plan.deleteIds.sort(), ['__expense__:a', '__expense__:b', '__expense__:c', '__expense__:e']);

  // --- rollover purge: total saved BEFORE delete, correct total, current cycle kept ---
  const store = new MemoryStore(rows);
  const result = await purgeClosedExpenseMonths(store, now);
  assert.deepEqual(result.purgedCycles, ['2026-08-30', '2026-09-30']);
  assert.equal(result.deleted, 4);
  assert.deepEqual(store.log, ['upsert:2026-08-30', 'upsert:2026-09-30', 'delete:4']);
  assert.equal(store.total('2026-09-30')?.totalPaise, 8000);
  assert.equal(store.total('2026-09-30')?.entryCount, 3);
  assert.deepEqual(store.expenses.map((r) => r.id).sort(), ['__expense__:broken', '__expense__:d']);
  assert.equal(store.total('2026-10-30'), null);

  // --- idempotency: second run changes nothing ---
  const again = await purgeClosedExpenseMonths(store, now);
  assert.equal(again.deleted, 0);
  assert.deepEqual(again.purgedCycles, []);
  assert.deepEqual(store.log, ['upsert:2026-08-30', 'upsert:2026-09-30', 'delete:4']);

  // --- late entry for an already-purged cycle is ADDED to the stored total ---
  store.expenses.push(expenseRow('late', '2026-10-20', 450));
  await purgeClosedExpenseMonths(store, now);
  assert.equal(store.total('2026-09-30')?.totalPaise, 8450);
  assert.equal(store.total('2026-09-30')?.entryCount, 4);

  // --- year end: 30 Dec – 29 Jan closes at 30 Jan 00:00 IST ---
  const yearEnd = new MemoryStore([expenseRow('x', '2026-12-30', 100), expenseRow('y', '2027-01-29', 200)]);
  assert.equal((await purgeClosedExpenseMonths(yearEnd, new Date('2027-01-29T23:59:00+05:30'))).deleted, 0);
  assert.equal((await purgeClosedExpenseMonths(yearEnd, new Date('2027-01-29T18:29:59Z'))).deleted, 0);
  const closed = await purgeClosedExpenseMonths(yearEnd, new Date('2027-01-29T18:30:00Z')); // 30 Jan 00:00 IST
  assert.equal(closed.deleted, 2);
  assert.equal(yearEnd.total('2026-12-30')?.totalPaise, 300);

  // --- February: 30 Jan – 27 Feb 2027 closes on 28 Feb ---
  const feb = new MemoryStore([expenseRow('f1', '2027-02-27', 100), expenseRow('f2', '2027-02-28', 200)]);
  const febResult = await purgeClosedExpenseMonths(feb, new Date('2027-02-28T03:00:00+05:30'));
  assert.deepEqual(febResult.purgedCycles, ['2027-01-30']);
  assert.deepEqual(feb.expenses.map((r) => r.id), ['__expense__:f2']);

  // --- old calendar-month totals (if any) stay readable and are never overwritten ---
  const legacy = { monthKey: '2026-08', totalPaise: 1234, entryCount: 2, purgedAt: '2026-09-01T00:00:00.000Z' };
  // spending-only records (before income existed) read with received = 0
  assert.deepEqual(parseMonthlyTotalNote(JSON.stringify(legacy)), { ...legacy, receivedPaise: 0, receivedCount: 0 });
  assert.equal(monthlyTotalId('2026-09-30'), '__expense_month__:2026-09-30');
  const withLegacy = planExpensePurge([expenseRow('g', '2026-09-01', 500)], [{ id: monthlyTotalId('2026-08'), note: JSON.stringify(legacy), updatedAt: new Date() }], now);
  assert.deepEqual(withLegacy.summaries.map((s) => [s.monthKey, s.totalPaise]), [['2026-08-30', 500]]);

  // --- income: purge keeps BOTH received and spent totals per cycle ---
  const incomeRow = (id: string, dateKey: string, amountPaise: number, category = 'Salary'): StoredRow => ({
    id: `__expense__:${id}`,
    note: JSON.stringify({ dateKey, amountPaise, category, note: '', kind: 'received' }),
    updatedAt: new Date('2026-10-01T00:00:00Z')
  });
  const mixed = new MemoryStore([
    expenseRow('s1', '2026-10-05', 30000),
    expenseRow('s2', '2026-10-20', 20000),
    incomeRow('i1', '2026-10-01', 9000000),
    incomeRow('i2', '2026-10-15', 150000, 'YouTube'),
    incomeRow('i3', '2026-10-30', 5000000) // next cycle: kept
  ]);
  const mixedResult = await purgeClosedExpenseMonths(mixed, now);
  assert.equal(mixedResult.deleted, 4);
  assert.deepEqual(
    (({ totalPaise, entryCount, receivedPaise, receivedCount }) => ({ totalPaise, entryCount, receivedPaise, receivedCount }))(mixed.total('2026-09-30')!),
    { totalPaise: 50000, entryCount: 2, receivedPaise: 9150000, receivedCount: 2 }
  );
  assert.deepEqual(mixed.expenses.map((r) => r.id), ['__expense__:i3']);
  // a late income entry is added to the existing record (received grows, spent unchanged)
  mixed.expenses.push(incomeRow('late-income', '2026-10-25', 1000, 'Refund/Cashback'));
  await purgeClosedExpenseMonths(mixed, now);
  assert.equal(mixed.total('2026-09-30')?.receivedPaise, 9151000);
  assert.equal(mixed.total('2026-09-30')?.receivedCount, 3);
  assert.equal(mixed.total('2026-09-30')?.totalPaise, 50000);
  // a spending-only stored record gets received added on top of 0
  const oldRecord = new MemoryStore([incomeRow('x1', '2026-10-02', 700)], new Map([['2026-09-30', { id: monthlyTotalId('2026-09-30'), note: JSON.stringify({ monthKey: '2026-09-30', totalPaise: 100, entryCount: 1, purgedAt: 'x' }), updatedAt: new Date() }]]));
  await purgeClosedExpenseMonths(oldRecord, now);
  assert.deepEqual([oldRecord.total('2026-09-30')?.totalPaise, oldRecord.total('2026-09-30')?.receivedPaise, oldRecord.total('2026-09-30')?.receivedCount], [100, 700, 1]);

  // --- bad summary notes are ignored ---
  assert.equal(parseMonthlyTotalNote('{"monthKey":"2026-10","totalPaise":1,"entryCount":0,"receivedPaise":-5,"purgedAt":"x"}'), null);
  assert.equal(parseMonthlyTotalNote('{"monthKey":"2026-10","totalPaise":-1,"entryCount":0,"purgedAt":"x"}'), null);
  assert.equal(parseMonthlyTotalNote('{"monthKey":"2026-1","totalPaise":1,"entryCount":0,"purgedAt":"x"}'), null);

  console.log('Expense cycle purge tests passed.');
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
