import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const ownerKey = 'default';
const AUTO_HABIT_MISS_NOTE = 'auto-habit-miss';
const taskMetaNotePattern = /\n?\[sg-task-meta:([A-Za-z0-9+/=]+)\]$/;

const habitLabels: Record<string, string> = {
  O: 'O',
  L1: 'L1',
  L2: 'L2',
  L3: 'L3',
  M: 'M',
  GYM: 'Gym',
  HEALTHYDRINKMORNING: 'Healthy drink morning',
  HEALTHYDRINKEVENING: 'Healthy drink evening',
  BOOK: 'Book read and communication practice',
  STUDY2: 'Study 2 hour',
  OFFICEWORK2: 'Office work',
  SLEEP: 'Sleep 11 to 6',
  NOJUNK: 'No junk food',
  MANIFEST: 'Manifestation',
  NOSOCIAL: 'No Social Media',
  EYECARE: 'Eye care',
  SALTGARGLE: 'Salt water gargle'
};

const habitDefaultWeights: Record<string, number> = {
  O: 1,
  L1: 2,
  L2: 2,
  L3: 2,
  M: 1,
  GYM: 4,
  HEALTHYDRINKMORNING: 2,
  HEALTHYDRINKEVENING: 2,
  BOOK: 4,
  STUDY2: 5,
  OFFICEWORK2: 8,
  SLEEP: 2,
  NOJUNK: 1,
  MANIFEST: 1,
  NOSOCIAL: 1,
  EYECARE: 2,
  SALTGARGLE: 2
};

export const dynamic = 'force-dynamic';

function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function previousIstDateKey(date = new Date()) {
  const ist = new Date(date.getTime() + 330 * 60000);
  ist.setUTCDate(ist.getUTCDate() - 1);
  return toISODate(ist);
}

function istDateKeyToUtcDate(dateKey: string, hours: number, minutes: number) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hours - 5, minutes - 30, 0, 0));
}

function normalizeHabitCode(text: string) {
  const compact = text.trim().toUpperCase().replace(/\s+/g, '');
  if (compact === 'O' || /^O[123]$/.test(compact)) return 'O';
  if (/^L[123]$/.test(compact)) return compact;
  if (compact === 'M') return 'M';
  if (compact === 'GYM') return 'GYM';
  if (compact === 'HEALTHYDRINKMORNING') return 'HEALTHYDRINKMORNING';
  if (compact === 'HEALTHYDRINKEVENING') return 'HEALTHYDRINKEVENING';
  if (compact === 'BOOKREAD') return 'BOOK';
  if (compact === 'STUDY2HOUR') return 'STUDY2';
  if (compact === 'OFFICEWORK' || compact === 'OFFICEWORK2HOUR') return 'OFFICEWORK2';
  if (compact === 'SLEEP11TO6') return 'SLEEP';
  if (compact === 'NOJUNKFOOD') return 'NOJUNK';
  if (compact === 'NOSOCIALMEDIA') return 'NOSOCIAL';
  if (compact === 'EYECARE') return 'EYECARE';
  if (compact === 'SALTWATERGARGLE' || compact === 'SALTGARGLE') return 'SALTGARGLE';
  if (compact === 'MANIFESTATION' || compact === 'MANIFESTNATION') return 'MANIFEST';
  return null;
}

function normalizeTaskWeight(value: unknown, fallback = 1) {
  const weight = Number(value);
  if (!Number.isFinite(weight) || weight <= 0) return fallback;
  return Math.min(100, Math.max(1, Math.round(weight)));
}

function taskWeightFromNote(note: string | null, fallback: number) {
  if (!note) return fallback;
  const match = note.match(taskMetaNotePattern);
  if (!match) return fallback;
  try {
    const parsed = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8')) as Partial<{ weight: unknown }>;
    return normalizeTaskWeight(parsed.weight, fallback);
  } catch {
    return fallback;
  }
}

function composeAutoMissNote(dateKey: string, points: number) {
  const payload = Buffer.from(JSON.stringify({ points: normalizeTaskWeight(points) }), 'utf8').toString('base64');
  return `${AUTO_HABIT_MISS_NOTE}:${dateKey}\n[sg-activity-meta:${payload}]`;
}

async function recordHabitMisses() {
  const missedDateKey = previousIstDateKey();
  const createdAt = istDateKeyToUtcDate(missedDateKey, 23, 59);
  const autoMissNote = `${AUTO_HABIT_MISS_NOTE}:${missedDateKey}`;
  const missedDateStart = istDateKeyToUtcDate(missedDateKey, 0, 0);
  const nextDateStart = new Date(missedDateStart.getTime() + 24 * 60 * 60 * 1000);
  const habitTasks = await prisma.goalTask.findMany({
    where: {
      ownerKey,
      scope: 'today',
      OR: [{ block: 'habit' }, { text: { in: Object.values(habitLabels) } }]
    }
  });
  const existingMisses = await prisma.goalActivity.findMany({
    where: {
      ownerKey,
      scope: 'today',
      kind: 'failure',
      reason: 'Missed habit',
      note: { startsWith: autoMissNote }
    },
    select: {
      id: true,
      taskText: true
    }
  });
  const dayActivities = await prisma.goalActivity.findMany({
    where: {
      ownerKey,
      scope: 'today',
      createdAt: {
        gte: missedDateStart,
        lt: nextDateStart
      }
    },
    select: {
      taskText: true,
      kind: true
    }
  });
  const existingKeys = new Set(existingMisses.flatMap((activity) => [activity.id, activity.taskText]));
  // Completed rows are removed from the active daily list after midnight, so
  // use the activity log as the source of truth for the missed date.
  const handledHabitCodes = new Set(
    dayActivities
      .filter((activity) => activity.kind === 'completion' || activity.kind === 'failure')
      .map((activity) => normalizeHabitCode(activity.taskText))
      .filter((code): code is string => Boolean(code))
  );
  const plannedCodes = new Set<string>();

  const rows = habitTasks
    .filter((task) => !task.done)
    .flatMap((task) => {
      const code = normalizeHabitCode(task.text);
      if (!code || plannedCodes.has(code) || handledHabitCodes.has(code)) return [];
      const id = `habit-miss-${missedDateKey}-${code}`;
      const taskText = habitLabels[code] || task.text;
      const points = taskWeightFromNote(task.note, habitDefaultWeights[code] || 1);
      if (existingKeys.has(id) || existingKeys.has(taskText)) return [];
      plannedCodes.add(code);
      return [{
        id,
        ownerKey,
        scope: 'today',
        priority: 'other',
        taskText,
        kind: 'failure',
        reason: 'Missed habit',
        note: composeAutoMissNote(missedDateKey, points),
        createdAt
      }];
    })

  if (rows.length) {
    await prisma.goalActivity.createMany({
      data: rows,
      skipDuplicates: true
    });
  }

  return { missedDateKey, checked: habitTasks.length, existing: existingMisses.length, recorded: rows.length };
}

export async function GET() {
  try {
    const result = await recordHabitMisses();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('Failed to roll over habit misses', error);
    return NextResponse.json({ error: 'Could not record habit misses.' }, { status: 503 });
  }
}

export async function POST() {
  return GET();
}
