import assert from 'node:assert/strict';
import {
  appDayStartMs,
  buildRecentSummary,
  clipMinutes,
  formatIstTime,
  inWindow,
  recentWindow,
  type RecentActivityInput
} from '../lib/goals/recent-activity';

const ist = (value: string) => Date.parse(`${value}+05:30`);
const iso = (value: string) => new Date(ist(value)).toISOString();
let n = 0;
const act = (fields: Partial<RecentActivityInput> & { kind: string; taskText: string; createdAt: string }): RecentActivityInput => ({
  id: `a${(n += 1)}`, scope: 'today', ...fields
});
// Habit aliases share one bucket, like the app's normaliser.
const group = (text: string) => (/book|speaking/i.test(text) ? { key: 'BOOK', label: 'Book reading' } : { key: text.toLowerCase(), label: text });

const now = ist('2026-10-26T15:30:00');

// Window maths and edges.
assert.deepEqual(recentWindow('1h', now), { startMs: ist('2026-10-26T14:30:00'), endMs: now });
assert.equal(recentWindow('3h', now).startMs, ist('2026-10-26T12:30:00'));
assert.equal(inWindow(ist('2026-10-26T14:30:00'), now - 3600000, now), true, 'exactly 60 minutes ago is included');
assert.equal(inWindow(ist('2026-10-26T14:30:00') - 1, now - 3600000, now), false, '60m + 1ms is excluded');
assert.equal(inWindow(now + 1, now - 3600000, now), false, 'future is excluded');
assert.equal(clipMinutes(ist('2026-10-26T14:00:00'), ist('2026-10-26T14:45:00'), now - 3600000, now), 15, 'clipped at the start');
assert.equal(clipMinutes(ist('2026-10-26T15:20:00'), ist('2026-10-26T16:00:00'), now - 3600000, now), 10, 'clipped at the end');
assert.equal(clipMinutes(ist('2026-10-26T13:00:00'), ist('2026-10-26T14:00:00'), now - 3600000, now), 0, 'fully outside');

// Empty state.
const empty = buildRecentSummary({ mode: '1h', nowMs: now, activities: [] });
assert.equal(empty.empty, true);
assert.equal(empty.headline, 'Nothing logged in the last hour');
const onlyOld = buildRecentSummary({ mode: '1h', nowMs: now, activities: [act({ kind: 'completion', taskText: 'Gym', createdAt: iso('2026-10-26T14:29:59'), completedAt: iso('2026-10-26T14:29:59') })] });
assert.equal(onlyOld.empty, true);

// Full example.
const activities = [
  act({ kind: 'completion', taskText: 'Gym', createdAt: iso('2026-10-26T14:58:40'), startedAt: iso('2026-10-26T14:15:00'), completedAt: iso('2026-10-26T14:58:00') }),
  act({ kind: 'completion', taskText: 'Edge task', createdAt: iso('2026-10-26T14:30:00'), completedAt: iso('2026-10-26T14:30:00') }),
  act({ kind: 'completion', taskText: 'Undone task', createdAt: iso('2026-10-26T15:00:00') }),
  act({ kind: 'undo', taskText: 'Undone task', createdAt: iso('2026-10-26T15:01:00') }),
  act({ kind: 'completion', taskText: 'Grt check', createdAt: iso('2026-10-26T15:05:00') }),
  act({ kind: 'completion', taskText: 'Grt check', createdAt: iso('2026-10-26T15:06:00') }),
  act({ kind: 'completion', taskText: 'Weekly review', scope: 'weekly', createdAt: iso('2026-10-26T15:10:00') }),
  act({ kind: 'failure', taskText: 'No sugar', createdAt: iso('2026-10-26T15:12:00') }),
  // Stopwatch 15:00-15:20 plus a legacy-label completion at the same time: union, not double count.
  act({ kind: 'focus-session', taskText: '📖 Book reading (30m)', focusMinutes: 20, startedAt: iso('2026-10-26T15:00:00'), completedAt: iso('2026-10-26T15:20:00'), createdAt: iso('2026-10-26T15:20:00') }),
  act({ kind: 'completion', taskText: 'Book read and communication practice', startedAt: iso('2026-10-26T15:00:00'), completedAt: iso('2026-10-26T15:20:00'), createdAt: iso('2026-10-26T15:20:30') }),
  // Manual addition counts in full.
  act({ kind: 'focus-session', taskText: 'Study', focusMinutes: 10, createdAt: iso('2026-10-26T15:25:00'), note: 'Additional focus time entered manually' }),
  // Timer session with no start: assumed to run up to its finish, clipped to the window (14:10-14:40 -> 10m).
  act({ kind: 'focus-session', taskText: 'Office work', focusMinutes: 30, completedAt: iso('2026-10-26T14:40:00'), createdAt: iso('2026-10-26T14:40:00') })
];
const summary = buildRecentSummary({
  mode: '1h', nowMs: now, activities, group,
  subtasks: [
    { taskText: 'Trip plan', scope: 'today', text: 'Book hotel', done: true, completedAt: iso('2026-10-26T15:15:00') },
    { taskText: 'Trip plan', scope: 'today', text: 'Old style', done: true, updatedAt: iso('2026-10-26T15:16:00') },
    { taskText: 'Trip plan', scope: 'today', text: 'Not done', done: false, updatedAt: iso('2026-10-26T15:17:00') }
  ],
  expenses: [
    { amountPaise: 30000, updatedAt: iso('2026-10-26T15:02:00') },
    { amountPaise: 15000, updatedAt: iso('2026-10-26T15:03:00'), kind: 'spent' },
    { amountPaise: 99900, updatedAt: iso('2026-10-26T12:00:00') },
    // income in the window: its own line, never counted as spending
    { amountPaise: 9000000, updatedAt: iso('2026-10-26T15:04:00'), kind: 'received' },
    { amountPaise: 50000, updatedAt: iso('2026-10-26T15:05:00'), kind: 'received' },
    { amountPaise: 777700, updatedAt: iso('2026-10-26T11:00:00'), kind: 'received' } // outside the window
  ],
  wakeLog: { wakeTime: '07:15', loggedAt: iso('2026-10-26T07:20:00') },
  running: [{ taskText: 'Gym', startedAt: iso('2026-10-26T15:20:00') }]
});
const texts = summary.items.map((item) => `${formatIstTime(item.at)} · ${item.icon} ${item.text}`);
assert.ok(texts.includes('2:58 PM · ✅ Gym'), texts.join('\n'));
assert.ok(texts.includes('2:30 PM · ✅ Edge task'), 'item exactly at the 60-minute edge is shown');
assert.ok(!texts.some((text) => text.includes('Undone task')), 'undone completion is hidden');
assert.equal(texts.filter((text) => text.includes('Grt check')).length, 1, 'repeat check-offs show once');
assert.ok(!texts.some((text) => text.includes('No sugar')), 'misses are not completions');
assert.ok(texts.includes('3:03 PM · 💸 Logged 2 expenses · ₹450'));
assert.ok(texts.includes('3:05 PM · 💰 Received ₹90,500'), 'income shown separately');
assert.equal(texts.filter((text) => text.includes('Logged 2 expenses · ₹450')).length, 1, 'spending total excludes income');
assert.ok(!texts.some((text) => text.includes('wake')), 'wake log outside the window is hidden');
assert.equal(summary.tasksDone, 5); // Gym, Edge task, Grt check, Weekly review, Book
assert.equal(summary.subtasksDone, 2);
const minutes = Object.fromEntries(summary.tracked.map((entry) => [entry.key, Math.round(entry.minutes)]));
// Gym: 14:30-14:58 completion (clipped from 14:15) + running 15:20-15:30 = 38m.
assert.equal(minutes.gym, 38);
assert.equal(summary.tracked.find((entry) => entry.key === 'gym')?.running, true);
assert.equal(minutes.BOOK, 20, 'overlapping stopwatch and timed completion are not double counted');
assert.equal(minutes.study, 10);
assert.equal(minutes['office work'], 10);
assert.equal(summary.trackedMinutes, 78);
assert.equal(summary.headline, '5 tasks done · 2 subtasks · 1h 18m tracked · ₹450 spent · ₹90,500 received');
assert.equal(summary.expensePaise, 45000, 'income never counted as spending');
assert.equal(summary.expenseCount, 2);
assert.equal(summary.incomePaise, 9050000);
assert.equal(summary.incomeCount, 2);
assert.equal(summary.items[0].at >= summary.items[summary.items.length - 1].at, true, 'newest first');

// 3 AM IST app-day boundary: at 03:20 the last hour reaches back into the previous app-day.
const after3 = ist('2026-10-27T03:20:00');
assert.equal(appDayStartMs(after3), ist('2026-10-27T03:00:00'));
assert.equal(appDayStartMs(ist('2026-10-27T02:59:00')), ist('2026-10-26T03:00:00'));
const crossing = buildRecentSummary({
  mode: '1h', nowMs: after3, group,
  activities: [
    act({ kind: 'completion', taskText: 'Late night task', createdAt: iso('2026-10-27T02:40:00') }),
    act({ kind: 'focus-session', taskText: 'Study', focusMinutes: 70, startedAt: iso('2026-10-27T02:00:00'), completedAt: iso('2026-10-27T03:10:00'), createdAt: iso('2026-10-27T03:10:00') })
  ]
});
assert.equal(crossing.tasksDone, 1, 'previous app-day item still inside the rolling hour');
assert.equal(Math.round(crossing.tracked[0].minutes), 50, 'session 02:00-03:10 clipped to 02:20-03:10');
const todayOnly = buildRecentSummary({ mode: 'today', nowMs: after3, group, activities: crossing.items.length ? [act({ kind: 'completion', taskText: 'Late night task', createdAt: iso('2026-10-27T02:40:00') })] : [] });
assert.equal(todayOnly.empty, true, 'Today view starts at 03:00 IST');
assert.equal(todayOnly.headline, 'Nothing logged today');

console.log('Recent activity tests passed.');
