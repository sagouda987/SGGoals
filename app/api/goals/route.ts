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
type WeeklyPlanInput = {
  mainGoal: string;
  studyPlan: string;
  workPlan: string;
  healthPlan: string;
  notes: string;
  updatedAt: string;
};
type YearlyNotesInput = {
  completedBooks: string;
  updatedAt: string;
};
type TargetStateInput = {
  taskIds: string[];
  taskMinutes?: Record<string, number>;
  endAt: string;
  running: boolean;
  remainingMs: number;
  durationMs?: number;
  updatedAt: string;
};

const scopes: Scope[] = ['today', 'weekly', 'monthly', 'yearly', 'tomorrow'];
const ownerKey = 'default';
const targetStateId = '__target_state__';
const weeklyPlanId = '__weekly_plan__';
const yearlyNotesId = '__yearly_notes__';
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
    (candidate.taskMinutes === undefined ||
      (typeof candidate.taskMinutes === 'object' &&
        candidate.taskMinutes !== null &&
        Object.entries(candidate.taskMinutes).every(([taskId, minutes]) => typeof taskId === 'string' && typeof minutes === 'number'))) &&
    typeof candidate.endAt === 'string' &&
    typeof candidate.running === 'boolean' &&
    typeof candidate.remainingMs === 'number' &&
    (candidate.durationMs === undefined || typeof candidate.durationMs === 'number') &&
    typeof candidate.updatedAt === 'string'
  );
}

function isWeeklyPlan(value: unknown): value is WeeklyPlanInput {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WeeklyPlanInput>;
  return (
    typeof candidate.mainGoal === 'string' &&
    typeof candidate.studyPlan === 'string' &&
    typeof candidate.workPlan === 'string' &&
    typeof candidate.healthPlan === 'string' &&
    typeof candidate.notes === 'string' &&
    typeof candidate.updatedAt === 'string'
  );
}

function isYearlyNotes(value: unknown): value is YearlyNotesInput {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<YearlyNotesInput>;
  return typeof candidate.completedBooks === 'string' && typeof candidate.updatedAt === 'string';
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

function parseWeeklyPlan(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return isWeeklyPlan(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseYearlyNotes(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return isYearlyNotes(parsed) ? parsed : null;
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
    const weeklyPlanRow = await prisma.goalTask.findUnique({
      where: { id: weeklyPlanId }
    });
    const yearlyNotesRow = await prisma.goalTask.findUnique({
      where: { id: yearlyNotesId }
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
    const weeklyPlan = parseWeeklyPlan(weeklyPlanRow?.note);
    const yearlyNotes = parseYearlyNotes(yearlyNotesRow?.note);

    return NextResponse.json({ store, targetState, weeklyPlan, yearlyNotes, hasCloudData: rows.length > 0 || Boolean(weeklyPlan) || Boolean(yearlyNotes) });
  } catch (error) {
    console.error('Failed to load goals', error);
    return NextResponse.json({ error: 'Database is not ready yet.' }, { status: 503 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as { store?: unknown; targetState?: unknown; weeklyPlan?: unknown; yearlyNotes?: unknown };
    if (!isGoalStore(body.store)) {
      return NextResponse.json({ error: 'Invalid goals payload.' }, { status: 400 });
    }
    const targetState = isTargetState(body.targetState) ? body.targetState : null;
    const weeklyPlan = isWeeklyPlan(body.weeklyPlan) ? body.weeklyPlan : null;
    const yearlyNotes = isYearlyNotes(body.yearlyNotes) ? body.yearlyNotes : null;

    const store = body.store;
    const rows = scopes.flatMap((scope) =>
      store[scope].map((task, index) => ({
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
      }))
    );

    const uniqueIds = new Set(rows.map((row) => row.id));
    if (uniqueIds.size !== rows.length) {
      return NextResponse.json({ error: 'Duplicate task IDs found. Refresh and try again.' }, { status: 409 });
    }

    await prisma.$transaction(
      async (tx) => {
        // Prevent overlapping browser saves from deleting and recreating the same rows concurrently.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerKey}))`;
        await tx.goalTask.deleteMany({ where: { ownerKey, scope: { in: scopes } } });
        if (rows.length) await tx.goalTask.createMany({ data: rows });

        if (targetState) {
          const existingTarget = await tx.goalTask.findUnique({ where: { id: targetStateId } });
          const existingState = parseTargetState(existingTarget?.note);
          const incomingTime = new Date(targetState.updatedAt).getTime();
          const existingTime = existingState ? new Date(existingState.updatedAt).getTime() : 0;
          if (!existingState || incomingTime >= existingTime) {
            await tx.goalTask.upsert({
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
            });
          }
        }

        if (weeklyPlan) {
          await tx.goalTask.upsert({
            where: { id: weeklyPlanId },
            create: {
              id: weeklyPlanId,
              ownerKey,
              scope: targetStateScope,
              text: 'Weekly planning state',
              note: JSON.stringify(weeklyPlan),
              priority: 'other',
              done: false,
              position: 1
            },
            update: {
              note: JSON.stringify(weeklyPlan),
              updatedAt: new Date()
            }
          });
        }

        if (yearlyNotes) {
          await tx.goalTask.upsert({
            where: { id: yearlyNotesId },
            create: {
              id: yearlyNotesId,
              ownerKey,
              scope: targetStateScope,
              text: 'Yearly notes state',
              note: JSON.stringify(yearlyNotes),
              priority: 'other',
              done: false,
              position: 2
            },
            update: {
              note: JSON.stringify(yearlyNotes),
              updatedAt: new Date()
            }
          });
        }
      },
      { maxWait: 15000, timeout: 15000 }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to save goals', error);
    return NextResponse.json({ error: 'Could not save goals.' }, { status: 503 });
  }
}
