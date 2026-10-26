import { prisma } from '@/lib/prisma';
import {
  EXPENSE_MONTH_SCOPE,
  EXPENSE_SCOPE,
  monthlyTotalId,
  parseMonthlyTotalNote,
  purgeClosedExpenseMonths,
  sortMonthlyTotals,
  type MonthlyExpenseTotal
} from '@/lib/goals/expense-purge';
import { expenseCycleLabel } from '@/lib/goals/expense-cycle';

const OWNER_KEY = 'default';

/** Runs the purge in a single transaction: totals are written before entries are deleted, and a failure rolls back both. */
export async function purgeClosedExpenseMonthsInDb(now: Date = new Date()) {
  return prisma.$transaction(
    async (tx) => {
      // Serialise concurrent purges (cron + page load) so a cycle is never double-counted.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'expense-purge:' + OWNER_KEY}))`;
      return purgeClosedExpenseMonths(
        {
          listExpenseRows: () => tx.goalTask.findMany({ where: { ownerKey: OWNER_KEY, scope: EXPENSE_SCOPE }, select: { id: true, note: true, updatedAt: true } }),
          listMonthlyTotalRows: () => tx.goalTask.findMany({ where: { ownerKey: OWNER_KEY, scope: EXPENSE_MONTH_SCOPE }, select: { id: true, note: true, updatedAt: true } }),
          upsertMonthlyTotal: async (total) => {
            const id = monthlyTotalId(total.monthKey);
            const note = JSON.stringify(total);
            const text = `Spending total ${expenseCycleLabel(total.monthKey)}`;
            await tx.goalTask.upsert({
              where: { id },
              create: { id, ownerKey: OWNER_KEY, scope: EXPENSE_MONTH_SCOPE, text, note, priority: 'other', position: 0, done: true },
              update: { text, note, updatedAt: new Date() }
            });
          },
          deleteExpenseRows: async (ids) => {
            const result = await tx.goalTask.deleteMany({ where: { ownerKey: OWNER_KEY, scope: EXPENSE_SCOPE, id: { in: ids } } });
            return result.count;
          }
        },
        now
      );
    },
    { maxWait: 15000, timeout: 15000 }
  );
}

export async function loadMonthlyExpenseTotals(): Promise<MonthlyExpenseTotal[]> {
  const rows = await prisma.goalTask.findMany({ where: { ownerKey: OWNER_KEY, scope: EXPENSE_MONTH_SCOPE }, select: { note: true } });
  return sortMonthlyTotals(rows.map((row) => parseMonthlyTotalNote(row.note)).filter((value): value is MonthlyExpenseTotal => Boolean(value)));
}
