import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type Scope = 'today' | 'weekly' | 'weekend' | 'monthly' | 'yearly' | 'tomorrow';
type GoalSubtaskInput = {
  id: string;
  text: string;
  done: boolean;
  updatedAt?: string;
};
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
  subtasks?: GoalSubtaskInput[];
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
  punishment?: string;
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

const scopes: Scope[] = ['today', 'weekly', 'weekend', 'monthly', 'yearly', 'tomorrow'];
const ownerKey = 'default';
const targetStateId = '__target_state__';
const weeklyPlanId = '__weekly_plan__';
const yearlyNotesId = '__yearly_notes__';
const targetStateScope = '__meta__';
const subtaskNotePattern = /\n?\[sg-subtasks:([A-Za-z0-9+/=]+)\]$/;

export const dynamic = 'force-dynamic';

function emptyStore(): GoalsStoreInput {
  return { today: [], weekly: [], weekend: [], monthly: [], yearly: [], tomorrow: [] };
}

function isGoalStore(value: unknown): value is GoalsStoreInput {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Record<Scope, unknown>>;
  return scopes.every(
    (scope) =>
      Array.isArray(candidate[scope]) &&
      candidate[scope]?.every((task) => {
        const t = task as Partial<GoalTaskInput>;
        const hasValidSubtasks =
          t.subtasks === undefined ||
          (Array.isArray(t.subtasks) &&
            t.subtasks.every(
              (subtask) =>
                typeof subtask.id === 'string' &&
                typeof subtask.text === 'string' &&
                typeof subtask.done === 'boolean' &&
                (subtask.updatedAt === undefined || typeof subtask.updatedAt === 'string')
            ));
        return typeof t.id === 'string' && typeof t.text === 'string' && typeof t.priority === 'string' && typeof t.done === 'boolean' && hasValidSubtasks;
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
  return (
    typeof candidate.completedBooks === 'string' &&
    (candidate.punishment === undefined || typeof candidate.punishment === 'string') &&
    typeof candidate.updatedAt === 'string'
  );
}

function normalizeYearlyNotes(value: YearlyNotesInput): Required<YearlyNotesInput> {
  return {
    completedBooks: value.completedBooks,
    punishment: value.punishment || '',
    updatedAt: value.updatedAt
  };
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
    return isYearlyNotes(parsed) ? normalizeYearlyNotes(parsed) : null;
  } catch {
    return null;
  }
}

function parseSubtasks(value: unknown): GoalSubtaskInput[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const subtasks = value.filter(
    (subtask): subtask is GoalSubtaskInput =>
      Boolean(subtask) &&
      typeof subtask === 'object' &&
      typeof (subtask as Partial<GoalSubtaskInput>).id === 'string' &&
      typeof (subtask as Partial<GoalSubtaskInput>).text === 'string' &&
      typeof (subtask as Partial<GoalSubtaskInput>).done === 'boolean'
  );
  return subtasks.length
    ? subtasks.map((subtask) => ({
        id: subtask.id,
        text: subtask.text,
        done: subtask.done,
        updatedAt: typeof subtask.updatedAt === 'string' ? subtask.updatedAt : undefined
      }))
    : undefined;
}

function splitStoredTaskNote(note: string | null | undefined) {
  if (!note) return { note: undefined, subtasks: undefined };
  const match = note.match(subtaskNotePattern);
  if (!match) return { note, subtasks: undefined };
  const visibleNote = note.replace(subtaskNotePattern, '').trim() || undefined;
  try {
    const parsed = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8')) as unknown;
    return { note: visibleNote, subtasks: parseSubtasks(parsed) };
  } catch {
    return { note: visibleNote, subtasks: undefined };
  }
}

function composeStoredTaskNote(note: string | undefined, subtasks: GoalSubtaskInput[] | undefined) {
  if (!subtasks?.length) return note || null;
  const payload = Buffer.from(JSON.stringify(subtasks), 'utf8').toString('base64');
  return `${note?.trim() || ''}\n[sg-subtasks:${payload}]`.trim();
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
      const noteInfo = splitStoredTaskNote(row.note);
      store[row.scope as Scope].push({
        id: row.id,
        text: row.text,
        note: noteInfo.note,
        priority: row.priority,
        block: row.block || undefined,
        done: row.done,
        startedAt: row.startedAt ? row.startedAt.toISOString() : undefined,
        completedAt: row.completedAt ? row.completedAt.toISOString() : undefined,
        investedMinutes: row.investedMinutes ?? undefined,
        subtasks: noteInfo.subtasks,
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
        note: composeStoredTaskNote(task.note, task.subtasks),
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
