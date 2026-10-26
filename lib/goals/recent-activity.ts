// "Last hour" summary for the Today tab. Pure: built from data the app already has in memory
// (activity log, task subtasks, current-month expenses, wake log, running stopwatches).
// Windows are real timestamps, so a window that crosses the 03:00 IST app-day boundary
// still includes items from the previous app-day.

export type RecentWindowMode = '1h' | '3h' | 'today';

export type RecentActivityInput = {
  id: string;
  scope: string;
  taskText: string;
  kind: string;
  note?: string;
  minutes?: number;
  focusMinutes?: number;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
};
export type RecentSubtaskInput = { taskText: string; scope: string; text: string; done: boolean; completedAt?: string; updatedAt?: string };
/** kind 'received' = income; anything else (or missing) = spending. */
export type RecentExpenseInput = { amountPaise: number; updatedAt: string; kind?: string };
export type RecentRunningSession = { taskText: string; startedAt: string };
export type RecentWakeInput = { wakeTime: string; loggedAt: string } | null;

export type RecentItem = {
  id: string;
  at: string; // ISO time shown in IST
  icon: string;
  text: string;
  detail?: string;
  kind: 'task' | 'subtask' | 'focus' | 'expense' | 'income' | 'wake' | 'running';
};
export type RecentTracked = { key: string; label: string; minutes: number; running: boolean };
export type RecentSummary = {
  mode: RecentWindowMode;
  startMs: number;
  endMs: number;
  items: RecentItem[];
  tracked: RecentTracked[];
  tasksDone: number;
  subtasksDone: number;
  trackedMinutes: number;
  expenseCount: number;
  expensePaise: number;
  incomeCount: number;
  incomePaise: number;
  empty: boolean;
  headline: string;
};

/** Groups habit aliases (e.g. old and new Book labels) so time is not double counted. */
export type GroupFn = (taskText: string) => { key: string; label: string };

const HOUR_MS = 60 * 60 * 1000;
const IST_OFFSET_MS = 330 * 60 * 1000;

/** Start of the app day (03:00 IST) that contains `nowMs`. */
export function appDayStartMs(nowMs: number) {
  const shifted = new Date(nowMs + IST_OFFSET_MS - 3 * HOUR_MS);
  const dayKey = shifted.toISOString().slice(0, 10);
  return Date.parse(`${dayKey}T03:00:00+05:30`);
}

export function recentWindow(mode: RecentWindowMode, nowMs: number) {
  if (mode === 'today') return { startMs: appDayStartMs(nowMs), endMs: nowMs };
  return { startMs: nowMs - (mode === '3h' ? 3 : 1) * HOUR_MS, endMs: nowMs };
}

/** Both edges inclusive: something exactly 60 minutes ago is still "in the last hour". */
export function inWindow(timeMs: number, startMs: number, endMs: number) {
  return Number.isFinite(timeMs) && timeMs >= startMs && timeMs <= endMs;
}

/** Minutes of [aMs, bMs] that fall inside the window. */
export function clipMinutes(aMs: number, bMs: number, startMs: number, endMs: number) {
  if (!Number.isFinite(aMs) || !Number.isFinite(bMs)) return 0;
  const from = Math.max(Math.min(aMs, bMs), startMs);
  const to = Math.min(Math.max(aMs, bMs), endMs);
  return to > from ? (to - from) / 60000 : 0;
}

type Interval = [number, number];

function mergedMinutesInWindow(intervals: Interval[], startMs: number, endMs: number) {
  const clipped = intervals
    .map(([a, b]) => [Math.max(Math.min(a, b), startMs), Math.min(Math.max(a, b), endMs)] as Interval)
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let total = 0;
  let current: Interval | null = null;
  for (const interval of clipped) {
    if (current && interval[0] <= current[1]) current[1] = Math.max(current[1], interval[1]);
    else {
      if (current) total += current[1] - current[0];
      current = [...interval] as Interval;
    }
  }
  if (current) total += current[1] - current[0];
  return total / 60000;
}

const time = (value: string | undefined) => (value ? Date.parse(value) : NaN);

export function formatIstTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).replace(/\b(am|pm)\b/, (part) => part.toUpperCase());
}

export function formatTrackedMinutes(minutes: number) {
  const whole = Math.round(minutes);
  if (whole < 60) return `${whole}m`;
  return `${Math.floor(whole / 60)}h${whole % 60 ? ` ${whole % 60}m` : ''}`;
}

function formatWholeRupees(paise: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(Math.round(paise / 100));
}

export function buildRecentSummary(input: {
  mode: RecentWindowMode;
  nowMs: number;
  activities: RecentActivityInput[];
  subtasks?: RecentSubtaskInput[];
  expenses?: RecentExpenseInput[];
  wakeLog?: RecentWakeInput;
  running?: RecentRunningSession[];
  group?: GroupFn;
}): RecentSummary {
  const { mode, nowMs } = input;
  const { startMs, endMs } = recentWindow(mode, nowMs);
  const group: GroupFn = input.group ?? ((text) => ({ key: text.trim().toLowerCase(), label: text.trim() }));
  const items: RecentItem[] = [];
  const intervals = new Map<string, { label: string; intervals: Interval[]; extra: number; running: boolean }>();
  const track = (taskText: string) => {
    const { key, label } = group(taskText);
    const entry = intervals.get(key) ?? { label, intervals: [], extra: 0, running: false };
    intervals.set(key, entry);
    return entry;
  };

  // Completions, minus any later undo of the same task; repeated check-offs count once (latest kept).
  const undos = input.activities.filter((activity) => activity.kind === 'undo');
  const latestCompletion = new Map<string, RecentActivityInput>();
  for (const activity of input.activities) {
    if (activity.kind !== 'completion') continue;
    const created = time(activity.createdAt);
    const undone = undos.some((undo) => undo.scope === activity.scope && undo.taskText === activity.taskText && time(undo.createdAt) > created);
    if (undone) continue;
    const doneAt = time(activity.completedAt) || created;
    if (inWindow(doneAt, startMs, endMs)) {
      const key = `${activity.scope}:${group(activity.taskText).key}`;
      const previous = latestCompletion.get(key);
      if (!previous || (time(previous.completedAt) || time(previous.createdAt)) <= doneAt) latestCompletion.set(key, activity);
    }
    // Timed completions (start..finish entered on check-off) count as tracked time when they overlap the window.
    const startedAt = time(activity.startedAt);
    if (Number.isFinite(startedAt) && doneAt > startedAt && clipMinutes(startedAt, doneAt, startMs, endMs) > 0) {
      track(activity.taskText).intervals.push([startedAt, doneAt]);
    }
  }
  latestCompletion.forEach((activity) => {
    const at = activity.completedAt || activity.createdAt;
    const minutes = Math.max(0, Math.round((time(activity.completedAt) - time(activity.startedAt)) / 60000)) || 0;
    items.push({
      id: activity.id,
      at,
      icon: '✅',
      text: activity.taskText,
      detail: [activity.scope !== 'today' ? activity.scope : '', minutes >= 2 ? `${minutes}m` : ''].filter(Boolean).join(' · ') || undefined,
      kind: 'task'
    });
  });

  // Focus sessions. Stopwatch sessions carry start/finish; timer sessions carry only finish
  // (assume they ran for their minutes up to the finish); manual additions have no clock time,
  // so their minutes count in full when they were entered inside the window.
  for (const activity of input.activities) {
    if (activity.kind !== 'focus-session') continue;
    const minutes = activity.focusMinutes ?? activity.minutes ?? 0;
    if (minutes <= 0) continue;
    const endAt = time(activity.completedAt) || time(activity.createdAt);
    const manual = !activity.completedAt && !activity.startedAt;
    if (manual) {
      if (!inWindow(time(activity.createdAt), startMs, endMs)) continue;
      track(activity.taskText).extra += minutes;
      items.push({ id: activity.id, at: activity.createdAt, icon: '➕', text: `${minutes}m added to ${group(activity.taskText).label}`, detail: 'manual', kind: 'focus' });
      continue;
    }
    const startAt = time(activity.startedAt) || endAt - minutes * 60000;
    const clipped = clipMinutes(startAt, endAt, startMs, endMs);
    if (clipped <= 0) continue;
    track(activity.taskText).intervals.push([startAt, endAt]);
    if (inWindow(endAt, startMs, endMs)) {
      items.push({ id: activity.id, at: new Date(endAt).toISOString(), icon: '⏱️', text: `${group(activity.taskText).label} session`, detail: `${minutes}m`, kind: 'focus' });
    }
  }

  // Stopwatches still running now.
  for (const session of input.running ?? []) {
    const startAt = time(session.startedAt);
    if (!Number.isFinite(startAt) || clipMinutes(startAt, endMs, startMs, endMs) <= 0) continue;
    const entry = track(session.taskText);
    entry.intervals.push([startAt, endMs]);
    entry.running = true;
  }

  let subtasksDone = 0;
  for (const subtask of input.subtasks ?? []) {
    if (!subtask.done) continue;
    const at = subtask.completedAt || subtask.updatedAt;
    if (!at || !inWindow(time(at), startMs, endMs)) continue;
    subtasksDone += 1;
    items.push({ id: `subtask:${subtask.taskText}:${subtask.text}:${at}`, at, icon: '☑️', text: subtask.text, detail: `in ${subtask.taskText}`, kind: 'subtask' });
  }

  const moneyInWindow = (input.expenses ?? []).filter((expense) => inWindow(time(expense.updatedAt), startMs, endMs));
  // Income is shown on its own line and never counted as spending.
  const expenses = moneyInWindow.filter((expense) => expense.kind !== 'received');
  const income = moneyInWindow.filter((expense) => expense.kind === 'received');
  const incomePaise = income.reduce((sum, entry) => sum + entry.amountPaise, 0);
  const expensePaise = expenses.reduce((sum, expense) => sum + expense.amountPaise, 0);
  if (expenses.length) {
    const latest = expenses.map((expense) => expense.updatedAt).sort().at(-1)!;
    items.push({ id: 'expenses', at: latest, icon: '💸', text: `Logged ${expenses.length} ${expenses.length === 1 ? 'expense' : 'expenses'} · ${formatWholeRupees(expensePaise)}`, kind: 'expense' });
  }
  if (income.length) {
    const latest = income.map((entry) => entry.updatedAt).sort().at(-1)!;
    items.push({ id: 'income', at: latest, icon: '💰', text: `Received ${formatWholeRupees(incomePaise)}`, detail: income.length > 1 ? `${income.length} entries` : undefined, kind: 'income' });
  }

  if (input.wakeLog && inWindow(time(input.wakeLog.loggedAt), startMs, endMs)) {
    items.push({ id: 'wake', at: input.wakeLog.loggedAt, icon: '⏰', text: `Logged wake-up time ${input.wakeLog.wakeTime}`, kind: 'wake' });
  }

  items.sort((a, b) => time(b.at) - time(a.at));
  const tracked = [...intervals.entries()]
    .map(([key, entry]) => ({ key, label: entry.label, minutes: mergedMinutesInWindow(entry.intervals, startMs, endMs) + entry.extra, running: entry.running }))
    .filter((entry) => Math.round(entry.minutes) >= 1)
    .sort((a, b) => b.minutes - a.minutes);
  const trackedMinutes = Math.round(tracked.reduce((sum, entry) => sum + entry.minutes, 0));
  const tasksDone = latestCompletion.size;
  const parts = [
    tasksDone ? `${tasksDone} ${tasksDone === 1 ? 'task' : 'tasks'} done` : '',
    subtasksDone ? `${subtasksDone} ${subtasksDone === 1 ? 'subtask' : 'subtasks'}` : '',
    trackedMinutes ? `${formatTrackedMinutes(trackedMinutes)} tracked` : '',
    expenses.length ? `${formatWholeRupees(expensePaise)} spent` : '',
    income.length ? `${formatWholeRupees(incomePaise)} received` : ''
  ].filter(Boolean);
  const empty = !items.length && !tracked.length;
  const windowLabel = mode === '1h' ? 'in the last hour' : mode === '3h' ? 'in the last 3 hours' : 'today';
  return {
    mode,
    startMs,
    endMs,
    items,
    tracked,
    tasksDone,
    subtasksDone,
    trackedMinutes,
    expenseCount: expenses.length,
    expensePaise,
    incomeCount: income.length,
    incomePaise,
    empty,
    headline: empty ? `Nothing logged ${windowLabel}` : parts.join(' · ') || `Activity logged ${windowLabel}`
  };
}
