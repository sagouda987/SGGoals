'use client';
import { useMemo } from 'react';
import { pointBreakdown } from '@/lib/goals/point-breakdown';

type Event = { id: string; scope: string; taskText: string; kind: string; createdAt: string; points?: number };
export function HistoryPointBreakdown<T extends Event>({ events, date, habitCode, points }: { events: T[]; date: string; habitCode: (text: string) => string | null; points: (event: T) => number }) {
  const breakdown = useMemo(() => pointBreakdown(events, date, habitCode, points), [events, date, habitCode, points]);
  return <details className="mt-2 text-xs text-[#b8b8d0]">
    <summary className="cursor-pointer">Inspect historical points · {breakdown.total} pts</summary>
    <p className="my-2">Recorded events for {date}, from 3 AM IST to the next 3 AM. Habit duplicates and undone awards are excluded. Renamed or removed checklist tasks can still have historical events. Running totals below reflect the final credited events.</p>
    <div className="max-h-80 overflow-auto"><table className="w-full text-left"><caption className="sr-only">Historical point contributions</caption><thead><tr><th>Event (IST)</th><th>Points</th><th>Total</th></tr></thead><tbody>
      {breakdown.rows.map(event => <tr key={event.id} className="border-t border-[#292947]"><td className="py-2">{event.taskText} · {event.kind}<br /><span className="text-[10px]">{new Date(event.createdAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} · {event.scope}<br />{event.explanation}</span></td><td>{event.delta > 0 ? '+' : ''}{event.delta}</td><td>{event.total}</td></tr>)}
    </tbody></table>{!breakdown.rows.length && <p>No point events for this day.</p>}</div>
  </details>;
}
