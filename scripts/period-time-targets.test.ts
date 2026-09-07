import assert from 'node:assert/strict';
import { buildPeriodTimeTargets } from '../lib/must-focus-targets';

const week = buildPeriodTimeTargets([], '2026-09-07', 'weekly');
assert.equal(week.start, '2026-09-06');
assert.equal(week.end, '2026-09-12');
assert.deepEqual(week.items.map((item) => item.target), [240, 690, 2340]);
const firstWeek = buildPeriodTimeTargets([], '2026-09-04', 'weekly');
assert.equal(firstWeek.start, '2026-09-04');
assert.deepEqual(firstWeek.items.map((item) => item.target), [75, 210, 720]);
assert.equal(buildPeriodTimeTargets([], '2026-09-07', 'monthly').start, '2026-09-04');
assert.equal(buildPeriodTimeTargets([], '2026-09-07', 'yearly').start, '2026-09-04');
const sessions = [
  { code: 'BOOK', minutes: 300, createdAt: '2026-09-07T02:59:00+05:30' },
  { code: 'BOOK', minutes: 99, createdAt: '2026-09-06T02:59:00+05:30' }
];
const book = buildPeriodTimeTargets(sessions, '2026-09-07', 'weekly').items[0];
assert.equal(book.completed, 300);
assert.equal(book.remaining, 0);
assert.equal(book.ahead, 60);
assert.equal(buildPeriodTimeTargets([], '2027-01-01', 'yearly').start, '2027-01-01');
console.log('Period targets: partial periods, full week, extra minutes, IST boundary and next year passed.');
