import 'server-only';

import { prisma } from '@/lib/prisma';
import { GOAL_PRIORITIES, scoreGoalCategory, type GoalPriority } from '@/lib/goals/category-score';
import { istFocusDateKey } from '@/lib/must-focus-targets';

export type AIContextTask = {
  id: string;
  scope: string;
  text: string;
  priority: GoalPriority;
  block: string | null;
  done: boolean;
  weight: number;
  investedMinutes: number;
};

export type AIContextActivity = {
  id: string;
  taskText: string;
  priority: GoalPriority;
  kind: string;
  minutes: number;
  reason: string | null;
  createdAt: string;
};

export type AIContext = {
  generatedAt: string;
  reportingDate: string;
  availableMinutes: number;
  tasks: AIContextTask[];
  recentActivities: AIContextActivity[];
  missedActivities: AIContextActivity[];
  categoryScores: Array<{
    priority: GoalPriority;
    score: number;
    completions: number;
    failures: number;
    undos: number;
    minutes: number;
    daysHit: number;
  }>;
  currentStreakDays: number;
};

type ContextTaskRecord = {
  id: string;
  scope: string;
  text: string;
  priority: string;
  block: string | null;
  done: boolean;
  note: string | null;
  investedMinutes: number | null;
};

type ContextActivityRecord = {
  id: string;
  taskText: string;
  priority: string;
  kind: string;
  minutes: number | null;
  reason: string | null;
  note: string | null;
  createdAt: Date | string;
};

function normalizePriority(priority: string): GoalPriority {
  return (GOAL_PRIORITIES as readonly string[]).includes(priority) ? (priority as GoalPriority) : 'other';
}

function readTaskWeight(note: string | null) {
  if (!note) return 1;
  const match = note.match(/(?:^|\n)\[sg-task-meta:([^\]]+)\]\s*$/);
  if (!match) return 1;

  try {
    const parsed = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8')) as { weight?: unknown };
    const weight = Number(parsed.weight);
    return Number.isFinite(weight) ? Math.max(0, Math.min(100, Math.round(weight))) : 1;
  } catch {
    return 1;
  }
}

function shiftDateKey(dateKey: string, offset: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function buildCurrentStreak(completionDays: Set<string>, reportingDate: string) {
  let cursor = reportingDate;
  if (!completionDays.has(cursor)) cursor = shiftDateKey(cursor, -1);

  let streak = 0;
  while (completionDays.has(cursor)) {
    streak += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  return streak;
}

function publicActivity(activity: AIContextActivity & { note: string | null }): AIContextActivity {
  return {
    id: activity.id,
    taskText: activity.taskText,
    priority: activity.priority,
    kind: activity.kind,
    minutes: activity.minutes,
    reason: activity.reason,
    createdAt: activity.createdAt
  };
}

export function buildAIContextFromRecords(input: {
  tasks: ContextTaskRecord[];
  activities: ContextActivityRecord[];
  availableMinutes: number;
  now?: Date;
}): AIContext {
  const now = input.now ?? new Date();
  const reportingDate = istFocusDateKey(now.toISOString());
  const windowKeys = Array.from({ length: 7 }, (_, index) => shiftDateKey(reportingDate, index - 6));
  const windowKeySet = new Set(windowKeys);

  const tasks = input.tasks.map((task) => ({
    id: task.id,
    scope: task.scope,
    text: task.text,
    priority: normalizePriority(task.priority),
    block: task.block,
    done: task.done,
    weight: readTaskWeight(task.note),
    investedMinutes: Math.max(0, task.investedMinutes ?? 0)
  }));

  const recentActivities = input.activities
    .map((activity) => ({
      id: activity.id,
      taskText: activity.taskText,
      priority: normalizePriority(activity.priority),
      kind: activity.kind,
      minutes: Math.max(0, activity.minutes ?? 0),
      reason: activity.reason,
      note: activity.note,
      createdAt: new Date(activity.createdAt).toISOString()
    }))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const scoreActivities = recentActivities.filter((activity) => {
    const key = istFocusDateKey(activity.createdAt);
    return windowKeySet.has(key) && !activity.note?.startsWith('auto-habit-miss');
  });

  const categoryScores = GOAL_PRIORITIES.map((priority) => {
    const matching = scoreActivities.filter((activity) => activity.priority === priority);
    const completionDays = new Set(
      matching.filter((activity) => activity.kind === 'completion').map((activity) => istFocusDateKey(activity.createdAt))
    );
    const completions = matching.filter((activity) => activity.kind === 'completion').length;
    const failures = matching.filter((activity) => activity.kind === 'failure').length;
    const undos = matching.filter((activity) => activity.kind === 'undo').length;
    const minutes = matching.reduce((sum, activity) => sum + (activity.kind === 'completion' ? activity.minutes : 0), 0);

    return {
      priority,
      score: scoreGoalCategory({ priority, completions, failures, undos, minutes, daysHit: completionDays.size, windowDays: windowKeys.length }),
      completions,
      failures,
      undos,
      minutes,
      daysHit: completionDays.size
    };
  });

  const completionDays = new Set(
    recentActivities.filter((activity) => activity.kind === 'completion').map((activity) => istFocusDateKey(activity.createdAt))
  );

  return {
    generatedAt: now.toISOString(),
    reportingDate,
    availableMinutes: input.availableMinutes,
    tasks,
    recentActivities: recentActivities.map(publicActivity),
    missedActivities: recentActivities.filter((activity) => activity.kind === 'failure').map(publicActivity),
    categoryScores,
    currentStreakDays: buildCurrentStreak(completionDays, reportingDate)
  };
}

export async function buildAIContext(input: { availableMinutes: number; now?: Date }) {
  const now = input.now ?? new Date();
  const historyStart = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);
  const [tasks, activities] = await Promise.all([
    prisma.goalTask.findMany({ where: { ownerKey: 'default' }, orderBy: [{ scope: 'asc' }, { position: 'asc' }] }),
    prisma.goalActivity.findMany({
      where: { ownerKey: 'default', createdAt: { gte: historyStart } },
      orderBy: { createdAt: 'desc' },
      take: 300
    })
  ]);

  return buildAIContextFromRecords({ tasks, activities, availableMinutes: input.availableMinutes, now });
}
