import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type Scope = 'today' | 'weekly' | 'monthly' | 'yearly' | 'tomorrow';
type GoalTaskInput = {
  id: string;
  text: string;
  note?: string;
  priority: string;
  block?: string;
  done: boolean;
  startedAt?: string;
  completedAt?: string;
  investedMinutes?: number;
  updatedAt?: string;
};
type GoalsStoreInput = Record<Scope, GoalTaskInput[]>;
type TargetStateInput = {
  taskIds: string[];
  endAt: string;
  running: boolean;
  remainingMs: number;
  updatedAt: string;
};

const scopes: Scope[] = ['today', 'weekly', 'monthly', 'yearly', 'tomorrow'];
const ownerKey = 'default';
const targetStateId = '__target_state__';
const targetStateScope = '__meta__';

export const dynamic = 'force-dynamic';

function emptyStore(): GoalsStoreInput {
  return { today: [], weekly: [], monthly: [], yearly: [], tomorrow: [] };
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

function isTargetState(value: unknown): value is TargetStateInput {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TargetStateInput>;
  return (
    Array.isArray(candidate.taskIds) &&
    candidate.taskIds.every((taskId) => typeof taskId === 'string') &&
    typeof candidate.endAt === 'string' &&
    typeof candidate.running === 'boolean' &&
    typeof candidate.remainingMs === 'number' &&
    typeof candidate.updatedAt === 'string'
  );
}

function parseTargetState(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return isTargetState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const rows = await prisma.goalTask.findMany({
      where: { ownerKey },
      orderBy: [{ scope: 'asc' }, { position: 'asc' }]
    });
    const targetStateRow = await prisma.goalTask.findUnique({
      where: { id: targetStateId }
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
        startedAt: row.startedAt ? row.startedAt.toISOString() : undefined,
        completedAt: row.completedAt ? row.completedAt.toISOString() : undefined,
        investedMinutes: row.investedMinutes ?? undefined,
        updatedAt: row.updatedAt.toISOString()
      });
    });
    const targetState = parseTargetState(targetStateRow?.note);

    return NextResponse.json({ store, targetState, hasCloudData: rows.length > 0 });
  } catch (error) {
    console.error('Failed to load goals', error);
    return NextResponse.json({ error: 'Database is not ready yet.' }, { status: 503 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as { store?: unknown; targetState?: unknown };
    if (!isGoalStore(body.store)) {
      return NextResponse.json({ error: 'Invalid goals payload.' }, { status: 400 });
    }
    const targetState = isTargetState(body.targetState) ? body.targetState : null;

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
            startedAt: task.startedAt ? new Date(task.startedAt) : null,
            completedAt: task.completedAt ? new Date(task.completedAt) : null,
            investedMinutes: typeof task.investedMinutes === 'number' ? task.investedMinutes : null,
            position: index
          }
        })
      )
    );
    const operations = [prisma.goalTask.deleteMany({ where: { ownerKey, scope: { in: scopes } } }), ...creates];
    if (targetState) {
      const existingTarget = await prisma.goalTask.findUnique({ where: { id: targetStateId } });
      const existingState = parseTargetState(existingTarget?.note);
      const incomingTime = new Date(targetState.updatedAt).getTime();
      const existingTime = existingState ? new Date(existingState.updatedAt).getTime() : 0;
      if (!existingState || incomingTime >= existingTime) {
        operations.push(
          prisma.goalTask.upsert({
            where: { id: targetStateId },
            create: {
              id: targetStateId,
              ownerKey,
              scope: targetStateScope,
              text: 'Target timer state',
              note: JSON.stringify(targetState),
              priority: 'other',
              done: false,
              position: 0
            },
            update: {
              note: JSON.stringify(targetState),
              updatedAt: new Date()
            }
          })
        );
      }
    }

    await prisma.$transaction(operations);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to save goals', error);
    return NextResponse.json({ error: 'Could not save goals.' }, { status: 503 });
  }
}
