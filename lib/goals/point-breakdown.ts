import { dailyHabitPointEvents } from '../goal-points';
import { istFocusDateKey } from '../must-focus-targets';

type Event = { id: string; scope: string; taskText: string; kind: string; createdAt: string };
export function pointBreakdown<T extends Event>(events: T[], date: string, habitCode: (text: string) => string | null, points: (event: T) => number) {
  const effective = new Set(dailyHabitPointEvents(events, habitCode).map(event => event.id));
  let total = 0;
  const rows = events.filter(event => istFocusDateKey(event.createdAt) === date && ['completion', 'undo', 'focus-session'].includes(event.kind))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .map(event => {
      const before = total;
      const counted = effective.has(event.id);
      if (counted && event.kind === 'completion') total += points(event);
      if (counted && event.kind === 'undo') total = Math.max(0, total - points(event));
      return { ...event, delta: total - before, total, explanation: event.kind === 'focus-session' ? 'Time only; no points'
        : !counted ? 'Excluded: duplicate habit completion or cleared by undo'
        : event.kind === 'undo' ? 'Undo deduction (total cannot go below zero)' : 'Credited completion' };
    });
  return { total, rows };
}
