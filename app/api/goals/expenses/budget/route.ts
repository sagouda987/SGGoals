import { NextRequest, NextResponse } from 'next/server';
import { budgetLimitFromRupees, MAX_BUDGET_RUPEES, MIN_BUDGET_RUPEES } from '@/lib/goals/expense-budget';
import { istMonthKey } from '@/lib/goals/expense-purge';
import { loadExpenseBudget, recordExpenseBudgetNotified, saveExpenseBudgetLimit } from '@/lib/goals/expense-budget-prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ budget: await loadExpenseBudget() });
  } catch (error) {
    console.error('Failed to load budget', error);
    return NextResponse.json({ error: 'Could not load the monthly budget.' }, { status: 503 });
  }
}

/** Body: { limitRupees } to change the limit, or { notified: { monthKey, level } } to record a sent alert. */
export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as { limitRupees?: unknown; notified?: { monthKey?: unknown; level?: unknown } };
    if (body.notified) {
      const { monthKey, level } = body.notified;
      if (monthKey !== istMonthKey() || (level !== 80 && level !== 100)) {
        return NextResponse.json({ error: 'Invalid budget alert.' }, { status: 400 });
      }
      return NextResponse.json({ budget: await recordExpenseBudgetNotified(monthKey, level) });
    }
    const limitPaise = budgetLimitFromRupees(body.limitRupees);
    if (limitPaise === null) {
      return NextResponse.json({ error: `Enter a budget between ₹${MIN_BUDGET_RUPEES.toLocaleString('en-IN')} and ₹${MAX_BUDGET_RUPEES.toLocaleString('en-IN')}.` }, { status: 400 });
    }
    return NextResponse.json({ budget: await saveExpenseBudgetLimit(limitPaise) });
  } catch (error) {
    console.error('Failed to save budget', error);
    return NextResponse.json({ error: 'Could not save the monthly budget.' }, { status: 503 });
  }
}
