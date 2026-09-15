import assert from 'node:assert/strict';
import { calculateBedtimeRemaining, calculateWakeTimer, createWakeLog, formatWakeCountdown, istCalendarDateKey, istTimeInput } from '../lib/wake-timer';

const log = createWakeLog({
  dateKey: '2026-09-15',
  wakeTime: '06:00',
  loggedAt: new Date('2026-09-15T01:00:00.000Z')
});
const timer = calculateWakeTimer(log, new Date('2026-09-15T02:30:00.000Z')); // 08:00 IST

assert.equal(timer.sleepMinutes, 7 * 60);
assert.equal(timer.awakeWindowMinutes, 17 * 60);
assert.equal(timer.remainingMs, 15 * 60 * 60 * 1000);
assert.equal(timer.wokeBeforeEight, true);
assert.equal(timer.bedtimeReached, false);
assert.equal(formatWakeCountdown(timer.remainingMs), '15:00:00');
assert.equal(calculateBedtimeRemaining('2026-09-15', new Date('2026-09-15T02:30:00.000Z')).remainingMs, 15 * 60 * 60 * 1000);
assert.equal(calculateWakeTimer(log, new Date('2026-09-15T18:00:00.000Z')).remainingMs, 0);
assert.equal(calculateWakeTimer(log, new Date('2026-09-15T18:00:00.000Z')).bedtimeReached, true);

const eightAm = createWakeLog({ dateKey: '2026-09-15', wakeTime: '08:00' });
assert.equal(calculateWakeTimer(eightAm).wokeBeforeEight, false);
assert.equal(istCalendarDateKey('2026-09-14T18:29:59.000Z'), '2026-09-14');
assert.equal(istCalendarDateKey('2026-09-14T18:30:00.000Z'), '2026-09-15');
assert.equal(istTimeInput('2026-09-15T01:07:00.000Z'), '06:37');

console.log('Wake timer: 11 PM sleep duration, awake window, live bedtime countdown, bedtime completion, and IST boundaries passed.');
