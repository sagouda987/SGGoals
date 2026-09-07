import { istFocusDateKey } from './must-focus-targets';

type FocusRecord = { id: string; scope: string; kind: string; taskText: string; createdAt: string | Date; note?: string | null };

export function applyFocusCorrections<T extends FocusRecord>(records: T[], habitCode: (text: string) => string | null): T[] {
  const corrections = new Map<string, { record: T; dateKey: string; through: number; minutes: number }>();
  for (const record of records) {
    if (record.kind !== 'focus-correction' || record.scope !== 'today') continue;
    try {
      const value = JSON.parse(record.note || '') as { dateKey: string; through: string; minutes: number };
      const through = Date.parse(value.through);
      const code = habitCode(record.taskText);
      if (!code || !/^\d{4}-\d{2}-\d{2}$/.test(value.dateKey) || !Number.isFinite(through) ||
        !Number.isInteger(value.minutes) || value.minutes < 0 || value.minutes > 1440) continue;
      const key = `${value.dateKey}:${code}`;
      const previous = corrections.get(key);
      if (!previous || new Date(record.createdAt).getTime() > new Date(previous.record.createdAt).getTime()) {
        corrections.set(key, { record, dateKey: value.dateKey, through, minutes: value.minutes });
      }
    } catch { /* Ignore malformed corrections; preserve the original sessions. */ }
  }
  const seen = new Set<string>();
  const result = records.filter((record) => {
    if (seen.has(record.id)) return false;
    seen.add(record.id);
    if (record.kind !== 'focus-session' || record.scope !== 'today') return true;
    const time = new Date(record.createdAt).getTime();
    const correction = corrections.get(`${istFocusDateKey(time)}:${habitCode(record.taskText)}`);
    return !correction || time > correction.through;
  });
  for (const { record, dateKey, minutes } of corrections.values()) {
    const timestamp = `${dateKey}T12:00:00.000Z`;
    result.push({ ...record, id: `${record.id}:credited`, kind: 'focus-session',
      createdAt: record.createdAt instanceof Date ? new Date(timestamp) : timestamp,
      startedAt: undefined, completedAt: undefined, minutes, focusMinutes: minutes, points: 0,
      note: `Confirmed daily focus total\n[sg-activity-meta:${btoa(JSON.stringify({ points: 0, focusMinutes: minutes }))}]`
    });
  }
  return result;
}
