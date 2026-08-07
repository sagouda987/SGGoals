'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, BarChart3, CalendarDays, Check, Clock, Copy, Download, Edit3, RotateCcw, Save, Sparkles, Star, Trash2, TrendingUp, Upload } from 'lucide-react';

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
  done: boolean;
  startedAt?: string;
  completedAt?: string;
  investedMinutes?: number;
  subtasks?: GoalSubtask[];
  updatedAt: string;
};

type ActivityKind = 'completion' | 'failure' | 'undo' | 'strike-reset';
type StrikeCode = 'O' | 'L1' | 'L2' | 'L3' | 'M' | 'GYM' | 'HEALTHYDRINKMORNING' | 'HEALTHYDRINKEVENING' | 'BOOK' | 'STUDY2' | 'OFFICEWORK2' | 'SLEEP' | 'NOJUNK' | 'MANIFEST' | 'NOSOCIAL' | 'OFFICECOURSE' | 'EYECARE' | 'SALTGARGLE';
type StrikeFamily = 'O' | 'L' | 'M' | 'GYM' | 'HEALTHYDRINKMORNING' | 'HEALTHYDRINKEVENING' | 'BOOK' | 'STUDY2' | 'OFFICEWORK2' | 'SLEEP' | 'NOJUNK' | 'MANIFEST' | 'NOSOCIAL' | 'OFFICECOURSE' | 'EYECARE' | 'SALTGARGLE';

type GoalActivity = {
  id: string;
  scope: Scope;
  priority: Priority;
  taskText: string;
  kind: ActivityKind;
  reason?: string;
  note?: string;
  minutes?: number;
  startedAt?: string;
  completedAt?: string;
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
  updatedAt: string;
};
type TargetState = {
  taskIds: string[];
  taskMinutes?: Record<string, number>;
  endAt: string;
  running: boolean;
  remainingMs: number;
  durationMs?: number;
  durationMinutes?: number;
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
const TARGET_TIMER_KEY = 'sg-goals-target-timer-v3';
const TARGET_REMAINING_KEY = 'sg-goals-target-remaining-v3';
const TARGET_RUNNING_KEY = 'sg-goals-target-running-v3';
const TARGET_DURATION_MINUTES_KEY = 'sg-goals-target-duration-minutes-v1';
const TARGET_UPDATED_KEY = 'sg-goals-target-updated-v1';
const TARGET_NOTIFICATION_KEY = 'sg-goals-target-notified-v1';
const SAVE_DEBOUNCE_MS = 600;
const APP_VERSION = 'cloud-sync-v59';
const DEFAULT_TARGET_DURATION_MINUTES = 120;
const TARGET_DURATION_MS = DEFAULT_TARGET_DURATION_MINUTES * 60 * 1000;
const PREVIOUS_TARGET_DURATION_MS = 90 * 60 * 1000;
const DAY_COUNTER_START_DATE = '2026-08-07';
const COUNTER_FORCE_RESET_AT = '2026-08-07T11:32:03+05:30';
const COUNTER_RESET_DAY = 7;
const HABIT_TARGET_COUNT = 21;
const DUE_NOTE_PATTERN = /^\[due:(\d{2}:\d{2})\]\n?/;
const FAILURE_REASONS = ['Tired', 'Busy', 'Distracted', 'Forgot', 'No energy', 'Other'] as const;
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_LABELS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

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

const HABIT_TASKS = ['O', 'L1', 'L2', 'L3', 'M', 'Gym', 'Healthy drink morning', 'Healthy drink evening', 'Eye care', 'Salt water gargle', 'Book read and communication practice', 'Study 2 hour', 'Office work', 'Office course', 'Sleep 11 to 6', 'No junk food', 'No Social Media', 'Manifestation'];
const REMOVED_HABIT_TASKS = ['Chess improvement'];
const NO_SUBTASK_STRIKE_CODES: StrikeCode[] = ['O', 'L1', 'L2', 'L3', 'M', 'GYM', 'EYECARE', 'SALTGARGLE', 'NOJUNK', 'NOSOCIAL', 'MANIFEST'];
const AUTO_HABIT_MISS_NOTE = 'auto-habit-miss';
const HABIT_MISS_ROLLOVER_KEY = 'sg-goals-habit-miss-rollover-v1';

const habitLabels: Partial<Record<StrikeCode, string>> = {
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
  OFFICECOURSE: 'Office course',
  EYECARE: 'Eye care',
  SALTGARGLE: 'Salt water gargle'
};
const DAILY_PRIORITY_STRIKE_KEYS = ['OFFICEWORK2', 'STUDY2', 'BOOK', 'GYM'] as const;

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
  updatedAt: '1970-01-01T00:00:00.000Z'
};

function makeTask(text: string, note: string | undefined, priority: Priority, block?: Block): GoalTask {
  return {
    id: cryptoSafeId(),
    text,
    note,
    priority,
    block,
    done: false,
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

function normalizeTimerMinutes(value: unknown, fallback = DEFAULT_TARGET_DURATION_MINUTES) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return fallback;
  return Math.min(1440, Math.max(1, Math.round(minutes)));
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
  return (
    typeof candidate.completedBooks === 'string' &&
    (candidate.punishment === undefined || typeof candidate.punishment === 'string') &&
    typeof candidate.updatedAt === 'string'
  );
}

function normalizeYearlyNotes(value: YearlyNotes): YearlyNotes {
  return {
    completedBooks: value.completedBooks,
    punishment: value.punishment || '',
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
    typeof candidate.endAt === 'string' &&
    typeof candidate.running === 'boolean' &&
    typeof candidate.remainingMs === 'number' &&
    (candidate.durationMs === undefined || typeof candidate.durationMs === 'number') &&
    (candidate.durationMinutes === undefined || typeof candidate.durationMinutes === 'number') &&
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

function buildMonthlyHabitMissWindow(now = new Date()) {
  const istNow = new Date(now.getTime() + 330 * 60000);
  const start = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), 1));
  if (istNow.getUTCDate() === 1 && istNow.getUTCHours() < 3) {
    start.setUTCMonth(start.getUTCMonth() - 1);
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

function buildPreviousMonthlyHabitMissWindow(now = new Date()) {
  const current = buildMonthlyHabitMissWindow(now);
  const currentStart = current[0] || new Date();
  const previousStart = new Date(Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth() - 1, 1));
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
  return new Date(dateValue).toLocaleDateString([], { month: 'short', day: 'numeric' });
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
  if (compact === 'GYM') return 'GYM';
  if (compact === 'HEALTHYDRINKMORNING') return 'HEALTHYDRINKMORNING';
  if (compact === 'HEALTHYDRINKEVENING') return 'HEALTHYDRINKEVENING';
  if (compact === 'BOOKREAD' || compact === 'BOOKREADANDCOMMUNICATIONPRACTICE') return 'BOOK';
  if (compact === 'STUDY2HOUR') return 'STUDY2';
  if (compact === 'OFFICEWORK' || compact === 'OFFICEWORK2HOUR') return 'OFFICEWORK2';
  if (compact === 'SLEEP11TO6') return 'SLEEP';
  if (compact === 'NOJUNKFOOD') return 'NOJUNK';
  if (compact === 'NOSOCIALMEDIA') return 'NOSOCIAL';
  if (compact === 'OFFICECOURSE') return 'OFFICECOURSE';
  if (compact === 'EYECARE') return 'EYECARE';
  if (compact === 'SALTWATERGARGLE' || compact === 'SALTGARGLE') return 'SALTGARGLE';
  if (compact === 'MANIFESTATION' || compact === 'MANIFESTNATION') return 'MANIFEST';
  return null;
}

function isHabitTask(text: string) {
  return normalizeStrikeCode(text) !== null;
}

function allowsSubtasks(task: GoalTask) {
  const code = normalizeStrikeCode(task.text);
  return !code || !NO_SUBTASK_STRIKE_CODES.includes(code);
}

function isAutoHabitMiss(activity: GoalActivity) {
  return activity.kind === 'failure' && activity.note?.startsWith(AUTO_HABIT_MISS_NOTE);
}

function buildCounterCycleStart(todayKey: string) {
  const today = new Date(`${todayKey}T00:00:00`);
  const start = new Date(today);
  start.setDate(COUNTER_RESET_DAY);
  if (today.getDate() < COUNTER_RESET_DAY) {
    start.setMonth(start.getMonth() - 1);
  }
  return toISODate(start);
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
    const normalizedTask = task.text === canonicalText ? task : { ...task, text: canonicalText };
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
    today: [...today, ...missingHabits.map((text) => makeTask(text, undefined, 'other', 'habit'))]
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
  const resetAt: Record<StrikeFamily, number> = { O: counterResetAt, L: counterResetAt, M: counterResetAt, GYM: counterResetAt, HEALTHYDRINKMORNING: counterResetAt, HEALTHYDRINKEVENING: counterResetAt, BOOK: counterResetAt, STUDY2: counterResetAt, OFFICEWORK2: counterResetAt, SLEEP: counterResetAt, NOJUNK: counterResetAt, MANIFEST: counterResetAt, NOSOCIAL: counterResetAt, OFFICECOURSE: counterResetAt, EYECARE: counterResetAt, SALTGARGLE: counterResetAt };
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
        activity.note === 'GYM' ||
        activity.note === 'HEALTHYDRINKMORNING' ||
        activity.note === 'HEALTHYDRINKEVENING' ||
        activity.note === 'BOOK' ||
        activity.note === 'STUDY2' ||
        activity.note === 'OFFICEWORK2' ||
        activity.note === 'SLEEP' ||
        activity.note === 'NOJUNK' ||
        activity.note === 'MANIFEST' ||
        activity.note === 'NOSOCIAL' ||
        activity.note === 'OFFICECOURSE' ||
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
    gym: codes.has('GYM'),
    healthyDrinkMorning: codes.has('HEALTHYDRINKMORNING'),
    healthyDrinkEvening: codes.has('HEALTHYDRINKEVENING'),
    book: codes.has('BOOK'),
    study2: codes.has('STUDY2'),
    officeWork2: codes.has('OFFICEWORK2'),
    sleep: codes.has('SLEEP'),
    noJunk: codes.has('NOJUNK'),
    manifest: codes.has('MANIFEST'),
    noSocial: codes.has('NOSOCIAL'),
    officeCourse: codes.has('OFFICECOURSE'),
    eyeCare: codes.has('EYECARE'),
    saltGargle: codes.has('SALTGARGLE')
  }));

  return {
    o: dayResults.filter((day) => day.o).length,
    l: dayResults.filter((day) => day.l).length,
    m: dayResults.filter((day) => day.m).length,
    gym: dayResults.filter((day) => day.gym).length,
    healthyDrinkMorning: dayResults.filter((day) => day.healthyDrinkMorning).length,
    healthyDrinkEvening: dayResults.filter((day) => day.healthyDrinkEvening).length,
    book: dayResults.filter((day) => day.book).length,
    study2: dayResults.filter((day) => day.study2).length,
    officeWork2: dayResults.filter((day) => day.officeWork2).length,
    sleep: dayResults.filter((day) => day.sleep).length,
    noJunk: dayResults.filter((day) => day.noJunk).length,
    manifest: dayResults.filter((day) => day.manifest).length,
    noSocial: dayResults.filter((day) => day.noSocial).length,
    officeCourse: dayResults.filter((day) => day.officeCourse).length,
    eyeCare: dayResults.filter((day) => day.eyeCare).length,
    saltGargle: dayResults.filter((day) => day.saltGargle).length,
    counterCycleStart,
    resetAt,
    today: dayResults.find((day) => day.day === todayKey) || { day: todayKey, o: false, l: false, m: false, gym: false, healthyDrinkMorning: false, healthyDrinkEvening: false, book: false, study2: false, officeWork2: false, sleep: false, noJunk: false, manifest: false, noSocial: false, officeCourse: false, eyeCare: false, saltGargle: false }
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
  const [targetEndAt, setTargetEndAt] = useState('');
  const [targetRunning, setTargetRunning] = useState(false);
  const [targetDurationMinutes, setTargetDurationMinutes] = useState(DEFAULT_TARGET_DURATION_MINUTES);
  const [targetRemainingMs, setTargetRemainingMs] = useState(TARGET_DURATION_MS);
  const [targetUpdatedAt, setTargetUpdatedAt] = useState(() => '1970-01-01T00:00:00.000Z');
  const [timerNow, setTimerNow] = useState(() => Date.now());
  const [reportCopied, setReportCopied] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [calendarCursor, setCalendarCursor] = useState(() => new Date());
  const [currentDateKey, setCurrentDateKey] = useState(() => toISODate(new Date()));
  const [draft, setDraft] = useState({ text: '', note: '', dueTime: '', priority: 'career' as Priority, block: 'morning' as Block });
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
    setTargetEndAt(upgradedEndAt);
    setTargetRunning(targetState.running);
    setTargetDurationMinutes(nextDurationMinutes);
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
    const savedRemaining = Number(window.localStorage.getItem(TARGET_REMAINING_KEY));
    const savedTargetDurationMinutes = normalizeTimerMinutes(window.localStorage.getItem(TARGET_DURATION_MINUTES_KEY));
    const savedTargetDurationMs = savedTargetDurationMinutes * 60000;
    const savedTargetUpdatedAt = window.localStorage.getItem(TARGET_UPDATED_KEY) || '1970-01-01T00:00:00.000Z';
    setStore(localStore);
    setActivities(localActivities);
    setWeeklyPlan(localWeeklyPlan);
    setYearlyNotes(localYearlyNotes);
    setMainGoalId(legacyTargetId);
    setTargetTaskIds(savedTargetIds.length ? savedTargetIds : legacyTargetId ? [legacyTargetId] : []);
    setTargetTaskMinutes(savedTargetMinutes);
    setTargetEndAt(savedEndAt);
    setTargetDurationMinutes(savedTargetDurationMinutes);
    setTargetRemainingMs(Number.isFinite(savedRemaining) && savedRemaining >= 0 ? Math.min(savedTargetDurationMs, savedRemaining) : savedTargetDurationMs);
    setTargetRunning(window.localStorage.getItem(TARGET_RUNNING_KEY) === 'true' && Boolean(savedEndAt));
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
                endAt: savedEndAt,
                running: window.localStorage.getItem(TARGET_RUNNING_KEY) === 'true' && Boolean(savedEndAt),
                remainingMs: Number.isFinite(savedRemaining) && savedRemaining >= 0 ? Math.min(savedTargetDurationMs, savedRemaining) : savedTargetDurationMs,
                durationMs: savedTargetDurationMs,
                durationMinutes: savedTargetDurationMinutes,
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
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // The app still works normally when service worker registration is unavailable.
      });
    }
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
    window.localStorage.setItem(TARGET_REMAINING_KEY, String(Math.max(0, Math.round(targetRemainingMs))));
    window.localStorage.setItem(TARGET_RUNNING_KEY, targetRunning ? 'true' : 'false');
    window.localStorage.setItem(TARGET_DURATION_MINUTES_KEY, String(targetDurationMinutes));
    window.localStorage.setItem(TARGET_UPDATED_KEY, targetUpdatedAt);
  }, [ready, targetDurationMinutes, targetEndAt, targetRemainingMs, targetRunning, targetUpdatedAt]);

  useEffect(() => {
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
    const validIds = targetTaskIds.filter((taskId) => store.today.some((task) => task.id === taskId));
    if (validIds.length !== targetTaskIds.length) {
      setTargetTaskIds(validIds);
      setTargetTaskMinutes((current) => Object.fromEntries(Object.entries(current).filter(([taskId]) => validIds.includes(taskId))));
    }
    if (!validIds.length) {
      setTargetEndAt('');
      setTargetRunning(false);
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
              endAt: targetEndAt,
              running: targetRunning,
              remainingMs: targetRunning && targetEndAt ? Math.max(0, new Date(targetEndAt).getTime() - Date.now()) : targetRemainingMs,
              durationMs: targetDurationMinutes * 60000,
              durationMinutes: targetDurationMinutes,
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
  }, [cloudReady, ready, store, targetDurationMinutes, targetEndAt, targetRemainingMs, targetRunning, targetTaskIds, targetTaskMinutes, targetUpdatedAt, weeklyPlan, yearlyNotes]);

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
          const cloudRemaining = Math.round(data.targetState.remainingMs / 1000);
          const localRemainingMs = targetRunning && targetEndAt ? Math.max(0, new Date(targetEndAt).getTime() - Date.now()) : targetRemainingMs;
          const localRemaining = Math.round(localRemainingMs / 1000);
          if (
            cloudIds !== localIds ||
            cloudMinutes !== localMinutes ||
            cloudDurationMinutes !== targetDurationMinutes ||
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
  }, [applyTargetState, cloudReady, ready, targetDurationMinutes, targetEndAt, targetRemainingMs, targetRunning, targetTaskIds, targetTaskMinutes, targetUpdatedAt]);

  const activeTasks = store[scope];
  const completion = useMemo(() => {
    const total = activeTasks.length;
    const done = activeTasks.filter((task) => task.done).length;
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
  }, [activeTasks]);

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
    const days: Date[] = [];
    const daysInMonth = today.getDate();
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(today.getFullYear(), today.getMonth(), day);
      date.setHours(0, 0, 0, 0);
      days.push(date);
    }
    return days;
  }, [currentDateKey]);
  const weeklyHabitMissWindow = useMemo(() => buildWeeklyHabitMissWindow(new Date(timerNow)), [timerNow]);
  const monthlyHabitMissWindow = useMemo(() => buildMonthlyHabitMissWindow(new Date(timerNow)), [timerNow]);
  const previousWeeklyHabitMissWindow = useMemo(() => buildPreviousWeeklyHabitMissWindow(new Date(timerNow)), [timerNow]);
  const previousMonthlyHabitMissWindow = useMemo(() => buildPreviousMonthlyHabitMissWindow(new Date(timerNow)), [timerNow]);

  const analytics = useMemo(() => buildAnalytics(activities, trendWindow), [activities, trendWindow]);
  const monthlyAnalytics = useMemo(() => buildAnalytics(activities, monthWindow, 10), [activities, monthWindow]);
  const weeklyHabitInsights = useMemo(() => buildHabitInsights(activities, weeklyHabitMissWindow, previousWeeklyHabitMissWindow), [activities, previousWeeklyHabitMissWindow, weeklyHabitMissWindow]);
  const monthlyHabitInsights = useMemo(() => buildHabitInsights(activities, monthlyHabitMissWindow, previousMonthlyHabitMissWindow), [activities, monthlyHabitMissWindow, previousMonthlyHabitMissWindow]);

  const overallScore = useMemo(() => {
    if (!analytics.scorecard.length) return 0;
    return Math.round(analytics.scorecard.reduce((sum, item) => sum + item.score, 0) / analytics.scorecard.length);
  }, [analytics.scorecard]);

  const todayKey = currentDateKey;
  const yesterdayKey = useMemo(() => {
    const date = new Date(`${currentDateKey}T00:00:00`);
    date.setDate(date.getDate() - 1);
    return toISODate(date);
  }, [currentDateKey]);

  const todayFocus = useMemo(() => {
    const todayActivities = activities.filter((activity) => activity.scope === 'today' && dateKeyFromValue(activity.createdAt) === todayKey && !isAutoHabitMiss(activity));
    const misses = todayActivities.filter((activity) => activity.kind === 'failure');
    const minutes = todayActivities.reduce((total, activity) => (activity.kind === 'completion' ? total + (activity.minutes || 0) : total), 0);
    return { misses, minutes };
  }, [activities, todayKey]);

  const yesterdaySummary = useMemo(() => {
    const yesterdayActivities = activities.filter((activity) => activity.scope === 'today' && dateKeyFromValue(activity.createdAt) === yesterdayKey && !isAutoHabitMiss(activity));
    const completed = yesterdayActivities.reduce((total, activity) => {
      if (activity.kind === 'completion') return total + 1;
      if (activity.kind === 'undo') return Math.max(0, total - 1);
      return total;
    }, 0);
    const failures = yesterdayActivities.filter((activity) => activity.kind === 'failure').length;
    const minutes = yesterdayActivities.reduce((total, activity) => (activity.kind === 'completion' ? total + (activity.minutes || 0) : total), 0);
    return { completed, failures, minutes, hadActivity: yesterdayActivities.length > 0 };
  }, [activities, yesterdayKey]);

  const strikeCounts = useMemo(() => buildStrikeCounts(activities, store.today, todayKey), [activities, store.today, todayKey]);
  const dayCounter = useMemo(() => buildDayCounter(todayKey), [todayKey]);

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

  const monthlyFailurePatterns = useMemo(() => {
    const counts = new Map<string, number>();
    monthlyAnalytics.failures.forEach((activity) => {
      const key = activity.reason || 'Missed';
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);
  }, [monthlyAnalytics.failures]);

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
  const istClockLabel = useMemo(() => formatIstClock(timerNow), [timerNow]);

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

  useEffect(() => {
    if (!ready) return;
    if (!targetPlanSignatureRef.current) {
      targetPlanSignatureRef.current = targetPlanSignature;
      return;
    }
    if (targetPlanSignatureRef.current !== targetPlanSignature && !targetRunning) {
      targetPlanSignatureRef.current = targetPlanSignature;
      setTargetRemainingMs(targetPlannedDurationMs);
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
    if (!ready || !targetTasks.length || !targetTimer.complete) return;
    const key = `${targetTaskIds.join(',')}-${targetEndAt || 'paused'}-${toISODate(new Date())}`;
    if (window.localStorage.getItem(TARGET_NOTIFICATION_KEY) === key) return;
    window.localStorage.setItem(TARGET_NOTIFICATION_KEY, key);
    setTargetRunning(false);
    setTargetEndAt('');
    setTargetRemainingMs(0);
    markTargetChanged();
    showGoalNotification('Target queue complete', `Time is up for: ${targetTasks.map((task) => task.text).join(', ')}`, 'sg-goals-target-complete');
  }, [markTargetChanged, ready, showGoalNotification, targetEndAt, targetTaskIds, targetTasks, targetTimer.complete]);

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
    setDraft({ text: '', note: '', dueTime: '', priority: 'career', block: 'morning' });
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

  function saveTask() {
    const text = draft.text.trim();
    if (!text) return;
    const note = composeTaskNote(draft.note.trim() || undefined, scope === 'today' ? draft.dueTime : '');
    const priority = scope === 'today' || scope === 'weekend' ? 'other' : draft.priority;
    const taskBlock = scope === 'today' ? (isHabitTask(text) ? 'habit' : draft.block) : undefined;
    persist((current) => {
      const next = { ...current };
      if (editing) {
        next[scope] = current[scope].map((task) =>
          task.id === editing.id
            ? { ...task, text, note, priority, block: taskBlock, updatedAt: new Date().toISOString() }
            : task
        );
      } else {
        next[scope] = [...current[scope], makeTask(text, note, priority, taskBlock)];
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
    const nextMinutes = normalizeTimerMinutes(value);
    const nextDurationMs = nextMinutes * 60000;
    setTargetDurationMinutes(nextMinutes);
    if (!targetRunning) {
      setTargetEndAt('');
      setTargetRemainingMs(nextDurationMs);
    } else {
      const elapsedMs = Math.max(0, targetPlannedDurationMs - targetTimer.remainingMs);
      const nextRemainingMs = Math.max(0, nextDurationMs - elapsedMs);
      setTargetRemainingMs(nextRemainingMs);
      setTargetEndAt(new Date(Date.now() + nextRemainingMs).toISOString());
    }
    window.localStorage.removeItem(TARGET_NOTIFICATION_KEY);
    markTargetChanged();
  }

  function toggleTargetTimer() {
    if (!targetTaskIds.length) return;
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
    setTargetRemainingMs(nextRemaining);
    setTargetEndAt(new Date(Date.now() + nextRemaining).toISOString());
    setTargetRunning(true);
    window.localStorage.removeItem(TARGET_NOTIFICATION_KEY);
    markTargetChanged();
    requestMainGoalNotificationPermission();
  }

  function resetTargetTimer() {
    const plannedDurationMs = targetPlannedDurationMs;
    setTargetRemainingMs(plannedDurationMs);
    setTargetEndAt(targetRunning ? new Date(Date.now() + plannedDurationMs).toISOString() : '');
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
    setDraft({ text: task.text, note: noteInfo.note || '', dueTime: noteInfo.dueTime, priority: task.priority, block: task.block || 'morning' });
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
              done: false,
              startedAt: undefined,
              completedAt: undefined,
              investedMinutes: undefined,
              updatedAt: new Date().toISOString()
            }
          : makeTask(text, undefined, 'other', 'habit');
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
                  subtasks: failureTask.subtasks
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
    return `${task.done ? 'Done' : 'Pending'} - ${task.text}${noteInfo.dueTime ? ` by ${noteInfo.dueTime}` : ''}${task.investedMinutes ? ` (${formatMinutes(task.investedMinutes)})` : ''}${subtaskText}`;
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
      `Today completion: ${completion.done}/${completion.total} (${completion.pct}%)`,
      `Today misses: ${todayFocus.misses.length}`,
      `Today time invested: ${formatMinutes(todayFocus.minutes) || '0m'}`,
      yesterdaySummary.hadActivity
        ? `Yesterday: ${yesterdaySummary.completed} completed, ${yesterdaySummary.failures} missed, ${formatMinutes(yesterdaySummary.minutes) || '0m'} invested`
        : 'Yesterday: no activity recorded',
      `Current streak: ${streaks.current} day(s)`,
      `Best streak: ${streaks.best} day(s)`,
      `Day counter: ${dayCounter}`,
      `Weekly plan: Main=${weeklyPlan.mainGoal || 'Not set'}; Study=${weeklyPlan.studyPlan || 'Not set'}; Work=${weeklyPlan.workPlan || 'Not set'}; Health=${weeklyPlan.healthPlan || 'Not set'}; Notes=${weeklyPlan.notes || 'None'}`,
      `Strike counts: O=${strikeCounts.o}, L=${strikeCounts.l}, M=${strikeCounts.m}, Gym=${strikeCounts.gym}, Healthy drink morning=${strikeCounts.healthyDrinkMorning}, Healthy drink evening=${strikeCounts.healthyDrinkEvening}, Eye care=${strikeCounts.eyeCare}, Book read and communication practice=${strikeCounts.book}, Study 2 hour=${strikeCounts.study2}, Office work=${strikeCounts.officeWork2}, Office course=${strikeCounts.officeCourse}, Sleep 11 to 6=${strikeCounts.sleep}, No junk food=${strikeCounts.noJunk}, No Social Media=${strikeCounts.noSocial}, Manifestation=${strikeCounts.manifest}`,
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

  const completedToday = scope === 'today' ? activeTasks.filter((task) => task.done) : [];

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
      tasks: activeTasks,
      done: activeTasks.filter((task) => task.done).length,
      total: activeTasks.length
    }
  ];

  const taskGroups = scope === 'today' ? todayDisplayGroups : scope === 'weekend' ? weekendGroups : groupedPriority;

  const sideMissLog = (scope === 'monthly' ? monthlyAnalytics.failures : scope === 'today' ? todayFocus.misses : analytics.failures).filter((activity) => !isAutoHabitMiss(activity));
  const sideMissLogTitle = scope === 'monthly' ? 'Monthly miss log' : scope === 'today' ? 'Today miss log' : '7-day miss log';
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
              <span>{completion.done}/{completion.total} complete</span>
              <span className="font-bold text-[#00d97e]">{completion.pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#1a1a30]">
              <div className="h-full rounded-full bg-[#00d97e] transition-all" style={{ width: `${completion.pct}%` }} />
            </div>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-[#8b8bb3]">
              <span>Habit counter cycle: {strikeCounts.counterCycleStart} to next 6th</span>
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
              { key: 'HEALTHYDRINKMORNING' as const, label: 'Drink AM count', rule: 'Healthy drink morning complete', color: '#14b8a6', todayDone: strikeCounts.today.healthyDrinkMorning, value: strikeCounts.healthyDrinkMorning },
              { key: 'HEALTHYDRINKEVENING' as const, label: 'Drink PM count', rule: 'Healthy drink evening complete', color: '#f97316', todayDone: strikeCounts.today.healthyDrinkEvening, value: strikeCounts.healthyDrinkEvening },
              { key: 'SLEEP' as const, label: 'Sleep count', rule: 'Sleep 11 to 6 complete', color: '#a78bfa', todayDone: strikeCounts.today.sleep, value: strikeCounts.sleep },
              { key: 'NOJUNK' as const, label: 'No junk count', rule: 'No junk food complete', color: '#00bcd4', todayDone: strikeCounts.today.noJunk, value: strikeCounts.noJunk },
              { key: 'NOSOCIAL' as const, label: 'No social count', rule: 'No Social Media complete', color: '#38bdf8', todayDone: strikeCounts.today.noSocial, value: strikeCounts.noSocial },
              { key: 'MANIFEST' as const, label: 'Manifest count', rule: 'Manifestation complete', color: '#fb7185', todayDone: strikeCounts.today.manifest, value: strikeCounts.manifest },
              { key: 'OFFICECOURSE' as const, label: 'Office course count', rule: 'Office course complete', color: '#60a5fa', todayDone: strikeCounts.today.officeCourse, value: strikeCounts.officeCourse },
              { key: 'EYECARE' as const, label: 'Eye care count', rule: 'Eye care complete', color: '#2dd4bf', todayDone: strikeCounts.today.eyeCare, value: strikeCounts.eyeCare },
              { key: 'SALTGARGLE' as const, label: 'Gargle count', rule: 'Salt water gargle complete', color: '#93c5fd', todayDone: strikeCounts.today.saltGargle, value: strikeCounts.saltGargle }
            ].map((item) => {
              const reachedTarget = item.value >= HABIT_TARGET_COUNT;
              const isDailyPriority = DAILY_PRIORITY_STRIKE_KEYS.includes(item.key as (typeof DAILY_PRIORITY_STRIKE_KEYS)[number]);
              return (
              <div
                key={item.key}
                className={`rounded-xl border px-3 py-2 ${
                  reachedTarget
                    ? 'border-[#ffd16699] bg-[#ffd16614] shadow-[0_0_18px_rgba(255,209,102,.14)]'
                    : isDailyPriority
                      ? item.todayDone
                        ? 'border-[#00d97e66] bg-[#00d97e10]'
                        : 'border-[#ff6b6b66] bg-[#ff6b6b10]'
                      : 'border-[#1a1a30] bg-[#0f0f1d]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-[10px] font-bold uppercase tracking-[.16em] ${reachedTarget ? 'text-[#ffd166]' : 'text-[#52527a]'}`}>{item.label}</p>
                  <span className="text-[10px] font-bold" style={{ color: reachedTarget ? '#ffd166' : item.todayDone ? '#00d97e' : isDailyPriority ? '#ff6b6b' : '#52527a' }}>
                    {reachedTarget ? '21 reached' : item.todayDone ? 'Today +1' : isDailyPriority ? 'Must today' : 'Pending'}
                  </span>
                </div>
                <p className="mt-1 text-2xl font-bold" style={{ color: item.color }}>{item.value}</p>
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
        <div className="grid gap-3 md:grid-cols-[1.2fr,.8fr]">
          <div className="rounded-xl border border-[#1a1a30] bg-[#0f0f1d] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#52527a]">Next target</p>
                <h2 className="mt-2 text-lg font-bold text-[#e8e8f5]">{targetTasks.length ? `${targetTasks.length} task${targetTasks.length === 1 ? '' : 's'} selected` : 'Select tasks from Morning, Afternoon, or Evening'}</h2>
                {mainGoal ? (
                  <p className="mt-1 text-xs text-[#8b8bb3]">
                    Current focus starts with {mainGoal.text}
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
                    return (
                      <div key={task.id} className="rounded-xl border border-[#1a1a30] bg-[#13132a] px-3 py-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[#4f8ef740] bg-[#4f8ef715] text-[11px] font-bold text-[#4f8ef7]">
                                {index + 1}
                              </span>
                              <p className={`text-sm font-bold ${task.done ? 'text-[#52527a] line-through' : 'text-[#e8e8f5]'}`}>{task.text}</p>
                              {targetTimer.running && targetTimer.activeTask?.id === task.id ? (
                                <span className="rounded-full bg-[#00d97e22] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.14em] text-[#00d97e]">Now</span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-[11px] text-[#8b8bb3]">
                              {task.block ? blocks[task.block].label : priorities[task.priority].label}
                              {noteInfo.dueTime ? ` - By ${noteInfo.dueTime}` : ''}
                              {noteInfo.note ? ` - ${noteInfo.note}` : ''}
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
                <div className="rounded-xl border border-[#1a1a30] bg-[#13132a] p-3">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#52527a]">Timer</p>
                      <p className={`mt-1 text-3xl font-bold ${targetTimer.complete ? 'text-[#f7a04f]' : 'text-[#00d97e]'}`}>
                        {targetTimer.complete ? '00:00' : targetTimer.label}
                      </p>
                      {targetTimer.activeTask ? (
                        <p className="mt-1 text-[11px] font-bold text-[#8b8bb3]">
                          Task {targetTimer.activeTaskIndex + 1} of {targetSequence.length}: <span className="text-[#e8e8f5]">{targetTimer.activeTask.text}</span>
                          {targetTimer.activeTaskMinutes ? ` (${targetTimer.activeTaskMinutes}m plan)` : ''}
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right text-[11px] text-[#8b8bb3]">
                      <p>{targetTimer.complete ? 'Time is up. Finish or log what happened.' : targetTimer.running ? 'Timer is running.' : 'Timer is paused.'}</p>
                      <label className="mt-2 flex items-center justify-end gap-2">
                        <span>Total</span>
                        <input
                          type="number"
                          min="1"
                          max="1440"
                          inputMode="numeric"
                          value={targetDurationMinutes}
                          onChange={(event) => updateTargetDurationMinutes(event.target.value)}
                          className="h-8 w-20 rounded-lg border border-[#1a1a30] bg-[#07070f] px-2 text-right font-mono text-sm font-bold text-[#e8e8f5] outline-none focus:border-[#00d97e]"
                          aria-label="Target timer total minutes"
                        />
                        <span>min</span>
                      </label>
                      <p className="mt-1">
                        {targetPlannedMinutes ? `Tasks planned ${formatMinutes(targetPlannedMinutes)} / timer ${formatMinutes(targetDurationMinutes)}.` : `Timer ${formatMinutes(targetDurationMinutes)}.`}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#1a1a30]">
                    <div className="h-full rounded-full bg-[#00d97e] transition-all" style={{ width: `${targetTimer.progress}%` }} />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={toggleTargetTimer} className="rounded-lg bg-[#00d97e] px-3 py-2 text-xs font-bold text-black">
                    {targetTimer.running ? 'Stop timer' : targetTimer.complete ? `Start ${formatMinutes(targetDurationMinutes)} again` : 'Start timer'}
                  </button>
                  <button onClick={resetTargetTimer} className="rounded-lg border border-[#4f8ef740] px-3 py-2 text-xs font-bold text-[#4f8ef7]">
                    Reset {formatMinutes(targetDurationMinutes)}
                  </button>
                  <button
                    onClick={() => {
                      setTargetTaskIds([]);
                      setTargetTaskMinutes({});
                      setTargetEndAt('');
                      setTargetRunning(false);
                      setTargetRemainingMs(targetPlannedDurationMs);
                      markTargetChanged();
                    }}
                    className="rounded-lg border border-[#ff6b6b44] px-3 py-2 text-xs font-bold text-[#ff6b6b]"
                  >
                    Clear target
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
      </section>
      ) : null}

      {scope === 'weekly' ? (
        <>
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
                          <p className="text-sm font-semibold text-[#e8e8f5]">{task.text}</p>
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
          {renderHabitMissCountsSection('Monthly habit missed count', 'Monthly counter resets on the 1st day at 3:00 AM IST.', monthlyHabitInsights, {
            summaryLabel: 'Last month summary'
          })}
          {renderFailurePatternsSection('Monthly failure patterns', 'Review recurring misses for this month without mixing them into today.', monthlyAnalytics, monthlyFailurePatterns)}
        </>
      ) : null}

      {scope === 'yearly' ? (
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
        </section>
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
                        return (
                          <>
                            <div className="flex items-stretch">
                              <button onClick={() => toggleTask(task.id)} className="flex flex-1 items-start gap-3 px-4 py-3 text-left">
                                <span
                                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border"
                                  style={{ borderColor: taskColor, background: task.done ? taskSoft : 'transparent' }}
                                >
                                  {task.done ? <Check className="h-3.5 w-3.5" style={{ color: taskColor }} /> : null}
                                </span>
                                <span className="min-w-0">
                                  <span className={`block text-sm ${task.done ? 'text-[#52527a] line-through' : 'text-[#e8e8f5]'}`}>{task.text}</span>
                                  <span className="mt-1 flex flex-wrap gap-2 text-[11px] text-[#52527a]">
                                    {scope !== 'weekend' ? <span style={{ color: priorities[task.priority].color }}>{priorities[task.priority].label}</span> : null}
                                    {noteInfo.dueTime ? <span style={{ color: '#00d97e' }}>By {noteInfo.dueTime}</span> : null}
                                    {noteInfo.note ? <span>{noteInfo.note}</span> : null}
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

          {scope === 'today' && completedToday.length ? (
            <div className="mt-5 border-t border-[#1a1a30] pt-4">
              <h3 className="text-xs font-bold uppercase tracking-[.2em] text-[#52527a]">Completed tasks</h3>
              <div className="mt-3 space-y-2">
                {completedToday.map((task) => {
                  const noteInfo = splitTaskNote(task.note);
                  return (
                    <div key={task.id} className="rounded-lg border border-[#1a1a30] bg-[#0f0f1d] px-3 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm text-[#e8e8f5]">{task.text}</p>
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
