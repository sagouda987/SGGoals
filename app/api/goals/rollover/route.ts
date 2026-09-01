import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const ownerKey = 'default';
const AUTO_HABIT_MISS_NOTE = 'auto-habit-miss';
const taskMetaNotePattern = /\n?\[sg-task-meta:([A-Za-z0-9+/=]+)\]$/;
const activityMetaNotePattern = /\n?\[sg-activity-meta:([A-Za-z0-9+/=]+)\]$/;
const MONTHLY_SUMMARY_NOTE_PREFIX = 'monthly-summary:';
const MONTHLY_SUMMARY_RECIPIENT = 'gouda3859@gmail.com';
const MONTHLY_RESET_DAY = 1;
const DAILY_PRIORITY_FOCUS_KEYS = ['OFFICEWORK2', 'STUDY2', 'BOOK', 'GYM'] as const;
type MustTaskFocusMinutes = Record<(typeof DAILY_PRIORITY_FOCUS_KEYS)[number], number>;

function emptyMustTaskFocusMinutes(): MustTaskFocusMinutes {
  return { OFFICEWORK2: 0, STUDY2: 0, BOOK: 0, GYM: 0 };
}

const habitLabels: Record<string, string> = {
  O: 'O',
  L1: 'L1',
  L2: 'L2',
  L3: 'L3',
  M: 'M',
  B: 'B',
  MEDITATION: 'Meditation',
  GYM: 'Gym',
  HEALTHYDRINKMORNING: 'Healthy drink morning',
  HEALTHYDRINKEVENING: 'Healthy drink evening',
  SKINCAREMORNING: 'Morning skin care',
  SKINCAREEVENING: 'Evening skin care',
  BOOK: 'Book read and communication practice',
  STUDY2: 'Study 2 hour',
  OFFICEWORK2: 'Office work',
  SLEEP: 'Sleep 11 to 6',
  NOJUNK: 'No junk food',
  MANIFEST: 'Manifestation',
  NOSOCIAL: 'No Social Media',
  NOE: 'No E',
  EYECARE: 'Eye care',
  SALTGARGLE: 'Salt water gargle'
};

const habitDefaultWeights: Record<string, number> = {
  O: 1,
  L1: 2,
  L2: 2,
  L3: 2,
  M: 1,
  B: 1,
  MEDITATION: 1,
  GYM: 4,
  HEALTHYDRINKMORNING: 2,
  HEALTHYDRINKEVENING: 2,
  SKINCAREMORNING: 1,
  SKINCAREEVENING: 1,
  BOOK: 4,
  STUDY2: 5,
  OFFICEWORK2: 8,
  SLEEP: 2,
  NOJUNK: 1,
  MANIFEST: 1,
  NOSOCIAL: 1,
  NOE: 1,
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

function currentIstDate(date = new Date()) {
  return new Date(date.getTime() + 330 * 60000);
}

function previousIstMonthKey(date = new Date()) {
  const ist = currentIstDate(date);
  if (ist.getUTCDate() !== MONTHLY_RESET_DAY || ist.getUTCHours() < 3) return null;
  const previousMonth = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - 1, 1));
  return `${previousMonth.getUTCFullYear()}-${String(previousMonth.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthRange(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  const start = istDateKeyToUtcDate(`${monthKey}-${String(MONTHLY_RESET_DAY).padStart(2, '0')}`, 0, 0);
  const end = istDateKeyToUtcDate(
    `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}-${String(MONTHLY_RESET_DAY).padStart(2, '0')}`,
    0,
    0
  );
  return { start, end };
}

function istDateKey(date: Date) {
  return toISODate(currentIstDate(date));
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
  if (compact === 'B') return 'B';
  if (compact === 'MEDITATION') return 'MEDITATION';
  if (compact === 'GYM') return 'GYM';
  if (compact === 'HEALTHYDRINKMORNING') return 'HEALTHYDRINKMORNING';
  if (compact === 'HEALTHYDRINKEVENING') return 'HEALTHYDRINKEVENING';
  if (compact === 'MORNINGSKINCARE' || compact === 'SKINCAREMORNING') return 'SKINCAREMORNING';
  if (compact === 'EVENINGSKINCARE' || compact === 'SKINCAREEVENING') return 'SKINCAREEVENING';
  if (compact === 'BOOKREAD') return 'BOOK';
  if (compact === 'STUDY2HOUR') return 'STUDY2';
  if (compact === 'OFFICEWORK' || compact === 'OFFICEWORK2HOUR') return 'OFFICEWORK2';
  if (compact === 'SLEEP11TO6') return 'SLEEP';
  if (compact === 'NOJUNKFOOD') return 'NOJUNK';
  if (compact === 'NOSOCIALMEDIA') return 'NOSOCIAL';
  if (compact === 'NOE') return 'NOE';
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

function activityPointsFromNote(note: string | null, taskText: string) {
  if (note) {
    const match = note.match(activityMetaNotePattern);
    if (match) {
      try {
        const parsed = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8')) as Partial<{ points: unknown }>;
        const points = normalizeTaskWeight(parsed.points, 0);
        if (points > 0) return points;
      } catch {
        // Fall back to the current habit weight below.
      }
    }
  }
  const code = normalizeHabitCode(taskText);
  return code ? habitDefaultWeights[code] || 1 : 1;
}

function activityFocusMinutesFromNote(note: string | null) {
  if (!note) return 0;
  const match = note.match(activityMetaNotePattern);
  if (!match) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8')) as Partial<{ focusMinutes: unknown }>;
    const minutes = Number(parsed.focusMinutes);
    return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : 0;
  } catch {
    return 0;
  }
}

function mergedFocusMinutes(intervals: Array<{ start: number; end: number }>, fallbackMinutes: number) {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  sorted.forEach((interval) => {
    const previous = merged[merged.length - 1];
    if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end);
    else merged.push({ ...interval });
  });
  return fallbackMinutes + merged.reduce((total, interval) => total + Math.max(1, Math.round((interval.end - interval.start) / 60000)), 0);
}

function escapePdfText(value: string) {
  return value.replace(/[^\x20-\x7E]/g, '?').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildMonthlySummaryPdf(summary: {
  monthKey: string;
  completedPoints: number;
  failedPoints: number;
  focusMinutes: number;
  days: Array<{ dateKey: string; completedPoints: number; failedPoints: number; focusMinutes: number; mustTaskFocusMinutes: MustTaskFocusMinutes }>;
}) {
  const lines = [
    `SG Goals - Monthly Summary ${summary.monthKey}`,
    `Completed points: ${summary.completedPoints}`,
    `Failed points: ${summary.failedPoints}`,
    `Completed focus time: ${summary.focusMinutes} minutes`,
    '',
    'Date-wise progress:'
  ];
  summary.days.filter((day) => day.completedPoints || day.failedPoints || day.focusMinutes).forEach((day) => {
    lines.push(`${day.dateKey} | Done ${day.completedPoints} | Failed ${day.failedPoints} | Focus ${day.focusMinutes}m | Office ${day.mustTaskFocusMinutes.OFFICEWORK2}m | Study ${day.mustTaskFocusMinutes.STUDY2}m | Book ${day.mustTaskFocusMinutes.BOOK}m | Gym ${day.mustTaskFocusMinutes.GYM}m`);
  });
  const content = `BT\n/F1 8 Tf\n40 760 Td\n${lines.map((line, index) => `${index ? '0 -13 Td\n' : ''}(${escapePdfText(line)}) Tj`).join('\n')}\nET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content, 'binary')} >>\nstream\n${content}\nendstream`
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'binary'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'binary');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'binary');
}

async function emailMonthlySummary(summary: {
  monthKey: string;
  completedPoints: number;
  failedPoints: number;
  focusMinutes: number;
  days: Array<{ dateKey: string; completedPoints: number; failedPoints: number; focusMinutes: number; mustTaskFocusMinutes: MustTaskFocusMinutes }>;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return null;
  const pdf = buildMonthlySummaryPdf(summary);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [MONTHLY_SUMMARY_RECIPIENT],
      subject: `SG Goals monthly summary - ${summary.monthKey}`,
      text: `Your SG Goals summary for ${summary.monthKey}: ${summary.completedPoints} completed points, ${summary.failedPoints} failed points, and ${summary.focusMinutes} completed focus minutes.`,
      attachments: [{ filename: `sg-goals-${summary.monthKey}.pdf`, content: pdf.toString('base64') }]
    })
  });
  if (!response.ok) throw new Error(`Monthly summary email failed with status ${response.status}`);
  return new Date().toISOString();
}

async function archiveMonthlySummary() {
  const monthKey = previousIstMonthKey();
  if (!monthKey) return { archived: false, monthKey: null, emailed: false };
  const summaryId = `monthly-summary-${monthKey}`;
  const existing = await prisma.goalActivity.findUnique({ where: { id: summaryId } });
  if (existing) {
    if (existing.note?.startsWith(MONTHLY_SUMMARY_NOTE_PREFIX) && !existing.note.includes('"emailedAt"')) {
      const raw = existing.note.slice(MONTHLY_SUMMARY_NOTE_PREFIX.length);
      const summary = JSON.parse(raw) as {
        monthKey: string;
        completedPoints: number;
        failedPoints: number;
        focusMinutes?: number;
        days: Array<{ dateKey: string; completedPoints: number; failedPoints: number; focusMinutes?: number; mustTaskFocusMinutes?: MustTaskFocusMinutes }>;
        emailedAt?: string;
      };
      const normalizedSummary = {
        ...summary,
        focusMinutes: summary.focusMinutes || 0,
        days: summary.days.map((day) => ({
          ...day,
          focusMinutes: day.focusMinutes || 0,
          mustTaskFocusMinutes: { ...emptyMustTaskFocusMinutes(), ...(day.mustTaskFocusMinutes || {}) }
        }))
      };
      const emailedAt = await emailMonthlySummary(normalizedSummary);
      if (emailedAt) {
        await prisma.goalActivity.update({
          where: { id: summaryId },
          data: { note: `${MONTHLY_SUMMARY_NOTE_PREFIX}${JSON.stringify({ ...normalizedSummary, emailedAt })}` }
        });
      }
      return { archived: true, monthKey, emailed: Boolean(emailedAt) };
    }
    return { archived: true, monthKey, emailed: Boolean(existing.note?.includes('"emailedAt"')) };
  }

  const { start, end } = monthRange(monthKey);
  const activities = await prisma.goalActivity.findMany({
    where: { ownerKey, createdAt: { gte: start, lt: end } },
    orderBy: { createdAt: 'asc' },
    select: { taskText: true, kind: true, note: true, startedAt: true, completedAt: true, createdAt: true }
  });
  const completedHabitKeys = new Set(
    activities
      .filter((activity) => activity.kind === 'completion')
      .map((activity) => {
        const code = normalizeHabitCode(activity.taskText);
        return code ? `${istDateKey(activity.createdAt)}:${code}` : null;
      })
      .filter((key): key is string => Boolean(key))
  );
  const days = new Map<string, {
    dateKey: string;
    completedPoints: number;
    failedPoints: number;
    focusMinutes: number;
    mustTaskFocusMinutes: MustTaskFocusMinutes;
    focusIntervals: Array<{ start: number; end: number }>;
    fallbackFocusMinutes: number;
  }>();
  const cursor = new Date(start.getTime());
  while (cursor < end) {
    const key = istDateKey(cursor);
    days.set(key, {
      dateKey: key,
      completedPoints: 0,
      failedPoints: 0,
      focusMinutes: 0,
      mustTaskFocusMinutes: emptyMustTaskFocusMinutes(),
      focusIntervals: [],
      fallbackFocusMinutes: 0
    });
    cursor.setTime(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  activities.forEach((activity) => {
    const day = days.get(istDateKey(activity.createdAt));
    if (!day) return;
    if (activity.kind === 'focus-session') {
      const focusMinutes = activityFocusMinutesFromNote(activity.note);
      const start = activity.startedAt?.getTime() ?? Number.NaN;
      const end = activity.completedAt?.getTime() ?? Number.NaN;
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) day.focusIntervals.push({ start, end });
      else day.fallbackFocusMinutes += focusMinutes;
      const code = normalizeHabitCode(activity.taskText);
      if (code && (DAILY_PRIORITY_FOCUS_KEYS as readonly string[]).includes(code)) {
        day.mustTaskFocusMinutes[code as keyof MustTaskFocusMinutes] += focusMinutes;
      }
      return;
    }
    const points = activityPointsFromNote(activity.note, activity.taskText);
    if (activity.kind === 'completion') day.completedPoints += points;
    if (activity.kind === 'undo') day.completedPoints = Math.max(0, day.completedPoints - points);
    if (activity.kind === 'failure') {
      const code = normalizeHabitCode(activity.taskText);
      if (activity.note?.startsWith(AUTO_HABIT_MISS_NOTE) && code && completedHabitKeys.has(`${day.dateKey}:${code}`)) return;
      day.failedPoints += points;
    }
  });
  const summaryDays = Array.from(days.values()).map(({ focusIntervals, fallbackFocusMinutes, ...day }) => ({
    ...day,
    focusMinutes: mergedFocusMinutes(focusIntervals, fallbackFocusMinutes)
  }));
  const summary = {
    monthKey,
    completedPoints: summaryDays.reduce((total, day) => total + day.completedPoints, 0),
    failedPoints: summaryDays.reduce((total, day) => total + day.failedPoints, 0),
    focusMinutes: summaryDays.reduce((total, day) => total + day.focusMinutes, 0),
    days: summaryDays,
    createdAt: new Date().toISOString()
  };
  const emailedAt = await emailMonthlySummary(summary);
  const storedSummary = emailedAt ? { ...summary, emailedAt } : summary;
  await prisma.goalActivity.create({
    data: {
      id: summaryId,
      ownerKey,
      scope: 'yearly',
      priority: 'other',
      taskText: `Monthly summary ${monthKey}`,
      kind: 'monthly-summary',
      note: `${MONTHLY_SUMMARY_NOTE_PREFIX}${JSON.stringify(storedSummary)}`,
      createdAt: new Date()
    }
  });
  return { archived: true, monthKey, emailed: Boolean(emailedAt) };
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
    const monthlySummary = await archiveMonthlySummary();
    const result = await recordHabitMisses();
    return NextResponse.json({ ok: true, monthlySummary, ...result });
  } catch (error) {
    console.error('Failed to roll over habit misses', error);
    return NextResponse.json({ error: 'Could not record habit misses.' }, { status: 503 });
  }
}

export async function POST() {
  return GET();
}
