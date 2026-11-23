/** Drop retired habits and collapse leftover night-skincare aliases into one kept entry. */

import { isRemovedChessItemText } from './chess-subtasks';

export const NO_MASTURBATION_TEXT = 'No masturbation (this week)';
export const NIGHT_SKIN_CARE_TEXT = 'Night skin care';

export const REMOVED_DUPLICATE_HABIT_TASKS = [
  'Morning skin care',
  'Ice skin care'
] as const;

const NIGHT_SKIN_KEYS = new Set([
  'EVENINGSKINCARE',
  'SKINCAREEVENING',
  'NIGHTSKINCARE',
  'SKINCARENIGHT',
  'PMSKINCARE',
  'SKINCAREPM'
]);

const MORNING_SKIN_KEYS = new Set([
  'MORNINGSKINCARE',
  'SKINCAREMORNING',
  'AMSKINCARE',
  'SKINCAREAM'
]);

const ICE_SKIN_KEYS = new Set(['ICESKINCARE', 'SKINCAREICE']);

const NO_MASTURBATION_KEYS = new Set([
  'NOMASTURBATIONTHISWEEK',
  'NOMASTURBATION',
  'NOSEXTHISWEEK',
  'NOSEX',
  'NOFAP',
  'NOFAPTHISWEEK',
  'MASTURBATE',
  'MASTURBATION',
  'MASTERBATE',
  'MASTERBATION',
  'NOMASTURBATE',
  'NOMASTERBATE',
  'SEX'
]);

export function compactHabitKey(text: string) {
  return text.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function mappedDuplicateHabitCode(text: string): 'NOMB' | 'SKINCAREEVENING' | 'SKINCAREMORNING' | 'ICESKINCARE' | null {
  const key = compactHabitKey(text);
  if (NIGHT_SKIN_KEYS.has(key)) return 'SKINCAREEVENING';
  if (MORNING_SKIN_KEYS.has(key)) return 'SKINCAREMORNING';
  if (ICE_SKIN_KEYS.has(key)) return 'ICESKINCARE';
  if (NO_MASTURBATION_KEYS.has(key)) return 'NOMB';
  return null;
}

export function isRemovedNoMbOrSexText(text: string) {
  const key = compactHabitKey(text);
  if (NO_MASTURBATION_KEYS.has(key)) return true;
  return (
    key.startsWith('NOMASTURBATION') ||
    key.startsWith('NOMASTERBATION') ||
    key.startsWith('NOMASTURBATE') ||
    key.startsWith('NOMASTERBATE') ||
    key.startsWith('NOSEX') ||
    key.startsWith('NOFAP')
  );
}

export function isRemovedPractiseBText(text: string) {
  const key = compactHabitKey(text);
  return key === 'PRACTISEB' || key === 'PRACTICEB';
}

export function isRemovedDuplicateHabitText(text: string) {
  const code = mappedDuplicateHabitCode(text);
  if (code === 'SKINCAREMORNING' || code === 'ICESKINCARE' || code === 'NOMB') return true;
  if (isRemovedNoMbOrSexText(text) || isRemovedPractiseBText(text) || isRemovedChessItemText(text)) return true;
  const key = compactHabitKey(text);
  return REMOVED_DUPLICATE_HABIT_TASKS.some((task) => compactHabitKey(task) === key);
}

export function canonicalKeptHabitText(text: string) {
  const code = mappedDuplicateHabitCode(text);
  if (code === 'SKINCAREEVENING') return NIGHT_SKIN_CARE_TEXT;
  return null;
}

export type DedupeTask = {
  id: string;
  text: string;
  done?: boolean;
  updatedAt?: string;
};

export type DedupeStore<T extends DedupeTask> = {
  today: T[];
  weekly: T[];
  weekend: T[];
  monthly: T[];
  yearly: T[];
  tomorrow: T[];
};

function taskTime(task: DedupeTask) {
  const value = Date.parse(task.updatedAt || '');
  return Number.isFinite(value) ? value : 0;
}

function preferTask<T extends DedupeTask>(current: T, candidate: T, canonicalText: string) {
  if (candidate.done && !current.done) return candidate;
  if (current.done && !candidate.done) return current;
  if (candidate.text === canonicalText && current.text !== canonicalText) return candidate;
  if (current.text === canonicalText && candidate.text !== canonicalText) return current;
  return taskTime(candidate) >= taskTime(current) ? candidate : current;
}

function dedupeScope<T extends DedupeTask>(tasks: T[]): { tasks: T[]; changed: boolean } {
  let changed = false;
  const kept: T[] = [];
  const seen = new Map<string, number>();

  for (const original of tasks) {
    if (isRemovedDuplicateHabitText(original.text)) {
      changed = true;
      continue;
    }
    const canonicalText = canonicalKeptHabitText(original.text);
    const task = canonicalText && original.text !== canonicalText
      ? { ...original, text: canonicalText }
      : original;
    if (task !== original) changed = true;
    if (!canonicalText) {
      kept.push(task);
      continue;
    }
    const existingIndex = seen.get(canonicalText);
    if (existingIndex === undefined) {
      seen.set(canonicalText, kept.length);
      kept.push(task);
      continue;
    }
    changed = true;
    kept[existingIndex] = preferTask(kept[existingIndex], task, canonicalText);
  }

  return { tasks: kept, changed };
}

/** Drop retired habits and merge leftover night-skincare aliases into one kept habit. */
export function dedupeHabitStore<T extends DedupeTask>(store: DedupeStore<T>): DedupeStore<T> {
  const today = dedupeScope(store.today);
  const weekly = dedupeScope(store.weekly);
  const weekend = dedupeScope(store.weekend);
  const monthly = dedupeScope(store.monthly);
  const yearly = dedupeScope(store.yearly);
  const tomorrow = dedupeScope(store.tomorrow);
  if (!today.changed && !weekly.changed && !weekend.changed && !monthly.changed && !yearly.changed && !tomorrow.changed) {
    return store;
  }
  return {
    ...store,
    today: today.tasks,
    weekly: weekly.tasks,
    weekend: weekend.tasks,
    monthly: monthly.tasks,
    yearly: yearly.tasks,
    tomorrow: tomorrow.tasks
  };
}

export type CloudHabitRow = {
  id: string;
  scope: string;
  text: string;
  done: boolean;
  updatedAt: Date | string;
};

export function planCloudHabitDedupe(rows: CloudHabitRow[]) {
  const scopes = new Set(['today', 'weekly', 'weekend', 'monthly', 'yearly', 'tomorrow']);
  const deleteIds: string[] = [];
  const renames: Array<{ id: string; text: string }> = [];
  const keptByScope = new Map<string, CloudHabitRow[]>();

  for (const row of rows) {
    if (!scopes.has(row.scope)) continue;
    if (isRemovedDuplicateHabitText(row.text)) {
      deleteIds.push(row.id);
      continue;
    }
    const canonicalText = canonicalKeptHabitText(row.text);
    const next = canonicalText ? { ...row, text: canonicalText } : row;
    if (canonicalText && row.text !== canonicalText) {
      renames.push({ id: row.id, text: canonicalText });
    }
    const key = canonicalText || `__keep__:${row.id}`;
    const groupKey = `${row.scope}:${key}`;
    const group = keptByScope.get(groupKey) || [];
    group.push(next);
    keptByScope.set(groupKey, group);
  }

  for (const [groupKey, group] of keptByScope) {
    if (!groupKey.includes('Night skin care')) continue;
    if (group.length < 2) continue;
    const winner = group.reduce((current, candidate) =>
      preferTask(
        { ...current, updatedAt: current.updatedAt instanceof Date ? current.updatedAt.toISOString() : String(current.updatedAt) },
        { ...candidate, updatedAt: candidate.updatedAt instanceof Date ? candidate.updatedAt.toISOString() : String(candidate.updatedAt) },
        group[0].text
      )
    );
    for (const row of group) {
      if (row.id === winner.id) continue;
      deleteIds.push(row.id);
      const renameIndex = renames.findIndex((item) => item.id === row.id);
      if (renameIndex >= 0) renames.splice(renameIndex, 1);
    }
  }

  return { deleteIds: [...new Set(deleteIds)], renames };
}
