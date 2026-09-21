import { buildAIContextFromRecords, type AIContextTask } from '@/lib/ai/context';
import { applyFocusCorrections } from '@/lib/focus-corrections';
import { dailyHabitPointEvents } from '@/lib/goal-points';
import { GOAL_PRIORITIES, scoreGoalCategory, type GoalPriority } from '@/lib/goals/category-score';
import { buildMustFocusTargetProgress, istFocusDateKey, shiftReportingDateKey } from '@/lib/must-focus-targets';

export type McpTaskRecord = {
  id: string;
  scope: string;
  text: string;
  priority: string;
  block: string | null;
  done: boolean;
  note: string | null;
  investedMinutes: number | null;
};

export type McpActivityRecord = {
  id: string;
  scope: string;
  priority: string;
  taskText: string;
  kind: string;
  reason: string | null;
  note: string | null;
  minutes: number | null;
  startedAt: Date | string | null;
  completedAt: Date | string | null;
  createdAt: Date | string;
};

export type PublicMcpActivity = {
  id: string;
  scope: string;
  category: GoalPriority;
  taskName: string;
  kind: string;
  reason: string | null;
  note: string | null;
  points: number;
  minutes: number;
  focusMinutes: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

const activityMetaPattern = /\n?\[sg-activity-meta:([A-Za-z0-9+/_=-]+)\]\s*$/;
const taskMetaPattern = /\n?\[sg-task-meta:[A-Za-z0-9+/_=-]+\]\s*$/;
const subtaskMetaPattern = /\n?\[sg-subtasks:[A-Za-z0-9+/_=-]+\]\s*$/;
const defaultHabitWeights: Record<string, number> = {
  O: 1, O1: 1, O2: 1, O3: 1, L1: 2, L2: 2, L3: 2, M: 1, B: 1,
  MEDITATION: 1, LANGUAGE: 1, GYM: 4, HEALTHYDRINKMORNING: 2, HEALTHYDRINKEVENING: 2,
  SKINCAREMORNING: 1, SKINCAREEVENING: 1, BOOK: 4, STUDY2: 5, OFFICEWORK2: 8,
  SLEEP: 2, NOJUNK: 1, MANIFEST: 1, NOSOCIAL: 1, NOE: 1, EYECARE: 2, SALTGARGLE: 2
};

export function normalizeMcpCategory(value: string): GoalPriority {
  return (GOAL_PRIORITIES as readonly string[]).includes(value) ? value as GoalPriority : 'other';
}

export function normalizeHabitCode(text: string) {
  const compact = text.trim().toUpperCase().replace(/\s+/g, '');
  if (compact === 'O' || /^O[123]$/.test(compact) || /^L[123]$/.test(compact) || compact === 'M' || compact === 'B') return compact;
  const aliases: Record<string, string> = {
    MEDITATION: 'MEDITATION', LANGUAGELEARN: 'LANGUAGE', LANGUAGELEARNING: 'LANGUAGE', GYM: 'GYM',
    HEALTHYDRINKMORNING: 'HEALTHYDRINKMORNING', HEALTHYDRINKEVENING: 'HEALTHYDRINKEVENING',
    MORNINGSKINCARE: 'SKINCAREMORNING', SKINCAREMORNING: 'SKINCAREMORNING',
    EVENINGSKINCARE: 'SKINCAREEVENING', SKINCAREEVENING: 'SKINCAREEVENING',
    BOOKREAD: 'BOOK', BOOKREADANDCOMMUNICATIONPRACTICE: 'BOOK', STUDY: 'STUDY2', STUDY2HOUR: 'STUDY2',
    OFFICEWORK: 'OFFICEWORK2', OFFICEWORK2HOUR: 'OFFICEWORK2', SLEEP11TO6: 'SLEEP', WAKEUPBEFORE8: 'SLEEP',
    NOJUNKFOOD: 'NOJUNK', NOSOCIALMEDIA: 'NOSOCIAL', NOE: 'NOE', EYECARE: 'EYECARE',
    SALTWATERGARGLE: 'SALTGARGLE', SALTGARGLE: 'SALTGARGLE', MANIFESTATION: 'MANIFEST', MANIFESTNATION: 'MANIFEST'
  };
  return aliases[compact] ?? null;
}

function decodeActivityNote(note: string | null) {
  if (!note) return { note: null, points: undefined as number | undefined, focusMinutes: undefined as number | undefined };
  const match = note.match(activityMetaPattern);
  if (!match) return { note, points: undefined as number | undefined, focusMinutes: undefined as number | undefined };
  const visible = note.replace(activityMetaPattern, '').trim() || null;
  try {
    const value = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8')) as { points?: unknown; focusMinutes?: unknown };
    const points = Number(value.points);
    const focusMinutes = Number(value.focusMinutes);
    return {
      note: visible,
      points: Number.isFinite(points) && points >= 0 ? Math.min(100, Math.round(points)) : undefined,
      focusMinutes: Number.isFinite(focusMinutes) && focusMinutes > 0 ? Math.min(1440, Math.round(focusMinutes)) : undefined
    };
  } catch {
    return { note: visible, points: undefined, focusMinutes: undefined };
  }
}

function visibleTaskNote(note: string | null) {
  return note?.replace(taskMetaPattern, '').replace(subtaskMetaPattern, '').trim() || null;
}

export function toPublicMcpActivity(record: McpActivityRecord): PublicMcpActivity {
  const metadata = decodeActivityNote(record.note);
  const habitCode = normalizeHabitCode(record.taskText);
  const fallbackPoints = habitCode ? defaultHabitWeights[habitCode] ?? 1 : 1;
  return {
    id: record.id,
    scope: record.scope,
    category: normalizeMcpCategory(record.priority),
    taskName: record.taskText,
    kind: record.kind,
    reason: record.reason,
    note: metadata.note,
    points: metadata.points ?? fallbackPoints,
    minutes: Math.max(0, Math.round(record.minutes ?? 0)),
    focusMinutes: metadata.focusMinutes ?? Math.max(0, Math.round(record.minutes ?? 0)),
    startedAt: record.startedAt ? new Date(record.startedAt).toISOString() : null,
    completedAt: record.completedAt ? new Date(record.completedAt).toISOString() : null,
    createdAt: new Date(record.createdAt).toISOString()
  };
}

function activityKey(activity: Pick<PublicMcpActivity, 'scope' | 'taskName'>) {
  return `${activity.scope}:${activity.taskName.trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

function correctedActivities(records: McpActivityRecord[]) {
  return applyFocusCorrections(records, normalizeHabitCode).map(toPublicMcpActivity)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

function effectiveActivities(records: McpActivityRecord[]) {
  return dailyHabitPointEvents(correctedActivities(records).map((activity) => ({ ...activity, taskText: activity.taskName })), normalizeHabitCode)
    .map((activity) => ({
      id: activity.id,
      scope: activity.scope,
      category: activity.category,
      taskName: activity.taskName,
      kind: activity.kind,
      reason: activity.reason,
      note: activity.note,
      points: activity.points,
      minutes: activity.minutes,
      focusMinutes: activity.focusMinutes,
      startedAt: activity.startedAt,
      completedAt: activity.completedAt,
      createdAt: activity.createdAt
    }))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

function mergedFocusMinutes(activities: PublicMcpActivity[]) {
  const intervals: Array<{ start: number; end: number }> = [];
  let fallback = 0;
  for (const activity of activities) {
    if (activity.kind !== 'focus-session') continue;
    const start = activity.startedAt ? Date.parse(activity.startedAt) : Number.NaN;
    const end = activity.completedAt ? Date.parse(activity.completedAt) : Number.NaN;
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) intervals.push({ start, end });
    else fallback += activity.focusMinutes;
  }
  intervals.sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const interval of intervals) {
    const previous = merged[merged.length - 1];
    if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end);
    else merged.push({ ...interval });
  }
  return Math.round(merged.reduce((sum, interval) => sum + (interval.end - interval.start) / 60000, fallback));
}

export function buildDailyActivitySummary(records: McpActivityRecord[], dateKey: string) {
  const dayRecords = records.filter((record) => istFocusDateKey(record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt) === dateKey);
  const activities = effectiveActivities(dayRecords);
  const active = new Map<string, PublicMcpActivity>();
  const misses: PublicMcpActivity[] = [];
  let completedPoints = 0;
  let failedPoints = 0;
  for (const activity of activities) {
    const key = activityKey(activity);
    if (activity.kind === 'completion') {
      active.set(key, activity);
      completedPoints += activity.points;
    } else if (activity.kind === 'undo') {
      active.delete(key);
      completedPoints = Math.max(0, completedPoints - activity.points);
    } else if (activity.kind === 'failure') {
      misses.push(activity);
      failedPoints += activity.points;
    }
  }
  return {
    date: dateKey,
    completedTasks: [...active.values()],
    missedTasks: misses,
    completedPoints,
    failedPoints,
    timeInvestedMinutes: mergedFocusMinutes(activities),
    activities
  };
}

export function buildCurrentTaskSummary(tasks: AIContextTask[]) {
  const today = tasks.filter((task) => task.scope === 'today');
  const totalPoints = today.reduce((sum, task) => sum + task.weight, 0);
  const completedPoints = today.filter((task) => task.done).reduce((sum, task) => sum + task.weight, 0);
  return {
    completedTasks: today.filter((task) => task.done).length,
    totalTasks: today.length,
    completedPoints,
    totalPoints,
    completionPercentage: totalPoints ? Math.round(completedPoints / totalPoints * 100) : 0
  };
}

export function buildCategoryPerformance(records: McpActivityRecord[], startDate: string, endDate: string) {
  const activities = correctedActivities(records).filter((activity) => {
    const key = istFocusDateKey(activity.createdAt);
    return key >= startDate && key <= endDate && !activity.note?.startsWith('auto-habit-miss');
  });
  const windowDays = Math.floor((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000) + 1;
  return GOAL_PRIORITIES.map((priority) => {
    const matching = activities.filter((activity) => activity.category === priority);
    const completions = matching.filter((activity) => activity.kind === 'completion').length;
    const failures = matching.filter((activity) => activity.kind === 'failure').length;
    const undos = matching.filter((activity) => activity.kind === 'undo').length;
    const minutes = matching.filter((activity) => activity.kind === 'completion').reduce((sum, activity) => sum + activity.minutes, 0);
    const daysHit = new Set(matching.filter((activity) => activity.kind === 'completion').map((activity) => istFocusDateKey(activity.createdAt))).size;
    return { priority, score: scoreGoalCategory({ priority, completions, failures, undos, minutes, daysHit, windowDays }), completions, failures, undos, minutes, daysHit };
  });
}

export function buildStreaks(records: McpActivityRecord[], reportingDate: string) {
  const focusSessions = correctedActivities(records)
    .filter((activity) => activity.kind === 'focus-session')
    .map((activity) => ({ code: normalizeHabitCode(activity.taskName) ?? '', createdAt: activity.createdAt, minutes: activity.focusMinutes }));
  const result = buildMustFocusTargetProgress(focusSessions, reportingDate);
  return { current: result.current, best: result.best };
}

export function buildTasks(tasks: McpTaskRecord[], activities: McpActivityRecord[], now: Date) {
  const context = buildAIContextFromRecords({ tasks, activities, availableMinutes: 30, now });
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return context.tasks.map((task) => ({ ...task, note: visibleTaskNote(byId.get(task.id)?.note ?? null) }));
}

export function enumerateDateKeys(startDate: string, endDate: string) {
  const result: string[] = [];
  for (let cursor = startDate; cursor <= endDate; cursor = shiftReportingDateKey(cursor, 1)) result.push(cursor);
  return result;
}
