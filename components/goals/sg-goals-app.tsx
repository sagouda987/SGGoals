'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, BarChart3, CalendarDays, Check, Clock, Copy, Download, Edit3, Flame, Pause, Play, RotateCcw, Save, Sparkles, Star, Trash2, TrendingUp, Upload } from 'lucide-react';

type Scope = 'today' | 'weekly' | 'weekend' | 'monthly' | 'yearly' | 'tomorrow';
type Priority = 'health' | 'career' | 'communication' | 'looks' | 'other';
type Block = 'morning' | 'afternoon' | 'evening' | 'habit';

type GoalSubtask = {
  id: string;
  text: string;
  done: boolean;
  updatedAt: string;
};

type GoalTask = {
  id: string;
  text: string;
  note?: string;
  priority: Priority;
  block?: Block;
  weight?: number;
  done: boolean;
  startedAt?: string;
  completedAt?: string;
  investedMinutes?: number;
  subtasks?: GoalSubtask[];
  allowSubtasks?: boolean;
  updatedAt: string;
};

type ActivityKind = 'completion' | 'failure' | 'undo' | 'strike-reset' | 'monthly-summary' | 'focus-session';
type StrikeCode = 'O' | 'L1' | 'L2' | 'L3' | 'M' | 'B' | 'MEDITATION' | 'GYM' | 'HEALTHYDRINKMORNING' | 'HEALTHYDRINKEVENING' | 'SKINCAREMORNING' | 'SKINCAREEVENING' | 'BOOK' | 'STUDY2' | 'OFFICEWORK2' | 'SLEEP' | 'NOJUNK' | 'MANIFEST' | 'NOSOCIAL' | 'NOE' | 'EYECARE' | 'SALTGARGLE';
type StrikeFamily = 'O' | 'L' | 'M' | 'B' | 'MEDITATION' | 'GYM' | 'HEALTHYDRINKMORNING' | 'HEALTHYDRINKEVENING' | 'SKINCAREMORNING' | 'SKINCAREEVENING' | 'BOOK' | 'STUDY2' | 'OFFICEWORK2' | 'SLEEP' | 'NOJUNK' | 'MANIFEST' | 'NOSOCIAL' | 'NOE' | 'EYECARE' | 'SALTGARGLE';

type GoalActivity = {
  id: string;
  scope: Scope;
  priority: Priority;
  taskText: string;
  kind: ActivityKind;
  reason?: string;
  note?: string;
  points?: number;
  minutes?: number;
  focusMinutes?: number;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
};
type MustTaskFocusMinutes = {
  OFFICEWORK2: number;
  STUDY2: number;
  BOOK: number;
  GYM: number;
};
type MustTaskStopwatch = {
  running: boolean;
  startedAt: string;
  elapsedMs: number;
  updatedAt: string;
};
type MustTaskStopwatchState = Partial<Record<keyof MustTaskFocusMinutes, MustTaskStopwatch>>;
type MonthlySummary = {
  monthKey: string;
  completedPoints: number;
  failedPoints: number;
  focusMinutes: number;
  days: Array<{ dateKey: string; completedPoints: number; failedPoints: number; focusMinutes: number; mustTaskFocusMinutes?: MustTaskFocusMinutes }>;
  emailedAt?: string;
  createdAt: string;
};

type GoalsStore = Record<Scope, GoalTask[]>;
type WeeklyPlan = {
  mainGoal: string;
  studyPlan: string;
  workPlan: string;
  healthPlan: string;
  notes: string;
  updatedAt: string;
};
type YearlyNotes = {
  completedBooks: string;
  punishment: string;
  goalBreakdowns: Record<string, { monthlyMilestone: string; weeklyAction: string; dailyHabit: string }>;
  updatedAt: string;
};
type TargetState = {
  taskIds: string[];
  taskMinutes?: Record<string, number>;
  mode?: 'timer' | 'stopwatch';
  stopwatchStartedAt?: string;
  stopwatchElapsedMs?: number;
  endAt: string;
  running: boolean;
  remainingMs: number;
  durationMs?: number;
  durationMinutes?: number;
  dailyGoalMinutes?: number;
  focusLogged?: boolean;
  mustTaskStopwatches?: MustTaskStopwatchState;
  updatedAt: string;
};

const STORAGE_KEY = 'sg-goals-store-v1';
const ACTIVITY_KEY = 'sg-goals-activities-v1';
const WEEKLY_PLAN_KEY = 'sg-goals-weekly-plan-v1';
const YEARLY_NOTES_KEY = 'sg-goals-yearly-notes-v1';
const MAIN_GOAL_KEY = 'sg-goals-main-goal-v1';
const NOTIFICATION_LAST_KEY = 'sg-goals-last-notification-v1';
const TARGET_TASKS_KEY = 'sg-goals-target-tasks-v1';
const TARGET_TASK_MINUTES_KEY = 'sg-goals-target-task-minutes-v1';
const TARGET_MODE_KEY = 'sg-goals-target-mode-v1';
const STOPWATCH_STARTED_KEY = 'sg-goals-stopwatch-started-v1';
const STOPWATCH_ELAPSED_KEY = 'sg-goals-stopwatch-elapsed-v1';
const TARGET_TIMER_KEY = 'sg-goals-target-timer-v3';
const TARGET_REMAINING_KEY = 'sg-goals-target-remaining-v3';
const TARGET_RUNNING_KEY = 'sg-goals-target-running-v3';
const TARGET_DURATION_MINUTES_KEY = 'sg-goals-target-duration-minutes-v1';
const FOCUS_DAILY_GOAL_KEY = 'sg-goals-focus-daily-goal-v1';
const TARGET_FOCUS_LOGGED_KEY = 'sg-goals-target-focus-logged-v1';
const TARGET_UPDATED_KEY = 'sg-goals-target-updated-v1';
const TARGET_NOTIFICATION_KEY = 'sg-goals-target-notified-v1';
const MUST_TASK_STOPWATCHES_KEY = 'sg-goals-must-task-stopwatches-v1';
const SAVE_DEBOUNCE_MS = 600;
const APP_VERSION = 'cloud-sync-v74';
const MONTHLY_SUMMARY_NOTE_PREFIX = 'monthly-summary:';
const DEFAULT_TARGET_DURATION_MINUTES = 120;
const TARGET_DURATION_MS = DEFAULT_TARGET_DURATION_MINUTES * 60 * 1000;
const PREVIOUS_TARGET_DURATION_MS = 90 * 60 * 1000;
const DAY_COUNTER_START_DATE = '2026-09-01';
const COUNTER_FORCE_RESET_AT = '2026-08-07T11:32:03+05:30';
const COUNTER_RESET_DAY = 1;
const HABIT_TARGET_COUNT = 21;
const DUE_NOTE_PATTERN = /^\[due:(\d{2}:\d{2})\]\n?/;
const FAILURE_REASONS = ['Tired', 'Busy', 'Distracted', 'Forgot', 'No energy', 'Other'] as const;
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_LABELS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

type AnalyticsWindow = {
  scorecard: Array<{
    priority: Priority;
    score: number;
    completions: number;
    failures: number;
    undos: number;
    minutes: number;
    series: number[];
  }>;
  failures: GoalActivity[];
  totals: { completions: number; failures: number; undos: number; minutes: number };
};

const priorities: Record<Priority, { label: string; color: string; soft: string }> = {
  health: { label: 'Health', color: '#00d97e', soft: 'rgba(0,217,126,.12)' },
  career: { label: 'Career', color: '#4f8ef7', soft: 'rgba(79,142,247,.12)' },
  communication: { label: 'Communication', color: '#f7a04f', soft: 'rgba(247,160,79,.12)' },
  looks: { label: 'Looks', color: '#c084fc', soft: 'rgba(192,132,252,.12)' },
  other: { label: 'Other', color: '#8b8bb3', soft: 'rgba(139,139,179,.12)' }
};

const blocks: Record<Block, { label: string; time: string }> = {
  habit: { label: 'Habit', time: 'Daily count checklist' },
  morning: { label: 'Morning', time: '6:00 AM - 12:00 PM' },
  afternoon: { label: 'Afternoon', time: '12:00 PM - 6:00 PM' },
  evening: { label: 'Evening', time: '6:00 PM - 12:00 AM' }
};

const HABIT_TASKS = ['O', 'L1', 'L2', 'L3', 'M', 'B', 'Meditation', 'Gym', 'Healthy drink morning', 'Healthy drink evening', 'Morning skin care', 'Evening skin care', 'Eye care', 'Salt water gargle', 'Book read and communication practice', 'Study 2 hour', 'Office work', 'Wake up before 8', 'No junk food', 'No Social Media', 'No E', 'Manifestation'];
const REMOVED_HABIT_TASKS = ['Chess improvement', 'Office course'];
const NO_SUBTASK_STRIKE_CODES: StrikeCode[] = ['O', 'L1', 'L2', 'L3', 'M', 'B', 'MEDITATION', 'GYM', 'SKINCAREMORNING', 'SKINCAREEVENING', 'EYECARE', 'SALTGARGLE', 'NOJUNK', 'NOSOCIAL', 'NOE', 'MANIFEST'];
const AUTO_HABIT_MISS_NOTE = 'auto-habit-miss';
const HABIT_MISS_ROLLOVER_KEY = 'sg-goals-habit-miss-rollover-v1';

const habitLabels: Partial<Record<StrikeCode, string>> = {
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
  SLEEP: 'Wake up before 8',
  NOJUNK: 'No junk food',
  MANIFEST: 'Manifestation',
  NOSOCIAL: 'No Social Media',
  NOE: 'No E',
  EYECARE: 'Eye care',
  SALTGARGLE: 'Salt water gargle'
};
const habitDefaultWeights: Partial<Record<StrikeCode, number>> = {
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
  EYECARE: 2,
  SALTGARGLE: 2,
  BOOK: 4,
  STUDY2: 5,
  NOJUNK: 1,
  OFFICEWORK2: 8,
  NOSOCIAL: 1,
  NOE: 1,
  MANIFEST: 1,
  SLEEP: 2
};
const DAILY_PRIORITY_STRIKE_KEYS = ['OFFICEWORK2', 'STUDY2', 'BOOK', 'GYM'] as const;
const DAILY_PRIORITY_FOCUS_COLORS: Record<(typeof DAILY_PRIORITY_STRIKE_KEYS)[number], string> = {
  OFFICEWORK2: '#4f8ef7',
  STUDY2: '#ff6b6b',
  BOOK: '#ffd166',
  GYM: '#00d97e'
};

function emptyMustTaskFocusMinutes(): MustTaskFocusMinutes {
  return { OFFICEWORK2: 0, STUDY2: 0, BOOK: 0, GYM: 0 };
}

function isDailyPriorityStrikeCode(code: StrikeCode | null): code is (typeof DAILY_PRIORITY_STRIKE_KEYS)[number] {
  return Boolean(code && (DAILY_PRIORITY_STRIKE_KEYS as readonly StrikeCode[]).includes(code));
}

function normalizeMustTaskStopwatches(value: unknown): MustTaskStopwatchState {
  if (!value || typeof value !== 'object') return {};
  const candidate = value as Record<string, unknown>;
  return Object.fromEntries(
    DAILY_PRIORITY_STRIKE_KEYS.flatMap((code) => {
      const stopwatch = candidate[code] as Partial<MustTaskStopwatch> | undefined;
      if (
        !stopwatch ||
        typeof stopwatch !== 'object' ||
        typeof stopwatch.running !== 'boolean' ||
        typeof stopwatch.startedAt !== 'string' ||
        typeof stopwatch.elapsedMs !== 'number' ||
        typeof stopwatch.updatedAt !== 'string'
      ) return [];
      return [[code, {
        running: stopwatch.running,
        startedAt: stopwatch.startedAt,
        elapsedMs: Math.max(0, stopwatch.elapsedMs),
        updatedAt: stopwatch.updatedAt
      }]];
    })
  ) as MustTaskStopwatchState;
}

const starterStore: GoalsStore = {
  today: [
    makeTask('Pray', 'Morning ritual', 'health', 'morning'),
    makeTask('Gym workout', '45 min', 'health', 'morning'),
    makeTask('Office work - zero escalation', 'Focus block', 'career', 'afternoon'),
    makeTask('Study DSA / Databricks / Spark', '1 hour minimum', 'career', 'evening'),
    makeTask('Communication practice', 'Speak or read English', 'communication', 'evening'),
    makeTask('Skin care - night', 'Routine', 'looks', 'evening')
  ],
  weekly: [
    makeTask('Gym minimum 4 times this week', undefined, 'health'),
    makeTask('Study Databricks/Spark - 5 hours total', undefined, 'career'),
    makeTask('Communication practice daily - 7/7', undefined, 'communication'),
    makeTask('Skin care routine daily - 7/7', undefined, 'looks')
  ],
  weekend: [
    makeTask('Weekly review and next week planning', undefined, 'career'),
    makeTask('Deep cleaning / personal admin', undefined, 'other'),
    makeTask('Long workout or outdoor walk', undefined, 'health'),
    makeTask('Family / relationship time', undefined, 'communication')
  ],
  monthly: [
    makeTask('Reach weight 68 kg', undefined, 'health'),
    makeTask('Complete Databricks and Spark course', undefined, 'career'),
    makeTask('Daily communication practice - 30 days', undefined, 'communication'),
    makeTask('Consistent skin care - 28+ days', undefined, 'looks')
  ],
  yearly: [
    makeTask('Have gym body - visible muscle definition', undefined, 'health'),
    makeTask('Change job - 40 LPA package', undefined, 'career'),
    makeTask('Improve personality and communication significantly', undefined, 'communication'),
    makeTask('Learn Kannada fluently', undefined, 'looks')
  ],
  tomorrow: []
};

const emptyWeeklyPlan: WeeklyPlan = {
  mainGoal: '',
  studyPlan: '',
  workPlan: '',
  healthPlan: '',
  notes: '',
  updatedAt: '1970-01-01T00:00:00.000Z'
};

const emptyYearlyNotes: YearlyNotes = {
  completedBooks: '',
  punishment: '',
  goalBreakdowns: {},
  updatedAt: '1970-01-01T00:00:00.000Z'
};

function makeTask(text: string, note: string | undefined, priority: Priority, block?: Block, allowSubtasks?: boolean, weight = 1): GoalTask {
  return {
    id: cryptoSafeId(),
    text,
    note,
    priority,
    block,
    weight: normalizeTaskWeight(weight),
    done: false,
    allowSubtasks,
    updatedAt: new Date().toISOString()
  };
}

function splitTaskNote(note?: string) {
  const match = note?.match(DUE_NOTE_PATTERN);
  if (!match) return { note, dueTime: '' };
  const visibleNote = note?.replace(DUE_NOTE_PATTERN, '').trim() || undefined;
  return { note: visibleNote, dueTime: match[1] };
}

function composeTaskNote(note: string | undefined, dueTime?: string) {
  const cleanNote = note?.trim();
  if (!dueTime) return cleanNote || undefined;
  return `[due:${dueTime}]${cleanNote ? `\n${cleanNote}` : ''}`;
}

function formatMinutes(mins?: number) {
  if (mins == null || Number.isNaN(mins)) return '';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (!rem) return `${hours}h`;
  return `${hours}h ${rem}m`;
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function normalizeTimerMinutes(value: unknown, fallback = DEFAULT_TARGET_DURATION_MINUTES) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return fallback;
  return Math.min(1440, Math.max(1, Math.round(minutes)));
}

function normalizeTaskWeight(value: unknown, fallback = 1) {
  if (value === '' || value === null || value === undefined) return fallback;
  const weight = Number(value);
  if (!Number.isFinite(weight) || weight < 0) return fallback;
  return Math.min(100, Math.max(0, Math.round(weight)));
}

function taskWeight(task: Pick<GoalTask, 'weight'>) {
  return normalizeTaskWeight(task.weight, 1);
}

function buildScopeCompletion(tasks: GoalTask[]) {
  const total = tasks.length;
  const done = tasks.filter((task) => task.done).length;
  const totalPoints = tasks.reduce((sum, task) => sum + taskWeight(task), 0);
  const donePoints = tasks.filter((task) => task.done).reduce((sum, task) => sum + taskWeight(task), 0);
  return { total, done, totalPoints, donePoints, pct: totalPoints ? Math.round((donePoints / totalPoints) * 100) : 0 };
}

function buildPointHistory(activities: GoalActivity[], dates: Date[]) {
  const byDate = new Map<
    string,
    {
      dateKey: string;
      completedPoints: number;
      failedPoints: number;
      focusMinutes: number;
      mustTaskFocusMinutes: MustTaskFocusMinutes;
      completedTasks: Array<{ text: string; points: number }>;
      failedTasks: Array<{ text: string; points: number }>;
    }
  >();
  dates.forEach((date) => {
    const dateKey = toISODate(date);
    byDate.set(dateKey, { dateKey, completedPoints: 0, failedPoints: 0, focusMinutes: 0, mustTaskFocusMinutes: emptyMustTaskFocusMinutes(), completedTasks: [], failedTasks: [] });
  });
  const completedHabitKeys = new Set<string>();
  activities.forEach((activity) => {
    if (activity.kind !== 'completion') return;
    const code = normalizeStrikeCode(activity.taskText);
    if (code) completedHabitKeys.add(`${dateKeyFromValue(activity.createdAt)}:${code}`);
  });
  activities.forEach((activity) => {
    const dateKey = dateKeyFromValue(activity.createdAt);
    const day = byDate.get(dateKey);
    if (!day) return;
    if (activity.kind === 'focus-session') {
      const focusMinutes = Math.max(0, Math.round(activity.focusMinutes || 0));
      const code = normalizeStrikeCode(activity.taskText);
      if (isDailyPriorityStrikeCode(code)) day.mustTaskFocusMinutes[code] += focusMinutes;
      return;
    }
    const points = activityPoints(activity);
    if (activity.kind === 'completion') {
      day.completedPoints += points;
      day.completedTasks.push({ text: activity.taskText, points });
    }
    if (activity.kind === 'undo') {
      day.completedPoints = Math.max(0, day.completedPoints - points);
    }
    if (activity.kind === 'failure') {
      const habitCode = normalizeStrikeCode(activity.taskText);
      if (isAutoHabitMiss(activity) && habitCode && completedHabitKeys.has(`${dateKey}:${habitCode}`)) return;
      day.failedPoints += points;
      day.failedTasks.push({ text: activity.taskText, points });
    }
  });
  byDate.forEach((day) => {
    day.focusMinutes = completedFocusMinutes(activities.filter((activity) => dateKeyFromValue(activity.createdAt) === day.dateKey));
  });
  return Array.from(byDate.values()).reverse();
}

function parseMonthlySummary(activity: GoalActivity): MonthlySummary | null {
  if (activity.kind !== 'monthly-summary' || !activity.note?.startsWith(MONTHLY_SUMMARY_NOTE_PREFIX)) return null;
  try {
    const parsed = JSON.parse(activity.note.slice(MONTHLY_SUMMARY_NOTE_PREFIX.length)) as Partial<MonthlySummary>;
    if (
      typeof parsed.monthKey !== 'string' ||
      typeof parsed.completedPoints !== 'number' ||
      typeof parsed.failedPoints !== 'number' ||
      !Array.isArray(parsed.days)
    ) {
      return null;
    }
    return {
      monthKey: parsed.monthKey,
      completedPoints: parsed.completedPoints,
      failedPoints: parsed.failedPoints,
      focusMinutes:
        typeof parsed.focusMinutes === 'number'
          ? parsed.focusMinutes
          : parsed.days.reduce(
              (total, day) => total + (typeof (day as { focusMinutes?: unknown }).focusMinutes === 'number' ? Number((day as { focusMinutes: number }).focusMinutes) : 0),
              0
            ),
      days: parsed.days.filter(
        (day): day is { dateKey: string; completedPoints: number; failedPoints: number; focusMinutes: number } =>
          Boolean(day) &&
          typeof day === 'object' &&
          typeof (day as { dateKey?: unknown }).dateKey === 'string' &&
          typeof (day as { completedPoints?: unknown }).completedPoints === 'number' &&
          typeof (day as { failedPoints?: unknown }).failedPoints === 'number'
      ).map((day) => {
        const mustTaskFocusMinutes = (day as { mustTaskFocusMinutes?: Partial<MustTaskFocusMinutes> }).mustTaskFocusMinutes;
        return {
          ...day,
          focusMinutes: typeof day.focusMinutes === 'number' ? day.focusMinutes : 0,
          mustTaskFocusMinutes: mustTaskFocusMinutes && typeof mustTaskFocusMinutes === 'object'
            ? { ...emptyMustTaskFocusMinutes(), ...mustTaskFocusMinutes }
            : emptyMustTaskFocusMinutes()
        };
      }),
      emailedAt: typeof parsed.emailedAt === 'string' ? parsed.emailedAt : undefined,
      createdAt: activity.createdAt
    };
  } catch {
    return null;
  }
}

function parseStartDate(timeValue: string) {
  if (!timeValue) return null;
  const now = new Date();
  const [hours, minutes] = timeValue.split(':').map(Number);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
  return Number.isNaN(start.getTime()) ? null : start;
}

function cryptoSafeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadStore(): GoalsStore {
  if (typeof window === 'undefined') return starterStore;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return starterStore;
  try {
    const parsed = JSON.parse(raw) as Partial<GoalsStore>;
    return {
      today: Array.isArray(parsed.today) ? parsed.today : starterStore.today,
      weekly: Array.isArray(parsed.weekly) ? parsed.weekly : starterStore.weekly,
      weekend: Array.isArray(parsed.weekend) ? parsed.weekend : starterStore.weekend,
      monthly: Array.isArray(parsed.monthly) ? parsed.monthly : starterStore.monthly,
      yearly: Array.isArray(parsed.yearly) ? parsed.yearly : starterStore.yearly,
      tomorrow: Array.isArray(parsed.tomorrow) ? parsed.tomorrow : starterStore.tomorrow
    };
  } catch {
    return starterStore;
  }
}

function loadActivities(): GoalActivity[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(ACTIVITY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as GoalActivity[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isWeeklyPlan(value: unknown): value is WeeklyPlan {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WeeklyPlan>;
  return (
    typeof candidate.mainGoal === 'string' &&
    typeof candidate.studyPlan === 'string' &&
    typeof candidate.workPlan === 'string' &&
    typeof candidate.healthPlan === 'string' &&
    typeof candidate.notes === 'string' &&
    typeof candidate.updatedAt === 'string'
  );
}

function loadWeeklyPlan(): WeeklyPlan {
  if (typeof window === 'undefined') return emptyWeeklyPlan;
  const raw = window.localStorage.getItem(WEEKLY_PLAN_KEY);
  if (!raw) return emptyWeeklyPlan;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isWeeklyPlan(parsed) ? parsed : emptyWeeklyPlan;
  } catch {
    return emptyWeeklyPlan;
  }
}

function isYearlyNotes(value: unknown): value is YearlyNotes {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<YearlyNotes>;
  const breakdownsAreValid =
    candidate.goalBreakdowns === undefined ||
    (typeof candidate.goalBreakdowns === 'object' &&
      candidate.goalBreakdowns !== null &&
      Object.values(candidate.goalBreakdowns).every(
        (breakdown) =>
          Boolean(breakdown) &&
          typeof breakdown === 'object' &&
          typeof (breakdown as Partial<{ monthlyMilestone: string; weeklyAction: string; dailyHabit: string }>).monthlyMilestone === 'string' &&
          typeof (breakdown as Partial<{ monthlyMilestone: string; weeklyAction: string; dailyHabit: string }>).weeklyAction === 'string' &&
          typeof (breakdown as Partial<{ monthlyMilestone: string; weeklyAction: string; dailyHabit: string }>).dailyHabit === 'string'
      ));
  return (
    typeof candidate.completedBooks === 'string' &&
    (candidate.punishment === undefined || typeof candidate.punishment === 'string') &&
    breakdownsAreValid &&
    typeof candidate.updatedAt === 'string'
  );
}

function normalizeYearlyNotes(value: YearlyNotes): YearlyNotes {
  return {
    completedBooks: value.completedBooks,
    punishment: value.punishment || '',
    goalBreakdowns: value.goalBreakdowns || {},
    updatedAt: value.updatedAt
  };
}

function loadYearlyNotes(): YearlyNotes {
  if (typeof window === 'undefined') return emptyYearlyNotes;
  const raw = window.localStorage.getItem(YEARLY_NOTES_KEY);
  if (!raw) return emptyYearlyNotes;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isYearlyNotes(parsed) ? normalizeYearlyNotes(parsed) : emptyYearlyNotes;
  } catch {
    return emptyYearlyNotes;
  }
}

function isTargetState(value: unknown): value is TargetState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TargetState>;
  return (
    Array.isArray(candidate.taskIds) &&
    candidate.taskIds.every((taskId) => typeof taskId === 'string') &&
    (candidate.taskMinutes === undefined ||
      (typeof candidate.taskMinutes === 'object' &&
        candidate.taskMinutes !== null &&
        Object.entries(candidate.taskMinutes).every(([taskId, minutes]) => typeof taskId === 'string' && typeof minutes === 'number'))) &&
    (candidate.mode === undefined || candidate.mode === 'timer' || candidate.mode === 'stopwatch') &&
    (candidate.stopwatchStartedAt === undefined || typeof candidate.stopwatchStartedAt === 'string') &&
    (candidate.stopwatchElapsedMs === undefined || typeof candidate.stopwatchElapsedMs === 'number') &&
    typeof candidate.endAt === 'string' &&
    typeof candidate.running === 'boolean' &&
    typeof candidate.remainingMs === 'number' &&
    (candidate.durationMs === undefined || typeof candidate.durationMs === 'number') &&
    (candidate.durationMinutes === undefined || typeof candidate.durationMinutes === 'number') &&
    (candidate.dailyGoalMinutes === undefined || typeof candidate.dailyGoalMinutes === 'number') &&
    (candidate.focusLogged === undefined || typeof candidate.focusLogged === 'boolean') &&
    (candidate.mustTaskStopwatches === undefined ||
      Object.keys(normalizeMustTaskStopwatches(candidate.mustTaskStopwatches)).length === Object.keys(candidate.mustTaskStopwatches || {}).length) &&
    typeof candidate.updatedAt === 'string'
  );
}

function targetMinutesSignature(minutes: Record<string, number> | undefined) {
  return JSON.stringify(
    Object.entries(minutes || {})
      .filter(([, value]) => typeof value === 'number' && value > 0)
      .sort(([a], [b]) => a.localeCompare(b))
  );
}

function mustTaskStopwatchesSignature(stopwatches: MustTaskStopwatchState | undefined) {
  return JSON.stringify(normalizeMustTaskStopwatches(stopwatches));
}

function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toIstDateKey(date = new Date()) {
  return toISODate(new Date(date.getTime() + 330 * 60000));
}

function istHour(date = new Date()) {
  return new Date(date.getTime() + 330 * 60000).getUTCHours();
}

function buildIstDateWindow(start: Date, end: Date) {
  const days: Date[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (cursor <= last) {
    days.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function buildWeeklyHabitMissWindow(now = new Date()) {
  const istNow = new Date(now.getTime() + 330 * 60000);
  const start = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  if (istNow.getUTCDay() === 0 && istNow.getUTCHours() < 3) {
    start.setUTCDate(start.getUTCDate() - 7);
  }
  return buildIstDateWindow(start, istNow);
}

function buildPreviousWeeklyHabitMissWindow(now = new Date()) {
  const current = buildWeeklyHabitMissWindow(now);
  const currentStart = current[0] || new Date();
  const previousStart = new Date(currentStart);
  previousStart.setUTCDate(previousStart.getUTCDate() - 7);
  const previousEnd = new Date(currentStart);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  return buildIstDateWindow(previousStart, previousEnd);
}

function parseTodayTime(timeValue: string) {
  return parseStartDate(timeValue);
}

function dateKeyFromValue(dateValue: string) {
  return toISODate(new Date(dateValue));
}

function shouldKeepTodayTask(task: GoalTask, todayKey: string) {
  if (!task.done) return true;
  if (!task.completedAt) return true;
  return dateKeyFromValue(task.completedAt) >= todayKey;
}

function activityId() {
  return cryptoSafeId();
}

function formatDateShort(dateValue: string) {
  return new Date(dateValue).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMonthKey(monthKey: string) {
  return new Date(`${monthKey}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function formatTimeShort(dateValue?: string) {
  if (!dateValue) return '';
  return new Date(dateValue).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatRelativeTime(dateValue?: string, now = Date.now()) {
  if (!dateValue) return 'Not saved yet';
  const diffSeconds = Math.max(0, Math.round((now - new Date(dateValue).getTime()) / 1000));
  if (diffSeconds < 5) return 'Just now';
  if (diffSeconds < 60) return `${diffSeconds} sec ago`;
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.round(diffMinutes / 60);
  return `${diffHours} hr ago`;
}

function formatClock(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatIstClock(timestamp: number) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(new Date(timestamp));
}

function normalizeStrikeCode(text: string) {
  const compact = text.trim().toUpperCase().replace(/\s+/g, '');
  if (compact === 'O' || /^O[123]$/.test(compact)) return 'O';
  if (/^L[123]$/.test(compact)) return compact as Extract<StrikeCode, 'L1' | 'L2' | 'L3'>;
  if (compact === 'M') return 'M';
  if (compact === 'B') return 'B';
  if (compact === 'MEDITATION') return 'MEDITATION';
  if (compact === 'GYM') return 'GYM';
  if (compact === 'HEALTHYDRINKMORNING') return 'HEALTHYDRINKMORNING';
  if (compact === 'HEALTHYDRINKEVENING') return 'HEALTHYDRINKEVENING';
  if (compact === 'MORNINGSKINCARE' || compact === 'SKINCAREMORNING') return 'SKINCAREMORNING';
  if (compact === 'EVENINGSKINCARE' || compact === 'SKINCAREEVENING') return 'SKINCAREEVENING';
  if (compact === 'BOOKREAD' || compact === 'BOOKREADANDCOMMUNICATIONPRACTICE') return 'BOOK';
  if (compact === 'STUDY2HOUR') return 'STUDY2';
  if (compact === 'OFFICEWORK' || compact === 'OFFICEWORK2HOUR') return 'OFFICEWORK2';
  if (compact === 'SLEEP11TO6' || compact === 'WAKEUPBEFORE8') return 'SLEEP';
  if (compact === 'NOJUNKFOOD') return 'NOJUNK';
  if (compact === 'NOSOCIALMEDIA') return 'NOSOCIAL';
  if (compact === 'NOE') return 'NOE';
  if (compact === 'EYECARE') return 'EYECARE';
  if (compact === 'SALTWATERGARGLE' || compact === 'SALTGARGLE') return 'SALTGARGLE';
  if (compact === 'MANIFESTATION' || compact === 'MANIFESTNATION') return 'MANIFEST';
  return null;
}

function isHabitTask(text: string) {
  return normalizeStrikeCode(text) !== null;
}

function defaultHabitWeight(text: string) {
  const code = normalizeStrikeCode(text);
  return code ? habitDefaultWeights[code] || 1 : 1;
}

function defaultTaskWeightFromText(text: string) {
  return isHabitTask(text) ? defaultHabitWeight(text) : 1;
}

function activityPoints(activity: Pick<GoalActivity, 'points' | 'taskText'>) {
  return normalizeTaskWeight(activity.points, defaultTaskWeightFromText(activity.taskText));
}

function completedFocusMinutes(activities: GoalActivity[]) {
  const intervals: Array<{ start: number; end: number }> = [];
  let fallbackMinutes = 0;
  activities.forEach((activity) => {
    if (activity.kind !== 'focus-session') return;
    const start = activity.startedAt ? new Date(activity.startedAt).getTime() : Number.NaN;
    const end = activity.completedAt ? new Date(activity.completedAt).getTime() : Number.NaN;
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) intervals.push({ start, end });
    else fallbackMinutes += Math.max(0, Math.round(activity.focusMinutes || 0));
  });
  intervals.sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  intervals.forEach((interval) => {
    const previous = merged[merged.length - 1];
    if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end);
    else merged.push({ ...interval });
  });
  const intervalMinutes = merged.reduce((total, interval) => total + Math.max(1, Math.round((interval.end - interval.start) / 60000)), 0);
  return fallbackMinutes + intervalMinutes;
}

function allowsSubtasks(task: GoalTask) {
  const code = normalizeStrikeCode(task.text);
  if (code && NO_SUBTASK_STRIKE_CODES.includes(code)) return false;
  return task.allowSubtasks !== false;
}

function isAutoHabitMiss(activity: GoalActivity) {
  return activity.kind === 'failure' && activity.note?.startsWith(AUTO_HABIT_MISS_NOTE);
}

function buildCounterCycleStart(todayKey: string) {
  const today = new Date(`${todayKey}T00:00:00Z`);
  const monthOffset = today.getUTCDate() < COUNTER_RESET_DAY ? -1 : 0;
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + monthOffset, COUNTER_RESET_DAY));
  return toISODate(start);
}

function buildNextCounterReset(todayKey: string) {
  const today = new Date(`${todayKey}T00:00:00Z`);
  const monthOffset = today.getUTCDate() >= COUNTER_RESET_DAY ? 1 : 0;
  const next = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + monthOffset, COUNTER_RESET_DAY));
  return toISODate(next);
}

function buildCounterResetRemaining(todayKey: string) {
  const today = new Date(`${todayKey}T00:00:00Z`);
  const nextResetKey = buildNextCounterReset(todayKey);
  const nextReset = new Date(`${nextResetKey}T00:00:00Z`);
  const days = Math.max(0, Math.ceil((nextReset.getTime() - today.getTime()) / 86400000));
  return { nextReset: nextResetKey, days };
}

function isAfterCounterReset(dateValue: string) {
  return dateKeyFromValue(dateValue) >= buildCounterCycleStart(toISODate(new Date()));
}

function buildHabitMissCounts(activities: GoalActivity[], days: Date[]) {
  const keySet = new Set(days.map(toISODate));
  const counts = new Map<string, { label: string; count: number; lastMissedAt: string }>();
  activities.forEach((activity) => {
    if (!isAutoHabitMiss(activity)) return;
    if (!isAfterCounterReset(activity.createdAt)) return;
    if (!keySet.has(dateKeyFromValue(activity.createdAt))) return;
    const code = normalizeStrikeCode(activity.taskText);
    const label = code ? habitLabels[code] || activity.taskText : activity.taskText;
    const current = counts.get(label);
    counts.set(label, {
      label,
      count: (current?.count || 0) + 1,
      lastMissedAt:
        !current || new Date(activity.createdAt).getTime() > new Date(current.lastMissedAt).getTime()
          ? activity.createdAt
          : current.lastMissedAt
    });
  });
  return Array.from(counts.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function buildHabitCompletionCounts(activities: GoalActivity[], days: Date[]) {
  const keySet = new Set(days.map(toISODate));
  const counts = new Map<string, number>();
  activities.forEach((activity) => {
    if (activity.kind !== 'completion') return;
    if (!isAfterCounterReset(activity.createdAt)) return;
    if (!keySet.has(dateKeyFromValue(activity.createdAt))) return;
    const code = normalizeStrikeCode(activity.taskText);
    if (!code) return;
    const label = habitLabels[code] || activity.taskText;
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return counts;
}

function buildThreeDayHabitMissWarnings(activities: GoalActivity[], todayKey: string) {
  const missedByCode = new Map<StrikeCode, Set<string>>();
  const completedByCode = new Map<StrikeCode, Set<string>>();

  activities.forEach((activity) => {
    const code = normalizeStrikeCode(activity.taskText);
    if (!code) return;
    const dayKey = dateKeyFromValue(activity.createdAt);
    if (activity.kind === 'completion') {
      if (!completedByCode.has(code)) completedByCode.set(code, new Set<string>());
      completedByCode.get(code)?.add(dayKey);
    }
    if (isAutoHabitMiss(activity)) {
      if (!missedByCode.has(code)) missedByCode.set(code, new Set<string>());
      missedByCode.get(code)?.add(dayKey);
    }
  });

  const warnings = new Set<StrikeCode>();
  Object.keys(habitLabels).forEach((rawCode) => {
    const code = rawCode as StrikeCode;
    const missedDays = missedByCode.get(code);
    if (!missedDays || completedByCode.get(code)?.has(todayKey)) return;

    let streak = 0;
    const cursor = new Date(`${todayKey}T00:00:00`);
    cursor.setDate(cursor.getDate() - 1);
    for (let index = 0; index < 3; index += 1) {
      const dayKey = toISODate(cursor);
      if (completedByCode.get(code)?.has(dayKey)) break;
      if (!missedDays.has(dayKey)) break;
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    if (streak >= 3) warnings.add(code);
  });

  return warnings;
}

function buildHabitInsights(activities: GoalActivity[], currentDays: Date[], previousDays: Date[]) {
  const currentMisses = buildHabitMissCounts(activities, currentDays);
  const previousMisses = buildHabitMissCounts(activities, previousDays);
  const completions = buildHabitCompletionCounts(activities, currentDays);
  const currentMissMap = new Map(currentMisses.map((item) => [item.label, item.count]));
  const previousMissMap = new Map(previousMisses.map((item) => [item.label, item.count]));
  const labels = Array.from(
    new Set([...Object.values(habitLabels), ...currentMissMap.keys(), ...previousMissMap.keys(), ...completions.keys()])
  ).sort((a, b) => a.localeCompare(b));

  const trend = labels
    .map((label) => ({
      label,
      current: currentMissMap.get(label) || 0,
      previous: previousMissMap.get(label) || 0
    }))
    .filter((item) => item.current || item.previous)
    .sort((a, b) => b.current - a.current || b.previous - a.previous || a.label.localeCompare(b.label));

  const health = labels
    .map((label) => {
      const done = completions.get(label) || 0;
      const missed = currentMissMap.get(label) || 0;
      const total = done + missed;
      return {
        label,
        done,
        missed,
        score: total ? Math.round((done / total) * 100) : null
      };
    })
    .filter((item) => item.score !== null || item.missed > 0 || item.done > 0)
    .sort((a, b) => (a.score ?? -1) - (b.score ?? -1) || b.missed - a.missed || a.label.localeCompare(b.label));

  const previousTotal = previousMisses.reduce((total, item) => total + item.count, 0);
  const topMissed = previousMisses.slice(0, 3);
  const previousHealth = labels
    .map((label) => ({
      label,
      missed: previousMissMap.get(label) || 0
    }))
    .sort((a, b) => a.missed - b.missed || a.label.localeCompare(b.label));
  const bestHabit = previousHealth.find((item) => item.missed === 0) || previousHealth[0] || null;
  const weakestHabit = [...previousHealth].sort((a, b) => b.missed - a.missed || a.label.localeCompare(b.label))[0] || null;

  return {
    currentMisses,
    trend,
    health,
    summary: {
      total: previousTotal,
      topMissed,
      bestHabit,
      weakestHabit
    }
  };
}

function isRemovedHabitTask(text: string) {
  const normalized = text.replace(/[^a-z0-9]/gi, '').toUpperCase();
  return REMOVED_HABIT_TASKS.some((task) => task.replace(/[^a-z0-9]/gi, '').toUpperCase() === normalized);
}

function ensureHabitTemplates(store: GoalsStore, activities: GoalActivity[] = [], todayKey = toISODate(new Date())): GoalsStore {
  const canonicalHabitText = new Map(HABIT_TASKS.map((text) => [normalizeStrikeCode(text), text]));
  const failedHabitCodesToday = new Set(
    activities
      .filter((activity) => activity.scope === 'today' && activity.kind === 'failure' && dateKeyFromValue(activity.createdAt) === todayKey)
      .map((activity) => normalizeStrikeCode(activity.taskText))
      .filter((code): code is StrikeCode => Boolean(code))
  );
  let changed = false;
  const seenHabitIndexes = new Map<string, number>();
  const today: GoalTask[] = [];
  store.today.forEach((task) => {
    if (isRemovedHabitTask(task.text)) {
      changed = true;
      return;
    }
    const code = normalizeStrikeCode(task.text);
    if (code && failedHabitCodesToday.has(code)) {
      changed = true;
      return;
    }
    const canonicalText = code ? canonicalHabitText.get(code) : undefined;
    if (!code || !canonicalText) {
      today.push(task);
      return;
    }
    const defaultWeight = defaultHabitWeight(canonicalText);
    const normalizedTask =
      task.text === canonicalText && task.weight !== undefined
        ? task
        : { ...task, text: canonicalText, weight: task.weight ?? defaultWeight };
    if (normalizedTask !== task) changed = true;
    const existingIndex = seenHabitIndexes.get(code);
    if (existingIndex === undefined) {
      seenHabitIndexes.set(code, today.length);
      today.push(normalizedTask);
      return;
    }
    changed = true;
    const existing = today[existingIndex];
    if (normalizedTask.done && !existing.done) {
      today[existingIndex] = normalizedTask;
    }
  });
  const existingHabits = new Set(
    today
      .filter((task) => isHabitTask(task.text))
      .map((task) => normalizeStrikeCode(task.text))
  );
  const missingHabits = HABIT_TASKS.filter((text) => {
    const code = normalizeStrikeCode(text);
    return code && !existingHabits.has(code) && !failedHabitCodesToday.has(code);
  });
  if (!missingHabits.length && !changed) return store;
  return {
    ...store,
    today: [...today, ...missingHabits.map((text) => makeTask(text, undefined, 'other', 'habit', false, defaultHabitWeight(text)))]
  };
}

function buildDayCounter(todayKey: string) {
  const start = new Date(`${DAY_COUNTER_START_DATE}T00:00:00`);
  const today = new Date(`${todayKey}T00:00:00`);
  const diffDays = Math.floor((today.getTime() - start.getTime()) / 86400000);
  return Math.max(0, diffDays);
}

function formatStartedDate(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function buildStrikeCounts(activities: GoalActivity[], todayTasks: GoalTask[], todayKey: string) {
  const byDay = new Map<string, Set<string>>();
  const ensureDay = (day: string) => {
    if (!byDay.has(day)) byDay.set(day, new Set<string>());
    return byDay.get(day) as Set<string>;
  };
  const counterCycleStart = buildCounterCycleStart(todayKey);
  const counterResetAt = Math.max(new Date(`${counterCycleStart}T00:00:00`).getTime(), new Date(COUNTER_FORCE_RESET_AT).getTime());
  const resetAt: Record<StrikeFamily, number> = { O: counterResetAt, L: counterResetAt, M: counterResetAt, B: counterResetAt, MEDITATION: counterResetAt, GYM: counterResetAt, HEALTHYDRINKMORNING: counterResetAt, HEALTHYDRINKEVENING: counterResetAt, SKINCAREMORNING: counterResetAt, SKINCAREEVENING: counterResetAt, BOOK: counterResetAt, STUDY2: counterResetAt, OFFICEWORK2: counterResetAt, SLEEP: counterResetAt, NOJUNK: counterResetAt, MANIFEST: counterResetAt, NOSOCIAL: counterResetAt, NOE: counterResetAt, EYECARE: counterResetAt, SALTGARGLE: counterResetAt };
  const familyForCode = (code: StrikeCode): StrikeFamily => {
    if (code.startsWith('O')) return 'O';
    if (code.startsWith('L')) return 'L';
    return code as StrikeFamily;
  };

  activities
    .filter((activity) => activity.kind === 'strike-reset')
    .forEach((activity) => {
      const family =
        activity.note === 'O' ||
        activity.note === 'L' ||
        activity.note === 'M' ||
        activity.note === 'B' ||
        activity.note === 'MEDITATION' ||
        activity.note === 'GYM' ||
        activity.note === 'HEALTHYDRINKMORNING' ||
        activity.note === 'HEALTHYDRINKEVENING' ||
        activity.note === 'SKINCAREMORNING' ||
        activity.note === 'SKINCAREEVENING' ||
        activity.note === 'BOOK' ||
        activity.note === 'STUDY2' ||
        activity.note === 'OFFICEWORK2' ||
        activity.note === 'SLEEP' ||
        activity.note === 'NOJUNK' ||
        activity.note === 'MANIFEST' ||
        activity.note === 'NOSOCIAL' ||
        activity.note === 'NOE' ||
        activity.note === 'EYECARE' ||
        activity.note === 'SALTGARGLE'
          ? activity.note
          : null;
      if (!family) return;
      resetAt[family] = Math.max(resetAt[family], new Date(activity.createdAt).getTime());
    });

  activities
    .filter((activity) => activity.scope === 'today')
    .forEach((activity) => {
      if (dateKeyFromValue(activity.createdAt) < counterCycleStart) return;
      const code = normalizeStrikeCode(activity.taskText);
      if (!code) return;
      const family = familyForCode(code);
      if (new Date(activity.createdAt).getTime() <= resetAt[family]) return;
      const day = dateKeyFromValue(activity.createdAt);
      const codes = ensureDay(day);
      if (activity.kind === 'completion') codes.add(code);
      if (activity.kind === 'undo') codes.delete(code);
    });

  todayTasks.forEach((task) => {
    const code = normalizeStrikeCode(task.text);
    if (!code || !task.done) return;
    const family = familyForCode(code);
    const completedAt = task.completedAt ? new Date(task.completedAt).getTime() : Date.now();
    if (completedAt <= resetAt[family]) return;
    ensureDay(todayKey).add(code);
  });

  const dayResults = Array.from(byDay.entries()).map(([day, codes]) => ({
    day,
    o: codes.has('O'),
    l: ['L1', 'L2', 'L3'].every((code) => codes.has(code)),
    m: codes.has('M'),
    b: codes.has('B'),
    meditation: codes.has('MEDITATION'),
    gym: codes.has('GYM'),
    healthyDrinkMorning: codes.has('HEALTHYDRINKMORNING'),
    healthyDrinkEvening: codes.has('HEALTHYDRINKEVENING'),
    skinCareMorning: codes.has('SKINCAREMORNING'),
    skinCareEvening: codes.has('SKINCAREEVENING'),
    book: codes.has('BOOK'),
    study2: codes.has('STUDY2'),
    officeWork2: codes.has('OFFICEWORK2'),
    sleep: codes.has('SLEEP'),
    noJunk: codes.has('NOJUNK'),
    manifest: codes.has('MANIFEST'),
    noSocial: codes.has('NOSOCIAL'),
    noE: codes.has('NOE'),
    eyeCare: codes.has('EYECARE'),
    saltGargle: codes.has('SALTGARGLE')
  }));
  const dayResultMap = new Map(dayResults.map((day) => [day.day, day]));
  const emptyDay = { day: todayKey, o: false, l: false, m: false, b: false, meditation: false, gym: false, healthyDrinkMorning: false, healthyDrinkEvening: false, skinCareMorning: false, skinCareEvening: false, book: false, study2: false, officeWork2: false, sleep: false, noJunk: false, manifest: false, noSocial: false, noE: false, eyeCare: false, saltGargle: false };
  const dayCompleteForFamily = (day: typeof emptyDay, family: StrikeFamily) => {
    if (family === 'O') return day.o;
    if (family === 'L') return day.l;
    if (family === 'M') return day.m;
    if (family === 'B') return day.b;
    if (family === 'MEDITATION') return day.meditation;
    if (family === 'GYM') return day.gym;
    if (family === 'HEALTHYDRINKMORNING') return day.healthyDrinkMorning;
    if (family === 'HEALTHYDRINKEVENING') return day.healthyDrinkEvening;
    if (family === 'SKINCAREMORNING') return day.skinCareMorning;
    if (family === 'SKINCAREEVENING') return day.skinCareEvening;
    if (family === 'BOOK') return day.book;
    if (family === 'STUDY2') return day.study2;
    if (family === 'OFFICEWORK2') return day.officeWork2;
    if (family === 'SLEEP') return day.sleep;
    if (family === 'NOJUNK') return day.noJunk;
    if (family === 'MANIFEST') return day.manifest;
    if (family === 'NOSOCIAL') return day.noSocial;
    if (family === 'NOE') return day.noE;
    if (family === 'EYECARE') return day.eyeCare;
    return day.saltGargle;
  };
  const buildFamilyStreak = (family: StrikeFamily) => {
    const cursor = new Date(`${todayKey}T00:00:00`);
    const cycleStart = new Date(`${counterCycleStart}T00:00:00`);
    const todayResult = dayResultMap.get(todayKey) || emptyDay;
    if (!dayCompleteForFamily(todayResult, family)) {
      cursor.setDate(cursor.getDate() - 1);
    }
    let streak = 0;
    while (cursor >= cycleStart) {
      const key = toISODate(cursor);
      const day = dayResultMap.get(key) || { ...emptyDay, day: key };
      if (!dayCompleteForFamily(day, family)) break;
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  };

  return {
    o: dayResults.filter((day) => day.o).length,
    l: dayResults.filter((day) => day.l).length,
    m: dayResults.filter((day) => day.m).length,
    b: dayResults.filter((day) => day.b).length,
    meditation: dayResults.filter((day) => day.meditation).length,
    gym: dayResults.filter((day) => day.gym).length,
    healthyDrinkMorning: dayResults.filter((day) => day.healthyDrinkMorning).length,
    healthyDrinkEvening: dayResults.filter((day) => day.healthyDrinkEvening).length,
    skinCareMorning: dayResults.filter((day) => day.skinCareMorning).length,
    skinCareEvening: dayResults.filter((day) => day.skinCareEvening).length,
    book: dayResults.filter((day) => day.book).length,
    study2: dayResults.filter((day) => day.study2).length,
    officeWork2: dayResults.filter((day) => day.officeWork2).length,
    sleep: dayResults.filter((day) => day.sleep).length,
    noJunk: dayResults.filter((day) => day.noJunk).length,
    manifest: dayResults.filter((day) => day.manifest).length,
    noSocial: dayResults.filter((day) => day.noSocial).length,
    noE: dayResults.filter((day) => day.noE).length,
    eyeCare: dayResults.filter((day) => day.eyeCare).length,
    saltGargle: dayResults.filter((day) => day.saltGargle).length,
    streaks: {
      O: buildFamilyStreak('O'),
      L: buildFamilyStreak('L'),
      M: buildFamilyStreak('M'),
      B: buildFamilyStreak('B'),
      MEDITATION: buildFamilyStreak('MEDITATION'),
      GYM: buildFamilyStreak('GYM'),
      HEALTHYDRINKMORNING: buildFamilyStreak('HEALTHYDRINKMORNING'),
      HEALTHYDRINKEVENING: buildFamilyStreak('HEALTHYDRINKEVENING'),
      SKINCAREMORNING: buildFamilyStreak('SKINCAREMORNING'),
      SKINCAREEVENING: buildFamilyStreak('SKINCAREEVENING'),
      BOOK: buildFamilyStreak('BOOK'),
      STUDY2: buildFamilyStreak('STUDY2'),
      OFFICEWORK2: buildFamilyStreak('OFFICEWORK2'),
      SLEEP: buildFamilyStreak('SLEEP'),
      NOJUNK: buildFamilyStreak('NOJUNK'),
      MANIFEST: buildFamilyStreak('MANIFEST'),
      NOSOCIAL: buildFamilyStreak('NOSOCIAL'),
      NOE: buildFamilyStreak('NOE'),
      EYECARE: buildFamilyStreak('EYECARE'),
      SALTGARGLE: buildFamilyStreak('SALTGARGLE')
    },
    counterCycleStart,
    resetAt,
    today: dayResults.find((day) => day.day === todayKey) || emptyDay
  };
}

function buildAnalytics(activities: GoalActivity[], days: Date[], maxFailures = 6): AnalyticsWindow {
  const byPriority = Object.fromEntries(
    (Object.keys(priorities) as Priority[]).map((priority) => [priority, { completions: 0, failures: 0, undos: 0, minutes: 0, daysHit: new Set<string>(), series: Array(days.length).fill(0) }])
  ) as Record<Priority, { completions: number; failures: number; undos: number; minutes: number; daysHit: Set<string>; series: number[] }>;

  const keys = days.map(toISODate);
  const keySet = new Set(keys);
  const recent = activities.filter((activity) => {
    const activityKey = dateKeyFromValue(activity.createdAt);
    return activityKey >= DAY_COUNTER_START_DATE && keySet.has(activityKey) && !isAutoHabitMiss(activity);
  });

  recent.forEach((activity) => {
    if (activity.kind === 'strike-reset') return;
    const bucket = byPriority[activity.priority];
    const key = dateKeyFromValue(activity.createdAt);
    const dayIndex = keys.indexOf(key);
    const signedValue = activity.kind === 'failure' || activity.kind === 'undo' ? -1 : 1;
    if (dayIndex >= 0) bucket.series[dayIndex] += signedValue;
    if (activity.kind === 'completion') {
      bucket.completions += 1;
      bucket.minutes += activity.minutes || 0;
      bucket.daysHit.add(key);
    } else if (activity.kind === 'failure') {
      bucket.failures += 1;
    } else if (activity.kind === 'undo') {
      bucket.undos += 1;
    }
  });

  const scorecard = (Object.keys(priorities) as Priority[]).map((priority) => {
    const data = byPriority[priority];
    const totalActions = data.completions + data.failures + data.undos;
    const consistency = days.length ? data.daysHit.size / days.length : 0;
    const completionRate = totalActions ? data.completions / totalActions : 0;
    const weeklyTargets: Record<Priority, number> = { health: 180, career: 300, communication: 90, looks: 45, other: 60 };
    const timeTarget = Math.max(1, Math.round((weeklyTargets[priority] / 7) * Math.max(days.length, 1)));
    const timeScore = Math.min(data.minutes / timeTarget, 1);
    const raw = completionRate * 0.45 + consistency * 0.35 + timeScore * 0.2;
    return {
      priority,
      score: Math.round(raw * 100),
      completions: data.completions,
      failures: data.failures,
      undos: data.undos,
      minutes: data.minutes,
      series: data.series
    };
  });

  return {
    scorecard,
    failures: recent
      .filter((activity) => activity.kind === 'failure')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, maxFailures),
    totals: recent.reduce(
      (acc, activity) => {
        if (activity.kind === 'completion') acc.completions += 1;
        if (activity.kind === 'failure') acc.failures += 1;
        if (activity.kind === 'undo') acc.undos += 1;
        if (activity.kind === 'completion') acc.minutes += activity.minutes || 0;
        return acc;
      },
      { completions: 0, failures: 0, undos: 0, minutes: 0 }
    )
  };
}

export function SgGoalsApp() {
  const [store, setStore] = useState<GoalsStore>(starterStore);
  const [activities, setActivities] = useState<GoalActivity[]>([]);
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlan>(emptyWeeklyPlan);
  const [yearlyNotes, setYearlyNotes] = useState<YearlyNotes>(emptyYearlyNotes);
  const [ready, setReady] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const [syncState, setSyncState] = useState<'loading' | 'local' | 'saving' | 'saved' | 'error'>('loading');
  const [timerSyncState, setTimerSyncState] = useState<'loading' | 'local' | 'saving' | 'saved' | 'conflict' | 'error'>('loading');
  const [lastSavedAt, setLastSavedAt] = useState('');
  const [targetConflict, setTargetConflict] = useState<TargetState | null>(null);
  const [scope, setScope] = useState<Scope>('today');
  const [editing, setEditing] = useState<GoalTask | null>(null);
  const [timingTask, setTimingTask] = useState<GoalTask | null>(null);
  const [timingScope, setTimingScope] = useState<Scope>('today');
  const [timingStart, setTimingStart] = useState('');
  const [timingEnd, setTimingEnd] = useState('');
  const [timingPreview, setTimingPreview] = useState('-');
  const [failureTask, setFailureTask] = useState<GoalTask | null>(null);
  const [failureScope, setFailureScope] = useState<Scope>('today');
  const [failureReason, setFailureReason] = useState<(typeof FAILURE_REASONS)[number]>('Tired');
  const [failureNote, setFailureNote] = useState('');
  const [mainGoalId, setMainGoalId] = useState('');
  const [targetTaskIds, setTargetTaskIds] = useState<string[]>([]);
  const [targetTaskMinutes, setTargetTaskMinutes] = useState<Record<string, number>>({});
  const [focusMode, setFocusMode] = useState<'timer' | 'stopwatch'>('timer');
  const [stopwatchStartedAt, setStopwatchStartedAt] = useState('');
  const [stopwatchElapsedMs, setStopwatchElapsedMs] = useState(0);
  const [mustTaskStopwatches, setMustTaskStopwatches] = useState<MustTaskStopwatchState>({});
  const [targetEndAt, setTargetEndAt] = useState('');
  const [targetRunning, setTargetRunning] = useState(false);
  const [targetDurationMinutes, setTargetDurationMinutes] = useState(DEFAULT_TARGET_DURATION_MINUTES);
  const [targetDurationDraft, setTargetDurationDraft] = useState(String(DEFAULT_TARGET_DURATION_MINUTES));
  const [targetDurationEditing, setTargetDurationEditing] = useState(false);
  const [focusDailyGoalMinutes, setFocusDailyGoalMinutes] = useState(DEFAULT_TARGET_DURATION_MINUTES);
  const [focusDailyGoalDraft, setFocusDailyGoalDraft] = useState(String(DEFAULT_TARGET_DURATION_MINUTES));
  const [focusDailyGoalEditing, setFocusDailyGoalEditing] = useState(false);
  const [targetFocusLogged, setTargetFocusLogged] = useState(false);
  const [targetRemainingMs, setTargetRemainingMs] = useState(TARGET_DURATION_MS);
  const [targetUpdatedAt, setTargetUpdatedAt] = useState(() => '1970-01-01T00:00:00.000Z');
  const [timerNow, setTimerNow] = useState(0);
  const [reportCopied, setReportCopied] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [pushAlarmStatus, setPushAlarmStatus] = useState<'unknown' | 'unsupported' | 'off' | 'saving' | 'on' | 'error'>('unknown');
  const [calendarCursor, setCalendarCursor] = useState(() => new Date());
  const [currentDateKey, setCurrentDateKey] = useState(() => toISODate(new Date()));
  const [draft, setDraft] = useState({ text: '', note: '', dueTime: '', priority: 'career' as Priority, block: 'morning' as Block, allowSubtasks: false, weight: '1' });
  const [tomorrowDraft, setTomorrowDraft] = useState({ text: '', note: '', dueTime: '' });
  const [subtaskDrafts, setSubtaskDrafts] = useState<Record<string, string>>({});
  const [habitCheckState, setHabitCheckState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const targetPlanSignatureRef = useRef('');

  const showGoalNotification = useCallback((title: string, body: string, tag: string) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.ready
        .then((registration) =>
          registration.showNotification(title, {
            body,
            icon: '/sg-goals-icon.svg',
            badge: '/sg-goals-icon.svg',
            tag
          })
        )
        .catch(() => new Notification(title, { body, icon: '/sg-goals-icon.svg', tag }));
      return;
    }
    new Notification(title, { body, icon: '/sg-goals-icon.svg', tag });
  }, []);

  const markTargetChanged = useCallback(() => {
    setTargetUpdatedAt(new Date().toISOString());
  }, []);

  const applyTargetState = useCallback((targetState: TargetState) => {
    const nextDurationMinutes = normalizeTimerMinutes(targetState.durationMinutes ?? (targetState.durationMs ? targetState.durationMs / 60000 : undefined));
    const nextDurationMs = nextDurationMinutes * 60000;
    const needsDurationUpgrade = targetState.durationMs !== undefined && targetState.durationMs !== nextDurationMs;
    const durationIncrease = Math.max(0, nextDurationMs - (targetState.durationMs || PREVIOUS_TARGET_DURATION_MS));
    const upgradedRemaining = needsDurationUpgrade
      ? Math.min(nextDurationMs, Math.max(0, targetState.remainingMs) + durationIncrease)
      : targetState.remainingMs;
    const upgradedEndAt =
      needsDurationUpgrade && targetState.running && targetState.endAt
        ? new Date(new Date(targetState.endAt).getTime() + durationIncrease).toISOString()
        : targetState.endAt;
    setTargetTaskIds(targetState.taskIds);
    setTargetTaskMinutes(targetState.taskMinutes || {});
    setFocusMode(targetState.mode === 'stopwatch' ? 'stopwatch' : 'timer');
    setStopwatchStartedAt(targetState.stopwatchStartedAt || '');
    setStopwatchElapsedMs(Math.max(0, targetState.stopwatchElapsedMs || 0));
    setMustTaskStopwatches(normalizeMustTaskStopwatches(targetState.mustTaskStopwatches));
    setTargetEndAt(upgradedEndAt);
    setTargetRunning(targetState.running);
    setTargetDurationMinutes(nextDurationMinutes);
    setFocusDailyGoalMinutes(normalizeTimerMinutes(targetState.dailyGoalMinutes));
    setTargetFocusLogged(Boolean(targetState.focusLogged));
    setTargetRemainingMs(Number.isFinite(upgradedRemaining) && upgradedRemaining >= 0 ? Math.min(nextDurationMs, upgradedRemaining) : nextDurationMs);
    setTargetUpdatedAt(needsDurationUpgrade ? new Date().toISOString() : targetState.updatedAt);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const localActivities = loadActivities();
    const localStore = ensureHabitTemplates(loadStore(), localActivities, toISODate(new Date()));
    const localWeeklyPlan = loadWeeklyPlan();
    const localYearlyNotes = loadYearlyNotes();
    const legacyTargetId = window.localStorage.getItem(MAIN_GOAL_KEY) || '';
    let savedTargetIds: string[] = [];
    try {
      const parsedTargets = JSON.parse(window.localStorage.getItem(TARGET_TASKS_KEY) || '[]') as string[];
      savedTargetIds = Array.isArray(parsedTargets) ? parsedTargets.filter(Boolean) : [];
    } catch {
      savedTargetIds = [];
    }
    let savedTargetMinutes: Record<string, number> = {};
    try {
      const parsedMinutes = JSON.parse(window.localStorage.getItem(TARGET_TASK_MINUTES_KEY) || '{}') as Record<string, number>;
      savedTargetMinutes =
        parsedMinutes && typeof parsedMinutes === 'object'
          ? Object.fromEntries(Object.entries(parsedMinutes).filter(([taskId, minutes]) => taskId && typeof minutes === 'number' && minutes > 0))
          : {};
    } catch {
      savedTargetMinutes = {};
    }
    const savedEndAt = window.localStorage.getItem(TARGET_TIMER_KEY) || '';
    const savedFocusMode = window.localStorage.getItem(TARGET_MODE_KEY) === 'stopwatch' ? 'stopwatch' : 'timer';
    const savedStopwatchStartedAt = window.localStorage.getItem(STOPWATCH_STARTED_KEY) || '';
    const savedStopwatchElapsed = Number(window.localStorage.getItem(STOPWATCH_ELAPSED_KEY));
    const savedRemaining = Number(window.localStorage.getItem(TARGET_REMAINING_KEY));
    const savedTargetDurationMinutes = normalizeTimerMinutes(window.localStorage.getItem(TARGET_DURATION_MINUTES_KEY));
    const savedFocusDailyGoalMinutes = normalizeTimerMinutes(window.localStorage.getItem(FOCUS_DAILY_GOAL_KEY));
    const savedTargetFocusLogged = window.localStorage.getItem(TARGET_FOCUS_LOGGED_KEY) === 'true';
    let savedMustTaskStopwatches: MustTaskStopwatchState = {};
    try {
      savedMustTaskStopwatches = normalizeMustTaskStopwatches(JSON.parse(window.localStorage.getItem(MUST_TASK_STOPWATCHES_KEY) || '{}'));
    } catch {
      savedMustTaskStopwatches = {};
    }
    const savedTargetDurationMs = savedTargetDurationMinutes * 60000;
    const savedTargetUpdatedAt = window.localStorage.getItem(TARGET_UPDATED_KEY) || '1970-01-01T00:00:00.000Z';
    setStore(localStore);
    setActivities(localActivities);
    setWeeklyPlan(localWeeklyPlan);
    setYearlyNotes(localYearlyNotes);
    setMainGoalId(legacyTargetId);
    setTargetTaskIds(savedTargetIds.length ? savedTargetIds : legacyTargetId ? [legacyTargetId] : []);
    setTargetTaskMinutes(savedTargetMinutes);
    setFocusMode(savedFocusMode);
    setStopwatchStartedAt(savedStopwatchStartedAt);
    setStopwatchElapsedMs(Number.isFinite(savedStopwatchElapsed) && savedStopwatchElapsed >= 0 ? savedStopwatchElapsed : 0);
    setTargetEndAt(savedEndAt);
    setTargetDurationMinutes(savedTargetDurationMinutes);
    setFocusDailyGoalMinutes(savedFocusDailyGoalMinutes);
    setTargetFocusLogged(savedTargetFocusLogged);
    setMustTaskStopwatches(savedMustTaskStopwatches);
    setTargetRemainingMs(Number.isFinite(savedRemaining) && savedRemaining >= 0 ? Math.min(savedTargetDurationMs, savedRemaining) : savedTargetDurationMs);
    setTargetRunning(
      window.localStorage.getItem(TARGET_RUNNING_KEY) === 'true' &&
        (savedFocusMode === 'stopwatch' ? Boolean(savedStopwatchStartedAt) : Boolean(savedEndAt))
    );
    setTargetUpdatedAt(savedTargetUpdatedAt);

    async function loadCloudStore() {
      try {
        const response = await fetch('/api/goals', { cache: 'no-store' });
        if (!response.ok) throw new Error('Cloud database is not ready.');
        const data = (await response.json()) as { store?: GoalsStore; targetState?: unknown; weeklyPlan?: unknown; yearlyNotes?: unknown; hasCloudData?: boolean };
        if (cancelled) return;
        if (data.hasCloudData && data.store) {
          setStore(ensureHabitTemplates(data.store, localActivities, toISODate(new Date())));
          if (isWeeklyPlan(data.weeklyPlan)) {
            setWeeklyPlan(data.weeklyPlan);
            window.localStorage.setItem(WEEKLY_PLAN_KEY, JSON.stringify(data.weeklyPlan));
          }
          if (isYearlyNotes(data.yearlyNotes)) {
            const nextYearlyNotes = normalizeYearlyNotes(data.yearlyNotes);
            setYearlyNotes(nextYearlyNotes);
            window.localStorage.setItem(YEARLY_NOTES_KEY, JSON.stringify(nextYearlyNotes));
          }
          if (isTargetState(data.targetState)) {
            const cloudTime = new Date(data.targetState.updatedAt).getTime();
            const localTime = new Date(savedTargetUpdatedAt).getTime();
            const localTaskIds = savedTargetIds.length ? savedTargetIds : legacyTargetId ? [legacyTargetId] : [];
            if (cloudTime >= localTime && (data.targetState.taskIds.length >= localTaskIds.length || localTime > 0)) {
              applyTargetState(data.targetState);
            } else if (localTaskIds.length) {
              setTargetUpdatedAt(new Date().toISOString());
            }
          }
        } else {
          await fetch('/api/goals', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              store: localStore,
              targetState: {
                taskIds: savedTargetIds.length ? savedTargetIds : legacyTargetId ? [legacyTargetId] : [],
                taskMinutes: savedTargetMinutes,
                mode: savedFocusMode,
                stopwatchStartedAt: savedStopwatchStartedAt,
                stopwatchElapsedMs: Number.isFinite(savedStopwatchElapsed) && savedStopwatchElapsed >= 0 ? savedStopwatchElapsed : 0,
                endAt: savedEndAt,
                running:
                  window.localStorage.getItem(TARGET_RUNNING_KEY) === 'true' &&
                  (savedFocusMode === 'stopwatch' ? Boolean(savedStopwatchStartedAt) : Boolean(savedEndAt)),
                remainingMs: Number.isFinite(savedRemaining) && savedRemaining >= 0 ? Math.min(savedTargetDurationMs, savedRemaining) : savedTargetDurationMs,
                durationMs: savedTargetDurationMs,
                durationMinutes: savedTargetDurationMinutes,
                dailyGoalMinutes: savedFocusDailyGoalMinutes,
                focusLogged: savedTargetFocusLogged,
                mustTaskStopwatches: savedMustTaskStopwatches,
                updatedAt: savedTargetUpdatedAt
              },
              weeklyPlan: localWeeklyPlan,
              yearlyNotes: localYearlyNotes
            })
          });
        }
        setCloudReady(true);
        setSyncState('saved');
        setTimerSyncState('saved');
        setLastSavedAt(new Date().toISOString());
      } catch {
        if (!cancelled) {
          setCloudReady(false);
          setSyncState('local');
          setTimerSyncState('local');
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    async function loadCloudActivities() {
      try {
        const response = await fetch('/api/goals/activities', { cache: 'no-store' });
        if (!response.ok) throw new Error('Cloud activity database is not ready.');
        const data = (await response.json()) as { activities?: GoalActivity[] };
        if (cancelled) return;
        if (Array.isArray(data.activities) && data.activities.length) {
          setActivities(data.activities);
          window.localStorage.setItem(ACTIVITY_KEY, JSON.stringify(data.activities));
        } else if (localActivities.length) {
          await Promise.all(
            localActivities.map((activity) =>
              fetch('/api/goals/activities', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ activity })
              })
            )
          );
        }
      } catch {
        if (!cancelled) {
          // keep local fallback
        }
      }
    }

    loadCloudStore();
    loadCloudActivities();
    return () => {
      cancelled = true;
    };
  }, [applyTargetState]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const hadController = Boolean(navigator.serviceWorker.controller);
      let refreshing = false;
      const handleControllerChange = () => {
        if (!hadController || refreshing) return;
        refreshing = true;
        window.location.reload();
      };
      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
      navigator.serviceWorker
        .register('/sw.js', { updateViaCache: 'none' })
        .then(async (registration) => {
          await registration.update();
          if (!('PushManager' in window) || !('Notification' in window)) {
            setPushAlarmStatus('unsupported');
            return;
          }
          const existing = await registration.pushManager.getSubscription();
          setPushAlarmStatus(existing ? 'on' : 'off');
        })
        .catch(() => {
          setPushAlarmStatus('unsupported');
        });
      return () => navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    } else {
      setPushAlarmStatus('unsupported');
    }
    return undefined;
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCurrentDateKey(toISODate(new Date()));
    }, 60000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (ready) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }, [ready, store]);

  useEffect(() => {
    if (ready) window.localStorage.setItem(ACTIVITY_KEY, JSON.stringify(activities));
  }, [activities, ready]);

  useEffect(() => {
    if (ready) window.localStorage.setItem(WEEKLY_PLAN_KEY, JSON.stringify(weeklyPlan));
  }, [ready, weeklyPlan]);

  useEffect(() => {
    if (ready) window.localStorage.setItem(YEARLY_NOTES_KEY, JSON.stringify(yearlyNotes));
  }, [ready, yearlyNotes]);

  useEffect(() => {
    if (ready) window.localStorage.setItem(MAIN_GOAL_KEY, mainGoalId);
  }, [mainGoalId, ready]);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(TARGET_TASKS_KEY, JSON.stringify(targetTaskIds));
    setMainGoalId(targetTaskIds[0] || '');
  }, [ready, targetTaskIds]);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(TARGET_TASK_MINUTES_KEY, JSON.stringify(targetTaskMinutes));
  }, [ready, targetTaskMinutes]);

  useEffect(() => {
    if (!ready) return;
    if (targetEndAt) window.localStorage.setItem(TARGET_TIMER_KEY, targetEndAt);
    else window.localStorage.removeItem(TARGET_TIMER_KEY);
    window.localStorage.setItem(TARGET_MODE_KEY, focusMode);
    if (stopwatchStartedAt) window.localStorage.setItem(STOPWATCH_STARTED_KEY, stopwatchStartedAt);
    else window.localStorage.removeItem(STOPWATCH_STARTED_KEY);
    window.localStorage.setItem(STOPWATCH_ELAPSED_KEY, String(Math.max(0, Math.round(stopwatchElapsedMs))));
    window.localStorage.setItem(TARGET_REMAINING_KEY, String(Math.max(0, Math.round(targetRemainingMs))));
    window.localStorage.setItem(TARGET_RUNNING_KEY, targetRunning ? 'true' : 'false');
    window.localStorage.setItem(TARGET_DURATION_MINUTES_KEY, String(targetDurationMinutes));
    window.localStorage.setItem(FOCUS_DAILY_GOAL_KEY, String(focusDailyGoalMinutes));
    window.localStorage.setItem(TARGET_FOCUS_LOGGED_KEY, targetFocusLogged ? 'true' : 'false');
    window.localStorage.setItem(TARGET_UPDATED_KEY, targetUpdatedAt);
  }, [focusDailyGoalMinutes, focusMode, ready, stopwatchElapsedMs, stopwatchStartedAt, targetDurationMinutes, targetEndAt, targetFocusLogged, targetRemainingMs, targetRunning, targetUpdatedAt]);

  useEffect(() => {
    if (ready) window.localStorage.setItem(MUST_TASK_STOPWATCHES_KEY, JSON.stringify(mustTaskStopwatches));
  }, [mustTaskStopwatches, ready]);

  useEffect(() => {
    if (!targetDurationEditing) setTargetDurationDraft(String(targetDurationMinutes));
  }, [targetDurationEditing, targetDurationMinutes]);

  useEffect(() => {
    if (!focusDailyGoalEditing) setFocusDailyGoalDraft(String(focusDailyGoalMinutes));
  }, [focusDailyGoalEditing, focusDailyGoalMinutes]);

  useEffect(() => {
    if (editing) return;
    if (scope !== 'today') return;
    const text = draft.text.trim();
    if (!text) return;
    if (draft.block !== 'habit' && !isHabitTask(text)) return;
    const defaultWeight = String(defaultHabitWeight(text));
    setDraft((current) => (current.weight === defaultWeight ? current : { ...current, weight: defaultWeight }));
  }, [draft.block, draft.text, editing, scope]);

  useEffect(() => {
    setTimerNow(Date.now());
    const interval = window.setInterval(() => {
      setTimerNow(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!ready) return;
    setStore((current) => {
      const nextToday = current.today.filter((task) => shouldKeepTodayTask(task, currentDateKey));
      if (nextToday.length === current.today.length) return current;
      return { ...current, today: nextToday };
    });
  }, [currentDateKey, ready]);

  useEffect(() => {
    if (!ready) return;
    setStore((current) => ensureHabitTemplates(current, activities, currentDateKey));
  }, [activities, currentDateKey, ready]);

  useEffect(() => {
    if (!ready || !targetTaskIds.length) return;
    const validIds = targetTaskIds.filter((taskId) => store.today.some((task) => task.id === taskId && !task.done));
    if (validIds.length !== targetTaskIds.length) {
      setTargetTaskIds(validIds);
      setTargetTaskMinutes((current) => Object.fromEntries(Object.entries(current).filter(([taskId]) => validIds.includes(taskId))));
      markTargetChanged();
    }
    if (!validIds.length) {
      setTargetEndAt('');
      setTargetRunning(false);
      setStopwatchStartedAt('');
      setStopwatchElapsedMs(0);
      setTargetFocusLogged(false);
      setTargetRemainingMs(targetDurationMinutes * 60000);
      markTargetChanged();
    }
  }, [markTargetChanged, ready, store.today, targetDurationMinutes, targetTaskIds]);

  useEffect(() => {
    if (!ready || !cloudReady) return;
    setSyncState('saving');
    setTimerSyncState('saving');
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch('/api/goals', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            store,
            targetState: {
              taskIds: targetTaskIds,
              taskMinutes: targetTaskMinutes,
              mode: focusMode,
              stopwatchStartedAt,
              stopwatchElapsedMs,
              endAt: targetEndAt,
              running: targetRunning,
              remainingMs: targetRunning && targetEndAt ? Math.max(0, new Date(targetEndAt).getTime() - Date.now()) : targetRemainingMs,
              durationMs: targetDurationMinutes * 60000,
              durationMinutes: targetDurationMinutes,
              dailyGoalMinutes: focusDailyGoalMinutes,
              focusLogged: targetFocusLogged,
              mustTaskStopwatches,
              updatedAt: targetUpdatedAt
            },
            weeklyPlan,
            yearlyNotes
          })
        });
        if (!response.ok) throw new Error('Save failed.');
        setSyncState('saved');
        setTimerSyncState('saved');
        setLastSavedAt(new Date().toISOString());
      } catch {
        setSyncState('error');
        setTimerSyncState('error');
      }
    }, SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [cloudReady, focusDailyGoalMinutes, focusMode, mustTaskStopwatches, ready, stopwatchElapsedMs, stopwatchStartedAt, store, targetDurationMinutes, targetEndAt, targetFocusLogged, targetRemainingMs, targetRunning, targetTaskIds, targetTaskMinutes, targetUpdatedAt, weeklyPlan, yearlyNotes]);

  useEffect(() => {
    if (!ready || !cloudReady) return;
    const todayIst = toIstDateKey();
    if (istHour() < 3) return;
    if (window.localStorage.getItem(HABIT_MISS_ROLLOVER_KEY) === todayIst) return;
    window.localStorage.setItem(HABIT_MISS_ROLLOVER_KEY, todayIst);
    void fetch('/api/goals/rollover', { method: 'POST' })
      .then((response) => (response.ok ? fetch('/api/goals/activities', { cache: 'no-store' }) : null))
      .then(async (response) => {
        if (!response) return;
        const data = (await response.json()) as { activities?: GoalActivity[] };
        if (Array.isArray(data.activities)) {
          setActivities(data.activities);
          window.localStorage.setItem(ACTIVITY_KEY, JSON.stringify(data.activities));
        }
      })
      .catch(() => {
        window.localStorage.removeItem(HABIT_MISS_ROLLOVER_KEY);
      });
  }, [cloudReady, ready]);

  useEffect(() => {
    if (!ready || !cloudReady) return;
    const interval = window.setInterval(async () => {
      try {
        const response = await fetch('/api/goals', { cache: 'no-store' });
        if (!response.ok) return;
        const data = (await response.json()) as { targetState?: unknown };
        if (!isTargetState(data.targetState)) return;
        if (new Date(data.targetState.updatedAt).getTime() > new Date(targetUpdatedAt).getTime()) {
          const cloudIds = data.targetState.taskIds.join('|');
          const localIds = targetTaskIds.join('|');
          const cloudMinutes = targetMinutesSignature(data.targetState.taskMinutes);
          const localMinutes = targetMinutesSignature(targetTaskMinutes);
          const cloudDurationMinutes = normalizeTimerMinutes(data.targetState.durationMinutes ?? (data.targetState.durationMs ? data.targetState.durationMs / 60000 : undefined));
          const cloudDailyGoalMinutes = normalizeTimerMinutes(data.targetState.dailyGoalMinutes);
          const cloudMode = data.targetState.mode === 'stopwatch' ? 'stopwatch' : 'timer';
          const cloudStopwatchElapsed = Math.round(Math.max(0, data.targetState.stopwatchElapsedMs || 0) / 1000);
          const localStopwatchElapsed = Math.round(Math.max(0, stopwatchElapsedMs) / 1000);
          const cloudMustTaskStopwatches = mustTaskStopwatchesSignature(data.targetState.mustTaskStopwatches);
          const localMustTaskStopwatches = mustTaskStopwatchesSignature(mustTaskStopwatches);
          const cloudRemaining = Math.round(data.targetState.remainingMs / 1000);
          const localRemainingMs = targetRunning && targetEndAt ? Math.max(0, new Date(targetEndAt).getTime() - Date.now()) : targetRemainingMs;
          const localRemaining = Math.round(localRemainingMs / 1000);
          if (
            cloudIds !== localIds ||
            cloudMinutes !== localMinutes ||
            cloudDurationMinutes !== targetDurationMinutes ||
            cloudDailyGoalMinutes !== focusDailyGoalMinutes ||
            cloudMode !== focusMode ||
            cloudStopwatchElapsed !== localStopwatchElapsed ||
            cloudMustTaskStopwatches !== localMustTaskStopwatches ||
            (data.targetState.stopwatchStartedAt || '') !== stopwatchStartedAt ||
            Boolean(data.targetState.focusLogged) !== targetFocusLogged ||
            data.targetState.running !== targetRunning ||
            Math.abs(cloudRemaining - localRemaining) > 5
          ) {
            setTargetConflict(data.targetState);
            setTimerSyncState('conflict');
          } else {
            applyTargetState(data.targetState);
            setTimerSyncState('saved');
          }
        }
      } catch {
        // Keep the local timer running when background refresh is unavailable.
      }
    }, 10000);
    return () => window.clearInterval(interval);
  }, [applyTargetState, cloudReady, focusDailyGoalMinutes, focusMode, mustTaskStopwatches, ready, stopwatchElapsedMs, stopwatchStartedAt, targetDurationMinutes, targetEndAt, targetFocusLogged, targetRemainingMs, targetRunning, targetTaskIds, targetTaskMinutes, targetUpdatedAt]);

  const activeTasks = store[scope];
  const completion = useMemo(() => buildScopeCompletion(activeTasks), [activeTasks]);
  const sectionCompletion = useMemo(
    () => ({
      weekly: buildScopeCompletion(store.weekly),
      monthly: buildScopeCompletion(store.monthly),
      yearly: buildScopeCompletion(store.yearly)
    }),
    [store.monthly, store.weekly, store.yearly]
  );
  const yearlyPointsTracker = useMemo(
    () =>
      ([
        ['Today', 'today'],
        ['Weekly', 'weekly'],
        ['Weekend', 'weekend'],
        ['Monthly', 'monthly'],
        ['Yearly', 'yearly']
      ] as Array<[string, Scope]>).map(([label, itemScope]) => ({
        label,
        scope: itemScope,
        completion: buildScopeCompletion(store[itemScope]),
        completedTasks: store[itemScope].filter((task) => task.done)
      })),
    [store]
  );

  const trendWindow = useMemo(() => {
    const days: Date[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      days.push(d);
    }
    return days;
  }, []);

  const monthWindow = useMemo(() => {
    const today = new Date(`${currentDateKey}T00:00:00`);
    const cycleStart = new Date(`${buildCounterCycleStart(currentDateKey)}T00:00:00`);
    const days: Date[] = [];
    const cursor = new Date(cycleStart);
    while (cursor <= today) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }, [currentDateKey]);

  const weeklyHabitMissWindow = useMemo(() => buildWeeklyHabitMissWindow(new Date(timerNow)), [timerNow]);
  const previousWeeklyHabitMissWindow = useMemo(() => buildPreviousWeeklyHabitMissWindow(new Date(timerNow)), [timerNow]);

  const analytics = useMemo(() => buildAnalytics(activities, trendWindow), [activities, trendWindow]);
  const weeklyHabitInsights = useMemo(() => buildHabitInsights(activities, weeklyHabitMissWindow, previousWeeklyHabitMissWindow), [activities, previousWeeklyHabitMissWindow, weeklyHabitMissWindow]);

  const overallScore = useMemo(() => {
    if (!analytics.scorecard.length) return 0;
    return Math.round(analytics.scorecard.reduce((sum, item) => sum + item.score, 0) / analytics.scorecard.length);
  }, [analytics.scorecard]);

  const todayKey = currentDateKey;
  const threeDayHabitMissWarnings = useMemo(() => buildThreeDayHabitMissWarnings(activities, todayKey), [activities, todayKey]);
  const yesterdayKey = useMemo(() => {
    const date = new Date(`${currentDateKey}T00:00:00`);
    date.setDate(date.getDate() - 1);
    return toISODate(date);
  }, [currentDateKey]);

  const todayFocus = useMemo(() => {
    const todayActivities = activities.filter((activity) => activity.scope === 'today' && dateKeyFromValue(activity.createdAt) === todayKey && !isAutoHabitMiss(activity));
    const misses = todayActivities.filter((activity) => activity.kind === 'failure');
    const failedPoints = misses.reduce((total, activity) => total + activityPoints(activity), 0);
    const minutes = todayActivities.reduce((total, activity) => (activity.kind === 'completion' ? total + (activity.minutes || 0) : total), 0);
    const focusMinutes = completedFocusMinutes(todayActivities);
    return { misses, minutes, focusMinutes, failedPoints };
  }, [activities, todayKey]);

  const monthlyPointHistory = useMemo(() => buildPointHistory(activities, monthWindow), [activities, monthWindow]);
  const monthlySummaries = useMemo(
    () => activities.map(parseMonthlySummary).filter((summary): summary is MonthlySummary => Boolean(summary)).sort((a, b) => b.monthKey.localeCompare(a.monthKey)),
    [activities]
  );

  const yesterdaySummary = useMemo(() => {
    const yesterdayActivities = activities.filter((activity) => activity.scope === 'today' && dateKeyFromValue(activity.createdAt) === yesterdayKey && !isAutoHabitMiss(activity));
    const completed = yesterdayActivities.reduce((total, activity) => {
      if (activity.kind === 'completion') return total + 1;
      if (activity.kind === 'undo') return Math.max(0, total - 1);
      return total;
    }, 0);
    const failures = yesterdayActivities.filter((activity) => activity.kind === 'failure').length;
    const minutes = yesterdayActivities.reduce((total, activity) => (activity.kind === 'completion' ? total + (activity.minutes || 0) : total), 0);
    const focusMinutes = completedFocusMinutes(yesterdayActivities);
    return { completed, failures, minutes, focusMinutes, hadActivity: yesterdayActivities.length > 0 };
  }, [activities, yesterdayKey]);

  const focusProgress = Math.min(100, Math.max(0, Math.round((todayFocus.focusMinutes / focusDailyGoalMinutes) * 100)));
  const focusStreak = useMemo(() => {
    const minutesByDay = new Map<string, number>();
    activities.forEach((activity) => {
      if (activity.scope !== 'today' || activity.kind !== 'focus-session') return;
      const dayKey = dateKeyFromValue(activity.createdAt);
      minutesByDay.set(dayKey, (minutesByDay.get(dayKey) || 0) + (activity.focusMinutes || 0));
    });
    const cursor = new Date(`${todayKey}T00:00:00Z`);
    if (Math.max(0, minutesByDay.get(todayKey) || 0) < focusDailyGoalMinutes) cursor.setUTCDate(cursor.getUTCDate() - 1);
    let streak = 0;
    for (let index = 0; index < 365; index += 1) {
      const dayKey = toISODate(cursor);
      if (Math.max(0, minutesByDay.get(dayKey) || 0) < focusDailyGoalMinutes) break;
      streak += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    return streak;
  }, [activities, focusDailyGoalMinutes, todayKey]);

  const strikeCounts = useMemo(() => buildStrikeCounts(activities, store.today, todayKey), [activities, store.today, todayKey]);
  const dayCounter = useMemo(() => buildDayCounter(todayKey), [todayKey]);
  const counterResetRemaining = useMemo(() => buildCounterResetRemaining(todayKey), [todayKey]);

  const failurePatterns = useMemo(() => {
    const counts = new Map<string, number>();
    analytics.failures.forEach((activity) => {
      const key = activity.reason || 'Missed';
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);
  }, [analytics.failures]);

  const targetTasks = useMemo(() => {
    return targetTaskIds.map((taskId) => store.today.find((task) => task.id === taskId)).filter((task): task is GoalTask => Boolean(task));
  }, [store.today, targetTaskIds]);

  const targetPlannedMinutes = useMemo(
    () => targetTasks.reduce((total, task) => total + (targetTaskMinutes[task.id] || 0), 0),
    [targetTaskMinutes, targetTasks]
  );

  const targetSequence = useMemo(() => {
    let cursorMs = 0;
    return targetTasks
      .map((task) => {
        const minutes = targetTaskMinutes[task.id] || 0;
        if (!minutes) return null;
        const startMs = cursorMs;
        const durationMs = minutes * 60000;
        cursorMs += durationMs;
        return { task, minutes, startMs, endMs: cursorMs, durationMs };
      })
      .filter((item): item is { task: GoalTask; minutes: number; startMs: number; endMs: number; durationMs: number } => Boolean(item));
  }, [targetTaskMinutes, targetTasks]);

  const targetPlannedDurationMs = targetDurationMinutes * 60000;
  const targetPlanSignature = `${targetTaskIds.join('|')}::${targetMinutesSignature(targetTaskMinutes)}::${targetPlannedDurationMs}`;
  const istClockLabel = useMemo(() => (timerNow ? formatIstClock(timerNow) : '--:--:--'), [timerNow]);

  const mainGoal = targetTasks[0] || null;

  const targetTimer = useMemo(() => {
    const endTime = targetEndAt ? new Date(targetEndAt).getTime() : 0;
    const runningRemainingMs = endTime ? Math.max(0, endTime - timerNow) : targetRemainingMs;
    const remainingMs = Math.min(targetPlannedDurationMs, targetRunning ? runningRemainingMs : targetRemainingMs);
    const elapsedMs = Math.max(0, targetPlannedDurationMs - remainingMs);
    const activeSegmentIndex = targetSequence.findIndex((segment) => elapsedMs < segment.endMs);
    const activeSegment =
      activeSegmentIndex >= 0 ? targetSequence[activeSegmentIndex] : targetSequence[targetSequence.length - 1] || null;
    const activeDisplayIndex = activeSegmentIndex >= 0 ? activeSegmentIndex : activeSegment ? targetSequence.length - 1 : -1;
    const activeTaskRemainingMs = activeSegment ? Math.max(0, activeSegment.endMs - elapsedMs) : remainingMs;
    const progress = targetTasks.length ? Math.min(100, Math.max(0, Math.round(((targetPlannedDurationMs - remainingMs) / targetPlannedDurationMs) * 100))) : 0;
    return {
      active: Boolean(targetTasks.length),
      running: Boolean(targetTasks.length && targetRunning && endTime && remainingMs > 0),
      complete: Boolean(targetTasks.length && remainingMs <= 0),
      remainingMs,
      activeTask: activeSegment?.task || null,
      activeTaskIndex: activeDisplayIndex,
      activeTaskMinutes: activeSegment?.minutes || 0,
      activeTaskRemainingMs,
      progress,
      label: formatCountdown(activeSegment ? activeTaskRemainingMs : remainingMs)
    };
  }, [targetEndAt, targetPlannedDurationMs, targetRemainingMs, targetRunning, targetSequence, targetTasks.length, timerNow]);

  const effectiveStopwatchElapsedMs = Math.max(
    0,
    stopwatchElapsedMs +
      (focusMode === 'stopwatch' && targetRunning && stopwatchStartedAt ? Math.max(0, timerNow - new Date(stopwatchStartedAt).getTime()) : 0)
  );
  const stopwatchSegmentIndex = targetSequence.findIndex((segment) => effectiveStopwatchElapsedMs < segment.endMs);
  const stopwatchSegment =
    stopwatchSegmentIndex >= 0 ? targetSequence[stopwatchSegmentIndex] : targetSequence[targetSequence.length - 1] || null;
  const focusActiveTask = focusMode === 'stopwatch' ? stopwatchSegment?.task || targetTasks[0] || null : targetTimer.activeTask;
  const focusActiveTaskIndex =
    focusMode === 'stopwatch'
      ? stopwatchSegmentIndex >= 0
        ? stopwatchSegmentIndex
        : stopwatchSegment
          ? targetSequence.length - 1
          : -1
      : targetTimer.activeTaskIndex;
  const focusElapsedMs = focusMode === 'stopwatch' ? effectiveStopwatchElapsedMs : Math.max(0, targetPlannedDurationMs - targetTimer.remainingMs);
  const focusRunning = focusMode === 'stopwatch' ? Boolean(targetTasks.length && targetRunning && stopwatchStartedAt) : targetTimer.running;
  const focusComplete = focusMode === 'timer' && targetTimer.complete;
  const focusPeriodProgress =
    focusMode === 'stopwatch'
      ? Math.min(100, Math.max(0, Math.round((effectiveStopwatchElapsedMs / targetPlannedDurationMs) * 100)))
      : targetTimer.activeTaskMinutes
        ? Math.min(100, Math.max(0, Math.round(((targetTimer.activeTaskMinutes * 60000 - targetTimer.activeTaskRemainingMs) / (targetTimer.activeTaskMinutes * 60000)) * 100)))
        : targetTimer.progress;
  const focusPeriodLabel = focusMode === 'stopwatch' ? formatElapsed(effectiveStopwatchElapsedMs) : focusComplete ? '00:00' : targetTimer.label;
  const dailyPriorityFocus = DAILY_PRIORITY_STRIKE_KEYS.map((code) => {
    const task = store.today.find((item) => normalizeStrikeCode(item.text) === code) || null;
    const minutes = activities.reduce((total, activity) => {
      if (
        activity.scope === 'today' &&
        activity.kind === 'focus-session' &&
        dateKeyFromValue(activity.createdAt) === todayKey &&
        normalizeStrikeCode(activity.taskText) === code
      ) {
        return total + Math.max(0, Math.round(activity.focusMinutes || 0));
      }
      return total;
    }, 0);
    const stopwatch = mustTaskStopwatches[code];
    const isActive = Boolean(stopwatch?.running && stopwatch.startedAt);
    const liveElapsedMs = Math.max(
      0,
      (stopwatch?.elapsedMs || 0) + (isActive ? Math.max(0, timerNow - new Date(stopwatch?.startedAt || '').getTime()) : 0)
    );
    return {
      code,
      task,
      label: habitLabels[code] || code,
      color: DAILY_PRIORITY_FOCUS_COLORS[code],
      minutes,
      isActive,
      liveElapsedMs
    };
  });
  const activeMustTaskFocus = dailyPriorityFocus.filter((item) => item.isActive);
  const mustTaskCombinedLiveMs = activeMustTaskFocus.reduce((total, item) => total + item.liveElapsedMs, 0);
  const mustTaskRealLiveMs = activeMustTaskFocus.length
    ? Math.max(0, timerNow - Math.min(...activeMustTaskFocus.map((item) => new Date(mustTaskStopwatches[item.code]?.startedAt || '').getTime())))
    : 0;

  useEffect(() => {
    if (!ready) return;
    if (!targetPlanSignatureRef.current) {
      targetPlanSignatureRef.current = targetPlanSignature;
      return;
    }
    if (targetPlanSignatureRef.current !== targetPlanSignature && !targetRunning) {
      targetPlanSignatureRef.current = targetPlanSignature;
      setTargetRemainingMs(targetPlannedDurationMs);
      setTargetFocusLogged(false);
      return;
    }
    targetPlanSignatureRef.current = targetPlanSignature;
  }, [ready, targetPlanSignature, targetPlannedDurationMs, targetRunning]);

  useEffect(() => {
    if (!ready || !('Notification' in window) || Notification.permission !== 'granted') return;

    function maybeNotify() {
      const now = new Date();
      const hour = now.getHours();
      if (hour < 6 || hour > 23 || hour % 2 !== 0) return;
      const key = `${toISODate(now)}-${hour}`;
      if (window.localStorage.getItem(NOTIFICATION_LAST_KEY) === key) return;
      const body = targetTasks.length ? `Next target: ${targetTasks.map((task) => task.text).join(', ')}` : 'Choose your next target for today.';
      window.localStorage.setItem(NOTIFICATION_LAST_KEY, key);
      showGoalNotification('SG Goals check-in', body, `sg-goals-${key}`);
    }

    maybeNotify();
    const interval = window.setInterval(maybeNotify, 60000);
    return () => window.clearInterval(interval);
  }, [ready, showGoalNotification, targetTasks]);

  useEffect(() => {
    if (!ready || focusMode !== 'timer' || !targetTasks.length || !targetTimer.complete) return;
    const key = `${targetTaskIds.join(',')}-${targetEndAt || 'paused'}-${toISODate(new Date())}`;
    if (window.localStorage.getItem(TARGET_NOTIFICATION_KEY) === key) return;
    window.localStorage.setItem(TARGET_NOTIFICATION_KEY, key);
    setTargetRunning(false);
    setTargetEndAt('');
    setTargetRemainingMs(0);
    markTargetChanged();
    if ('vibrate' in navigator) navigator.vibrate([500, 200, 500, 200, 500]);
    showGoalNotification('Target queue complete', `Time is up for: ${targetTasks.map((task) => task.text).join(', ')}`, 'sg-goals-target-complete');
  }, [focusMode, markTargetChanged, ready, showGoalNotification, targetEndAt, targetTaskIds, targetTasks, targetTimer.complete]);

  const dailyStatus = useMemo(() => {
    const status: Record<string, { completed: number; failures: number; total: number; state: 'green' | 'red' | 'none' }> = {};
    const todayTotal = store.today.length;
    const todayDone = store.today.filter((task) => task.done).length;
    if (todayTotal) {
      status[todayKey] = {
        completed: todayDone,
        failures: activities.filter((activity) => activity.scope === 'today' && activity.kind === 'failure' && dateKeyFromValue(activity.createdAt) === todayKey).length,
        total: todayTotal,
        state: todayDone === todayTotal ? 'green' : todayDone > 0 ? 'red' : 'none'
      };
    }

    activities
      .filter((activity) => activity.scope === 'today')
      .forEach((activity) => {
        const key = dateKeyFromValue(activity.createdAt);
        if (!status[key]) status[key] = { completed: 0, failures: 0, total: todayTotal, state: 'none' };
        if (activity.kind === 'completion') status[key].completed += 1;
        if (activity.kind === 'undo') status[key].completed = Math.max(0, status[key].completed - 1);
        if (activity.kind === 'failure') status[key].failures += 1;
      });

    Object.keys(status).forEach((key) => {
      const day = status[key];
      const total = Math.max(day.total, todayTotal);
      day.total = total;
      day.state = total > 0 && day.completed >= total && day.failures === 0 ? 'green' : day.completed > 0 || day.failures > 0 ? 'red' : 'none';
    });

    return status;
  }, [activities, store.today, todayKey]);

  const calendarDays = useMemo(() => {
    const year = calendarCursor.getFullYear();
    const month = calendarCursor.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    return [
      ...Array.from({ length: firstDay }, (_, index) => ({ key: `empty-${index}`, day: 0, date: null as Date | null, status: 'none' as const })),
      ...Array.from({ length: daysInMonth }, (_, index) => {
        const date = new Date(year, month, index + 1);
        const key = toISODate(date);
        return { key, day: index + 1, date, status: dailyStatus[key]?.state || ('none' as const) };
      })
    ];
  }, [calendarCursor, dailyStatus]);

  const streaks = useMemo(() => {
    let current = 0;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    for (let i = 0; i < 365; i += 1) {
      const key = toISODate(cursor);
      if (dailyStatus[key]?.state !== 'green') break;
      current += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    let best = 0;
    let running = 0;
    const sortedKeys = Object.keys(dailyStatus).sort();
    sortedKeys.forEach((key) => {
      if (dailyStatus[key].state === 'green') {
        running += 1;
        best = Math.max(best, running);
      } else if (dailyStatus[key].state === 'red') {
        running = 0;
      }
    });

    return { current, best };
  }, [dailyStatus]);

  function persist(mutator: (current: GoalsStore) => GoalsStore) {
    setStore((current) => mutator(current));
  }

  function appendActivity(activity: GoalActivity, syncToCloud = true) {
    setActivities((current) => {
      const next = [activity, ...current];
      if (ready) window.localStorage.setItem(ACTIVITY_KEY, JSON.stringify(next));
      return next;
    });

    if (syncToCloud && cloudReady) {
      void fetch('/api/goals/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activity })
      }).catch(() => {
        setSyncState('error');
      });
    }
  }

  async function refreshActivitiesFromCloud() {
    const response = await fetch('/api/goals/activities', { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not refresh activities.');
    const data = (await response.json()) as { activities?: GoalActivity[] };
    if (Array.isArray(data.activities)) {
      setActivities(data.activities);
      window.localStorage.setItem(ACTIVITY_KEY, JSON.stringify(data.activities));
    }
  }

  async function runHabitMissCheckNow() {
    setHabitCheckState('running');
    try {
      const response = await fetch('/api/goals/rollover', { method: 'POST' });
      if (!response.ok) throw new Error('Habit check failed.');
      await refreshActivitiesFromCloud();
      setHabitCheckState('done');
      window.setTimeout(() => setHabitCheckState('idle'), 2500);
    } catch {
      setHabitCheckState('error');
    }
  }

  function resetDraft() {
    setEditing(null);
    setDraft({ text: '', note: '', dueTime: '', priority: 'career', block: 'morning', allowSubtasks: false, weight: '1' });
  }

  function updateWeeklyPlan(field: keyof Omit<WeeklyPlan, 'updatedAt'>, value: string) {
    setWeeklyPlan((current) => ({
      ...current,
      [field]: value,
      updatedAt: new Date().toISOString()
    }));
  }

  function clearWeeklyPlan() {
    setWeeklyPlan({
      ...emptyWeeklyPlan,
      updatedAt: new Date().toISOString()
    });
  }

  function updateYearlyBooks(value: string) {
    setYearlyNotes((current) => ({
      ...current,
      completedBooks: value,
      updatedAt: new Date().toISOString()
    }));
  }

  function updateYearlyPunishment(value: string) {
    setYearlyNotes((current) => ({
      ...current,
      punishment: value,
      updatedAt: new Date().toISOString()
    }));
  }

  function updateYearlyGoalBreakdown(taskId: string, field: 'monthlyMilestone' | 'weeklyAction' | 'dailyHabit', value: string) {
    setYearlyNotes((current) => {
      const existing = current.goalBreakdowns[taskId] || { monthlyMilestone: '', weeklyAction: '', dailyHabit: '' };
      return {
        ...current,
        goalBreakdowns: {
          ...current.goalBreakdowns,
          [taskId]: {
            ...existing,
            [field]: value
          }
        },
        updatedAt: new Date().toISOString()
      };
    });
  }

  function saveTask() {
    const text = draft.text.trim();
    if (!text) return;
    const note = composeTaskNote(draft.note.trim() || undefined, scope === 'today' ? draft.dueTime : '');
    const priority = scope === 'today' || scope === 'weekend' ? 'other' : draft.priority;
    const taskBlock = scope === 'today' ? (isHabitTask(text) ? 'habit' : draft.block) : undefined;
    const weight = normalizeTaskWeight(draft.weight, taskBlock === 'habit' ? defaultHabitWeight(text) : 1);
    persist((current) => {
      const next = { ...current };
      if (editing) {
        next[scope] = current[scope].map((task) =>
          task.id === editing.id
            ? { ...task, text, note, priority, block: taskBlock, weight, allowSubtasks: draft.allowSubtasks, updatedAt: new Date().toISOString() }
            : task
        );
      } else {
        next[scope] = [...current[scope], makeTask(text, note, priority, taskBlock, draft.allowSubtasks, weight)];
      }
      return next;
    });
    resetDraft();
  }

  function addTomorrowTask() {
    const text = tomorrowDraft.text.trim();
    if (!text) return;
    const note = composeTaskNote(tomorrowDraft.note.trim() || undefined, tomorrowDraft.dueTime);
    persist((current) => ({
      ...current,
      tomorrow: [...current.tomorrow, makeTask(text, note, 'other')]
    }));
    setTomorrowDraft({ text: '', note: '', dueTime: '' });
  }

  function deleteTomorrowTask(taskId: string) {
    persist((current) => ({
      ...current,
      tomorrow: current.tomorrow.filter((task) => task.id !== taskId)
    }));
  }

  function requestMainGoalNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }

  async function enableReliableAlarm() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setPushAlarmStatus('unsupported');
      return;
    }
    setPushAlarmStatus('saving');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushAlarmStatus('off');
        return;
      }
      const keyResponse = await fetch('/api/goals/push-key', { cache: 'no-store' });
      const keyData = (await keyResponse.json()) as { publicKey?: string; enabled?: boolean };
      if (!keyResponse.ok || !keyData.enabled || !keyData.publicKey) {
        throw new Error('Push key is not configured.');
      }
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyData.publicKey)
        }));
      const saveResponse = await fetch('/api/goals/push-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription })
      });
      if (!saveResponse.ok) throw new Error('Subscription save failed.');
      setPushAlarmStatus('on');
    } catch {
      setPushAlarmStatus('error');
    }
  }

  function toggleTargetTask(taskId: string) {
    setTargetTaskIds((current) => {
      if (current.includes(taskId)) {
        setTargetTaskMinutes((minutes) => {
          const next = { ...minutes };
          delete next[taskId];
          return next;
        });
        return current.filter((id) => id !== taskId);
      }
      return [...current, taskId];
    });
    if (!targetRunning) {
      setTargetEndAt('');
      setTargetRemainingMs(targetPlannedDurationMs);
    } else {
      setTargetRemainingMs((current) => (current <= 0 ? targetPlannedDurationMs : current));
    }
    window.localStorage.removeItem(TARGET_NOTIFICATION_KEY);
    markTargetChanged();
    requestMainGoalNotificationPermission();
  }

  function moveTargetTask(taskId: string, direction: -1 | 1) {
    setTargetTaskIds((current) => {
      const index = current.indexOf(taskId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
    if (!targetRunning) {
      setTargetEndAt('');
      setTargetRemainingMs(targetPlannedDurationMs);
      window.localStorage.removeItem(TARGET_NOTIFICATION_KEY);
    }
    markTargetChanged();
  }

  function updateTargetTaskMinutes(taskId: string, value: string) {
    const minutes = Number(value);
    setTargetTaskMinutes((current) => {
      const next = { ...current };
      if (!value || !Number.isFinite(minutes) || minutes <= 0) delete next[taskId];
      else next[taskId] = normalizeTimerMinutes(minutes);
      return next;
    });
    markTargetChanged();
  }

  function adjustTargetTaskMinutes(taskId: string, delta: number) {
    setTargetTaskMinutes((current) => {
      const currentMinutes = current[taskId] || 0;
      const nextMinutes = Math.min(1440, Math.max(0, currentMinutes + delta));
      const next = { ...current };
      if (!nextMinutes) delete next[taskId];
      else next[taskId] = nextMinutes;
      return next;
    });
    markTargetChanged();
  }

  function updateTargetDurationMinutes(value: string) {
    const cleanValue = value.replace(/[^\d]/g, '');
    setTargetDurationDraft(cleanValue);
    if (!cleanValue) return;
    const nextMinutes = normalizeTimerMinutes(cleanValue);
    const nextDurationMs = nextMinutes * 60000;
    setTargetDurationMinutes(nextMinutes);
    if (!targetRunning) {
      setTargetEndAt('');
      setTargetRemainingMs(nextDurationMs);
      setTargetFocusLogged(false);
    } else {
      const elapsedMs = Math.max(0, targetPlannedDurationMs - targetTimer.remainingMs);
      const nextRemainingMs = Math.max(0, nextDurationMs - elapsedMs);
      setTargetRemainingMs(nextRemainingMs);
      setTargetEndAt(new Date(Date.now() + nextRemainingMs).toISOString());
    }
    window.localStorage.removeItem(TARGET_NOTIFICATION_KEY);
    markTargetChanged();
  }

  function finishTargetDurationEdit() {
    setTargetDurationEditing(false);
    const nextMinutes = normalizeTimerMinutes(targetDurationDraft, targetDurationMinutes);
    setTargetDurationDraft(String(nextMinutes));
    if (nextMinutes !== targetDurationMinutes) updateTargetDurationMinutes(String(nextMinutes));
  }

  function updateFocusDailyGoal(value: string) {
    const cleanValue = value.replace(/[^\d]/g, '');
    setFocusDailyGoalDraft(cleanValue);
    if (!cleanValue) return;
    const nextMinutes = normalizeTimerMinutes(cleanValue);
    setFocusDailyGoalMinutes(nextMinutes);
    markTargetChanged();
  }

  function finishFocusDailyGoalEdit() {
    setFocusDailyGoalEditing(false);
    const nextMinutes = normalizeTimerMinutes(focusDailyGoalDraft, focusDailyGoalMinutes);
    setFocusDailyGoalDraft(String(nextMinutes));
    if (nextMinutes !== focusDailyGoalMinutes) updateFocusDailyGoal(String(nextMinutes));
  }

  function changeFocusMode(nextMode: 'timer' | 'stopwatch') {
    if (nextMode === focusMode) return;
    if (targetRunning) {
      if (focusMode === 'stopwatch' && stopwatchStartedAt) {
        setStopwatchElapsedMs((current) => current + Math.max(0, Date.now() - new Date(stopwatchStartedAt).getTime()));
        setStopwatchStartedAt('');
      } else if (focusMode === 'timer') {
        const endTime = targetEndAt ? new Date(targetEndAt).getTime() : 0;
        setTargetRemainingMs(endTime ? Math.max(0, endTime - Date.now()) : targetRemainingMs);
        setTargetEndAt('');
      }
      setTargetRunning(false);
    }
    setFocusMode(nextMode);
    setTargetFocusLogged(false);
    window.localStorage.removeItem(TARGET_NOTIFICATION_KEY);
    markTargetChanged();
  }

  function startMustTaskStopwatch(code: keyof MustTaskFocusMinutes, task: GoalTask) {
    if (task.done || mustTaskStopwatches[code]?.running) return;
    const now = new Date().toISOString();
    setMustTaskStopwatches((current) => ({
      ...current,
      [code]: { running: true, startedAt: now, elapsedMs: 0, updatedAt: now }
    }));
    markTargetChanged();
  }

  function finishMustTaskStopwatch(code: keyof MustTaskFocusMinutes, task: GoalTask) {
    const stopwatch = mustTaskStopwatches[code];
    if (!stopwatch?.running || !stopwatch.startedAt) return;
    const completedAt = new Date();
    const startedAt = new Date(stopwatch.startedAt);
    const elapsedMs = Math.max(0, stopwatch.elapsedMs + completedAt.getTime() - startedAt.getTime());
    if (elapsedMs < 1000) return;
    const focusMinutes = Math.max(1, Math.round(elapsedMs / 60000));
    const completedAtIso = completedAt.toISOString();
    appendActivity({
      id: activityId(),
      scope: 'today',
      priority: task.priority,
      taskText: habitLabels[code] || task.text,
      kind: 'focus-session',
      note: 'Completed must-task stopwatch session',
      minutes: focusMinutes,
      focusMinutes,
      startedAt: stopwatch.startedAt,
      completedAt: completedAtIso,
      createdAt: completedAtIso
    });
    setMustTaskStopwatches((current) => ({
      ...current,
      [code]: { running: false, startedAt: '', elapsedMs: 0, updatedAt: completedAtIso }
    }));
    markTargetChanged();
  }

  function toggleTargetTimer() {
    if (!targetTaskIds.length) return;
    if (focusMode === 'stopwatch') {
      if (targetRunning) {
        const startedAt = stopwatchStartedAt ? new Date(stopwatchStartedAt).getTime() : Date.now();
        setStopwatchElapsedMs((current) => current + Math.max(0, Date.now() - startedAt));
        setStopwatchStartedAt('');
        setTargetRunning(false);
        markTargetChanged();
        return;
      }
      if (targetFocusLogged) {
        setStopwatchElapsedMs(0);
        setTargetFocusLogged(false);
      }
      setStopwatchStartedAt(new Date().toISOString());
      setTargetEndAt('');
      setTargetRunning(true);
      markTargetChanged();
      return;
    }
    const plannedDurationMs = targetPlannedDurationMs;
    if (targetRunning) {
      const endTime = targetEndAt ? new Date(targetEndAt).getTime() : 0;
      setTargetRemainingMs(endTime ? Math.max(0, endTime - Date.now()) : targetRemainingMs);
      setTargetEndAt('');
      setTargetRunning(false);
      markTargetChanged();
      return;
    }
    const nextRemaining = targetRemainingMs <= 0 || targetRemainingMs > plannedDurationMs ? plannedDurationMs : targetRemainingMs;
    if (targetRemainingMs <= 0) setTargetFocusLogged(false);
    setTargetRemainingMs(nextRemaining);
    setTargetEndAt(new Date(Date.now() + nextRemaining).toISOString());
    setTargetRunning(true);
    window.localStorage.removeItem(TARGET_NOTIFICATION_KEY);
    markTargetChanged();
    requestMainGoalNotificationPermission();
  }

  function resetTargetTimer() {
    if (focusMode === 'stopwatch') {
      setStopwatchElapsedMs(0);
      setStopwatchStartedAt(targetRunning ? new Date().toISOString() : '');
      setTargetFocusLogged(false);
      markTargetChanged();
      return;
    }
    const plannedDurationMs = targetPlannedDurationMs;
    setTargetRemainingMs(plannedDurationMs);
    setTargetEndAt(targetRunning ? new Date(Date.now() + plannedDurationMs).toISOString() : '');
    setTargetFocusLogged(false);
    window.localStorage.removeItem(TARGET_NOTIFICATION_KEY);
    markTargetChanged();
  }

  function completeFocusPeriod() {
    if (!targetTaskIds.length || targetFocusLogged) return;
    const elapsedMs = focusElapsedMs;
    if (elapsedMs < 1000) return;
    const elapsedMinutes = Math.max(1, Math.round(elapsedMs / 60000));
    const now = new Date().toISOString();
    appendActivity({
      id: activityId(),
      scope: 'today',
      priority: focusActiveTask?.priority || mainGoal?.priority || 'other',
      taskText: focusActiveTask?.text || mainGoal?.text || 'Focus period',
      kind: 'focus-session',
      note: focusMode === 'stopwatch' ? 'Completed stopwatch focus period' : 'Completed timer focus period',
      minutes: elapsedMinutes,
      focusMinutes: elapsedMinutes,
      completedAt: now,
      createdAt: now
    });
    setTargetRunning(false);
    setTargetEndAt('');
    setStopwatchStartedAt('');
    if (focusMode === 'stopwatch') setStopwatchElapsedMs(0);
    else setTargetRemainingMs(0);
    setTargetFocusLogged(true);
    window.localStorage.removeItem(TARGET_NOTIFICATION_KEY);
    markTargetChanged();
  }

  function resetStrikeCount(family: StrikeFamily) {
    const now = new Date().toISOString();
    appendActivity({
      id: activityId(),
      scope: 'today',
      priority: 'other',
      taskText: `${family} count reset`,
      kind: 'strike-reset',
      note: family,
      createdAt: now
    });
  }

  function useCloudTargetConflict() {
    if (!targetConflict) return;
    applyTargetState(targetConflict);
    setTargetConflict(null);
    setTimerSyncState('saved');
  }

  function keepLocalTargetConflict() {
    setTargetConflict(null);
    setTimerSyncState('saving');
    markTargetChanged();
  }

  function beginEdit(task: GoalTask) {
    const noteInfo = splitTaskNote(task.note);
    setEditing(task);
    setDraft({ text: task.text, note: noteInfo.note || '', dueTime: noteInfo.dueTime, priority: task.priority, block: task.block || 'morning', allowSubtasks: task.allowSubtasks !== false, weight: String(taskWeight(task)) });
  }

  function toggleTask(taskId: string) {
    const currentTask = store[scope].find((task) => task.id === taskId);
    if (!currentTask) return;
    if (currentTask.done) {
      persist((current) => ({
        ...current,
        [scope]: current[scope].map((task) =>
          task.id === taskId
            ? { ...task, done: false, startedAt: undefined, completedAt: undefined, investedMinutes: undefined, updatedAt: new Date().toISOString() }
            : task
        )
      }));
      appendActivity({
        id: activityId(),
        scope,
        priority: currentTask.priority,
      taskText: currentTask.text,
      kind: 'undo',
      note: splitTaskNote(currentTask.note).note,
      points: taskWeight(currentTask),
      createdAt: new Date().toISOString()
    });
      return;
    }

    setTimingTask(currentTask);
    setTimingScope(scope);
    const now = new Date();
    const nowValue = formatClock(now);
    const todayKeyForTiming = toISODate(now);
    const previousCompletion = store[scope]
      .filter(
        (task) =>
          task.id !== taskId &&
          task.done &&
          task.completedAt &&
          dateKeyFromValue(task.completedAt) === todayKeyForTiming
      )
      .map((task) => new Date(task.completedAt as string))
      .filter((date) => !Number.isNaN(date.getTime()) && date.getTime() <= now.getTime())
      .sort((a, b) => b.getTime() - a.getTime())[0];
    const guessed = new Date(Date.now() - 30 * 60 * 1000);
    const guessedValue = previousCompletion ? formatClock(previousCompletion) : formatClock(guessed);
    setTimingStart(guessedValue);
    setTimingEnd(nowValue);
    updateTimingPreview(guessedValue, nowValue);
  }

  function updateTimingPreview(nextStart = timingStart, nextEnd = timingEnd) {
    if (!nextStart || !nextEnd) {
      setTimingPreview('-');
      return;
    }
    const start = parseTodayTime(nextStart);
    const end = parseTodayTime(nextEnd);
    if (!start || !end) {
      setTimingPreview('Invalid time');
      return;
    }
    const diffMs = end.getTime() - start.getTime();
    if (diffMs < 0) {
      setTimingPreview('End time must be after start time');
      return;
    }
    setTimingPreview(`Start ${nextStart} - End ${nextEnd} - Invested ${formatMinutes(Math.max(1, Math.round(diffMs / 60000)))}`);
  }

  function clearCompletedDailyTasks() {
    persist((current) => ({
      ...current,
      today: current.today.filter((task) => !task.done)
    }));
  }

  function resetHabitTasks() {
    persist((current) => {
      const remainingTasks = current.today.filter((task) => !isHabitTask(task.text) && !isRemovedHabitTask(task.text));
      const existingHabits = new Map(
        current.today
          .filter((task) => isHabitTask(task.text))
          .map((task) => [normalizeStrikeCode(task.text), task])
      );
      const freshHabits = HABIT_TASKS.map((text) => {
        const existing = existingHabits.get(normalizeStrikeCode(text));
        return existing
          ? {
              ...existing,
              text,
              block: 'habit' as const,
              weight: existing.weight ?? defaultHabitWeight(text),
              done: false,
              startedAt: undefined,
              completedAt: undefined,
              investedMinutes: undefined,
              updatedAt: new Date().toISOString()
            }
          : makeTask(text, undefined, 'other', 'habit', false, defaultHabitWeight(text));
      });
      return { ...current, today: [...remainingTasks, ...freshHabits] };
    });
  }

  function confirmTiming() {
    if (!timingTask) return;
    const startedAt = parseTodayTime(timingStart);
    const completedAt = parseTodayTime(timingEnd) || new Date();
    if (startedAt && completedAt.getTime() < startedAt.getTime()) {
      setTimingPreview('End time must be after start time');
      return;
    }
    const investedMinutes = startedAt ? Math.max(1, Math.round((completedAt.getTime() - startedAt.getTime()) / 60000)) : undefined;
    persist((current) => ({
      ...current,
      [timingScope]: current[timingScope].map((task) =>
        task.id === timingTask.id
          ? {
              ...task,
              done: true,
              startedAt: startedAt ? startedAt.toISOString() : undefined,
              completedAt: completedAt.toISOString(),
              investedMinutes,
              updatedAt: new Date().toISOString()
            }
          : task
      )
    }));
    appendActivity({
      id: activityId(),
      scope: timingScope,
      priority: timingTask.priority,
      taskText: timingTask.text,
      kind: 'completion',
      note: splitTaskNote(timingTask.note).note,
      points: taskWeight(timingTask),
      minutes: investedMinutes,
      startedAt: startedAt ? startedAt.toISOString() : undefined,
      completedAt: completedAt.toISOString(),
      createdAt: completedAt.toISOString()
    });
    if (timingScope === 'today' && targetTaskIds.includes(timingTask.id)) {
      setTargetTaskIds((current) => {
        const remaining = current.filter((taskId) => taskId !== timingTask.id);
        setTargetTaskMinutes((minutes) => {
          const remainingMinutes = { ...minutes };
          delete remainingMinutes[timingTask.id];
          return remainingMinutes;
        });
        if (!remaining.length) {
          setTargetEndAt('');
          setTargetRunning(false);
          setTargetRemainingMs(targetPlannedDurationMs);
          window.localStorage.removeItem(TARGET_NOTIFICATION_KEY);
        }
        markTargetChanged();
        return remaining;
      });
    }
    setTimingTask(null);
    setTimingScope('today');
    setTimingStart('');
    setTimingEnd('');
    setTimingPreview('-');
  }

  function openFailure(task: GoalTask) {
    setFailureTask(task);
    setFailureScope(scope);
    setFailureReason('Tired');
    setFailureNote('');
  }

  function saveFailure() {
    if (!failureTask) return;
    const now = new Date().toISOString();
    const noteInfo = splitTaskNote(failureTask.note);
    const failureDetails = [`Missed today: ${failureReason}`, failureNote.trim()].filter(Boolean).join(' - ');
    const tomorrowNote = [noteInfo.note, failureDetails].filter(Boolean).join(' | ');
    appendActivity({
      id: activityId(),
      scope: failureScope,
      priority: failureTask.priority,
      taskText: failureTask.text,
      kind: 'failure',
      reason: failureReason,
      note: failureNote.trim() || undefined,
      points: taskWeight(failureTask),
      createdAt: now
    });
    if (failureScope === 'today') {
      persist((current) => {
        const alreadyPlanned = current.tomorrow.some((task) => task.text.trim().toLowerCase() === failureTask.text.trim().toLowerCase());
        return {
          ...current,
          today: current.today.filter((task) => task.id !== failureTask.id),
          tomorrow: alreadyPlanned
            ? current.tomorrow
            : [
                ...current.tomorrow,
                {
                  ...makeTask(failureTask.text, composeTaskNote(tomorrowNote || undefined, noteInfo.dueTime), failureTask.priority),
                  subtasks: failureTask.subtasks,
                  allowSubtasks: failureTask.allowSubtasks
                }
              ]
        };
      });
      if (editing?.id === failureTask.id) resetDraft();
    }
    setFailureTask(null);
    setFailureScope('today');
    setFailureReason('Tired');
    setFailureNote('');
  }

  function deleteTask(taskId: string) {
    persist((current) => ({ ...current, [scope]: current[scope].filter((task) => task.id !== taskId) }));
    if (editing?.id === taskId) resetDraft();
  }

  function addSubtask(taskId: string) {
    const parentTask = store[scope].find((task) => task.id === taskId);
    if (!parentTask || !allowsSubtasks(parentTask)) return;
    const text = subtaskDrafts[taskId]?.trim();
    if (!text) return;
    persist((current) => ({
      ...current,
      [scope]: current[scope].map((task) =>
        task.id === taskId
          ? {
              ...task,
              subtasks: [...(task.subtasks || []), { id: cryptoSafeId(), text, done: false, updatedAt: new Date().toISOString() }],
              updatedAt: new Date().toISOString()
            }
          : task
      )
    }));
    setSubtaskDrafts((current) => ({ ...current, [taskId]: '' }));
  }

  function toggleSubtask(taskId: string, subtaskId: string) {
    const parentTask = store[scope].find((task) => task.id === taskId);
    if (!parentTask || !allowsSubtasks(parentTask)) return;
    persist((current) => ({
      ...current,
      [scope]: current[scope].map((task) =>
        task.id === taskId
          ? {
              ...task,
              subtasks: (task.subtasks || []).map((subtask) =>
                subtask.id === subtaskId ? { ...subtask, done: !subtask.done, updatedAt: new Date().toISOString() } : subtask
              ),
              updatedAt: new Date().toISOString()
            }
          : task
      )
    }));
  }

  function deleteSubtask(taskId: string, subtaskId: string) {
    const parentTask = store[scope].find((task) => task.id === taskId);
    if (!parentTask || !allowsSubtasks(parentTask)) return;
    persist((current) => ({
      ...current,
      [scope]: current[scope].map((task) =>
        task.id === taskId
          ? {
              ...task,
              subtasks: (task.subtasks || []).filter((subtask) => subtask.id !== subtaskId),
              updatedAt: new Date().toISOString()
            }
          : task
      )
    }));
  }

  function resetAll() {
    if (!window.confirm('Reset SG Goals back to the starter tasks?')) return;
    setStore(starterStore);
    resetDraft();
  }

  async function copyBackup() {
    await navigator.clipboard.writeText(JSON.stringify(store, null, 2));
  }

  function downloadBackup() {
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sg-goals-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function importBackup(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as GoalsStore;
        setStore({
          today: parsed.today || [],
          weekly: parsed.weekly || [],
          weekend: parsed.weekend || [],
          monthly: parsed.monthly || [],
          yearly: parsed.yearly || [],
          tomorrow: parsed.tomorrow || []
        });
      } catch {
        alert('That backup file could not be imported.');
      }
    };
    reader.readAsText(file);
  }

  async function copyCoachingReport() {
  const todayTasks = store.today.map((task) => {
    const noteInfo = splitTaskNote(task.note);
    const subtaskText = allowsSubtasks(task) && task.subtasks?.length
      ? ` | Subtasks: ${task.subtasks.map((subtask) => `${subtask.done ? 'done' : 'pending'} ${subtask.text}`).join('; ')}`
      : '';
    return `${task.done ? 'Done' : 'Pending'} - ${task.text} (${taskWeight(task)} pts)${noteInfo.dueTime ? ` by ${noteInfo.dueTime}` : ''}${task.investedMinutes ? ` (${formatMinutes(task.investedMinutes)})` : ''}${subtaskText}`;
  });
    const scoreLines = analytics.scorecard.map((item) => {
      const meta = priorities[item.priority];
      return `${meta.label}: score ${item.score}, ${item.completions} done, ${item.failures} failed, ${formatMinutes(item.minutes) || '0m'} invested`;
    });
    const failureLines = analytics.failures.length
      ? analytics.failures.map((activity) => `${formatDateShort(activity.createdAt)} - ${activity.taskText} - ${activity.reason || 'Missed'}${activity.note ? ` - ${activity.note}` : ''}`)
      : ['No recent failures logged'];

    const report = [
      'SG Goals Coaching Report',
      `Date: ${new Date().toLocaleDateString()}`,
      '',
      `Overall score: ${overallScore}`,
      `Today completion: ${completion.done}/${completion.total} tasks, ${completion.donePoints}/${completion.totalPoints} points (${completion.pct}%)`,
      `Today misses: ${todayFocus.misses.length}`,
      `Today time invested: ${formatMinutes(todayFocus.minutes) || '0m'}`,
      yesterdaySummary.hadActivity
        ? `Yesterday: ${yesterdaySummary.completed} completed, ${yesterdaySummary.failures} missed, ${formatMinutes(yesterdaySummary.minutes) || '0m'} invested`
        : 'Yesterday: no activity recorded',
      `Current streak: ${streaks.current} day(s)`,
      `Best streak: ${streaks.best} day(s)`,
      `Day counter: ${dayCounter}`,
      `Weekly plan: Main=${weeklyPlan.mainGoal || 'Not set'}; Study=${weeklyPlan.studyPlan || 'Not set'}; Work=${weeklyPlan.workPlan || 'Not set'}; Health=${weeklyPlan.healthPlan || 'Not set'}; Notes=${weeklyPlan.notes || 'None'}`,
      `Strike counts: O=${strikeCounts.o}, L=${strikeCounts.l}, M=${strikeCounts.m}, B=${strikeCounts.b}, Meditation=${strikeCounts.meditation}, Gym=${strikeCounts.gym}, Healthy drink morning=${strikeCounts.healthyDrinkMorning}, Healthy drink evening=${strikeCounts.healthyDrinkEvening}, Morning skin care=${strikeCounts.skinCareMorning}, Evening skin care=${strikeCounts.skinCareEvening}, Eye care=${strikeCounts.eyeCare}, Book read and communication practice=${strikeCounts.book}, Study 2 hour=${strikeCounts.study2}, Office work=${strikeCounts.officeWork2}, Wake up before 8=${strikeCounts.sleep}, No junk food=${strikeCounts.noJunk}, No Social Media=${strikeCounts.noSocial}, No E=${strikeCounts.noE}, Manifestation=${strikeCounts.manifest}`,
      `Next target (${formatMinutes(targetDurationMinutes)} timer): ${
        targetTasks.length
          ? targetTasks.map((task) => `${task.text}${targetTaskMinutes[task.id] ? ` (${targetTaskMinutes[task.id]}m)` : ''}`).join(', ')
          : 'Not selected'
      }`,
      '',
      'Scorecard',
      ...scoreLines,
      '',
      'Today tasks',
      ...todayTasks,
      '',
      'Recent failures',
      ...failureLines,
      '',
      '7-day failure patterns',
      ...(failurePatterns.length ? failurePatterns.map((item) => `${item.reason}: ${item.count}`) : ['No failure patterns yet']),
      '',
      'Please coach me: identify my pattern, biggest bottleneck, and the next 3 actions for tomorrow.'
    ].join('\n');

    await navigator.clipboard.writeText(report);
    setReportCopied(true);
    window.setTimeout(() => setReportCopied(false), 1800);
  }

  const completedInCurrentScope = scope === 'today' || scope === 'weekend' ? activeTasks.filter((task) => task.done) : [];

  const groupedToday = (Object.keys(blocks) as Block[]).map((block) => {
    const blockTasks = activeTasks.filter((task) => {
      const effectiveBlock = isHabitTask(task.text) ? 'habit' : task.block;
      return effectiveBlock === block;
    });
    return {
      id: block,
      title: blocks[block].label,
      sub: blocks[block].time,
      color: block === 'habit' ? '#00d97e' : '#4f8ef7',
      tasks: blockTasks.filter((task) => !task.done),
      done: blockTasks.filter((task) => task.done).length,
      total: blockTasks.length
    };
  });

  const todayDisplayGroups = groupedToday;

  const tomorrowTasks = store.tomorrow
    .map((task) => ({ task, noteInfo: splitTaskNote(task.note) }))
    .sort((a, b) => (a.noteInfo.dueTime || '99:99').localeCompare(b.noteInfo.dueTime || '99:99'));

  const groupedPriority = (Object.keys(priorities) as Priority[]).map((priority) => ({
    id: priority,
    title: priorities[priority].label,
    sub: 'Priority group',
    color: priorities[priority].color,
    tasks: activeTasks.filter((task) => task.priority === priority),
    done: activeTasks.filter((task) => task.priority === priority && task.done).length,
    total: activeTasks.filter((task) => task.priority === priority).length
  }));

  const weekendGroups = [
    {
      id: 'weekend-work',
      title: 'Weekend work',
      sub: 'Write down all your weekend work',
      color: '#4f8ef7',
      tasks: activeTasks.filter((task) => !task.done),
      done: activeTasks.filter((task) => task.done).length,
      total: activeTasks.length
    }
  ];

  const taskGroups = scope === 'today' ? todayDisplayGroups : scope === 'weekend' ? weekendGroups : groupedPriority;

  const sideMissLog = (scope === 'today' ? todayFocus.misses : analytics.failures).filter((activity) => !isAutoHabitMiss(activity));
  const sideMissLogTitle = scope === 'today' ? 'Today miss log' : '7-day miss log';
  const taskSyncLabel = syncState === 'saved' ? 'Tasks synced' : syncState === 'saving' ? 'Tasks saving' : syncState === 'loading' ? 'Tasks loading' : syncState === 'error' ? 'Tasks save failed' : 'Tasks local';
  const timerSyncLabel =
    timerSyncState === 'saved'
      ? 'Timer synced'
      : timerSyncState === 'saving'
        ? 'Timer saving'
        : timerSyncState === 'conflict'
          ? 'Timer conflict'
          : timerSyncState === 'loading'
            ? 'Timer loading'
            : timerSyncState === 'error'
              ? 'Timer save failed'
              : 'Timer local';
  const syncSummary =
    syncState === 'error' || timerSyncState === 'error'
      ? 'Cloud save failed. Browser backup is still active.'
      : timerSyncState === 'conflict'
        ? 'Newer timer data found in another browser.'
        : syncState === 'saved' && timerSyncState === 'saved'
          ? `Tasks and timer synced. Last saved ${formatRelativeTime(lastSavedAt, timerNow)}.`
          : syncState === 'saving' || timerSyncState === 'saving'
            ? 'Saving tasks and timer to Supabase...'
            : syncState === 'local' || timerSyncState === 'local'
              ? 'Browser backup active. Supabase sync is not available.'
              : 'Loading your saved goals...';

  function renderFailurePatternsSection(title: string, subtitle: string, data: AnalyticsWindow, patterns: Array<{ reason: string; count: number }>) {
    const visibleFailures = data.failures.filter((activity) => !isAutoHabitMiss(activity));

    return (
      <section className="mx-auto max-w-4xl px-5 pb-2">
        <div className="rounded-xl border border-[#1a1a30] bg-[#0f0f1d] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#52527a]">{title}</p>
              <h2 className="mt-1 text-sm font-bold text-[#e8e8f5]">{subtitle}</h2>
            </div>
            <div className="rounded-lg bg-[#ff6b6b18] p-2 text-[#ff6b6b]">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-[.8fr,1.2fr]">
            <div className="rounded-xl border border-[#1a1a30] bg-[#13132a] p-3">
              <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#52527a]">Reasons</p>
              <div className="mt-3 space-y-2">
                {patterns.length ? (
                  patterns.map((item) => (
                    <div key={item.reason} className="flex items-center justify-between rounded-lg border border-[#1a1a30] bg-[#0f0f1d] px-3 py-2 text-xs">
                      <span className="text-[#8b8bb3]">{item.reason}</span>
                      <span className="font-bold text-[#ff6b6b]">{item.count}</span>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-[#1a1a30] px-3 py-4 text-center text-[11px] text-[#52527a]">
                    No misses in this period.
                  </div>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-[#1a1a30] bg-[#13132a] p-3">
              <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#52527a]">Pattern log</p>
              <div className="mt-3 space-y-2">
                {visibleFailures.length ? (
                  visibleFailures.map((activity) => (
                    <div key={activity.id} className="rounded-lg border border-[#1a1a30] bg-[#0f0f1d] px-3 py-2">
                      <p className="text-sm text-[#e8e8f5]">{activity.taskText}</p>
                      <p className="mt-1 text-[11px] text-[#8b8bb3]">
                        {activity.reason || 'Missed'}
                        {activity.note ? ` - ${activity.note}` : ''}
                        {' - '}
                        {formatDateShort(activity.createdAt)}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-[#1a1a30] px-3 py-4 text-center text-[11px] text-[#52527a]">
                    Nothing to review yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  function renderHabitMissCountsSection(
    title: string,
    subtitle: string,
    insights: ReturnType<typeof buildHabitInsights>,
    options?: { showManualCheck?: boolean; summaryLabel?: string }
  ) {
    const counts = insights.currentMisses;
    const totalMisses = counts.reduce((total, item) => total + item.count, 0);
    const summaryTop = insights.summary.topMissed.map((item) => item.label).join(', ') || 'None';
    return (
      <section className="mx-auto max-w-4xl px-5 pb-2">
        <div className="rounded-xl border border-[#1a1a30] bg-[#0f0f1d] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#52527a]">{title}</p>
              <h2 className="mt-1 text-sm font-bold text-[#e8e8f5]">{subtitle}</h2>
            </div>
            <div className="rounded-lg bg-[#f7a04f15] px-3 py-2 text-sm font-bold text-[#f7a04f]">{totalMisses}</div>
          </div>
          {options?.showManualCheck ? (
            <button
              onClick={runHabitMissCheckNow}
              disabled={habitCheckState === 'running'}
              className="mt-4 w-full rounded-lg border border-[#4f8ef740] px-3 py-2 text-xs font-bold text-[#4f8ef7] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {habitCheckState === 'running'
                ? 'Running 3 AM check...'
                : habitCheckState === 'done'
                  ? '3 AM check complete'
                  : habitCheckState === 'error'
                    ? 'Check failed - tap to retry'
                    : 'Run 3 AM check now'}
            </button>
          ) : null}
          <div className="mt-4 rounded-xl border border-[#1a1a30] bg-[#13132a] p-3">
            <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#52527a]">{options?.summaryLabel || 'Previous reset summary'}</p>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <div className="rounded-lg border border-[#1a1a30] bg-[#0f0f1d] px-3 py-2">
                <p className="text-[10px] text-[#52527a]">Total misses</p>
                <p className="mt-1 text-lg font-bold text-[#ff6b6b]">{insights.summary.total}</p>
              </div>
              <div className="rounded-lg border border-[#1a1a30] bg-[#0f0f1d] px-3 py-2">
                <p className="text-[10px] text-[#52527a]">Top missed</p>
                <p className="mt-1 text-xs font-bold text-[#f7a04f]">{summaryTop}</p>
              </div>
              <div className="rounded-lg border border-[#1a1a30] bg-[#0f0f1d] px-3 py-2">
                <p className="text-[10px] text-[#52527a]">Best / weakest</p>
                <p className="mt-1 text-xs font-bold text-[#8b8bb3]">
                  {(insights.summary.bestHabit?.label || 'None')} / {(insights.summary.weakestHabit?.label || 'None')}
                </p>
              </div>
            </div>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {counts.length ? (
              counts.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-3 rounded-lg border border-[#1a1a30] bg-[#13132a] px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[#e8e8f5]">{item.label}</p>
                    <p className="mt-1 text-[11px] text-[#8b8bb3]">Last missed {formatDateShort(item.lastMissedAt)}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#ff6b6b18] px-2 py-1 text-xs font-bold text-[#ff6b6b]">{item.count}</span>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-[#1a1a30] px-3 py-5 text-center text-xs text-[#52527a] md:col-span-2">
                No auto-counted habit misses in this period.
              </div>
            )}
          </div>
          {insights.trend.length ? (
            <div className="mt-4 rounded-xl border border-[#1a1a30] bg-[#13132a] p-3">
              <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#52527a]">Habit missed trend</p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {insights.trend.slice(0, 8).map((item) => {
                  const delta = item.current - item.previous;
                  const tone = delta < 0 ? 'text-[#00d97e]' : delta > 0 ? 'text-[#ff6b6b]' : 'text-[#8b8bb3]';
                  const label = delta < 0 ? 'Improving' : delta > 0 ? 'Needs attention' : 'Same';
                  return (
                    <div key={item.label} className="rounded-lg border border-[#1a1a30] bg-[#0f0f1d] px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-bold text-[#e8e8f5]">{item.label}</p>
                        <span className={`text-[11px] font-bold ${tone}`}>{label}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-[#8b8bb3]">Missed {item.previous} previous, {item.current} now</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          {insights.health.length ? (
            <div className="mt-4 rounded-xl border border-[#1a1a30] bg-[#13132a] p-3">
              <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#52527a]">Habit health score</p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {insights.health.slice(0, 8).map((item) => (
                  <div key={item.label} className="rounded-lg border border-[#1a1a30] bg-[#0f0f1d] px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-bold text-[#e8e8f5]">{item.label}</p>
                      <span className={`text-sm font-bold ${(item.score || 0) >= 80 ? 'text-[#00d97e]' : (item.score || 0) >= 50 ? 'text-[#f7a04f]' : 'text-[#ff6b6b]'}`}>
                        {item.score ?? 0}%
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#1a1a30]">
                      <div className="h-full rounded-full bg-[#00d97e]" style={{ width: `${item.score ?? 0}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-[#8b8bb3]">{item.done} completed / {item.missed} missed</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <p className="mt-3 text-[11px] text-[#52527a]">Auto counted at 3:00 AM IST from the previous day&apos;s incomplete Habit tasks.</p>
        </div>
      </section>
    );
  }

  function renderScopeCompletionCard(title: string, subtitle: string, data: ReturnType<typeof buildScopeCompletion>) {
    return (
      <section className="mx-auto max-w-4xl px-5 pb-4">
        <div className="rounded-xl border border-[#1a1a30] bg-[#0f0f1d] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#52527a]">{title}</p>
              <h2 className="mt-1 text-sm font-bold text-[#e8e8f5]">{subtitle}</h2>
            </div>
            <div className="rounded-lg bg-[#00d97e15] px-3 py-2 text-sm font-bold text-[#00d97e]">{data.pct}%</div>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            <div className="rounded-lg border border-[#1a1a30] bg-[#13132a] px-3 py-2">
              <p className="text-[10px] text-[#52527a]">Completed points</p>
              <p className="mt-1 text-xl font-bold text-[#00d97e]">{data.donePoints}/{data.totalPoints}</p>
            </div>
            <div className="rounded-lg border border-[#1a1a30] bg-[#13132a] px-3 py-2">
              <p className="text-[10px] text-[#52527a]">Completed tasks</p>
              <p className="mt-1 text-xl font-bold text-[#e8e8f5]">{data.done}/{data.total}</p>
            </div>
            <div className="rounded-lg border border-[#1a1a30] bg-[#13132a] px-3 py-2">
              <p className="text-[10px] text-[#52527a]">Remaining points</p>
              <p className="mt-1 text-xl font-bold text-[#f7a04f]">{Math.max(0, data.totalPoints - data.donePoints)}</p>
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#1a1a30]">
            <div className="h-full rounded-full bg-[#00d97e] transition-all" style={{ width: `${data.pct}%` }} />
          </div>
        </div>
      </section>
    );
  }

  function renderMustTaskFocusTracker() {
    return (
      <section className="mt-3 rounded-xl border border-[#1a1a30] bg-[#0f0f1d] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#52527a]">Must-task focus time</p>
            <p className="mt-1 text-xs text-[#8b8bb3]">Run one or several stopwatches together. Overlapping time counts once in Real focus.</p>
          </div>
          <Clock className="h-4 w-4 text-[#4f8ef7]" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold">
          <span className="rounded-full border border-[#4f8ef740] bg-[#4f8ef712] px-2 py-1 text-[#4f8ef7]">
            Real focus {formatMinutes(todayFocus.focusMinutes) || '0m'}
          </span>
          <span className="rounded-full border border-[#ffd16640] bg-[#ffd16612] px-2 py-1 text-[#ffd166]">
            Combined tasks {formatMinutes(dailyPriorityFocus.reduce((total, item) => total + item.minutes, 0)) || '0m'}
          </span>
          {activeMustTaskFocus.length ? (
            <span className="rounded-full border border-[#00d97e40] bg-[#00d97e12] px-2 py-1 text-[#00d97e]">
              {activeMustTaskFocus.length} active · real {formatElapsed(mustTaskRealLiveMs)} · combined {formatElapsed(mustTaskCombinedLiveMs)}
            </span>
          ) : null}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {dailyPriorityFocus.map((item) => {
            const sharePct = todayFocus.focusMinutes ? Math.min(100, Math.round((item.minutes / todayFocus.focusMinutes) * 100)) : 0;
            const unavailable = !item.task || item.task.done;
            return (
              <div key={item.code} className="rounded-lg border border-[#24243e] bg-[#13132a] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-[#e8e8f5]">{item.label}</p>
                    <p className="mt-1 text-lg font-bold" style={{ color: item.color }}>{formatMinutes(item.minutes) || '0m'}</p>
                    {item.isActive ? <p className="mt-0.5 font-mono text-[10px] text-[#00d97e]">+ {formatElapsed(item.liveElapsedMs)} live</p> : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (item.isActive && item.task) finishMustTaskStopwatch(item.code, item.task);
                      else if (item.task) startMustTaskStopwatch(item.code, item.task);
                    }}
                    disabled={item.isActive ? item.liveElapsedMs < 1000 : unavailable}
                    className={`shrink-0 rounded-lg border px-2.5 py-2 text-[10px] font-bold ${
                      item.isActive
                        ? 'border-[#00d97e40] bg-[#00d97e18] text-[#00d97e] disabled:opacity-40'
                        : unavailable
                          ? 'cursor-not-allowed border-[#1a1a30] text-[#38385a]'
                          : 'border-[#4f8ef740] bg-[#4f8ef715] text-[#4f8ef7]'
                    }`}
                  >
                    {item.isActive ? 'Finish focus' : item.task?.done ? 'Task done' : item.task ? 'Start' : 'Unavailable'}
                  </button>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#1a1a30]">
                  <div className="h-full rounded-full" style={{ width: `${sharePct}%`, background: item.color }} />
                </div>
                <p className="mt-1 text-[9px] text-[#52527a]">{sharePct}% of real completed focus · task time may overlap</p>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  function renderPointHistorySection(title: string, subtitle: string, history: ReturnType<typeof buildPointHistory>) {
    const chartDays = [...history].reverse();
    const maxPointValue = Math.max(1, ...chartDays.flatMap((day) => [day.completedPoints, day.failedPoints]));
    const maxFocusMinutes = Math.max(1, ...chartDays.map((day) => day.focusMinutes));
    const lineX = (index: number) => 36 + (index / Math.max(1, chartDays.length - 1)) * 668;
    const lineY = (value: number, maxValue: number) => 118 - (value / maxValue) * 98;
    const completedLine = chartDays.map((day, index) => `${lineX(index)},${lineY(day.completedPoints, maxPointValue)}`).join(' ');
    const failedLine = chartDays.map((day, index) => `${lineX(index)},${lineY(day.failedPoints, maxPointValue)}`).join(' ');
    const focusLine = chartDays.map((day, index) => `${lineX(index)},${lineY(day.focusMinutes, maxFocusMinutes)}`).join(' ');
    const maxMustTaskFocusMinutes = Math.max(
      1,
      ...chartDays.flatMap((day) => DAILY_PRIORITY_STRIKE_KEYS.map((code) => day.mustTaskFocusMinutes[code]))
    );
    const mustTaskFocusLines = DAILY_PRIORITY_STRIKE_KEYS.map((code) => ({
      code,
      label: habitLabels[code] || code,
      color: DAILY_PRIORITY_FOCUS_COLORS[code],
      points: chartDays.map((day, index) => `${lineX(index)},${lineY(day.mustTaskFocusMinutes[code], maxMustTaskFocusMinutes)}`).join(' ')
    }));

    return (
      <section className="mx-auto max-w-4xl px-5 pb-4">
        <div className="rounded-xl border border-[#1a1a30] bg-[#0f0f1d] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#52527a]">{title}</p>
              <h2 className="mt-1 text-sm font-bold text-[#e8e8f5]">{subtitle}</h2>
            </div>
            <div className="rounded-lg bg-[#4f8ef715] p-2 text-[#4f8ef7]">
              <BarChart3 className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-[#1a1a30] bg-[#13132a] p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#8b8bb3]">Monthly progress graph</p>
                <div className="mt-2 flex flex-wrap gap-3 text-[10px] font-bold">
                  <span className="flex items-center gap-1.5 text-[#00d97e]"><span className="h-2 w-2 rounded-sm bg-[#00d97e]" />Completed</span>
                  <span className="flex items-center gap-1.5 text-[#ff6b6b]"><span className="h-2 w-2 rounded-sm bg-[#ff6b6b]" />Failed</span>
                  <span className="flex items-center gap-1.5 text-[#4f8ef7]"><span className="h-2 w-2 rounded-sm bg-[#4f8ef7]" />Focus</span>
                </div>
              </div>
              <div className="text-right text-[10px] leading-5 text-[#52527a]">
                <p>Points max {maxPointValue}</p>
                <p>Focus max {formatMinutes(maxFocusMinutes)}</p>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto pb-1">
              <div className="flex h-36 min-w-max items-end gap-2 border-b border-[#24243e] px-1">
                {chartDays.map((day) => {
                  const completedHeight = day.completedPoints ? Math.max(3, Math.round((day.completedPoints / maxPointValue) * 104)) : 0;
                  const failedHeight = day.failedPoints ? Math.max(3, Math.round((day.failedPoints / maxPointValue) * 104)) : 0;
                  const focusHeight = day.focusMinutes ? Math.max(3, Math.round((day.focusMinutes / maxFocusMinutes) * 104)) : 0;
                  const dayNumber = Number(day.dateKey.slice(-2));
                  return (
                    <div
                      key={`${day.dateKey}-chart`}
                      className="flex w-9 shrink-0 flex-col items-center justify-end"
                      title={`${formatStartedDate(day.dateKey)}: ${day.completedPoints} completed points, ${day.failedPoints} failed points, ${formatMinutes(day.focusMinutes) || '0m'} focus`}
                      aria-label={`${formatStartedDate(day.dateKey)}: ${day.completedPoints} completed points, ${day.failedPoints} failed points, ${formatMinutes(day.focusMinutes) || '0m'} focus`}
                    >
                      <div className="flex h-[108px] items-end gap-0.5">
                        <span className="w-2 rounded-t-sm bg-[#00d97e]" style={{ height: `${completedHeight}px` }} />
                        <span className="w-2 rounded-t-sm bg-[#ff6b6b]" style={{ height: `${failedHeight}px` }} />
                        <span className="w-2 rounded-t-sm bg-[#4f8ef7]" style={{ height: `${focusHeight}px` }} />
                      </div>
                      <span className="mt-1 h-4 text-[9px] text-[#52527a]">{dayNumber}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-4 grid gap-3 border-t border-[#24243e] pt-4">
              <div className="min-w-0 overflow-hidden rounded-lg border border-[#1a1a30] bg-[#0f0f1d] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#8b8bb3]">Points line trend</p>
                  <div className="flex gap-3 text-[10px] font-bold">
                    <span className="text-[#00d97e]">Completed</span>
                    <span className="text-[#ff6b6b]">Failed</span>
                  </div>
                </div>
                <div className="mt-2 w-full max-w-full overflow-x-auto">
                  <svg viewBox="0 0 740 150" className="h-40 w-[620px] max-w-none" role="img" aria-label="Completed and failed points line graph by day">
                    <title>Completed and failed points by day</title>
                    {[20, 69, 118].map((y) => (
                      <line key={`points-grid-${y}`} x1="36" x2="704" y1={y} y2={y} stroke="#24243e" strokeWidth="1" />
                    ))}
                    <polyline points={completedLine} fill="none" stroke="#00d97e" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                    <polyline points={failedLine} fill="none" stroke="#ff6b6b" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                    {chartDays.map((day, index) => (
                      <g key={`${day.dateKey}-point-lines`}>
                        <circle cx={lineX(index)} cy={lineY(day.completedPoints, maxPointValue)} r="2.5" fill="#00d97e"><title>{`${day.dateKey}: ${day.completedPoints} completed points`}</title></circle>
                        <circle cx={lineX(index)} cy={lineY(day.failedPoints, maxPointValue)} r="2.5" fill="#ff6b6b"><title>{`${day.dateKey}: ${day.failedPoints} failed points`}</title></circle>
                        {(index % 3 === 0 || index === chartDays.length - 1) ? <text x={lineX(index)} y="142" textAnchor="middle" fill="#52527a" fontSize="8">{Number(day.dateKey.slice(-2))}</text> : null}
                      </g>
                    ))}
                  </svg>
                </div>
              </div>

              <div className="min-w-0 overflow-hidden rounded-lg border border-[#1a1a30] bg-[#0f0f1d] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#8b8bb3]">Focus line trend</p>
                  <span className="text-[10px] font-bold text-[#4f8ef7]">Completed focus time</span>
                </div>
                <div className="mt-2 w-full max-w-full overflow-x-auto">
                  <svg viewBox="0 0 740 150" className="h-40 w-[620px] max-w-none" role="img" aria-label="Completed focus time line graph by day">
                    <title>Completed focus time by day</title>
                    {[20, 69, 118].map((y) => (
                      <line key={`focus-grid-${y}`} x1="36" x2="704" y1={y} y2={y} stroke="#24243e" strokeWidth="1" />
                    ))}
                    <polyline points={focusLine} fill="none" stroke="#4f8ef7" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                    {chartDays.map((day, index) => (
                      <g key={`${day.dateKey}-focus-line`}>
                        <circle cx={lineX(index)} cy={lineY(day.focusMinutes, maxFocusMinutes)} r="2.5" fill="#4f8ef7"><title>{`${day.dateKey}: ${formatMinutes(day.focusMinutes) || '0m'} focus`}</title></circle>
                        {(index % 3 === 0 || index === chartDays.length - 1) ? <text x={lineX(index)} y="142" textAnchor="middle" fill="#52527a" fontSize="8">{Number(day.dateKey.slice(-2))}</text> : null}
                      </g>
                    ))}
                  </svg>
                </div>
              </div>

              <div className="min-w-0 overflow-hidden rounded-lg border border-[#1a1a30] bg-[#0f0f1d] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#8b8bb3]">Must-task focus trend</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-bold">
                    {mustTaskFocusLines.map((series) => (
                      <span key={`${series.code}-legend`} className="flex items-center gap-1.5" style={{ color: series.color }}>
                        <span className="h-2 w-2 rounded-full" style={{ background: series.color }} />
                        {series.label}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-2 w-full max-w-full overflow-x-auto">
                  <svg viewBox="0 0 740 150" className="h-40 w-[620px] max-w-none" role="img" aria-label="Must-task completed focus time line graph by day">
                    <title>Office work, study, book and communication, and gym focus time by day</title>
                    {[20, 69, 118].map((y) => (
                      <line key={`must-focus-grid-${y}`} x1="36" x2="704" y1={y} y2={y} stroke="#24243e" strokeWidth="1" />
                    ))}
                    {mustTaskFocusLines.map((series) => (
                      <polyline key={`${series.code}-line`} points={series.points} fill="none" stroke={series.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                    ))}
                    {chartDays.map((day, index) => (
                      <g key={`${day.dateKey}-must-focus-lines`}>
                        {mustTaskFocusLines.map((series) => (
                          <circle key={`${day.dateKey}-${series.code}`} cx={lineX(index)} cy={lineY(day.mustTaskFocusMinutes[series.code], maxMustTaskFocusMinutes)} r="2.5" fill={series.color}>
                            <title>{`${day.dateKey}: ${series.label} ${formatMinutes(day.mustTaskFocusMinutes[series.code]) || '0m'}`}</title>
                          </circle>
                        ))}
                        {(index % 3 === 0 || index === chartDays.length - 1) ? <text x={lineX(index)} y="142" textAnchor="middle" fill="#52527a" fontSize="8">{Number(day.dateKey.slice(-2))}</text> : null}
                      </g>
                    ))}
                  </svg>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {history.map((day) => {
              const total = day.completedPoints + day.failedPoints;
              const completedPct = total ? Math.round((day.completedPoints / total) * 100) : 0;
              return (
                <div key={day.dateKey} className="rounded-xl border border-[#1a1a30] bg-[#13132a] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold text-[#e8e8f5]">{formatStartedDate(day.dateKey)}</p>
                    <div className="flex flex-wrap items-center justify-end gap-2 text-xs font-bold">
                      <span className="text-[#00d97e]">Done {day.completedPoints} pts</span>
                      <span className="text-[#ff6b6b]">Failed {day.failedPoints} pts</span>
                      <span className="text-[#4f8ef7]">Focus {formatMinutes(day.focusMinutes) || '0m'}</span>
                    </div>
                  </div>
                  <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-[#1a1a30]">
                    <div className="bg-[#00d97e]" style={{ width: `${completedPct}%` }} />
                    <div className="bg-[#ff6b6b]" style={{ width: `${total ? 100 - completedPct : 0}%` }} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 rounded-lg border border-[#1a1a30] bg-[#0f0f1d] px-2.5 py-2 text-[10px] font-bold">
                    {DAILY_PRIORITY_STRIKE_KEYS.map((code) => (
                      <span key={`${day.dateKey}-${code}-focus`} style={{ color: DAILY_PRIORITY_FOCUS_COLORS[code] }}>
                        {habitLabels[code]} {formatMinutes(day.mustTaskFocusMinutes[code]) || '0m'}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#00d97e]">Completed</p>
                      {day.completedTasks.length ? (
                        day.completedTasks.slice(0, 4).map((task, index) => (
                          <p key={`${day.dateKey}-done-${index}`} className="truncate text-[11px] text-[#8b8bb3]">
                            {task.text} - {task.points} pts
                          </p>
                        ))
                      ) : (
                        <p className="text-[11px] text-[#52527a]">No completed points.</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#ff6b6b]">Failed</p>
                      {day.failedTasks.length ? (
                        day.failedTasks.slice(0, 4).map((task, index) => (
                          <p key={`${day.dateKey}-fail-${index}`} className="truncate text-[11px] text-[#8b8bb3]">
                            {task.text} - {task.points} pts
                          </p>
                        ))
                      ) : (
                        <p className="text-[11px] text-[#52527a]">No failed points.</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  return (
    <main className="min-h-screen bg-[#07070f] pb-24 text-[#e8e8f5]">
      <section className="border-b border-[#1a1a30] bg-[#0b0b1c] px-5 pb-5 pt-10">
        <div className="mx-auto flex max-w-4xl flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.3em] text-[#52527a]">SG Goals</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight">Daily dashboard</h1>
              <p className="mt-1 text-sm text-[#8b8bb3]">{syncSummary}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex gap-2">
                <button
                  onClick={() => setScoreOpen(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#4f8ef740] bg-[#4f8ef712] text-[#4f8ef7]"
                  aria-label="Open score details"
                  title="Open score details"
                >
                  <BarChart3 className="h-5 w-5" />
                </button>
                <button
                  onClick={() => setCalendarOpen(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#00d97e40] bg-[#00d97e12] text-[#00d97e]"
                  aria-label="Open calendar heatmap"
                  title="Open calendar heatmap"
                >
                  <CalendarDays className="h-5 w-5" />
                </button>
              </div>
              <div className="flex flex-col items-end gap-1 text-[10px]">
                <span
                  className={`rounded-full border px-2 py-1 font-bold uppercase tracking-wider ${
                    syncState === 'saved'
                      ? 'border-[#00d97e40] text-[#00d97e]'
                      : syncState === 'saving' || syncState === 'loading'
                        ? 'border-[#4f8ef740] text-[#4f8ef7]'
                        : 'border-[#ff6b6b44] text-[#ff6b6b]'
                  }`}
                >
                  {taskSyncLabel}
                </span>
                <span
                  className={`rounded-full border px-2 py-1 font-bold uppercase tracking-wider ${
                    timerSyncState === 'saved'
                      ? 'border-[#00d97e40] text-[#00d97e]'
                      : timerSyncState === 'saving' || timerSyncState === 'loading'
                        ? 'border-[#4f8ef740] text-[#4f8ef7]'
                        : timerSyncState === 'conflict'
                          ? 'border-[#f7a04f40] text-[#f7a04f]'
                          : 'border-[#ff6b6b44] text-[#ff6b6b]'
                  }`}
                >
                  {timerSyncLabel}
                </span>
                <span className="text-[#52527a]">Last saved {formatRelativeTime(lastSavedAt, timerNow)}</span>
              </div>
              <span className="text-[10px] text-[#52527a]">{APP_VERSION}</span>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-[#8b8bb3]">
              <span>{completion.done}/{completion.total} complete · {completion.donePoints}/{completion.totalPoints} pts</span>
              <span className="font-bold text-[#00d97e]">{completion.pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#1a1a30]">
              <div className="h-full rounded-full bg-[#00d97e] transition-all" style={{ width: `${completion.pct}%` }} />
            </div>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-[#8b8bb3]">
              <span>Habit counter cycle starts {strikeCounts.counterCycleStart}</span>
              <span className="font-bold text-[#ffd166]">21+ gets highlighted</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
            {[
              { key: 'OFFICEWORK2' as const, label: 'Office work count', rule: 'Daily priority - Office work complete', color: '#22c55e', todayDone: strikeCounts.today.officeWork2, value: strikeCounts.officeWork2 },
              { key: 'STUDY2' as const, label: 'Study count', rule: 'Daily priority - Study 2 hour complete', color: '#ff6b6b', todayDone: strikeCounts.today.study2, value: strikeCounts.study2 },
              { key: 'BOOK' as const, label: 'Book + comm count', rule: 'Daily priority - Book read and communication practice complete', color: '#ffd166', todayDone: strikeCounts.today.book, value: strikeCounts.book },
              { key: 'GYM' as const, label: 'Gym count', rule: 'Daily priority - Gym complete', color: '#00d97e', todayDone: strikeCounts.today.gym, value: strikeCounts.gym },
              { key: 'O' as const, label: 'O count', rule: 'O complete', color: '#4f8ef7', todayDone: strikeCounts.today.o, value: strikeCounts.o },
              { key: 'L' as const, label: 'L count', rule: 'L1 + L2 + L3', color: '#c084fc', todayDone: strikeCounts.today.l, value: strikeCounts.l },
              { key: 'M' as const, label: 'M count', rule: 'M complete', color: '#f7a04f', todayDone: strikeCounts.today.m, value: strikeCounts.m },
              { key: 'B' as const, label: 'B count', rule: 'B complete', color: '#60a5fa', todayDone: strikeCounts.today.b, value: strikeCounts.b },
              { key: 'MEDITATION' as const, label: 'Meditation count', rule: 'Meditation complete', color: '#34d399', todayDone: strikeCounts.today.meditation, value: strikeCounts.meditation },
              { key: 'HEALTHYDRINKMORNING' as const, label: 'Drink AM count', rule: 'Healthy drink morning complete', color: '#14b8a6', todayDone: strikeCounts.today.healthyDrinkMorning, value: strikeCounts.healthyDrinkMorning },
              { key: 'HEALTHYDRINKEVENING' as const, label: 'Drink PM count', rule: 'Healthy drink evening complete', color: '#f97316', todayDone: strikeCounts.today.healthyDrinkEvening, value: strikeCounts.healthyDrinkEvening },
              { key: 'SKINCAREMORNING' as const, label: 'Skin AM count', rule: 'Morning skin care complete', color: '#c084fc', todayDone: strikeCounts.today.skinCareMorning, value: strikeCounts.skinCareMorning },
              { key: 'SKINCAREEVENING' as const, label: 'Skin PM count', rule: 'Evening skin care complete', color: '#e879f9', todayDone: strikeCounts.today.skinCareEvening, value: strikeCounts.skinCareEvening },
              { key: 'SLEEP' as const, label: 'Wake count', rule: 'Wake up before 8 complete', color: '#a78bfa', todayDone: strikeCounts.today.sleep, value: strikeCounts.sleep },
              { key: 'NOJUNK' as const, label: 'No junk count', rule: 'No junk food complete', color: '#00bcd4', todayDone: strikeCounts.today.noJunk, value: strikeCounts.noJunk },
              { key: 'NOSOCIAL' as const, label: 'No social count', rule: 'No Social Media complete', color: '#38bdf8', todayDone: strikeCounts.today.noSocial, value: strikeCounts.noSocial },
              { key: 'NOE' as const, label: 'No E count', rule: 'No E complete', color: '#8b8bb3', todayDone: strikeCounts.today.noE, value: strikeCounts.noE },
              { key: 'MANIFEST' as const, label: 'Manifest count', rule: 'Manifestation complete', color: '#fb7185', todayDone: strikeCounts.today.manifest, value: strikeCounts.manifest },
              { key: 'EYECARE' as const, label: 'Eye care count', rule: 'Eye care complete', color: '#2dd4bf', todayDone: strikeCounts.today.eyeCare, value: strikeCounts.eyeCare },
              { key: 'SALTGARGLE' as const, label: 'Gargle count', rule: 'Salt water gargle complete', color: '#93c5fd', todayDone: strikeCounts.today.saltGargle, value: strikeCounts.saltGargle }
            ].map((item) => {
              const reachedTarget = item.value >= HABIT_TARGET_COUNT;
              const isDailyPriority = DAILY_PRIORITY_STRIKE_KEYS.includes(item.key as (typeof DAILY_PRIORITY_STRIKE_KEYS)[number]);
              const streak = strikeCounts.streaks[item.key];
              const activeStreak = streak > 0 && item.todayDone;
              const streakAtRisk = streak > 0 && !item.todayDone;
              return (
              <div
                key={item.key}
                className={`rounded-xl border px-3 py-2 ${
                  item.todayDone
                    ? 'border-[#00d97e66] bg-[#00d97e10] shadow-[0_0_18px_rgba(0,217,126,.12)]'
                    : 'border-[#f9731699] bg-[#f9731614] shadow-[0_0_18px_rgba(249,115,22,.12)]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-[10px] font-bold uppercase tracking-[.16em] ${reachedTarget ? 'text-[#ffd166]' : 'text-[#52527a]'}`}>{item.label}</p>
                  <span className="text-[10px] font-bold" style={{ color: reachedTarget ? '#ffd166' : item.todayDone ? '#00d97e' : isDailyPriority ? '#ff6b6b' : '#52527a' }}>
                    {reachedTarget ? '21 reached' : item.todayDone ? 'Today +1' : isDailyPriority ? 'Must today' : 'Pending'}
                  </span>
                </div>
                <div className="mt-1 flex items-end justify-between gap-2">
                  <p className="text-2xl font-bold" style={{ color: item.color }}>{item.value}</p>
                  {streak > 0 ? (
                    <span
                      className={`rounded-full border px-2 py-1 text-[10px] font-bold ${
                        activeStreak
                          ? 'border-[#00d97e44] bg-[#00d97e14] text-[#00d97e]'
                          : 'border-[#f9731644] bg-[#f9731618] text-[#f97316]'
                      }`}
                    >
                      {activeStreak ? <Flame className="mr-1 inline h-3 w-3" /> : streakAtRisk ? 'At risk ' : ''} {streak}d
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-[10px] text-[#8b8bb3]">{item.rule}</p>
                  <button onClick={() => resetStrikeCount(item.key)} className="rounded-md border border-[#ff6b6b44] px-2 py-1 text-[10px] font-bold text-[#ff6b6b]">
                    Reset
                  </button>
                </div>
              </div>
              );
            })}
            <div className="rounded-xl border border-[#1a1a30] bg-[#0f0f1d] px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#52527a]">Day counter</p>
                <span className="text-[10px] font-bold text-[#00d97e]">Auto +1</span>
              </div>
              <p className="mt-1 text-2xl font-bold text-[#e8e8f5]">{dayCounter}</p>
              <p className="mt-1 text-[10px] text-[#8b8bb3]">Started {formatStartedDate(DAY_COUNTER_START_DATE)}</p>
            </div>
            <div className="rounded-xl border border-[#4f8ef740] bg-[#4f8ef712] px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#8b8bb3]">Next reset</p>
                <span className="text-[10px] font-bold text-[#4f8ef7]">Monthly</span>
              </div>
              <p className="mt-1 text-2xl font-bold text-[#4f8ef7]">
                {counterResetRemaining.days} day{counterResetRemaining.days === 1 ? '' : 's'}
              </p>
              <p className="mt-1 text-[10px] text-[#8b8bb3]">Resets on {formatStartedDate(counterResetRemaining.nextReset)}</p>
            </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {(['today', 'weekly', 'weekend', 'monthly', 'yearly'] as Scope[]).map((item) => (
            <button
              key={item}
              onClick={() => {
                setScope(item);
                resetDraft();
              }}
              className={`rounded-lg border px-2 py-3 text-xs font-bold capitalize transition ${
                scope === item ? 'border-[#00d97e] bg-[#00d97e] text-black' : 'border-[#1a1a30] bg-[#0f0f1d] text-[#8b8bb3]'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      {scope === 'today' ? (
      <section className="mx-auto max-w-4xl px-5 pb-2">
        <div className="mb-3 rounded-xl border border-[#1a1a30] bg-[#0f0f1d] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#52527a]">Today points</p>
              <h2 className="mt-1 text-sm font-bold text-[#e8e8f5]">Completed vs failed weighted points today</h2>
            </div>
            <div className="rounded-lg bg-[#00d97e15] px-3 py-2 text-sm font-bold text-[#00d97e]">{completion.pct}%</div>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            <div className="rounded-lg border border-[#1a1a30] bg-[#13132a] px-3 py-2">
              <p className="text-[10px] text-[#52527a]">Completed</p>
              <p className="mt-1 text-xl font-bold text-[#00d97e]">{completion.donePoints} pts</p>
            </div>
            <div className="rounded-lg border border-[#1a1a30] bg-[#13132a] px-3 py-2">
              <p className="text-[10px] text-[#52527a]">Failed</p>
              <p className="mt-1 text-xl font-bold text-[#ff6b6b]">{todayFocus.failedPoints} pts</p>
            </div>
            <div className="rounded-lg border border-[#1a1a30] bg-[#13132a] px-3 py-2">
              <p className="text-[10px] text-[#52527a]">Total available</p>
              <p className="mt-1 text-xl font-bold text-[#e8e8f5]">{completion.totalPoints} pts</p>
            </div>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-[1.2fr,.8fr]">
          <div className="min-w-0 rounded-xl border border-[#1a1a30] bg-[#0f0f1d] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#52527a]">Next target</p>
                <h2 className="mt-2 text-lg font-bold text-[#e8e8f5]">{targetTasks.length ? `${targetTasks.length} task${targetTasks.length === 1 ? '' : 's'} selected` : 'Select tasks from Morning, Afternoon, or Evening'}</h2>
                {mainGoal ? (
                  <p className="mt-1 text-xs text-[#8b8bb3]">
                    Current focus starts with {mainGoal.text} ({taskWeight(mainGoal)} pts)
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-[#8b8bb3]">Tap the star beside Today tasks to add them here.</p>
                )}
              </div>
              <div className="shrink-0 rounded-lg bg-[#ffd16615] px-3 py-2 text-right text-[#ffd166]">
                <div className="flex items-center justify-end gap-1">
                  <Clock className="h-4 w-4" />
                  <span className="font-mono text-sm font-bold">{istClockLabel}</span>
                </div>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-[.18em] text-[#8b8bb3]">IST</p>
              </div>
            </div>
            {targetTasks.length ? (
              <div className="mt-4">
                <div className="mb-3 space-y-2">
                  {targetTasks.map((task, index) => {
                    const noteInfo = splitTaskNote(task.note);
                    const targetSubtasks = allowsSubtasks(task) ? task.subtasks || [] : [];
                    const targetDoneSubtasks = targetSubtasks.filter((subtask) => subtask.done).length;
                    return (
                      <div key={task.id} className="rounded-xl border border-[#1a1a30] bg-[#13132a] px-3 py-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[#4f8ef740] bg-[#4f8ef715] text-[11px] font-bold text-[#4f8ef7]">
                                {index + 1}
                              </span>
                              <p className={`flex flex-wrap items-center gap-2 text-sm font-bold ${task.done ? 'text-[#52527a] line-through' : 'text-[#e8e8f5]'}`}>
                                <span>{task.text}</span>
                                <span className="rounded-full border border-[#ffd16640] bg-[#ffd16612] px-2 py-0.5 text-[10px] font-bold text-[#ffd166] no-underline">
                                  {taskWeight(task)} pts
                                </span>
                              </p>
                              {targetTimer.running && targetTimer.activeTask?.id === task.id ? (
                                <span className="rounded-full bg-[#00d97e22] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.14em] text-[#00d97e]">Now</span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-[11px] text-[#8b8bb3]">
                              {task.block ? blocks[task.block].label : priorities[task.priority].label}
                              {noteInfo.dueTime ? ` - By ${noteInfo.dueTime}` : ''}
                              {noteInfo.note ? ` - ${noteInfo.note}` : ''}
                              {targetSubtasks.length ? ` - ${targetDoneSubtasks}/${targetSubtasks.length} subtasks` : ''}
                            </p>
                            <div className="mt-2 flex w-fit items-center gap-1 rounded-lg border border-[#1a1a30] bg-[#0f0f1d] p-1 text-[11px] text-[#8b8bb3]">
                              <span className="px-1">Plan</span>
                              <button
                                type="button"
                                onClick={() => adjustTargetTaskMinutes(task.id, -5)}
                                className="flex h-7 w-7 items-center justify-center rounded-md border border-[#1a1a30] text-[#8b8bb3]"
                                aria-label={`Reduce planned time for ${task.text}`}
                              >
                                -
                              </button>
                              <div className="flex h-7 items-center rounded-md border border-[#1a1a30] bg-[#07070f] px-2">
                                <input
                                  type="number"
                                  min="1"
                                  max="1440"
                                  inputMode="numeric"
                                  value={targetTaskMinutes[task.id] ?? ''}
                                  onChange={(event) => updateTargetTaskMinutes(task.id, event.target.value)}
                                  placeholder="00"
                                  className="w-9 bg-transparent text-right font-mono text-sm font-bold text-[#e8e8f5] outline-none"
                                  aria-label={`Planned minutes for ${task.text}`}
                                />
                                <span className="font-mono text-sm font-bold text-[#52527a]">:00</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => adjustTargetTaskMinutes(task.id, 5)}
                                className="flex h-7 w-7 items-center justify-center rounded-md border border-[#1a1a30] text-[#8b8bb3]"
                                aria-label={`Increase planned time for ${task.text}`}
                              >
                                +
                              </button>
                              <span className="px-1">min</span>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => moveTargetTask(task.id, -1)}
                              disabled={index === 0}
                              className={`flex h-8 w-8 items-center justify-center rounded-lg border border-[#1a1a30] ${
                                index === 0 ? 'cursor-not-allowed text-[#38385a]' : 'text-[#8b8bb3]'
                              }`}
                              aria-label={`Move ${task.text} up`}
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveTargetTask(task.id, 1)}
                              disabled={index === targetTasks.length - 1}
                              className={`flex h-8 w-8 items-center justify-center rounded-lg border border-[#1a1a30] ${
                                index === targetTasks.length - 1 ? 'cursor-not-allowed text-[#38385a]' : 'text-[#8b8bb3]'
                              }`}
                              aria-label={`Move ${task.text} down`}
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => toggleTargetTask(task.id)} className="rounded-lg border border-[#1a1a30] px-2 py-1 text-[11px] font-bold text-[#8b8bb3]">
                              Remove
                            </button>
                          </div>
                        </div>
                        {targetSubtasks.length ? (
                          <div className="mt-3 space-y-1.5 rounded-lg border border-[#1a1a30] bg-[#0b0b18] p-2">
                            {targetSubtasks.map((subtask) => (
                              <button
                                key={subtask.id}
                                type="button"
                                onClick={() => toggleSubtask(task.id, subtask.id)}
                                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-[#c8c8ee] hover:bg-[#13132a]"
                              >
                                <span
                                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                                    subtask.done ? 'border-[#00d97e] bg-[#00d97e15] text-[#00d97e]' : 'border-[#4f8ef740] text-[#4f8ef7]'
                                  }`}
                                >
                                  {subtask.done ? <Check className="h-3 w-3" /> : null}
                                </span>
                                <span className={`min-w-0 flex-1 ${subtask.done ? 'text-[#52527a] line-through' : ''}`}>{subtask.text}</span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            onClick={() => toggleTask(task.id)}
                            className={`rounded-lg px-3 py-2 text-xs font-bold ${
                              task.done ? 'border border-[#1a1a30] text-[#8b8bb3]' : 'bg-[#00d97e] text-black'
                            }`}
                          >
                            {task.done ? 'Mark pending' : 'Complete'}
                          </button>
                          <button onClick={() => openFailure(task)} className="rounded-lg border border-[#f7a04f40] px-3 py-2 text-xs font-bold text-[#f7a04f]">
                            Log failure
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="grid gap-3">
                  <section className="rounded-xl border border-[#1a1a30] bg-[#13132a] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#52527a]">
                          Focus period {targetSequence.length ? `(${Math.max(1, focusActiveTaskIndex + 1)} of ${targetSequence.length})` : ''}
                        </p>
                        <p className="mt-1 truncate text-xs font-bold text-[#e8e8f5]">{focusActiveTask?.text || 'Assign time to a selected task'}</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[.14em] ${focusRunning ? 'bg-[#00d97e18] text-[#00d97e]' : 'bg-[#1a1a30] text-[#8b8bb3]'}`}>
                        {targetFocusLogged ? 'Recorded' : focusComplete ? 'Time up' : focusRunning ? 'Running' : 'Paused'}
                      </span>
                    </div>

                    <div className="mx-auto mt-4 grid w-full max-w-[220px] grid-cols-2 rounded-lg border border-[#24243e] bg-[#0f0f1d] p-1">
                      {(['timer', 'stopwatch'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => changeFocusMode(mode)}
                          className={`h-8 rounded-md text-[11px] font-bold capitalize ${focusMode === mode ? 'bg-[#4f8ef7] text-white' : 'text-[#8b8bb3]'}`}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>

                    <div className="mx-auto mt-4 flex h-48 w-48 items-center justify-center rounded-full p-3" style={{ background: `conic-gradient(#4f8ef7 ${focusPeriodProgress * 3.6}deg, #1a1a30 0deg)` }}>
                      <div className="flex h-full w-full flex-col items-center justify-center rounded-full border border-[#24243e] bg-[#0f0f1d] text-center">
                        <p className={`font-mono text-3xl font-bold ${focusComplete ? 'text-[#f7a04f]' : 'text-[#e8e8f5]'}`}>{focusPeriodLabel}</p>
                        <p className="mt-1 text-[10px] uppercase tracking-[.16em] text-[#8b8bb3]">{focusMode === 'stopwatch' ? 'elapsed' : 'remaining'}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={toggleTargetTimer}
                        title={focusRunning ? `Pause focus ${focusMode}` : `Start focus ${focusMode}`}
                        aria-label={focusRunning ? `Pause focus ${focusMode}` : `Start focus ${focusMode}`}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-[#4f8ef7] text-white"
                      >
                        {focusRunning ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={resetTargetTimer}
                        title="Reset focus timer"
                        aria-label="Reset focus timer"
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-[#24243e] text-[#8b8bb3]"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={completeFocusPeriod}
                        disabled={targetFocusLogged || focusElapsedMs < 1000}
                        title={targetFocusLogged ? 'Focus period recorded' : 'Complete focus period'}
                        aria-label={targetFocusLogged ? 'Focus period recorded' : 'Complete focus period'}
                        className={`flex h-10 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-bold ${
                          targetFocusLogged || focusElapsedMs < 1000
                            ? 'cursor-not-allowed border-[#1a1a30] text-[#38385a]'
                            : 'border-[#00d97e40] bg-[#00d97e18] text-[#00d97e]'
                        }`}
                      >
                        <Check className="h-4 w-4" />
                        <span>{targetFocusLogged ? 'Recorded' : 'Complete'}</span>
                      </button>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[11px] text-[#8b8bb3]">
                      <span>Total</span>
                      <input
                        type="number"
                        min="1"
                        max="1440"
                        inputMode="numeric"
                        value={targetDurationDraft}
                        onFocus={() => setTargetDurationEditing(true)}
                        onChange={(event) => updateTargetDurationMinutes(event.target.value)}
                        onBlur={finishTargetDurationEdit}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.currentTarget.blur();
                        }}
                        className="h-8 w-20 rounded-lg border border-[#24243e] bg-[#07070f] px-2 text-right font-mono text-sm font-bold text-[#e8e8f5] outline-none focus:border-[#4f8ef7]"
                        aria-label="Target timer total minutes"
                      />
                      <span>min</span>
                      <span className="text-[#52527a]">
                        {focusMode === 'stopwatch' ? 'Stopwatch keeps running after the app closes' : targetPlannedMinutes ? `${formatMinutes(targetPlannedMinutes)} assigned` : 'No task times assigned'}
                      </span>
                    </div>
                  </section>

                  <section className="rounded-xl border border-[#1a1a30] bg-[#13132a] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#52527a]">Daily focus progress</p>
                        <p className="mt-1 text-xs text-[#8b8bb3]">Elapsed time recorded from completed focus periods</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFocusDailyGoalEditing((current) => !current)}
                        title="Edit daily focus goal"
                        aria-label="Edit daily focus goal"
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#24243e] text-[#8b8bb3]"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-5 grid grid-cols-[1fr_1.4fr_1fr] items-center gap-2 text-center">
                      <div>
                        <p className="text-[10px] uppercase tracking-[.14em] text-[#8b8bb3]">Yesterday</p>
                        <p className="mt-1 text-2xl font-bold text-[#e8e8f5]">{yesterdaySummary.focusMinutes}</p>
                        <p className="text-[10px] text-[#52527a]">minutes</p>
                      </div>

                      <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-full p-3" style={{ background: `conic-gradient(#00d97e ${focusProgress * 3.6}deg, #1a1a30 0deg)` }}>
                        <div className="flex h-full w-full flex-col items-center justify-center rounded-full border border-[#24243e] bg-[#0f0f1d]">
                          <p className="text-[10px] uppercase tracking-[.14em] text-[#8b8bb3]">Daily goal</p>
                          {focusDailyGoalEditing ? (
                            <label className="mt-2 flex items-center gap-1">
                              <input
                                autoFocus
                                type="number"
                                min="1"
                                max="1440"
                                inputMode="numeric"
                                value={focusDailyGoalDraft}
                                onChange={(event) => updateFocusDailyGoal(event.target.value)}
                                onBlur={finishFocusDailyGoalEdit}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') event.currentTarget.blur();
                                }}
                                className="h-8 w-16 rounded-md border border-[#24243e] bg-[#07070f] px-2 text-right font-mono text-base font-bold text-[#e8e8f5] outline-none focus:border-[#00d97e]"
                                aria-label="Daily focus goal minutes"
                              />
                              <span className="text-[10px] text-[#8b8bb3]">min</span>
                            </label>
                          ) : (
                            <p className="mt-1 text-xl font-bold text-[#e8e8f5]">{formatMinutes(focusDailyGoalMinutes)}</p>
                          )}
                        </div>
                      </div>

                      <div>
                        <p className="text-[10px] uppercase tracking-[.14em] text-[#8b8bb3]">Streak</p>
                        <p className="mt-1 text-2xl font-bold text-[#ffd166]">{focusStreak}</p>
                        <p className="text-[10px] text-[#52527a]">days</p>
                      </div>
                    </div>

                    <div className="mt-5 text-center">
                      <p className="text-xs font-bold text-[#e8e8f5]">Completed focus time: {formatMinutes(todayFocus.focusMinutes) || '0m'}</p>
                      <p className="mt-1 text-[10px] text-[#8b8bb3]">{focusProgress}% of today&apos;s focus goal</p>
                    </div>

                  </section>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      setTargetTaskIds([]);
                      setTargetTaskMinutes({});
                      setTargetEndAt('');
                      setTargetRunning(false);
                      setStopwatchStartedAt('');
                      setStopwatchElapsedMs(0);
                      setTargetFocusLogged(false);
                      setTargetRemainingMs(targetPlannedDurationMs);
                      markTargetChanged();
                    }}
                    className="rounded-lg border border-[#ff6b6b44] px-3 py-2 text-xs font-bold text-[#ff6b6b]"
                  >
                    Clear target
                  </button>
                  <button
                    onClick={enableReliableAlarm}
                    disabled={pushAlarmStatus === 'saving' || pushAlarmStatus === 'unsupported'}
                    className={`rounded-lg border px-3 py-2 text-xs font-bold ${
                      pushAlarmStatus === 'on'
                        ? 'border-[#00d97e40] text-[#00d97e]'
                        : pushAlarmStatus === 'unsupported'
                          ? 'cursor-not-allowed border-[#1a1a30] text-[#52527a]'
                          : pushAlarmStatus === 'error'
                            ? 'border-[#ff6b6b44] text-[#ff6b6b]'
                            : 'border-[#ffd16640] text-[#ffd166]'
                    }`}
                  >
                    {pushAlarmStatus === 'on'
                      ? 'Reliable alarm on'
                      : pushAlarmStatus === 'saving'
                        ? 'Enabling alarm...'
                        : pushAlarmStatus === 'unsupported'
                          ? 'Alarm not supported'
                          : pushAlarmStatus === 'error'
                            ? 'Alarm setup failed'
                            : 'Enable reliable alarm'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-[#1a1a30] bg-[#0f0f1d] p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#52527a]">Coaching report</p>
                <p className="mt-2 text-sm font-bold text-[#e8e8f5]">Copy today&apos;s progress</p>
                <p className="mt-1 text-xs text-[#8b8bb3]">Paste it into ChatGPT or Claude for feedback.</p>
              </div>
              <div className="rounded-lg bg-[#4f8ef715] p-2 text-[#4f8ef7]">
                <Sparkles className="h-5 w-5" />
              </div>
            </div>
            <button onClick={copyCoachingReport} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-[#4f8ef740] px-3 py-2 text-xs font-bold text-[#4f8ef7]">
              <Sparkles className="h-3.5 w-3.5" />
              {reportCopied ? 'Report copied' : 'Copy coaching report'}
            </button>
          </div>
        </div>
        {renderMustTaskFocusTracker()}
      </section>
      ) : null}

      {scope === 'weekly' ? (
        <>
          {renderScopeCompletionCard('Weekly completion', 'Weighted progress for this week.', sectionCompletion.weekly)}
          <section className="mx-auto max-w-4xl px-5 pb-2">
            <div className="mb-4 rounded-xl border border-[#1a1a30] bg-[#0f0f1d] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#52527a]">Weekly planning</p>
                  <h2 className="mt-1 text-sm font-bold text-[#e8e8f5]">Plan this week before the days get noisy</h2>
                  <p className="mt-1 text-xs text-[#8b8bb3]">Write the main direction, then break it into study, work, and health focus.</p>
                </div>
                <button onClick={clearWeeklyPlan} className="shrink-0 rounded-lg border border-[#ff6b6b44] px-3 py-2 text-xs font-bold text-[#ff6b6b]">
                  Clear
                </button>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-[.16em] text-[#8b8bb3]">Main goal</span>
                  <textarea
                    value={weeklyPlan.mainGoal}
                    onChange={(event) => updateWeeklyPlan('mainGoal', event.target.value)}
                    placeholder="Example: Finish Spark module and stay consistent with gym."
                    rows={3}
                    className="mt-2 w-full resize-none rounded-lg border border-[#1a1a30] bg-[#13132a] px-3 py-2 text-sm text-[#e8e8f5] outline-none focus:border-[#00d97e]"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-[.16em] text-[#8b8bb3]">Study plan</span>
                  <textarea
                    value={weeklyPlan.studyPlan}
                    onChange={(event) => updateWeeklyPlan('studyPlan', event.target.value)}
                    placeholder="Topics, hours, course modules, practice problems..."
                    rows={3}
                    className="mt-2 w-full resize-none rounded-lg border border-[#1a1a30] bg-[#13132a] px-3 py-2 text-sm text-[#e8e8f5] outline-none focus:border-[#00d97e]"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-[.16em] text-[#8b8bb3]">Work plan</span>
                  <textarea
                    value={weeklyPlan.workPlan}
                    onChange={(event) => updateWeeklyPlan('workPlan', event.target.value)}
                    placeholder="Office work, course work, deep-work blocks..."
                    rows={3}
                    className="mt-2 w-full resize-none rounded-lg border border-[#1a1a30] bg-[#13132a] px-3 py-2 text-sm text-[#e8e8f5] outline-none focus:border-[#00d97e]"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-[.16em] text-[#8b8bb3]">Health plan</span>
                  <textarea
                    value={weeklyPlan.healthPlan}
                    onChange={(event) => updateWeeklyPlan('healthPlan', event.target.value)}
                    placeholder="Gym days, food rules, sleep, water, recovery..."
                    rows={3}
                    className="mt-2 w-full resize-none rounded-lg border border-[#1a1a30] bg-[#13132a] px-3 py-2 text-sm text-[#e8e8f5] outline-none focus:border-[#00d97e]"
                  />
                </label>
                <label className="block md:col-span-2">
                  <span className="text-[10px] font-bold uppercase tracking-[.16em] text-[#8b8bb3]">Notes / risk</span>
                  <textarea
                    value={weeklyPlan.notes}
                    onChange={(event) => updateWeeklyPlan('notes', event.target.value)}
                    placeholder="What can block this week? What is the backup plan?"
                    rows={3}
                    className="mt-2 w-full resize-none rounded-lg border border-[#1a1a30] bg-[#13132a] px-3 py-2 text-sm text-[#e8e8f5] outline-none focus:border-[#00d97e]"
                  />
                </label>
              </div>
            </div>
            <div className="rounded-xl border border-[#1a1a30] bg-[#0f0f1d] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#52527a]">Tomorrow work</p>
                  <h2 className="mt-1 text-sm font-bold text-[#e8e8f5]">Manual work for the upcoming day</h2>
                  <p className="mt-1 text-xs text-[#8b8bb3]">Add this yourself. It does not pull from today&apos;s tasks.</p>
                </div>
                <div className="rounded-lg bg-[#4f8ef715] px-3 py-2 text-sm font-bold text-[#4f8ef7]">{tomorrowTasks.length}</div>
              </div>
              <div className="mt-4 space-y-2">
                {tomorrowTasks.length ? (
                  tomorrowTasks.map(({ task, noteInfo }) => (
                    <div key={task.id} className="rounded-lg border border-[#1a1a30] bg-[#13132a] px-3 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#e8e8f5]">
                            <span>{task.text}</span>
                            <span className="rounded-full border border-[#ffd16640] bg-[#ffd16612] px-2 py-0.5 text-[10px] font-bold text-[#ffd166]">
                              {taskWeight(task)} pts
                            </span>
                          </p>
                          <p className="mt-1 text-[11px] text-[#8b8bb3]">
                            <span style={{ color: priorities[task.priority].color }}>{priorities[task.priority].label}</span>
                            {task.block ? ` - ${blocks[task.block].label}` : ''}
                            {noteInfo.note ? ` - ${noteInfo.note}` : ''}
                          </p>
                        </div>
                        {noteInfo.dueTime ? (
                          <span className="shrink-0 rounded-full border border-[#00d97e40] px-2 py-1 text-[11px] font-bold text-[#00d97e]">
                            By {noteInfo.dueTime}
                          </span>
                        ) : null}
                        <button onClick={() => deleteTomorrowTask(task.id)} className="shrink-0 rounded-lg border border-[#ff6b6b44] px-2 py-1 text-[11px] font-bold text-[#ff6b6b]">
                          Remove
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-[#1a1a30] px-3 py-5 text-center text-xs text-[#52527a]">
                    No tomorrow work yet.
                  </div>
                )}
              </div>
              <div className="mt-4 grid gap-2 border-t border-[#1a1a30] pt-4 md:grid-cols-[1fr,140px]">
                <input
                  value={tomorrowDraft.text}
                  onChange={(event) => setTomorrowDraft((current) => ({ ...current, text: event.target.value }))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') addTomorrowTask();
                  }}
                  placeholder="Add tomorrow work..."
                  className="rounded-lg border border-[#1a1a30] bg-[#13132a] px-3 py-2 text-sm outline-none focus:border-[#00d97e]"
                />
                <input
                  type="time"
                  value={tomorrowDraft.dueTime}
                  onChange={(event) => setTomorrowDraft((current) => ({ ...current, dueTime: event.target.value }))}
                  className="rounded-lg border border-[#1a1a30] bg-[#13132a] px-3 py-2 text-sm outline-none focus:border-[#00d97e]"
                />
                <input
                  value={tomorrowDraft.note}
                  onChange={(event) => setTomorrowDraft((current) => ({ ...current, note: event.target.value }))}
                  placeholder="Note (optional)"
                  className="rounded-lg border border-[#1a1a30] bg-[#13132a] px-3 py-2 text-sm outline-none focus:border-[#00d97e] md:col-span-2"
                />
                <button onClick={addTomorrowTask} className="rounded-lg bg-[#00d97e] px-3 py-2 text-sm font-bold text-black md:col-span-2">
                  Add tomorrow work
                </button>
              </div>
            </div>
          </section>
          {renderHabitMissCountsSection('Habit missed count', 'Weekly counter resets every Sunday at 3:00 AM IST.', weeklyHabitInsights, {
            showManualCheck: true,
            summaryLabel: 'Last week summary'
          })}
          {renderFailurePatternsSection('7-day failure patterns', 'Learn from misses without carrying them into today.', analytics, failurePatterns)}
        </>
      ) : null}

      {scope === 'monthly' ? (
        <>
          {renderScopeCompletionCard('Monthly completion', 'Weighted progress for this month.', sectionCompletion.monthly)}
          {renderPointHistorySection('Date-wise progress history', 'Completed points, failed points, total focus time, and four must-task timings for the current month.', monthlyPointHistory)}
        </>
      ) : null}

      {scope === 'yearly' ? (
        <>
        {renderScopeCompletionCard('Yearly completion', 'Weighted progress for your big goals.', sectionCompletion.yearly)}
        <section className="mx-auto max-w-4xl px-5 pb-4">
          <div className="rounded-xl border border-[#1a1a30] bg-[#0f0f1d] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#52527a]">Points completed tracker</p>
                <h2 className="mt-1 text-sm font-bold text-[#e8e8f5]">How many weighted points are completed in each section</h2>
              </div>
              <div className="rounded-lg bg-[#ffd16615] p-2 text-[#ffd166]">
                <Star className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {yearlyPointsTracker.map((item) => (
                <div key={item.scope} className="rounded-xl border border-[#1a1a30] bg-[#13132a] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#8b8bb3]">{item.label}</p>
                      <p className="mt-1 text-xl font-bold text-[#e8e8f5]">
                        {item.completion.donePoints}/{item.completion.totalPoints} pts
                      </p>
                    </div>
                    <span className="rounded-full bg-[#00d97e15] px-2 py-1 text-xs font-bold text-[#00d97e]">{item.completion.pct}%</span>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#1a1a30]">
                    <div className="h-full rounded-full bg-[#00d97e] transition-all" style={{ width: `${item.completion.pct}%` }} />
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {item.completedTasks.length ? (
                      item.completedTasks.slice(0, 6).map((task) => (
                        <div key={task.id} className="flex items-center justify-between gap-2 rounded-lg border border-[#1a1a30] bg-[#0f0f1d] px-2 py-1.5 text-xs">
                          <span className="min-w-0 truncate text-[#c8c8ee]">{task.text}</span>
                          <span className="shrink-0 font-bold text-[#ffd166]">{taskWeight(task)} pts</span>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-lg border border-dashed border-[#1a1a30] px-3 py-3 text-center text-[11px] text-[#52527a]">
                        No completed tasks yet.
                      </div>
                    )}
                    {item.completedTasks.length > 6 ? (
                      <p className="text-[11px] text-[#52527a]">+{item.completedTasks.length - 6} more completed task(s)</p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="mx-auto max-w-4xl px-5 pb-4">
          <div className="rounded-xl border border-[#4f8ef740] bg-[#0f0f1d] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#8b8bb3]">Archived monthly summaries</p>
                <h2 className="mt-1 text-sm font-bold text-[#e8e8f5]">Each month is saved here after the 3 AM reset</h2>
              </div>
              <div className="rounded-lg bg-[#4f8ef715] p-2 text-[#4f8ef7]">
                <CalendarDays className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {monthlySummaries.length ? (
                monthlySummaries.map((summary) => (
                  <div key={summary.monthKey} className="rounded-lg border border-[#1a1a30] bg-[#13132a] px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-[#e8e8f5]">{formatMonthKey(summary.monthKey)}</p>
                      <span className="text-[10px] text-[#00d97e]">Archived</span>
                    </div>
                    <p className="mt-2 text-xs text-[#8b8bb3]">
                      Done <span className="font-bold text-[#00d97e]">{summary.completedPoints} pts</span>
                      {' · '}
                      Failed <span className="font-bold text-[#ff6b6b]">{summary.failedPoints} pts</span>
                      {' · '}
                      Focus <span className="font-bold text-[#4f8ef7]">{formatMinutes(summary.focusMinutes) || '0m'}</span>
                    </p>
                    <p className="mt-1 text-[11px] text-[#52527a]">{summary.days.filter((day) => day.completedPoints || day.failedPoints || day.focusMinutes).length} active day(s)</p>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-[#1a1a30] px-3 py-5 text-center text-xs text-[#52527a] md:col-span-2">
                  Your first monthly summary will appear here after the next reset.
                </div>
              )}
            </div>
          </div>
        </section>
        <section className="mx-auto grid max-w-4xl gap-4 px-5 pb-4 md:grid-cols-2">
          <div className="rounded-xl border border-[#1a1a30] bg-[#0f0f1d] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#8b8bb3]">Books completed this year</p>
                <h2 className="mt-1 text-sm font-bold text-[#e8e8f5]">Reading notes</h2>
              </div>
              <div className="rounded-lg bg-[#4f8ef715] p-2 text-[#4f8ef7]">
                <Edit3 className="h-5 w-5" />
              </div>
            </div>
            <textarea
              value={yearlyNotes.completedBooks}
              onChange={(event) => updateYearlyBooks(event.target.value)}
              placeholder={'Add completed books here...\nExample:\nAtomic Habits - Jan\nDeep Work - Feb'}
              className="mt-4 min-h-36 w-full resize-y rounded-xl border border-[#1a1a30] bg-[#13132a] px-3 py-3 text-sm leading-6 text-[#e8e8f5] outline-none placeholder:text-[#52527a] focus:border-[#4f8ef7]"
            />
            <p className="mt-2 text-[11px] text-[#52527a]">
              Saved with your yearly goals. Use one line per book so it stays easy to review.
            </p>
          </div>
          <div className="rounded-xl border border-[#ff6b6b44] bg-[#0f0f1d] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#ff8a8a]">Punishment</p>
                <h2 className="mt-1 text-sm font-bold text-[#e8e8f5]">Accountability rules</h2>
              </div>
              <div className="rounded-lg bg-[#ff6b6b18] p-2 text-[#ff6b6b]">
                <AlertTriangle className="h-5 w-5" />
              </div>
            </div>
            <textarea
              value={yearlyNotes.punishment}
              onChange={(event) => updateYearlyPunishment(event.target.value)}
              placeholder={'Write your punishment rules here...\nExample:\nIf I miss study 2 days in a row - no YouTube next day\nIf I miss gym 3 times in a week - extra Sunday workout'}
              className="mt-4 min-h-36 w-full resize-y rounded-xl border border-[#ff6b6b44] bg-[#13132a] px-3 py-3 text-sm leading-6 text-[#e8e8f5] outline-none placeholder:text-[#52527a] focus:border-[#ff6b6b]"
            />
            <p className="mt-2 text-[11px] text-[#52527a]">
              Keep this realistic and specific. It syncs with your yearly goals.
            </p>
          </div>
          <div className="rounded-xl border border-[#4f8ef740] bg-[#0f0f1d] p-4 md:col-span-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#8b8bb3]">Goal breakdown</p>
                <h2 className="mt-1 text-sm font-bold text-[#e8e8f5]">Turn each yearly goal into monthly, weekly, and daily action</h2>
              </div>
              <div className="rounded-lg bg-[#00d97e15] p-2 text-[#00d97e]">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {store.yearly.length ? (
                store.yearly.map((task) => {
                  const breakdown = yearlyNotes.goalBreakdowns[task.id] || { monthlyMilestone: '', weeklyAction: '', dailyHabit: '' };
                  return (
                    <div key={task.id} className="rounded-xl border border-[#1a1a30] bg-[#13132a] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-[#e8e8f5]">
                            <span>{task.text}</span>
                            <span className="rounded-full border border-[#ffd16640] bg-[#ffd16612] px-2 py-0.5 text-[10px] font-bold text-[#ffd166]">
                              {taskWeight(task)} pts
                            </span>
                          </p>
                          <p className="mt-1 text-[11px]" style={{ color: priorities[task.priority].color }}>
                            {priorities[task.priority].label}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${task.done ? 'bg-[#00d97e15] text-[#00d97e]' : 'bg-[#4f8ef715] text-[#4f8ef7]'}`}>
                          {task.done ? 'Done' : 'Active'}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-2 md:grid-cols-3">
                        <label className="block">
                          <span className="text-[10px] font-bold uppercase tracking-[.16em] text-[#8b8bb3]">Monthly milestone</span>
                          <textarea
                            value={breakdown.monthlyMilestone}
                            onChange={(event) => updateYearlyGoalBreakdown(task.id, 'monthlyMilestone', event.target.value)}
                            placeholder="What should be true this month?"
                            rows={3}
                            className="mt-2 w-full resize-none rounded-lg border border-[#1a1a30] bg-[#0f0f1d] px-3 py-2 text-xs leading-5 text-[#e8e8f5] outline-none placeholder:text-[#52527a] focus:border-[#4f8ef7]"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[10px] font-bold uppercase tracking-[.16em] text-[#8b8bb3]">Weekly action</span>
                          <textarea
                            value={breakdown.weeklyAction}
                            onChange={(event) => updateYearlyGoalBreakdown(task.id, 'weeklyAction', event.target.value)}
                            placeholder="What will I do every week?"
                            rows={3}
                            className="mt-2 w-full resize-none rounded-lg border border-[#1a1a30] bg-[#0f0f1d] px-3 py-2 text-xs leading-5 text-[#e8e8f5] outline-none placeholder:text-[#52527a] focus:border-[#00d97e]"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[10px] font-bold uppercase tracking-[.16em] text-[#8b8bb3]">Daily habit</span>
                          <textarea
                            value={breakdown.dailyHabit}
                            onChange={(event) => updateYearlyGoalBreakdown(task.id, 'dailyHabit', event.target.value)}
                            placeholder="What small action repeats daily?"
                            rows={3}
                            className="mt-2 w-full resize-none rounded-lg border border-[#1a1a30] bg-[#0f0f1d] px-3 py-2 text-xs leading-5 text-[#e8e8f5] outline-none placeholder:text-[#52527a] focus:border-[#f7a04f]"
                          />
                        </label>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-lg border border-dashed border-[#1a1a30] px-3 py-5 text-center text-xs text-[#52527a]">
                  Add yearly goals below, then break them into monthly, weekly, and daily actions here.
                </div>
              )}
            </div>
          </div>
        </section>
        </>
      ) : null}

      <section className="mx-auto grid max-w-4xl gap-4 px-5 md:grid-cols-[1fr,320px]">
        <div className="space-y-4">
          {taskGroups.map((group) => {
            return (
              <div key={group.id} className="overflow-hidden rounded-xl border border-[#1a1a30] bg-[#0f0f1d]">
                <div className="flex items-center justify-between border-b border-[#1a1a30] px-4 py-3">
                  <div>
                    <h2 className="text-sm font-bold" style={{ color: group.color }}>{group.title}</h2>
                    <p className="text-[11px] text-[#52527a]">{group.sub}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {scope === 'today' && group.id === 'habit' ? (
                      <button onClick={resetHabitTasks} className="rounded-lg border border-[#00d97e40] px-2 py-1 text-[11px] font-bold text-[#00d97e]">
                        Reset habits
                      </button>
                    ) : null}
                    <span className="text-xs font-bold" style={{ color: group.color }}>{group.done}/{group.total}</span>
                  </div>
                </div>

                {group.tasks.length ? (
                  group.tasks.map((task) => (
                    <article key={task.id} className="border-b border-[#1a1a30] last:border-b-0">
                      {(() => {
                        const noteInfo = splitTaskNote(task.note);
                        const canUseSubtasks = allowsSubtasks(task);
                        const subtasks = canUseSubtasks ? task.subtasks || [] : [];
                        const doneSubtasks = subtasks.filter((subtask) => subtask.done).length;
                        const taskColor = scope === 'weekend' ? group.color : priorities[task.priority].color;
                        const taskSoft = scope === 'weekend' ? 'rgba(79,142,247,.12)' : priorities[task.priority].soft;
                        const habitMissWarning = scope === 'today' && group.id === 'habit' && !task.done && threeDayHabitMissWarnings.has(normalizeStrikeCode(task.text) as StrikeCode);
                        return (
                          <>
                            <div className={`flex items-stretch ${habitMissWarning ? 'bg-[#ff6b6b10] shadow-[inset_3px_0_0_#ff6b6b]' : ''}`}>
                              <button onClick={() => toggleTask(task.id)} className="flex flex-1 items-start gap-3 px-4 py-3 text-left">
                                <span
                                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border"
                                  style={{ borderColor: habitMissWarning ? '#ff6b6b' : taskColor, background: task.done ? taskSoft : 'transparent' }}
                                >
                                  {task.done ? <Check className="h-3.5 w-3.5" style={{ color: taskColor }} /> : null}
                                </span>
                                <span className="min-w-0">
                                  <span className="flex flex-wrap items-center gap-2">
                                    <span className={`text-sm ${task.done ? 'text-[#52527a] line-through' : 'text-[#e8e8f5]'}`}>{task.text}</span>
                                    <span className="rounded-full border border-[#ffd16640] bg-[#ffd16612] px-2 py-0.5 text-[10px] font-bold text-[#ffd166]">
                                      {taskWeight(task)} pts
                                    </span>
                                  </span>
                                  <span className="mt-1 flex flex-wrap gap-2 text-[11px] text-[#52527a]">
                                    {scope !== 'weekend' ? <span style={{ color: priorities[task.priority].color }}>{priorities[task.priority].label}</span> : null}
                                    {noteInfo.dueTime ? <span style={{ color: '#00d97e' }}>By {noteInfo.dueTime}</span> : null}
                                    {noteInfo.note ? <span>{noteInfo.note}</span> : null}
                                    {habitMissWarning ? <span style={{ color: '#ff6b6b' }}>3-day miss streak</span> : null}
                                    {subtasks.length ? (
                                      <span style={{ color: doneSubtasks === subtasks.length ? '#00d97e' : '#8b8bb3' }}>
                                        {doneSubtasks}/{subtasks.length} subtasks
                                      </span>
                                    ) : null}
                                    {task.done && task.investedMinutes != null ? (
                                      <span style={{ color: taskColor }}>{formatMinutes(task.investedMinutes)} invested</span>
                                    ) : null}
                                    {task.done && task.startedAt && task.completedAt ? (
                                      <span>
                                        {formatTimeShort(task.startedAt)} - {formatTimeShort(task.completedAt)}
                                      </span>
                                    ) : null}
                                  </span>
                                </span>
                              </button>
                              <button aria-label="Edit task" onClick={() => beginEdit(task)} className="w-11 border-l border-[#1a1a30] text-[#4f8ef7]">
                                <Edit3 className="mx-auto h-4 w-4" />
                              </button>
                              {scope === 'today' ? (
                                <button
                                  aria-label="Set next target"
                                  onClick={() => toggleTargetTask(task.id)}
                                  className={`w-11 border-l border-[#1a1a30] ${targetTaskIds.includes(task.id) ? 'text-[#ffd166]' : 'text-[#52527a]'}`}
                                >
                                  <Star className="mx-auto h-4 w-4" />
                                </button>
                              ) : null}
                              <button aria-label="Log failure" onClick={() => openFailure(task)} className="w-11 border-l border-[#1a1a30] text-[#f7a04f]">
                                <AlertTriangle className="mx-auto h-4 w-4" />
                              </button>
                              <button aria-label="Delete task" onClick={() => deleteTask(task.id)} className="w-11 border-l border-[#1a1a30] text-[#ff6b6b]">
                                <Trash2 className="mx-auto h-4 w-4" />
                              </button>
                            </div>
                            {canUseSubtasks ? (
                              <div className="space-y-2 border-t border-[#1a1a30] bg-[#0b0b18] px-4 py-3">
                                {subtasks.length ? (
                                  <div className="space-y-1.5">
                                    {subtasks.map((subtask) => (
                                      <div key={subtask.id} className="flex items-center gap-2 rounded-lg border border-[#1a1a30] bg-[#0f0f1d] px-2 py-2">
                                        <button
                                          type="button"
                                          onClick={() => toggleSubtask(task.id, subtask.id)}
                                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#4f8ef740] text-[#4f8ef7]"
                                          aria-label={subtask.done ? 'Mark subtask pending' : 'Mark subtask done'}
                                        >
                                          {subtask.done ? <Check className="h-3.5 w-3.5" /> : null}
                                        </button>
                                        <span className={`min-w-0 flex-1 text-xs ${subtask.done ? 'text-[#52527a] line-through' : 'text-[#c8c8ee]'}`}>{subtask.text}</span>
                                        <button type="button" onClick={() => deleteSubtask(task.id, subtask.id)} className="rounded-md px-2 py-1 text-[#ff6b6b]" aria-label="Delete subtask">
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                                <div className="flex gap-2">
                                  <input
                                    value={subtaskDrafts[task.id] || ''}
                                    onChange={(event) => setSubtaskDrafts((current) => ({ ...current, [task.id]: event.target.value }))}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter') addSubtask(task.id);
                                    }}
                                    placeholder="+ Add subtask"
                                    className="min-w-0 flex-1 rounded-lg border border-[#1a1a30] bg-[#07070f] px-3 py-2 text-xs outline-none placeholder:text-[#52527a] focus:border-[#4f8ef7]"
                                  />
                                  <button type="button" onClick={() => addSubtask(task.id)} className="rounded-lg border border-[#4f8ef740] px-3 py-2 text-xs font-bold text-[#4f8ef7]">
                                    Add
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </>
                        );
                      })()}
                    </article>
                  ))
                ) : (
                  <div className="px-4 py-6 text-center text-sm text-[#52527a]">No tasks here yet.</div>
                )}
              </div>
            );
          })}
        </div>

        <aside className="h-fit rounded-xl border border-[#1a1a30] bg-[#13132a] p-4">
          <h2 className="text-sm font-bold">{editing ? 'Edit task' : 'Add task'}</h2>
          <div className="mt-3 space-y-3">
            <input
              value={draft.text}
              onChange={(event) => setDraft((current) => ({ ...current, text: event.target.value }))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') saveTask();
              }}
              placeholder="Task name"
              className="w-full rounded-lg border border-[#1a1a30] bg-[#0f0f1d] px-3 py-2 text-sm outline-none focus:border-[#00d97e]"
            />
            <input
              value={draft.note}
              onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
              placeholder="Note (optional)"
              className="w-full rounded-lg border border-[#1a1a30] bg-[#0f0f1d] px-3 py-2 text-sm outline-none focus:border-[#00d97e]"
            />
            <label className="block">
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-[.18em] text-[#52527a]">Weight points</span>
              <input
                type="number"
                min="0"
                max="100"
                inputMode="numeric"
                value={draft.weight}
                onChange={(event) => setDraft((current) => ({ ...current, weight: event.target.value.replace(/[^\d]/g, '') }))}
                onBlur={() => setDraft((current) => ({ ...current, weight: String(normalizeTaskWeight(current.weight, 1)) }))}
                className="w-full rounded-lg border border-[#1a1a30] bg-[#0f0f1d] px-3 py-2 text-sm outline-none focus:border-[#00d97e]"
              />
              <p className="mt-1 text-[11px] text-[#52527a]">Use 5 for most important tasks, 3 for important habits, 1 for small work.</p>
            </label>
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#52527a]">Subtasks</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: true, label: 'Need subtasks' },
                  { value: false, label: 'No subtasks' }
                ].map((option) => {
                  const isActive = draft.allowSubtasks === option.value;
                  return (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => setDraft((current) => ({ ...current, allowSubtasks: option.value }))}
                      className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${
                        isActive ? 'border-[#00d97e] bg-[#00d97e15] text-[#00d97e]' : 'border-[#1a1a30] bg-[#0f0f1d] text-[#8b8bb3]'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {scope !== 'today' && scope !== 'weekend' ? (
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#52527a]">Priority</p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(priorities).map(([key, value]) => {
                    const isActive = draft.priority === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setDraft((current) => ({ ...current, priority: key as Priority }))}
                        className="rounded-lg border px-3 py-2 text-xs font-bold transition"
                        style={{
                          borderColor: isActive ? value.color : '#1a1a30',
                          background: isActive ? value.soft : '#0f0f1d',
                          color: isActive ? value.color : '#8b8bb3'
                        }}
                      >
                        {value.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {scope === 'today' ? (
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#52527a]">Time block</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {Object.entries(blocks).map(([key, value]) => {
                    const isActive = draft.block === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setDraft((current) => ({ ...current, block: key as Block }))}
                        className={`rounded-lg border px-2 py-2 text-xs font-bold transition ${
                          isActive ? 'border-[#4f8ef7] bg-[#4f8ef715] text-[#4f8ef7]' : 'border-[#1a1a30] bg-[#0f0f1d] text-[#8b8bb3]'
                        }`}
                      >
                        {value.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {scope === 'today' ? (
              <label className="block">
                <span className="mb-2 block text-[10px] font-bold uppercase tracking-[.18em] text-[#52527a]">Complete by</span>
                <input
                  type="time"
                  value={draft.dueTime}
                  onChange={(event) => setDraft((current) => ({ ...current, dueTime: event.target.value }))}
                  className="w-full rounded-lg border border-[#1a1a30] bg-[#0f0f1d] px-3 py-2 text-sm outline-none focus:border-[#00d97e]"
                />
              </label>
            ) : null}
            <button onClick={saveTask} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#00d97e] px-3 py-3 text-sm font-bold text-black">
              <Save className="h-4 w-4" />
              {editing ? 'Save changes' : 'Add task'}
            </button>
            {editing ? (
              <button onClick={resetDraft} className="w-full rounded-lg border border-[#1a1a30] px-3 py-2 text-sm text-[#8b8bb3]">Cancel edit</button>
            ) : null}
            {scope === 'today' && store.today.some((task) => task.done) ? (
              <button onClick={clearCompletedDailyTasks} className="w-full rounded-lg border border-[#ff6b6b44] px-3 py-2 text-sm font-bold text-[#ff6b6b]">
                Clear completed daily tasks
              </button>
            ) : null}
          </div>

          <div className="mt-5 border-t border-[#1a1a30] pt-4">
            <h3 className="text-xs font-bold uppercase tracking-[.2em] text-[#52527a]">Backup</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={copyBackup} className="flex items-center justify-center gap-2 rounded-lg border border-[#1a1a30] px-2 py-2 text-xs text-[#8b8bb3]">
                <Copy className="h-3.5 w-3.5" /> Copy
              </button>
              <button onClick={downloadBackup} className="flex items-center justify-center gap-2 rounded-lg border border-[#1a1a30] px-2 py-2 text-xs text-[#8b8bb3]">
                <Download className="h-3.5 w-3.5" /> Export
              </button>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#1a1a30] px-2 py-2 text-xs text-[#8b8bb3]">
                <Upload className="h-3.5 w-3.5" /> Import
                <input type="file" accept="application/json" className="hidden" onChange={(event) => importBackup(event.target.files?.[0])} />
              </label>
              <button onClick={resetAll} className="flex items-center justify-center gap-2 rounded-lg border border-[#ff6b6b44] px-2 py-2 text-xs text-[#ff6b6b]">
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </button>
            </div>
          </div>

          {scope !== 'monthly' ? (
            <div className="mt-5 border-t border-[#1a1a30] pt-4">
              <h3 className="text-xs font-bold uppercase tracking-[.2em] text-[#52527a]">{sideMissLogTitle}</h3>
              <div className="mt-3 space-y-2">
                {sideMissLog.length ? (
                  sideMissLog.map((activity) => (
                    <div key={activity.id} className="rounded-lg border border-[#1a1a30] bg-[#0f0f1d] px-3 py-2">
                      <p className="text-sm text-[#e8e8f5]">{activity.taskText}</p>
                      <p className="mt-1 text-[11px] text-[#8b8bb3]">
                        {activity.reason || 'Missed'}
                        {activity.note ? ` - ${activity.note}` : ''}
                        {' - '}
                        {formatDateShort(activity.createdAt)}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-[#1a1a30] px-3 py-4 text-center text-[11px] text-[#52527a]">
                    Nothing logged yet.
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {(scope === 'today' || scope === 'weekend') && completedInCurrentScope.length ? (
            <div className="mt-5 border-t border-[#1a1a30] pt-4">
              <h3 className="text-xs font-bold uppercase tracking-[.2em] text-[#52527a]">
                {scope === 'weekend' ? 'Completed weekend tasks' : 'Completed tasks'}
              </h3>
              <div className="mt-3 space-y-2">
                {completedInCurrentScope.map((task) => {
                  const noteInfo = splitTaskNote(task.note);
                  return (
                    <div key={task.id} className="rounded-lg border border-[#1a1a30] bg-[#0f0f1d] px-3 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 text-sm text-[#e8e8f5]">
                            <span>{task.text}</span>
                            <span className="rounded-full border border-[#ffd16640] bg-[#ffd16612] px-2 py-0.5 text-[10px] font-bold text-[#ffd166]">
                              {taskWeight(task)} pts
                            </span>
                          </p>
                          <p className="mt-1 flex flex-wrap gap-2 text-[11px] text-[#8b8bb3]">
                            <span style={{ color: priorities[task.priority].color }}>{priorities[task.priority].label}</span>
                            {noteInfo.dueTime ? <span className="text-[#00d97e]">By {noteInfo.dueTime}</span> : null}
                            {task.investedMinutes != null ? <span>{formatMinutes(task.investedMinutes)} invested</span> : null}
                            {allowsSubtasks(task) && task.subtasks?.length ? (
                              <span>
                                {task.subtasks.filter((subtask) => subtask.done).length}/{task.subtasks.length} subtasks
                              </span>
                            ) : null}
                          </p>
                        </div>
                        <button onClick={() => toggleTask(task.id)} className="shrink-0 rounded-lg border border-[#1a1a30] px-2 py-1 text-[11px] font-bold text-[#8b8bb3]">
                          Undo
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </aside>
      </section>

      <div className={`fixed inset-0 z-[99996] flex items-end justify-center bg-black/70 px-4 transition ${scoreOpen ? 'visible opacity-100' : 'pointer-events-none invisible opacity-0'}`}>
        <div className="w-full max-w-md rounded-t-3xl border border-[#1a1a30] bg-[#12122a] p-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)]">
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[#1a1a30]" />
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#52527a]">Score details</p>
              <h2 className="mt-1 text-base font-bold text-[#e8e8f5]">Today and week snapshot</h2>
            </div>
            <div className="rounded-lg bg-[#4f8ef715] p-2 text-[#4f8ef7]">
              <BarChart3 className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-[#1a1a30] bg-[#0f0f1d] p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#52527a]">Overall score</p>
                <p className="mt-1 text-3xl font-bold text-[#e8e8f5]">{overallScore}</p>
              </div>
              <div className="rounded-lg bg-[#00d97e15] p-2 text-[#00d97e]">
                <BarChart3 className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#1a1a30]">
              <div className="h-full rounded-full bg-[#00d97e]" style={{ width: `${overallScore}%` }} />
            </div>
            <p className="mt-2 text-[11px] text-[#8b8bb3]">A mix of completions, consistency, time invested, and logged failures.</p>
          </div>
          <div className="mt-3 rounded-xl border border-[#1a1a30] bg-[#0f0f1d] p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#52527a]">This week</p>
                <p className="mt-1 text-3xl font-bold text-[#e8e8f5]">{analytics.totals.completions}</p>
              </div>
              <div className="rounded-lg bg-[#4f8ef715] p-2 text-[#4f8ef7]">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-[#8b8bb3]">
              <div className="rounded-lg border border-[#1a1a30] bg-[#13132a] px-2 py-2">
                <p className="text-[10px] text-[#52527a]">Done</p>
                <p className="mt-1 text-sm font-bold text-[#00d97e]">{analytics.totals.completions}</p>
              </div>
              <div className="rounded-lg border border-[#1a1a30] bg-[#13132a] px-2 py-2">
                <p className="text-[10px] text-[#52527a]">Fails</p>
                <p className="mt-1 text-sm font-bold text-[#ff6b6b]">{analytics.totals.failures}</p>
              </div>
              <div className="rounded-lg border border-[#1a1a30] bg-[#13132a] px-2 py-2">
                <p className="text-[10px] text-[#52527a]">Time</p>
                <p className="mt-1 text-sm font-bold text-[#f7a04f]">{formatMinutes(analytics.totals.minutes) || '0m'}</p>
              </div>
            </div>
          </div>
          <button onClick={() => setScoreOpen(false)} className="mt-4 w-full rounded-xl border border-[#1a1a30] px-3 py-3 text-sm text-[#8b8bb3]">
            Close
          </button>
        </div>
      </div>

      <div className={`fixed inset-0 z-[99997] flex items-end justify-center bg-black/70 px-4 transition ${calendarOpen ? 'visible opacity-100' : 'pointer-events-none invisible opacity-0'}`}>
        <div className="w-full max-w-md rounded-t-3xl border border-[#1a1a30] bg-[#12122a] p-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)]">
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[#1a1a30]" />
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#52527a]">Calendar heatmap</p>
              <h2 className="mt-1 text-base font-bold text-[#e8e8f5]">{MONTH_LABELS[calendarCursor.getMonth()]} {calendarCursor.getFullYear()}</h2>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCalendarCursor((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
                className="h-8 w-8 rounded-lg border border-[#1a1a30] text-sm text-[#8b8bb3]"
                aria-label="Previous month"
              >
                &lt;
              </button>
              <button
                onClick={() => setCalendarCursor((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
                className="h-8 w-8 rounded-lg border border-[#1a1a30] text-sm text-[#8b8bb3]"
                aria-label="Next month"
              >
                &gt;
              </button>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-7 gap-1">
            {WEEKDAY_LABELS.map((label, index) => (
              <div key={`${label}-${index}`} className="py-1 text-center text-[10px] font-bold text-[#52527a]">
                {label}
              </div>
            ))}
            {calendarDays.map((day) => {
              const isToday = day.date ? toISODate(day.date) === toISODate(new Date()) : false;
              const stateClass =
                day.status === 'green'
                  ? 'border-[#00d97e40] bg-[#00d97e] text-black'
                  : day.status === 'red'
                    ? 'border-[#ff6b6b44] bg-[#ff6b6b22] text-[#ff6b6b]'
                    : 'border-[#1a1a30] bg-[#13132a] text-[#52527a]';
              return (
                <div
                  key={day.key}
                  className={`flex aspect-square min-h-10 items-center justify-center rounded-lg border text-xs font-bold ${day.day ? stateClass : 'border-transparent bg-transparent'} ${
                    isToday ? 'ring-1 ring-white/80' : ''
                  }`}
                  title={day.date ? `${formatDateShort(day.date.toISOString())}: ${day.status}` : undefined}
                >
                  {day.day || ''}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-[#8b8bb3]">
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-[#00d97e]" />All done</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-[#ff6b6b55]" />Incomplete</span>
          </div>
          <button onClick={() => setCalendarOpen(false)} className="mt-4 w-full rounded-xl border border-[#1a1a30] px-3 py-3 text-sm text-[#8b8bb3]">
            Close
          </button>
        </div>
      </div>

      <div className={`fixed inset-0 z-[99999] flex items-end justify-center bg-black/60 px-4 transition ${timingTask ? 'visible opacity-100' : 'pointer-events-none invisible opacity-0'}`}>
        <div className="w-full max-w-md rounded-t-3xl border border-[#1a1a30] bg-[#12122a] p-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)]">
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[#1a1a30]" />
          <div className="text-[10px] font-bold uppercase tracking-[.28em] text-[#8b8bb3]">Task completed</div>
          <div className="mt-2 text-base font-bold text-[#e8e8f5]">{timingTask?.text}</div>
          <div className="mt-4 text-[11px] text-[#8b8bb3]">When did you start this task?</div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-xl border border-[#1a1a30] bg-[#0f0f1d] px-3 py-2">
              <p className="text-[#52527a]">Start</p>
              <p className="mt-1 font-bold text-[#e8e8f5]">{timingStart || '-'}</p>
            </div>
            <div className="rounded-xl border border-[#1a1a30] bg-[#0f0f1d] px-3 py-2">
              <p className="text-[#52527a]">End</p>
              <p className="mt-1 font-bold text-[#00d97e]">{timingEnd || '-'}</p>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-[.18em] text-[#52527a]">Start time</span>
              <input
                type="time"
                value={timingStart}
                onChange={(event) => {
                  setTimingStart(event.target.value);
                  updateTimingPreview(event.target.value, timingEnd);
                }}
                className="mt-1 w-full rounded-xl border border-[#1a1a30] bg-[#0f0f1d] px-3 py-3 text-center text-base text-[#e8e8f5] outline-none focus:border-[#00d97e]"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-[.18em] text-[#52527a]">End time</span>
              <input
                type="time"
                value={timingEnd}
                onChange={(event) => {
                  setTimingEnd(event.target.value);
                  updateTimingPreview(timingStart, event.target.value);
                }}
                className="mt-1 w-full rounded-xl border border-[#1a1a30] bg-[#0f0f1d] px-3 py-3 text-center text-base text-[#e8e8f5] outline-none focus:border-[#00d97e]"
              />
            </label>
          </div>
          <div className="mt-3 rounded-xl border border-[#1a1a30] bg-[#0f0f1d] px-4 py-3 text-sm text-[#8b8bb3]">{timingPreview}</div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => {
                const now = new Date();
                const value = formatClock(now);
                setTimingStart(value);
                setTimingEnd(value);
                updateTimingPreview(value, value);
              }}
              className="flex-1 rounded-xl border border-[#1a1a30] bg-[#0f0f1d] px-3 py-3 text-sm text-[#8b8bb3]"
            >
              Just now
            </button>
            <button onClick={confirmTiming} className="flex-1 rounded-xl bg-[#00d97e] px-3 py-3 text-sm font-bold text-black">
              Save & Complete
            </button>
          </div>
          <button
            onClick={() => {
              setTimingTask(null);
              setTimingScope('today');
              setTimingStart('');
              setTimingEnd('');
              setTimingPreview('-');
            }}
            className="mt-2 w-full rounded-xl px-3 py-3 text-sm text-[#52527a]"
          >
            Cancel
          </button>
        </div>
      </div>


      <div className={`fixed inset-0 z-[99998] flex items-end justify-center bg-black/60 px-4 transition ${failureTask ? 'visible opacity-100' : 'pointer-events-none invisible opacity-0'}`}>
        <div className="w-full max-w-md rounded-t-3xl border border-[#1a1a30] bg-[#12122a] p-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)]">
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[#1a1a30]" />
          <div className="text-[10px] font-bold uppercase tracking-[.28em] text-[#8b8bb3]">Log failure</div>
          <div className="mt-2 text-base font-bold text-[#e8e8f5]">{failureTask?.text}</div>
          <div className="mt-4 grid gap-2">
            <label className="text-[11px] text-[#8b8bb3]">Why did it slip?</label>
            <select
              value={failureReason}
              onChange={(event) => setFailureReason(event.target.value as (typeof FAILURE_REASONS)[number])}
              className="w-full rounded-xl border border-[#1a1a30] bg-[#0f0f1d] px-4 py-3 text-sm text-[#e8e8f5] outline-none focus:border-[#ff6b6b]"
            >
              {FAILURE_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
            <textarea
              value={failureNote}
              onChange={(event) => setFailureNote(event.target.value)}
              placeholder="Optional note"
              className="min-h-24 w-full rounded-xl border border-[#1a1a30] bg-[#0f0f1d] px-4 py-3 text-sm text-[#e8e8f5] outline-none focus:border-[#ff6b6b]"
            />
            <div className="rounded-xl border border-[#1a1a30] bg-[#0f0f1d] px-4 py-3 text-[11px] text-[#8b8bb3]">
              Today failures move into tomorrow work and stay visible in your failure log.
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => {
                setFailureTask(null);
                setFailureScope('today');
                setFailureReason('Tired');
                setFailureNote('');
              }}
              className="flex-1 rounded-xl border border-[#1a1a30] bg-[#0f0f1d] px-3 py-3 text-sm text-[#8b8bb3]"
            >
              Cancel
            </button>
            <button onClick={saveFailure} className="flex-1 rounded-xl bg-[#ff6b6b] px-3 py-3 text-sm font-bold text-black">
              Save failure
            </button>
          </div>
        </div>
      </div>

      <div className={`fixed inset-0 z-[100000] flex items-end justify-center bg-black/70 px-4 transition ${targetConflict ? 'visible opacity-100' : 'pointer-events-none invisible opacity-0'}`}>
        <div className="w-full max-w-md rounded-t-3xl border border-[#1a1a30] bg-[#12122a] p-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)]">
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[#1a1a30]" />
          <div className="text-[10px] font-bold uppercase tracking-[.28em] text-[#f7a04f]">Newer data found</div>
          <h2 className="mt-2 text-base font-bold text-[#e8e8f5]">Another browser has a newer timer target.</h2>
          <p className="mt-2 text-sm leading-6 text-[#8b8bb3]">
            Keep your current target list, or use the cloud version from the other browser.
          </p>
          {targetConflict ? (
            <div className="mt-4 rounded-xl border border-[#1a1a30] bg-[#0f0f1d] p-3 text-xs text-[#8b8bb3]">
              <div className="flex justify-between gap-3">
                <span>Cloud target tasks</span>
                <span className="font-bold text-[#e8e8f5]">{targetConflict.taskIds.length}</span>
              </div>
              <div className="mt-2 flex justify-between gap-3">
                <span>Cloud timer</span>
                <span className="font-bold text-[#e8e8f5]">{targetConflict.running ? 'Running' : 'Paused'} · {formatCountdown(targetConflict.remainingMs)}</span>
              </div>
            </div>
          ) : null}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button onClick={keepLocalTargetConflict} className="rounded-xl border border-[#1a1a30] bg-[#0f0f1d] px-3 py-3 text-sm font-bold text-[#8b8bb3]">
              Keep mine
            </button>
            <button onClick={useCloudTargetConflict} className="rounded-xl bg-[#00d97e] px-3 py-3 text-sm font-bold text-black">
              Use cloud
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

