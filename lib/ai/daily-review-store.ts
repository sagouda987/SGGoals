import 'server-only';

import { prisma } from '@/lib/prisma';
import { buildAIContextFromRecords } from '@/lib/ai/context-builder';
import { generateDailyReview } from '@/lib/ai/daily-review';
import { storedDailyReviewSchema, type DailyReviewContext, type StoredDailyReview } from '@/lib/ai/daily-review-schema';
import type { AIProvider } from '@/lib/ai/provider';
import { istFocusDateKey } from '@/lib/must-focus-targets';

const OWNER_KEY = 'default';
const REVIEW_SCOPE = '__daily_review__';
const TASK_META_PATTERN = /\n?\[sg-task-meta:[A-Za-z0-9+/_=-]+\]\s*$/;
const SUBTASK_META_PATTERN = /\n?\[sg-subtasks:[A-Za-z0-9+/_=-]+\]\s*$/;

function shiftDateKey(dateKey: string, offset: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function previousReportingDate(now: Date) {
  return shiftDateKey(istFocusDateKey(now.toISOString()), -1);
}

function reportingDayBounds(dateKey: string) {
  const start = new Date(`${dateKey}T03:00:00+05:30`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

function visibleNote(note: string | null) {
  if (!note) return '';
  return note.replace(TASK_META_PATTERN, '').replace(SUBTASK_META_PATTERN, '').trim();
}

function noteText(note: string) {
  try {
    const parsed = JSON.parse(note) as Record<string, unknown>;
    return Object.entries(parsed)
      .filter(([, value]) => typeof value === 'string' && value.trim())
      .map(([key, value]) => `${key}: ${String(value).trim()}`)
      .join('; ')
      .slice(0, 500);
  } catch {
    return note.slice(0, 500);
  }
}

function netCompletedActivities<T extends { scope: string; taskText: string; kind: string; createdAt: Date }>(activities: T[]) {
  const active = new Map<string, T>();
  for (const activity of [...activities].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const key = `${activity.scope}:${activity.taskText.trim().toLowerCase()}`;
    if (activity.kind === 'completion') active.set(key, activity);
    if (activity.kind === 'undo') active.delete(key);
  }
  return [...active.values()];
}

export async function buildDailyReviewContext(input: { dateKey: string; now?: Date }): Promise<DailyReviewContext> {
  const { start, end } = reportingDayBounds(input.dateKey);
  const historyStart = new Date(start.getTime() - 20 * 24 * 60 * 60 * 1000);
  const [tasks, dayActivities, recentActivities] = await Promise.all([
    prisma.goalTask.findMany({ where: { ownerKey: OWNER_KEY }, orderBy: [{ scope: 'asc' }, { position: 'asc' }] }),
    prisma.goalActivity.findMany({ where: { ownerKey: OWNER_KEY, createdAt: { gte: start, lt: end } }, orderBy: { createdAt: 'asc' } }),
    prisma.goalActivity.findMany({ where: { ownerKey: OWNER_KEY, createdAt: { gte: historyStart, lt: end } }, orderBy: { createdAt: 'desc' }, take: 300 })
  ]);

  const contextAtDayEnd = new Date(end.getTime() - 1);
  const aiContext = buildAIContextFromRecords({ tasks, activities: recentActivities, availableMinutes: 30, now: contextAtDayEnd });
  const activeCompletions = netCompletedActivities(dayActivities);
  const misses = new Map<string, DailyReviewContext['missed'][number]>();
  dayActivities.filter((activity) => activity.kind === 'failure').forEach((activity) => {
    const key = `${activity.priority}:${activity.taskText.trim().toLowerCase()}`;
    misses.set(key, {
      title: activity.taskText,
      category: aiContext.categoryScores.some((item) => item.priority === activity.priority) ? activity.priority as DailyReviewContext['missed'][number]['category'] : 'other',
      reason: activity.reason
    });
  });

  const notes = tasks
    .filter((task) => task.scope !== REVIEW_SCOPE && task.updatedAt >= start && task.updatedAt < end)
    .flatMap((task) => {
      const text = noteText(visibleNote(task.note));
      return text ? [{ source: task.scope === '__meta__' ? 'planning' : task.scope, title: task.text, text }] : [];
    })
    .slice(0, 12);

  const scoreByPriority = new Map(aiContext.categoryScores.map((item) => [item.priority, item.score]));
  const plannedTomorrow = aiContext.tasks.filter((task) => task.scope === 'tomorrow' && !task.done);
  const candidates = (plannedTomorrow.length ? plannedTomorrow : aiContext.tasks.filter((task) => !task.done && (task.scope === 'today' || task.scope === 'weekly')))
    .sort((a, b) => b.weight - a.weight || (scoreByPriority.get(a.priority) ?? 0) - (scoreByPriority.get(b.priority) ?? 0) || a.text.localeCompare(b.text))
    .slice(0, 3)
    .map((task) => ({ id: task.id, title: task.text, category: task.priority, weight: task.weight }));

  return {
    dateKey: input.dateKey,
    completed: activeCompletions.map((activity) => ({
      title: activity.taskText,
      category: aiContext.categoryScores.some((item) => item.priority === activity.priority) ? activity.priority as DailyReviewContext['completed'][number]['category'] : 'other',
      minutes: Math.max(0, activity.minutes ?? 0)
    })),
    missed: [...misses.values()],
    notes,
    categoryScores: aiContext.categoryScores.map(({ priority, score }) => ({ priority, score })),
    currentStreakDays: aiContext.currentStreakDays,
    tomorrowCandidates: candidates
  };
}

function parseStoredReview(note: string | null): StoredDailyReview | null {
  if (!note) return null;
  try {
    const parsed = storedDailyReviewSchema.safeParse(JSON.parse(note));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function generateAndStoreDailyReview(input: { now?: Date; provider?: AIProvider | null; force?: boolean } = {}) {
  const now = input.now ?? new Date();
  const dateKey = previousReportingDate(now);
  const id = `__daily_review__:${dateKey}`;
  const existing = await prisma.goalTask.findUnique({ where: { id } });
  const stored = parseStoredReview(existing?.note ?? null);
  if (stored && !input.force) return { review: stored, created: false };

  const context = await buildDailyReviewContext({ dateKey, now });
  const review = await generateDailyReview({ context, provider: input.provider, now });
  await prisma.goalTask.upsert({
    where: { id },
    create: {
      id,
      ownerKey: OWNER_KEY,
      scope: REVIEW_SCOPE,
      text: `Daily review ${dateKey}`,
      note: JSON.stringify(review),
      priority: 'other',
      done: true,
      position: 0,
      completedAt: now
    },
    update: {
      note: JSON.stringify(review),
      completedAt: now,
      updatedAt: now
    }
  });
  return { review, created: true };
}

export async function getLatestDailyReview() {
  const rows = await prisma.goalTask.findMany({
    where: { ownerKey: OWNER_KEY, scope: REVIEW_SCOPE },
    orderBy: { text: 'desc' },
    take: 7,
    select: { note: true }
  });
  for (const row of rows) {
    const review = parseStoredReview(row.note);
    if (review) return review;
  }
  return null;
}
