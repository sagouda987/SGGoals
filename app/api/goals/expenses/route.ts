import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { amountToPaise, expenseDateIsAllowed, parseExpenseNote } from '@/lib/goals/expenses';

const OWNER_KEY = 'default';
const EXPENSE_SCOPE = '__expense__';

export const dynamic = 'force-dynamic';

function expensePayload(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const input = value as { id?: unknown; dateKey?: unknown; amount?: unknown; category?: unknown; note?: unknown };
  const amountPaise = amountToPaise(input.amount);
  if (
    typeof input.id !== 'string' || !input.id.startsWith('__expense__:') ||
    typeof input.dateKey !== 'string' || !expenseDateIsAllowed(input.dateKey) ||
    amountPaise === null || typeof input.category !== 'string' || typeof input.note !== 'string'
  ) return null;
  return {
    id: input.id,
    dateKey: input.dateKey,
    amountPaise,
    category: input.category.trim().slice(0, 50) || 'Other',
    note: input.note.trim().slice(0, 300)
  };
}

function storedNote(value: { dateKey: string; amountPaise: number; category: string; note: string }) {
  return JSON.stringify(value);
}

export async function GET() {
  try {
    const rows = await prisma.goalTask.findMany({
      where: { ownerKey: OWNER_KEY, scope: EXPENSE_SCOPE },
      orderBy: [{ startedAt: 'desc' }, { updatedAt: 'desc' }]
    });
    return NextResponse.json({ expenses: rows.map((row) => parseExpenseNote(row.id, row.note, row.updatedAt)).filter(Boolean) });
  } catch (error) {
    console.error('Failed to load expenses', error);
    return NextResponse.json({ error: 'Could not load spending entries.' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const value = expensePayload((await req.json()).expense);
    if (!value) return NextResponse.json({ error: 'Enter a valid current-month date and amount.' }, { status: 400 });
    const date = new Date(`${value.dateKey}T12:00:00+05:30`);
    const row = await prisma.goalTask.create({
      data: {
        id: value.id,
        ownerKey: OWNER_KEY,
        scope: EXPENSE_SCOPE,
        text: `${value.category} expense`,
        note: storedNote(value),
        priority: 'other',
        position: 0,
        startedAt: date
      }
    });
    return NextResponse.json({ expense: parseExpenseNote(row.id, row.note, row.updatedAt) });
  } catch (error) {
    console.error('Failed to save expense', error);
    return NextResponse.json({ error: 'Could not save this spending entry.' }, { status: 503 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const value = expensePayload((await req.json()).expense);
    if (!value) return NextResponse.json({ error: 'Enter a valid current-month date and amount.' }, { status: 400 });
    const existing = await prisma.goalTask.findFirst({ where: { id: value.id, ownerKey: OWNER_KEY, scope: EXPENSE_SCOPE } });
    if (!existing) return NextResponse.json({ error: 'Spending entry not found.' }, { status: 404 });
    const row = await prisma.goalTask.update({
      where: { id: value.id },
      data: { text: `${value.category} expense`, note: storedNote(value), startedAt: new Date(`${value.dateKey}T12:00:00+05:30`) }
    });
    return NextResponse.json({ expense: parseExpenseNote(row.id, row.note, row.updatedAt) });
  } catch (error) {
    console.error('Failed to update expense', error);
    return NextResponse.json({ error: 'Could not update this spending entry.' }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id?.startsWith('__expense__:')) return NextResponse.json({ error: 'Invalid spending entry.' }, { status: 400 });
    const result = await prisma.goalTask.deleteMany({ where: { id, ownerKey: OWNER_KEY, scope: EXPENSE_SCOPE } });
    if (!result.count) return NextResponse.json({ error: 'Spending entry not found.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to delete expense', error);
    return NextResponse.json({ error: 'Could not delete this spending entry.' }, { status: 503 });
  }
}
