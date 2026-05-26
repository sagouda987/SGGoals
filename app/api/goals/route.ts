import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type Scope = 'today' | 'weekly' | 'monthly' | 'yearly';
type GoalTaskInput = {
  id: string;
  text: string;
  note?: string;
  priority: string;
  block?: string;
  done: boolean;
  updatedAt?: string;
};
type GoalsStoreInput = Record<Scope, GoalTaskInput[]>;

const scopes: Scope[] = ['today', 'weekly', 'monthly', 'yearly'];
const ownerKey = 'default';

export const dynamic = 'force-dynamic';

function emptyStore(): GoalsStoreInput {
  return { today: [], weekly: [], monthly: [], yearly: [] };
}

function isGoalStore(value: unknown): value is GoalsStoreInput {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Record<Scope, unknown>>;
  return scopes.every(
    (scope) =>
      Array.isArray(candidate[scope]) &&
      candidate[scope]?.every((task) => {
        const t = task as Partial<GoalTaskInput>;
        return typeof t.id === 'string' && typeof t.text === 'string' && typeof t.priority === 'string' && typeof t.done === 'boolean';
      })
  );
}

export async function GET() {
  try {
    const rows = await prisma.goalTask.findMany({
      where: { ownerKey },
      orderBy: [{ scope: 'asc' }, { position: 'asc' }]
    });

    const store = emptyStore();
    rows.forEach((row) => {
      if (!scopes.includes(row.scope as Scope)) return;
      store[row.scope as Scope].push({
        id: row.id,
        text: row.text,
        note: row.note || undefined,
        priority: row.priority,
        block: row.block || undefined,
        done: row.done,
        updatedAt: row.updatedAt.toISOString()
      });
    });

    return NextResponse.json({ store, hasCloudData: rows.length > 0 });
  } catch (error) {
    console.error('Failed to load goals', error);
    return NextResponse.json({ error: 'Database is not ready yet.' }, { status: 503 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as { store?: unknown };
    if (!isGoalStore(body.store)) {
      return NextResponse.json({ error: 'Invalid goals payload.' }, { status: 400 });
    }

    const store = body.store;
    const creates = scopes.flatMap((scope) =>
      store[scope].map((task, index) =>
        prisma.goalTask.create({
          data: {
            id: task.id,
            ownerKey,
            scope,
            text: task.text,
            note: task.note || null,
            priority: task.priority,
            block: task.block || null,
            done: task.done,
            position: index
          }
        })
      )
    );

    await prisma.$transaction([prisma.goalTask.deleteMany({ where: { ownerKey } }), ...creates]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to save goals', error);
    return NextResponse.json({ error: 'Could not save goals.' }, { status: 503 });
  }
}
