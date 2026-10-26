import { prisma } from '@/lib/prisma';
import {
  EXPENSE_BUDGET_ID,
  EXPENSE_BUDGET_SCOPE,
  markBudgetNotified,
  parseExpenseBudgetNote,
  type BudgetAlertLevel,
  type ExpenseBudget
} from '@/lib/goals/expense-budget';

const OWNER_KEY = 'default';

export async function loadExpenseBudget(): Promise<ExpenseBudget> {
  const row = await prisma.goalTask.findFirst({ where: { id: EXPENSE_BUDGET_ID, ownerKey: OWNER_KEY, scope: EXPENSE_BUDGET_SCOPE }, select: { note: true } });
  return parseExpenseBudgetNote(row?.note);
}

async function updateExpenseBudget(change: (current: ExpenseBudget) => ExpenseBudget) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'expense-budget:' + OWNER_KEY}))`;
    const row = await tx.goalTask.findFirst({ where: { id: EXPENSE_BUDGET_ID, ownerKey: OWNER_KEY, scope: EXPENSE_BUDGET_SCOPE }, select: { note: true } });
    const next = { ...change(parseExpenseBudgetNote(row?.note)), updatedAt: new Date().toISOString() };
    const note = JSON.stringify(next);
    await tx.goalTask.upsert({
      where: { id: EXPENSE_BUDGET_ID },
      create: { id: EXPENSE_BUDGET_ID, ownerKey: OWNER_KEY, scope: EXPENSE_BUDGET_SCOPE, text: 'Monthly spending budget', note, priority: 'other', position: 0, done: true },
      update: { note, updatedAt: new Date() }
    });
    return next;
  }, { maxWait: 15000, timeout: 15000 });
}

export function saveExpenseBudgetLimit(limitPaise: number) {
  return updateExpenseBudget((current) => ({ ...current, limitPaise }));
}

export function recordExpenseBudgetNotified(monthKey: string, level: BudgetAlertLevel) {
  return updateExpenseBudget((current) => ({ ...current, notified: markBudgetNotified(current.notified, monthKey, level) }));
}
