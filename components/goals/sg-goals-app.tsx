'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, CalendarDays, Check, Copy, Download, Edit3, Flame, RotateCcw, Save, Sparkles, Star, Trash2, TrendingUp, Upload } from 'lucide-react';

type Scope = 'today' | 'weekly' | 'monthly' | 'yearly';
type Priority = 'health' | 'career' | 'communication' | 'looks';
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
const SAVE_DEBOUNCE_MS = 600;
const APP_VERSION = 'cloud-sync-v5';
const FAILURE_REASONS = ['Tired', 'Busy', 'Distracted', 'Forgot', 'No energy', 'Other'] as const;
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_LABELS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const priorities: Record<Priority, { label: string; color: string; soft: string }> = {
  health: { label: 'Health', color: '#00d97e', soft: 'rgba(0,217,126,.12)' },
  career: { label: 'Career', color: '#4f8ef7', soft: 'rgba(79,142,247,.12)' },
  communication: { label: 'Communication', color: '#f7a04f', soft: 'rgba(247,160,79,.12)' },
  looks: { label: 'Looks', color: '#c084fc', soft: 'rgba(192,132,252,.12)' }
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
  ]
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

function formatMinutes(mins?: number) {
  if (mins == null || Number.isNaN(mins)) return '';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (!rem) return `${hours}h`;
  return `${hours}h ${rem}m`;
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
      yearly: Array.isArray(parsed.yearly) ? parsed.yearly : starterStore.yearly
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

function dateKeyFromValue(dateValue: string) {
  return toISODate(new Date(dateValue));
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
  const [timingPreview, setTimingPreview] = useState('-');
  const [failureTask, setFailureTask] = useState<GoalTask | null>(null);
  const [failureScope, setFailureScope] = useState<Scope>('today');
  const [failureReason, setFailureReason] = useState<(typeof FAILURE_REASONS)[number]>('Tired');
  const [failureNote, setFailureNote] = useState('');
  const [mainGoalId, setMainGoalId] = useState('');
  const [reportCopied, setReportCopied] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarCursor, setCalendarCursor] = useState(() => new Date());
  const [draft, setDraft] = useState({ text: '', note: '', priority: 'career' as Priority, block: 'morning' as Block });

  useEffect(() => {
    let cancelled = false;
    const localStore = loadStore();
    const localActivities = loadActivities();
    setStore(localStore);
    setActivities(localActivities);
    setMainGoalId(window.localStorage.getItem(MAIN_GOAL_KEY) || '');

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
    if (ready) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }, [ready, store]);

  useEffect(() => {
    if (ready) window.localStorage.setItem(ACTIVITY_KEY, JSON.stringify(activities));
  }, [activities, ready]);

  useEffect(() => {
    if (ready) window.localStorage.setItem(MAIN_GOAL_KEY, mainGoalId);
  }, [mainGoalId, ready]);

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

  const analytics = useMemo(() => {
    const byPriority = Object.fromEntries(
      (Object.keys(priorities) as Priority[]).map((priority) => [priority, { completions: 0, failures: 0, undos: 0, minutes: 0, daysHit: new Set<string>(), series: Array(7).fill(0) }])
    ) as Record<
      Priority,
      { completions: number; failures: number; undos: number; minutes: number; daysHit: Set<string>; series: number[] }
    >;

    const recent = activities.filter((activity) => {
      const created = new Date(activity.createdAt);
      const windowStart = new Date();
      windowStart.setDate(windowStart.getDate() - 6);
      windowStart.setHours(0, 0, 0, 0);
      return created >= windowStart;
    });

    recent.forEach((activity) => {
      const bucket = byPriority[activity.priority];
      const created = new Date(activity.createdAt);
      const dayIndex = trendWindow.findIndex((day) => toISODate(day) === toISODate(created));
      const signedValue = activity.kind === 'failure' ? -1 : activity.kind === 'undo' ? -1 : 1;
      if (dayIndex >= 0) bucket.series[dayIndex] += signedValue;
      if (activity.kind === 'completion') {
        bucket.completions += 1;
        bucket.minutes += activity.minutes || 0;
        bucket.daysHit.add(toISODate(created));
      } else if (activity.kind === 'failure') {
        bucket.failures += 1;
      } else if (activity.kind === 'undo') {
        bucket.undos += 1;
      }
    });

    const scorecard = (Object.keys(priorities) as Priority[]).map((priority) => {
      const data = byPriority[priority];
      const totalActions = data.completions + data.failures + data.undos;
      const consistency = data.daysHit.size / 7;
      const completionRate = totalActions ? data.completions / totalActions : 0;
      const minuteTargets: Record<Priority, number> = { health: 180, career: 300, communication: 90, looks: 45 };
      const timeScore = Math.min(data.minutes / minuteTargets[priority], 1);
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
        .slice(0, 6),
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
  }, [activities, trendWindow]);

  const overallScore = useMemo(() => {
    if (!analytics.scorecard.length) return 0;
    return Math.round(analytics.scorecard.reduce((sum, item) => sum + item.score, 0) / analytics.scorecard.length);
  }, [analytics.scorecard]);

  const mainGoal = useMemo(() => {
    const selected = store.today.find((task) => task.id === mainGoalId);
    if (selected) return selected;
    return store.today.find((task) => !task.done) || store.today[0] || null;
  }, [mainGoalId, store.today]);

  const dailyStatus = useMemo(() => {
    const status: Record<string, { completed: number; failures: number; total: number; state: 'green' | 'red' | 'none' }> = {};
    const todayKey = toISODate(new Date());
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
  }, [activities, store.today]);

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
    setDraft({ text: '', note: '', priority: 'career', block: 'morning' });
  }

  function saveTask() {
    const text = draft.text.trim();
    if (!text) return;
    const note = draft.note.trim() || undefined;
    persist((current) => {
      const next = { ...current };
      if (editing) {
        next[scope] = current[scope].map((task) =>
          task.id === editing.id
            ? { ...task, text, note, priority: draft.priority, block: scope === 'today' ? draft.block : undefined, updatedAt: new Date().toISOString() }
            : task
        );
      } else {
        next[scope] = [...current[scope], makeTask(text, note, draft.priority, scope === 'today' ? draft.block : undefined)];
      }
      return next;
    });
    resetDraft();
  }

  function beginEdit(task: GoalTask) {
    setEditing(task);
    setDraft({ text: task.text, note: task.note || '', priority: task.priority, block: task.block || 'morning' });
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
        note: currentTask.note,
        createdAt: new Date().toISOString()
      });
      return;
    }

    setTimingTask(currentTask);
    setTimingScope(scope);
    const guessed = new Date(Date.now() - 30 * 60 * 1000);
    setTimingStart(`${String(guessed.getHours()).padStart(2, '0')}:${String(guessed.getMinutes()).padStart(2, '0')}`);
    setTimingPreview('-');
  }

  function updateTimingPreview(nextValue = timingStart) {
    if (!nextValue) {
      setTimingPreview('-');
      return;
    }
    const start = parseStartDate(nextValue);
    if (!start) {
      setTimingPreview('Invalid time');
      return;
    }
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    if (diffMs < 0) {
      setTimingPreview('Start time is in the future');
      return;
    }
    setTimingPreview(`Invested ${formatMinutes(Math.max(1, Math.round(diffMs / 60000)))}`);
  }

  function confirmTiming() {
    if (!timingTask) return;
    const startedAt = parseStartDate(timingStart);
    const completedAt = new Date();
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
      note: timingTask.note,
      minutes: investedMinutes,
      startedAt: startedAt ? startedAt.toISOString() : undefined,
      completedAt: completedAt.toISOString(),
      createdAt: completedAt.toISOString()
    });
    setTimingTask(null);
    setTimingScope('today');
    setTimingStart('');
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
          yearly: parsed.yearly || []
        });
      } catch {
        alert('That backup file could not be imported.');
      }
    };
    reader.readAsText(file);
  }

  async function copyCoachingReport() {
    const todayTasks = store.today.map((task) => `${task.done ? 'Done' : 'Pending'} - ${task.text}${task.investedMinutes ? ` (${formatMinutes(task.investedMinutes)})` : ''}`);
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
      `Current streak: ${streaks.current} day(s)`,
      `Best streak: ${streaks.best} day(s)`,
      `Main goal today: ${mainGoal ? mainGoal.text : 'Not selected'}`,
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
      'Please coach me: identify my pattern, biggest bottleneck, and the next 3 actions for tomorrow.'
    ].join('\n');

    await navigator.clipboard.writeText(report);
    setReportCopied(true);
    window.setTimeout(() => setReportCopied(false), 1800);
  }

  const groupedToday = (Object.keys(blocks) as Block[]).map((block) => ({
    block,
    tasks: activeTasks.filter((task) => task.block === block)
  }));

  const groupedPriority = (Object.keys(priorities) as Priority[]).map((priority) => ({
    priority,
    tasks: activeTasks.filter((task) => task.priority === priority)
  }));

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
              <button
                onClick={() => setCalendarOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#00d97e40] bg-[#00d97e12] text-[#00d97e]"
                aria-label="Open calendar heatmap"
                title="Open calendar heatmap"
              >
                <CalendarDays className="h-5 w-5" />
              </button>
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

      <section className="mx-auto max-w-4xl px-5 pb-2">
        <div className="grid gap-3 md:grid-cols-[1.2fr,.8fr]">
          <div className="rounded-xl border border-[#1a1a30] bg-[#0f0f1d] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#52527a]">Main goal of the day</p>
                <h2 className="mt-2 text-lg font-bold text-[#e8e8f5]">{mainGoal ? mainGoal.text : 'Add a daily task to choose your main goal'}</h2>
                {mainGoal ? (
                  <p className="mt-1 text-xs text-[#8b8bb3]">
                    {priorities[mainGoal.priority].label}
                    {mainGoal.note ? ` - ${mainGoal.note}` : ''}
                  </p>
                ) : null}
              </div>
              <div className="rounded-lg bg-[#ffd16615] p-2 text-[#ffd166]">
                <Star className="h-5 w-5" />
              </div>
            </div>
            {mainGoal ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => toggleTask(mainGoal.id)}
                  className={`rounded-lg px-3 py-2 text-xs font-bold ${
                    mainGoal.done ? 'border border-[#1a1a30] text-[#8b8bb3]' : 'bg-[#00d97e] text-black'
                  }`}
                >
                  {mainGoal.done ? 'Mark pending' : 'Complete main goal'}
                </button>
                <button onClick={() => openFailure(mainGoal)} className="rounded-lg border border-[#f7a04f40] px-3 py-2 text-xs font-bold text-[#f7a04f]">
                  Log failure
                </button>
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

      <section className="mx-auto max-w-4xl px-5 pb-2">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-[#1a1a30] bg-[#0f0f1d] p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#52527a]">Overall score</p>
                <p className="mt-1 text-2xl font-bold text-[#e8e8f5]">{overallScore}</p>
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

          <div className="rounded-xl border border-[#1a1a30] bg-[#0f0f1d] p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#52527a]">This week</p>
                <p className="mt-1 text-2xl font-bold text-[#e8e8f5]">{analytics.totals.completions}</p>
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

          <div className="rounded-xl border border-[#1a1a30] bg-[#0f0f1d] p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#52527a]">Recent misses</p>
                <p className="mt-1 text-2xl font-bold text-[#e8e8f5]">{analytics.failures.length}</p>
              </div>
              <div className="rounded-lg bg-[#ff6b6b18] p-2 text-[#ff6b6b]">
                <AlertTriangle className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {analytics.failures.length ? (
                analytics.failures.map((activity) => (
                  <div key={activity.id} className="rounded-lg border border-[#1a1a30] bg-[#13132a] px-3 py-2">
                    <p className="text-sm text-[#e8e8f5]">{activity.taskText}</p>
                    <p className="mt-1 text-[11px] text-[#8b8bb3]">
                      {activity.reason ? activity.reason : 'Missed'}
                      {activity.note ? ` · ${activity.note}` : ''}
                      {' · '}
                      {formatDateShort(activity.createdAt)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-[#1a1a30] px-3 py-4 text-center text-[11px] text-[#52527a]">
                  No failures logged yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 pb-2">
        <div className="rounded-xl border border-[#1a1a30] bg-[#0f0f1d] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#52527a]">Priority trends</p>
              <h2 className="mt-1 text-sm font-bold text-[#e8e8f5]">Last 7 days per area</h2>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-[#52527a]">
              <span className="h-2 w-2 rounded-full bg-[#00d97e]" />Positive
              <span className="ml-2 h-2 w-2 rounded-full bg-[#ff6b6b]" />Misses
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {analytics.scorecard.map((row) => (
              <div key={row.priority} className="rounded-xl border border-[#1a1a30] bg-[#13132a] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#52527a]">{priorities[row.priority].label}</p>
                    <p className="mt-1 text-lg font-bold" style={{ color: priorities[row.priority].color }}>
                      {row.score}
                    </p>
                  </div>
                  <div className="text-right text-[11px] text-[#8b8bb3]">
                    <p>{row.completions} done</p>
                    <p>{row.failures} failed</p>
                    <p>{formatMinutes(row.minutes) || '0m'} invested</p>
                  </div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#1a1a30]">
                  <div className="h-full rounded-full" style={{ width: `${row.score}%`, background: priorities[row.priority].color }} />
                </div>
                <div className="mt-3 flex h-16 items-end gap-1">
                  {row.series.map((value, index) => {
                    const height = Math.min(56, Math.max(10, Math.abs(value) * 14 + 10));
                    const color = value >= 0 ? priorities[row.priority].color : '#ff6b6b';
                    const day = trendWindow[index];
                    return (
                      <div key={day.toISOString()} className="flex flex-1 flex-col items-center justify-end gap-1">
                        <div className="flex h-14 w-full items-end">
                          <div
                            className="w-full rounded-t"
                            style={{
                              height: `${height}px`,
                              background: value === 0 ? '#2b2b49' : color,
                              opacity: value === 0 ? 0.7 : 1
                            }}
                          />
                        </div>
                        <span className="text-[10px] text-[#52527a]">{day.toLocaleDateString([], { weekday: 'narrow' })}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-4xl gap-4 px-5 md:grid-cols-[1fr,320px]">
        <div className="space-y-4">
          {(scope === 'today' ? groupedToday : groupedPriority).map((group) => {
            const isToday = 'block' in group;
            const title = isToday ? blocks[group.block].label : priorities[group.priority].label;
            const sub = isToday ? blocks[group.block].time : 'Priority group';
            const color = isToday ? '#4f8ef7' : priorities[group.priority].color;
            return (
              <div key={isToday ? group.block : group.priority} className="overflow-hidden rounded-xl border border-[#1a1a30] bg-[#0f0f1d]">
                <div className="flex items-center justify-between border-b border-[#1a1a30] px-4 py-3">
                  <div>
                    <h2 className="text-sm font-bold" style={{ color }}>{title}</h2>
                    <p className="text-[11px] text-[#52527a]">{sub}</p>
                  </div>
                  <span className="text-xs font-bold" style={{ color }}>{group.tasks.filter((task) => task.done).length}/{group.tasks.length}</span>
                </div>

                {group.tasks.length ? (
                  group.tasks.map((task) => (
                    <article key={task.id} className="flex items-stretch border-b border-[#1a1a30] last:border-b-0">
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
                            {task.note ? <span>{task.note}</span> : null}
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
                      <button aria-label="Edit task" onClick={() => beginEdit(task)} className="w-11 border-l border-[#1a1a30] text-[#4f8ef7]">
                        <Edit3 className="mx-auto h-4 w-4" />
                      </button>
                      {scope === 'today' ? (
                        <button
                          aria-label="Set main goal"
                          onClick={() => setMainGoalId(task.id)}
                          className={`w-11 border-l border-[#1a1a30] ${mainGoal?.id === task.id ? 'text-[#ffd166]' : 'text-[#52527a]'}`}
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
            <select
              value={draft.priority}
              onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as Priority }))}
              className="w-full rounded-lg border border-[#1a1a30] bg-[#0f0f1d] px-3 py-2 text-sm outline-none focus:border-[#00d97e]"
            >
              {Object.entries(priorities).map(([key, value]) => (
                <option key={key} value={key}>{value.label}</option>
              ))}
            </select>
            {scope === 'today' ? (
              <select
                value={draft.block}
                onChange={(event) => setDraft((current) => ({ ...current, block: event.target.value as Block }))}
                className="w-full rounded-lg border border-[#1a1a30] bg-[#0f0f1d] px-3 py-2 text-sm outline-none focus:border-[#00d97e]"
              >
                {Object.entries(blocks).map(([key, value]) => (
                  <option key={key} value={key}>{value.label}</option>
                ))}
              </select>
            ) : null}
            <button onClick={saveTask} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#00d97e] px-3 py-3 text-sm font-bold text-black">
              <Save className="h-4 w-4" />
              {editing ? 'Save changes' : 'Add task'}
            </button>
            {editing ? (
              <button onClick={resetDraft} className="w-full rounded-lg border border-[#1a1a30] px-3 py-2 text-sm text-[#8b8bb3]">Cancel edit</button>
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
            <h3 className="text-xs font-bold uppercase tracking-[.2em] text-[#52527a]">Failure log</h3>
            <div className="mt-3 space-y-2">
              {analytics.failures.length ? (
                analytics.failures.map((activity) => (
                  <div key={activity.id} className="rounded-lg border border-[#1a1a30] bg-[#0f0f1d] px-3 py-2">
                    <p className="text-sm text-[#e8e8f5]">{activity.taskText}</p>
                    <p className="mt-1 text-[11px] text-[#8b8bb3]">
                      {activity.reason || 'Missed'}
                      {activity.note ? ` · ${activity.note}` : ''}
                      {' · '}
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
        </aside>
      </section>

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
          <input
            type="time"
            value={timingStart}
            onChange={(event) => {
              setTimingStart(event.target.value);
              updateTimingPreview(event.target.value);
            }}
            className="mt-2 w-full rounded-xl border border-[#1a1a30] bg-[#0f0f1d] px-4 py-3 text-center text-lg text-[#e8e8f5] outline-none focus:border-[#00d97e]"
          />
          <div className="mt-3 rounded-xl border border-[#1a1a30] bg-[#0f0f1d] px-4 py-3 text-sm text-[#8b8bb3]">{timingPreview}</div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => {
                const now = new Date();
                const value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                setTimingStart(value);
                updateTimingPreview(value);
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
              This will go into the failure log and show up in trends.
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
