'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, CalendarDays, Check, Clock, Copy, Download, Edit3, Flame, RotateCcw, Save, Sparkles, Star, Trash2, TrendingUp, Upload } from 'lucide-react';

type Scope = 'today' | 'weekly' | 'monthly' | 'yearly' | 'tomorrow';
type Priority = 'health' | 'career' | 'communication' | 'looks' | 'other';
type Block = 'morning' | 'afternoon' | 'evening';

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
  updatedAt: string;
};

type ActivityKind = 'completion' | 'failure' | 'undo';

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

const STORAGE_KEY = 'sg-goals-store-v1';
const ACTIVITY_KEY = 'sg-goals-activities-v1';
const MAIN_GOAL_KEY = 'sg-goals-main-goal-v1';
const NOTIFICATION_LAST_KEY = 'sg-goals-last-notification-v1';
const TARGET_TASKS_KEY = 'sg-goals-target-tasks-v1';
const TARGET_TIMER_KEY = 'sg-goals-target-timer-v1';
const TARGET_REMAINING_KEY = 'sg-goals-target-remaining-v1';
const TARGET_RUNNING_KEY = 'sg-goals-target-running-v1';
const TARGET_NOTIFICATION_KEY = 'sg-goals-target-notified-v1';
const SAVE_DEBOUNCE_MS = 600;
const APP_VERSION = 'cloud-sync-v22';
const TARGET_DURATION_MS = 90 * 60 * 1000;
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
  morning: { label: 'Morning', time: '6:00 AM - 12:00 PM' },
  afternoon: { label: 'Afternoon', time: '12:00 PM - 6:00 PM' },
  evening: { label: 'Evening', time: '6:00 PM - 12:00 AM' }
};

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

function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
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

function formatClock(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function buildAnalytics(activities: GoalActivity[], days: Date[], maxFailures = 6): AnalyticsWindow {
  const byPriority = Object.fromEntries(
    (Object.keys(priorities) as Priority[]).map((priority) => [priority, { completions: 0, failures: 0, undos: 0, minutes: 0, daysHit: new Set<string>(), series: Array(days.length).fill(0) }])
  ) as Record<Priority, { completions: number; failures: number; undos: number; minutes: number; daysHit: Set<string>; series: number[] }>;

  const keys = days.map(toISODate);
  const keySet = new Set(keys);
  const recent = activities.filter((activity) => keySet.has(dateKeyFromValue(activity.createdAt)));

  recent.forEach((activity) => {
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
  const [ready, setReady] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const [syncState, setSyncState] = useState<'loading' | 'local' | 'saving' | 'saved' | 'error'>('loading');
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
  const [targetEndAt, setTargetEndAt] = useState('');
  const [targetRunning, setTargetRunning] = useState(false);
  const [targetRemainingMs, setTargetRemainingMs] = useState(TARGET_DURATION_MS);
  const [timerNow, setTimerNow] = useState(() => Date.now());
  const [reportCopied, setReportCopied] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [calendarCursor, setCalendarCursor] = useState(() => new Date());
  const [currentDateKey, setCurrentDateKey] = useState(() => toISODate(new Date()));
  const [draft, setDraft] = useState({ text: '', note: '', dueTime: '', priority: 'career' as Priority, block: 'morning' as Block });
  const [tomorrowDraft, setTomorrowDraft] = useState({ text: '', note: '', dueTime: '' });

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

  useEffect(() => {
    let cancelled = false;
    const localStore = loadStore();
    const localActivities = loadActivities();
    const legacyTargetId = window.localStorage.getItem(MAIN_GOAL_KEY) || '';
    let savedTargetIds: string[] = [];
    try {
      const parsedTargets = JSON.parse(window.localStorage.getItem(TARGET_TASKS_KEY) || '[]') as string[];
      savedTargetIds = Array.isArray(parsedTargets) ? parsedTargets.filter(Boolean) : [];
    } catch {
      savedTargetIds = [];
    }
    const savedEndAt = window.localStorage.getItem(TARGET_TIMER_KEY) || '';
    const savedRemaining = Number(window.localStorage.getItem(TARGET_REMAINING_KEY));
    setStore(localStore);
    setActivities(localActivities);
    setMainGoalId(legacyTargetId);
    setTargetTaskIds(savedTargetIds.length ? savedTargetIds : legacyTargetId ? [legacyTargetId] : []);
    setTargetEndAt(savedEndAt);
    setTargetRemainingMs(Number.isFinite(savedRemaining) && savedRemaining >= 0 ? savedRemaining : TARGET_DURATION_MS);
    setTargetRunning(window.localStorage.getItem(TARGET_RUNNING_KEY) === 'true' && Boolean(savedEndAt));

    async function loadCloudStore() {
      try {
        const response = await fetch('/api/goals', { cache: 'no-store' });
        if (!response.ok) throw new Error('Cloud database is not ready.');
        const data = (await response.json()) as { store?: GoalsStore; hasCloudData?: boolean };
        if (cancelled) return;
        if (data.hasCloudData && data.store) {
          setStore(data.store);
        } else {
          await fetch('/api/goals', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ store: localStore })
          });
        }
        setCloudReady(true);
        setSyncState('saved');
      } catch {
        if (!cancelled) {
          setCloudReady(false);
          setSyncState('local');
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
  }, []);

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
    if (ready) window.localStorage.setItem(MAIN_GOAL_KEY, mainGoalId);
  }, [mainGoalId, ready]);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(TARGET_TASKS_KEY, JSON.stringify(targetTaskIds));
    setMainGoalId(targetTaskIds[0] || '');
  }, [ready, targetTaskIds]);

  useEffect(() => {
    if (!ready) return;
    if (targetEndAt) window.localStorage.setItem(TARGET_TIMER_KEY, targetEndAt);
    else window.localStorage.removeItem(TARGET_TIMER_KEY);
    window.localStorage.setItem(TARGET_REMAINING_KEY, String(Math.max(0, Math.round(targetRemainingMs))));
    window.localStorage.setItem(TARGET_RUNNING_KEY, targetRunning ? 'true' : 'false');
  }, [ready, targetEndAt, targetRemainingMs, targetRunning]);

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
    if (!ready || !targetTaskIds.length) return;
    const validIds = targetTaskIds.filter((taskId) => store.today.some((task) => task.id === taskId));
    if (validIds.length !== targetTaskIds.length) {
      setTargetTaskIds(validIds);
    }
    if (!validIds.length) {
      setTargetEndAt('');
      setTargetRunning(false);
      setTargetRemainingMs(TARGET_DURATION_MS);
    }
  }, [ready, store.today, targetTaskIds]);

  useEffect(() => {
    if (!ready || !cloudReady) return;
    setSyncState('saving');
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch('/api/goals', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ store })
        });
        if (!response.ok) throw new Error('Save failed.');
        setSyncState('saved');
      } catch {
        setSyncState('error');
      }
    }, SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [cloudReady, ready, store]);

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

  const analytics = useMemo(() => buildAnalytics(activities, trendWindow), [activities, trendWindow]);
  const monthlyAnalytics = useMemo(() => buildAnalytics(activities, monthWindow, 10), [activities, monthWindow]);

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
    const todayActivities = activities.filter((activity) => activity.scope === 'today' && dateKeyFromValue(activity.createdAt) === todayKey);
    const misses = todayActivities.filter((activity) => activity.kind === 'failure');
    const minutes = todayActivities.reduce((total, activity) => (activity.kind === 'completion' ? total + (activity.minutes || 0) : total), 0);
    return { misses, minutes };
  }, [activities, todayKey]);

  const yesterdaySummary = useMemo(() => {
    const yesterdayActivities = activities.filter((activity) => activity.scope === 'today' && dateKeyFromValue(activity.createdAt) === yesterdayKey);
    const completed = yesterdayActivities.reduce((total, activity) => {
      if (activity.kind === 'completion') return total + 1;
      if (activity.kind === 'undo') return Math.max(0, total - 1);
      return total;
    }, 0);
    const failures = yesterdayActivities.filter((activity) => activity.kind === 'failure').length;
    const minutes = yesterdayActivities.reduce((total, activity) => (activity.kind === 'completion' ? total + (activity.minutes || 0) : total), 0);
    return { completed, failures, minutes, hadActivity: yesterdayActivities.length > 0 };
  }, [activities, yesterdayKey]);

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

  const mainGoal = targetTasks[0] || null;

  const targetTimer = useMemo(() => {
    const endTime = targetEndAt ? new Date(targetEndAt).getTime() : 0;
    const runningRemainingMs = endTime ? Math.max(0, endTime - timerNow) : targetRemainingMs;
    const remainingMs = targetRunning ? runningRemainingMs : targetRemainingMs;
    const progress = targetTasks.length ? Math.min(100, Math.max(0, Math.round(((TARGET_DURATION_MS - remainingMs) / TARGET_DURATION_MS) * 100))) : 0;
    return {
      active: Boolean(targetTasks.length),
      running: Boolean(targetTasks.length && targetRunning && endTime && remainingMs > 0),
      complete: Boolean(targetTasks.length && remainingMs <= 0),
      remainingMs,
      progress,
      label: formatCountdown(remainingMs)
    };
  }, [targetEndAt, targetRemainingMs, targetRunning, targetTasks.length, timerNow]);

  useEffect(() => {
    if (!ready || !('Notification' in window) || Notification.permission !== 'granted') return;

    function maybeNotify() {
      const now = new Date();
      const hour = now.getHours();
      if (hour < 6 || hour > 23 || hour % 2 !== 0) return;
      const key = `${toISODate(now)}-${hour}`;
      if (window.localStorage.getItem(NOTIFICATION_LAST_KEY) === key) return;
      const body = targetTasks.length ? `Next 1.5 hour target: ${targetTasks.map((task) => task.text).join(', ')}` : 'Choose your next 1.5 hour target for today.';
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
    showGoalNotification('1.5 hour target complete', `Time is up for: ${targetTasks.map((task) => task.text).join(', ')}`, 'sg-goals-target-complete');
  }, [ready, showGoalNotification, targetEndAt, targetTaskIds, targetTasks, targetTimer.complete]);

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

  function resetDraft() {
    setEditing(null);
    setDraft({ text: '', note: '', dueTime: '', priority: 'career', block: 'morning' });
  }

  function saveTask() {
    const text = draft.text.trim();
    if (!text) return;
    const note = composeTaskNote(draft.note.trim() || undefined, scope === 'today' ? draft.dueTime : '');
    const priority = scope === 'today' && !editing ? 'other' : draft.priority;
    persist((current) => {
      const next = { ...current };
      if (editing) {
        next[scope] = current[scope].map((task) =>
          task.id === editing.id
            ? { ...task, text, note, priority, block: scope === 'today' ? draft.block : undefined, updatedAt: new Date().toISOString() }
            : task
        );
      } else {
        next[scope] = [...current[scope], makeTask(text, note, priority, scope === 'today' ? draft.block : undefined)];
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
      if (current.includes(taskId)) return current.filter((id) => id !== taskId);
      return [...current, taskId];
    });
    setTargetRemainingMs((current) => (current <= 0 ? TARGET_DURATION_MS : current));
    window.localStorage.removeItem(TARGET_NOTIFICATION_KEY);
    requestMainGoalNotificationPermission();
  }

  function toggleTargetTimer() {
    if (!targetTaskIds.length) return;
    if (targetRunning) {
      const endTime = targetEndAt ? new Date(targetEndAt).getTime() : 0;
      setTargetRemainingMs(endTime ? Math.max(0, endTime - Date.now()) : targetRemainingMs);
      setTargetEndAt('');
      setTargetRunning(false);
      return;
    }
    const nextRemaining = targetRemainingMs <= 0 ? TARGET_DURATION_MS : targetRemainingMs;
    setTargetRemainingMs(nextRemaining);
    setTargetEndAt(new Date(Date.now() + nextRemaining).toISOString());
    setTargetRunning(true);
    window.localStorage.removeItem(TARGET_NOTIFICATION_KEY);
    requestMainGoalNotificationPermission();
  }

  function resetTargetTimer() {
    setTargetRemainingMs(TARGET_DURATION_MS);
    setTargetEndAt(targetRunning ? new Date(Date.now() + TARGET_DURATION_MS).toISOString() : '');
    window.localStorage.removeItem(TARGET_NOTIFICATION_KEY);
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
        if (!remaining.length) {
          setTargetEndAt('');
          setTargetRunning(false);
          setTargetRemainingMs(TARGET_DURATION_MS);
          window.localStorage.removeItem(TARGET_NOTIFICATION_KEY);
        }
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
            : [...current.tomorrow, makeTask(failureTask.text, composeTaskNote(tomorrowNote || undefined, noteInfo.dueTime), failureTask.priority)]
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
    return `${task.done ? 'Done' : 'Pending'} - ${task.text}${noteInfo.dueTime ? ` by ${noteInfo.dueTime}` : ''}${task.investedMinutes ? ` (${formatMinutes(task.investedMinutes)})` : ''}`;
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
      `Next 1.5 hour target: ${targetTasks.length ? targetTasks.map((task) => task.text).join(', ') : 'Not selected'}`,
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
    const blockTasks = activeTasks.filter((task) => task.block === block);
    return {
      id: block,
      title: blocks[block].label,
      sub: blocks[block].time,
      color: '#4f8ef7',
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

  const sideMissLog = scope === 'monthly' ? monthlyAnalytics.failures : scope === 'today' ? todayFocus.misses : analytics.failures;
  const sideMissLogTitle = scope === 'monthly' ? 'Monthly miss log' : scope === 'today' ? 'Today miss log' : '7-day miss log';

  function renderFailurePatternsSection(title: string, subtitle: string, data: AnalyticsWindow, patterns: Array<{ reason: string; count: number }>) {
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
                {data.failures.length ? (
                  data.failures.map((activity) => (
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

  return (
    <main className="min-h-screen bg-[#07070f] pb-24 text-[#e8e8f5]">
      <section className="border-b border-[#1a1a30] bg-[#0b0b1c] px-5 pb-5 pt-10">
        <div className="mx-auto flex max-w-4xl flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.3em] text-[#52527a]">SG Goals</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight">Daily dashboard</h1>
              <p className="mt-1 text-sm text-[#8b8bb3]">
                {syncState === 'saved'
                  ? 'Saved to Supabase and backed up in this browser.'
                  : syncState === 'saving'
                    ? 'Saving changes to Supabase...'
                    : syncState === 'error'
                      ? 'Cloud save failed. Browser backup is still active.'
                      : syncState === 'local'
                        ? 'Browser backup active. Add DATABASE_URL to enable Supabase sync.'
                        : 'Loading your saved goals...'}
              </p>
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
              <span
                className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                  syncState === 'saved'
                    ? 'border-[#00d97e40] text-[#00d97e]'
                    : syncState === 'saving'
                      ? 'border-[#4f8ef740] text-[#4f8ef7]'
                      : 'border-[#ff6b6b44] text-[#ff6b6b]'
                }`}
              >
                {syncState === 'saved' ? 'Cloud saved' : syncState === 'saving' ? 'Saving' : syncState === 'loading' ? 'Loading' : 'Local only'}
              </span>
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
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-4">
        <div className="grid grid-cols-4 gap-2">
          {(['today', 'weekly', 'monthly', 'yearly'] as Scope[]).map((item) => (
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
                <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#52527a]">Next 1.5 hour target</p>
                <h2 className="mt-2 text-lg font-bold text-[#e8e8f5]">{targetTasks.length ? `${targetTasks.length} task${targetTasks.length === 1 ? '' : 's'} selected` : 'Select tasks from Morning, Afternoon, or Evening'}</h2>
                {mainGoal ? (
                  <p className="mt-1 text-xs text-[#8b8bb3]">
                    Current focus starts with {mainGoal.text}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-[#8b8bb3]">Tap the star beside Today tasks to add them here.</p>
                )}
              </div>
              <div className="rounded-lg bg-[#ffd16615] p-2 text-[#ffd166]">
                <Clock className="h-5 w-5" />
              </div>
            </div>
            {targetTasks.length ? (
              <div className="mt-4">
                <div className="mb-3 space-y-2">
                  {targetTasks.map((task) => {
                    const noteInfo = splitTaskNote(task.note);
                    return (
                      <div key={task.id} className="rounded-xl border border-[#1a1a30] bg-[#13132a] px-3 py-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className={`text-sm font-bold ${task.done ? 'text-[#52527a] line-through' : 'text-[#e8e8f5]'}`}>{task.text}</p>
                            <p className="mt-1 text-[11px] text-[#8b8bb3]">
                              {task.block ? blocks[task.block].label : priorities[task.priority].label}
                              {noteInfo.dueTime ? ` - By ${noteInfo.dueTime}` : ''}
                              {noteInfo.note ? ` - ${noteInfo.note}` : ''}
                            </p>
                          </div>
                          <button onClick={() => toggleTargetTask(task.id)} className="shrink-0 rounded-lg border border-[#1a1a30] px-2 py-1 text-[11px] font-bold text-[#8b8bb3]">
                            Remove
                          </button>
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
                    </div>
                    <p className="text-right text-[11px] text-[#8b8bb3]">
                      {targetTimer.complete ? 'Time is up. Finish or log what happened.' : targetTimer.running ? 'Timer is running.' : 'Timer is paused.'}
                    </p>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#1a1a30]">
                    <div className="h-full rounded-full bg-[#00d97e] transition-all" style={{ width: `${targetTimer.progress}%` }} />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={toggleTargetTimer} className="rounded-lg bg-[#00d97e] px-3 py-2 text-xs font-bold text-black">
                    {targetTimer.running ? 'Stop timer' : targetTimer.complete ? 'Start 1.5 hours again' : 'Start timer'}
                  </button>
                  <button onClick={resetTargetTimer} className="rounded-lg border border-[#4f8ef740] px-3 py-2 text-xs font-bold text-[#4f8ef7]">
                    Reset 1.5 hours
                  </button>
                  <button
                    onClick={() => {
                      setTargetTaskIds([]);
                      setTargetEndAt('');
                      setTargetRunning(false);
                      setTargetRemainingMs(TARGET_DURATION_MS);
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
                <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#52527a]">Streaks</p>
                <p className="mt-2 text-2xl font-bold text-[#e8e8f5]">{streaks.current}</p>
              </div>
              <div className="rounded-lg bg-[#f7a04f15] p-2 text-[#f7a04f]">
                <Flame className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-[#1a1a30] bg-[#13132a] px-3 py-2">
                <p className="text-[10px] text-[#52527a]">Current</p>
                <p className="mt-1 text-sm font-bold text-[#00d97e]">{streaks.current} day(s)</p>
              </div>
              <div className="rounded-lg border border-[#1a1a30] bg-[#13132a] px-3 py-2">
                <p className="text-[10px] text-[#52527a]">Best</p>
                <p className="mt-1 text-sm font-bold text-[#f7a04f]">{streaks.best} day(s)</p>
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
          {renderFailurePatternsSection('7-day failure patterns', 'Learn from misses without carrying them into today.', analytics, failurePatterns)}
        </>
      ) : null}

      {scope === 'monthly' ? (
        <>
          {renderFailurePatternsSection('Monthly failure patterns', 'Review recurring misses for this month without mixing them into today.', monthlyAnalytics, monthlyFailurePatterns)}
        </>
      ) : null}

      <section className="mx-auto grid max-w-4xl gap-4 px-5 md:grid-cols-[1fr,320px]">
        <div className="space-y-4">
          {(scope === 'today' ? todayDisplayGroups : groupedPriority).map((group) => {
            return (
              <div key={group.id} className="overflow-hidden rounded-xl border border-[#1a1a30] bg-[#0f0f1d]">
                <div className="flex items-center justify-between border-b border-[#1a1a30] px-4 py-3">
                  <div>
                    <h2 className="text-sm font-bold" style={{ color: group.color }}>{group.title}</h2>
                    <p className="text-[11px] text-[#52527a]">{group.sub}</p>
                  </div>
                  <span className="text-xs font-bold" style={{ color: group.color }}>{group.done}/{group.total}</span>
                </div>

                {group.tasks.length ? (
                  group.tasks.map((task) => (
                    <article key={task.id} className="flex items-stretch border-b border-[#1a1a30] last:border-b-0">
                      {(() => {
                        const noteInfo = splitTaskNote(task.note);
                        return (
                      <button onClick={() => toggleTask(task.id)} className="flex flex-1 items-start gap-3 px-4 py-3 text-left">
                        <span
                          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border"
                          style={{ borderColor: priorities[task.priority].color, background: task.done ? priorities[task.priority].soft : 'transparent' }}
                        >
                          {task.done ? <Check className="h-3.5 w-3.5" style={{ color: priorities[task.priority].color }} /> : null}
                        </span>
                        <span className="min-w-0">
                          <span className={`block text-sm ${task.done ? 'text-[#52527a] line-through' : 'text-[#e8e8f5]'}`}>{task.text}</span>
                          <span className="mt-1 flex flex-wrap gap-2 text-[11px] text-[#52527a]">
                            <span style={{ color: priorities[task.priority].color }}>{priorities[task.priority].label}</span>
                            {noteInfo.dueTime ? <span style={{ color: '#00d97e' }}>By {noteInfo.dueTime}</span> : null}
                            {noteInfo.note ? <span>{noteInfo.note}</span> : null}
                            {task.done && task.investedMinutes != null ? (
                              <span style={{ color: priorities[task.priority].color }}>{formatMinutes(task.investedMinutes)} invested</span>
                            ) : null}
                            {task.done && task.startedAt && task.completedAt ? (
                              <span>
                                {formatTimeShort(task.startedAt)} - {formatTimeShort(task.completedAt)}
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </button>
                        );
                      })()}
                      <button aria-label="Edit task" onClick={() => beginEdit(task)} className="w-11 border-l border-[#1a1a30] text-[#4f8ef7]">
                        <Edit3 className="mx-auto h-4 w-4" />
                      </button>
                      {scope === 'today' ? (
                        <button
                          aria-label="Set next 1.5 hour target"
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
            {scope !== 'today' ? (
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
                <div className="grid grid-cols-3 gap-2">
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
    </main>
  );
}
