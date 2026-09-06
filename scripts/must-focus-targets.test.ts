import assert from 'node:assert/strict';
import { buildMustFocusDayProgress, buildMustFocusTargetProgress, istFocusDateKey, mustFocusTargets } from '../lib/must-focus-targets';

assert.deepEqual(mustFocusTargets('2026-09-04').minutes, { BOOK: 30, GYM: 90, STUDY2: 300 });
assert.deepEqual(mustFocusTargets('2026-09-05').minutes, { BOOK: 45, GYM: 120, STUDY2: 420 });
assert.equal(mustFocusTargets('2026-09-06').weekend, true);
assert.equal(mustFocusTargets('2026-09-07').weekend, false);
assert.equal(istFocusDateKey('2026-09-04T18:30:00Z'), '2026-09-05');
assert.deepEqual(buildMustFocusDayProgress('2026-09-06', { BOOK: 45, GYM: 60, STUDY2: 210 }), {
  dateKey: '2026-09-06', weekend: true,
  targets: { BOOK: 45, GYM: 120, STUDY2: 420 },
  minutes: { BOOK: 45, GYM: 60, STUDY2: 210 },
  completedMinutes: 315, creditedMinutes: 315, targetMinutes: 585,
  tracked: true, met: 1, percent: 53, complete: false
});

const fullDay = (date: string) => Object.entries(mustFocusTargets(date).minutes).map(([code, minutes]) => ({ code, minutes, createdAt: `${date}T12:00:00+05:30` }));
const friday = fullDay('2026-09-04');
let result = buildMustFocusTargetProgress(friday, '2026-09-04');
assert.equal(result.current, 1);
assert.equal(result.today.percent, 100);
assert.equal(result.achievedDaysPercent, 100);
result = buildMustFocusTargetProgress(friday, '2026-09-05');
assert.equal(result.current, 1);
assert.equal(result.today.complete, false);
result = buildMustFocusTargetProgress(friday, '2026-09-06');
assert.equal(result.current, 0);
assert.equal(result.best, 1);
result = buildMustFocusTargetProgress([...friday, ...fullDay('2026-09-05')], '2026-09-05');
assert.equal(result.current, 2);
assert.equal(result.best, 2);
const partial = [{ code: 'BOOK', minutes: 1000, createdAt: '2026-09-04T12:00:00+05:30' }];
result = buildMustFocusTargetProgress(partial, '2026-09-04');
assert.equal(result.today.met, 1);
assert.equal(result.today.percent, 7);
assert.equal(result.today.completedMinutes, 1000);
assert.equal(result.today.creditedMinutes, 30);
assert.equal(result.today.targetMinutes, 420);
assert.equal(result.current, 0);
result = buildMustFocusTargetProgress([
  ...friday.filter((session) => session.code !== 'BOOK'),
  { ...friday[0], minutes: 10 }, { ...friday[0], minutes: 20 },
  { code: 'OFFICEWORK2', minutes: 300, createdAt: friday[0].createdAt },
  ...fullDay('2026-09-03')
], '2026-09-04');
assert.equal(result.current, 1);
assert.equal(result.today.minutes.BOOK, 30);
assert.equal(result.history.filter((day) => day.complete).length, 1);
assert.equal(result.history.length, 14);
assert.equal(buildMustFocusTargetProgress([], '2026-09-04').best, 0);
console.log('Must-focus targets: weekday/weekend, IST rollover, partial progress, session accumulation and streak checks passed.');
