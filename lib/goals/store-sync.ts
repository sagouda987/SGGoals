export type SyncTask = { id: string; updatedAt?: string; done?: boolean };

/** An uncheck must be at least this much newer than a completion to win (absorbs device clock skew). */
export const UNCHECK_MIN_LEAD_MS = 2 * 60 * 1000;
export type SyncStore<T extends SyncTask> = Record<string, T[]>;

function changed<T extends SyncTask>(base: T | undefined, value: T | undefined) {
  if (!base || !value) return base !== value;
  return base.updatedAt !== value.updatedAt;
}

function timeOf(task: SyncTask) {
  const value = Date.parse(task.updatedAt || '1970-01-01T00:00:00.000Z');
  return Number.isFinite(value) ? value : 0;
}

function newer<T extends SyncTask>(left: T, right: T) {
  const leftTime = timeOf(left);
  const rightTime = timeOf(right);
  // Completion wins conflicts: a done task only goes back to undone when the uncheck is clearly newer.
  if (left.done === true && right.done === false) return rightTime - leftTime > UNCHECK_MIN_LEAD_MS ? right : left;
  if (right.done === true && left.done === false) return leftTime - rightTime > UNCHECK_MIN_LEAD_MS ? left : right;
  return leftTime > rightTime ? left : right;
}

/** Merge concurrent whole-store snapshots without discarding independent task edits. */
export function mergeGoalStores<T extends SyncTask>(base: SyncStore<T>, local: SyncStore<T>, remote: SyncStore<T>): SyncStore<T> {
  const scopes = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  return Object.fromEntries([...scopes].map((scope) => {
    const baseById = new Map((base[scope] || []).map((task) => [task.id, task]));
    const localById = new Map((local[scope] || []).map((task) => [task.id, task]));
    const remoteById = new Map((remote[scope] || []).map((task) => [task.id, task]));
    const orderedIds = [...new Set([...(remote[scope] || []).map((task) => task.id), ...(local[scope] || []).map((task) => task.id)])];
    const merged = orderedIds.flatMap((id) => {
      const baseTask = baseById.get(id);
      const localTask = localById.get(id);
      const remoteTask = remoteById.get(id);
      const localChanged = changed(baseTask, localTask);
      const remoteChanged = changed(baseTask, remoteTask);

      if (localChanged && !remoteChanged) return localTask ? [localTask] : [];
      if (remoteChanged && !localChanged) return remoteTask ? [remoteTask] : [];
      if (localChanged && remoteChanged) {
        if (!localTask) return remoteTask ? [remoteTask] : [];
        if (!remoteTask) return [localTask];
        return [newer(localTask, remoteTask)];
      }
      return remoteTask ? [remoteTask] : localTask ? [localTask] : [];
    });
    return [scope, merged];
  })) as SyncStore<T>;
}

export function latestTaskRevision(tasks: Array<{ updatedAt: Date | string }>) {
  if (!tasks.length) return null;
  return tasks.reduce((latest, task) => {
    const value = task.updatedAt instanceof Date ? task.updatedAt.toISOString() : task.updatedAt;
    return value > latest ? value : latest;
  }, '1970-01-01T00:00:00.000Z');
}

export function storeRevisionConflicts(currentRevision: string | null, expectedRevision: string | null) {
  return currentRevision !== expectedRevision;
}

export function newerUpdatedValue<T extends { updatedAt: string }>(local: T, remote: T) {
  return Date.parse(local.updatedAt) > Date.parse(remote.updatedAt) ? local : remote;
}
