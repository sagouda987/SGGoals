import assert from 'node:assert/strict';
import { extraFocusMinutes } from '../lib/extra-focus';
import { buildPeriodTimeTargets } from '../lib/must-focus-targets';

assert.equal(extraFocusMinutes('45'), 45);
assert.equal(extraFocusMinutes('0'), null);
for (const invalid of ['', '-1', '1.5', '1441', 'abc', '1e2']) assert.equal(extraFocusMinutes(invalid), null);
const original = [{ code: 'STUDY2', minutes: 300, createdAt: '2026-09-07T12:00:00Z' }];
const extra = { code: 'STUDY2', minutes: 45, createdAt: '2026-09-07T17:00:00Z' };
for (const period of ['weekly', 'monthly', 'yearly'] as const) {
  const before = buildPeriodTimeTargets(original, '2026-09-07', period).items.find((item) => item.code === 'STUDY2')!;
  const after = buildPeriodTimeTargets([...original, extra], '2026-09-07', period).items.find((item) => item.code === 'STUDY2')!;
  assert.equal(after.completed, 345);
  assert.equal(after.remaining, before.remaining - 45);
  assert.equal(after.target, before.target);
}
const aboveTarget = buildPeriodTimeTargets([{ ...extra, minutes: 2400 }], '2026-09-07', 'weekly').items.find((item) => item.code === 'STUDY2')!;
assert.equal(aboveTarget.remaining, 0);
assert.equal(aboveTarget.ahead, 60);
console.log('Extra focus: validation, extra study reduces weekly/monthly/yearly remaining time, and surplus checks passed.');
