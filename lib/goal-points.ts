import { istFocusDateKey } from './must-focus-targets';

// Daily habits earn their recorded weight once per reporting day. Duplicate
// completions do not change that weight; undo clears it, allowing a fresh award.
export function dailyHabitPointEvents<T extends { scope: string; kind: string; taskText: string; createdAt: string | Date }>(
  events: T[], habitCode: (text: string) => string | null
): T[] {
  const active = new Map<string, T>();
  const other: T[] = [];
  const ordered = [...events].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  for (const event of ordered) {
    const code = event.scope === 'today' ? habitCode(event.taskText) : null;
    if (!code || (event.kind !== 'completion' && event.kind !== 'undo')) {
      other.push(event);
      continue;
    }
    const key = `${istFocusDateKey(new Date(event.createdAt).getTime())}:${code}`;
    if (event.kind === 'undo') active.delete(key);
    else if (!active.has(key)) active.set(key, event);
  }
  return [...other, ...active.values()].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}
