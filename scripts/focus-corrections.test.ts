import assert from 'node:assert/strict';
import { applyFocusCorrections } from '../lib/focus-corrections';
import { buildPeriodTimeTargets } from '../lib/must-focus-targets';

type RecordRow = { id: string; scope: string; kind: string; taskText: string; createdAt: string; note?: string; focusMinutes?: number };
const normalize = (text: string) => text === 'Study' ? 'STUDY2' : text === 'Gym' ? 'GYM' : null;
const rows: RecordRow[] = [120, 34, 88, 286, 8].map((focusMinutes, index) => ({
  id: `session-${index}`, scope: 'today', kind: 'focus-session', taskText: 'Study',
  createdAt: `2026-09-07T${index + 10}:00:00Z`, focusMinutes
}));
const correction: RecordRow = { id: 'correction', scope: 'today', kind: 'focus-correction', taskText: 'Study',
  createdAt: '2026-09-08T00:00:00Z', note: JSON.stringify({ dateKey: '2026-09', minutes: 300 }) };
correction.note = JSON.stringify({ dateKey: '2026-09-07', through: '2026-09-07T18:30:00Z', minutes: 300 });
const original = JSON.stringify(rows);
const corrected = applyFocusCorrections([...rows, rows[3], correction], normalize);
const sessions = corrected.filter((row) => row.kind === 'focus-session');
assert.equal(sessions.reduce((sum, row) => sum + (row.focusMinutes || 0), 0), 300);
assert.equal(JSON.stringify(rows), original);
for (const period of ['weekly', 'monthly', 'yearly'] as const) {
  const result = buildPeriodTimeTargets(sessions.map((row) => ({ code: 'STUDY2', minutes: row.focusMinutes || 0, createdAt: row.createdAt })), '2026-09-07', period);
  assert.equal(result.items.find((item) => item.code === 'STUDY2')?.completed, 300);
}
const extra = { ...rows[0], id: 'extra', createdAt: '2026-09-07T19:00:00Z', focusMinutes: 45 };
assert.equal(applyFocusCorrections([...rows, correction, extra], normalize).filter((row) => row.kind === 'focus-session').reduce((sum, row) => sum + (row.focusMinutes || 0), 0), 345);
assert.equal(applyFocusCorrections([...rows, correction, { ...extra, taskText: 'Gym' }], normalize).filter((row) => row.taskText === 'Gym').length, 1);
assert.equal(applyFocusCorrections([...rows, { ...correction, note: 'invalid' }], normalize).filter((row) => row.kind === 'focus-session').length, 5);
console.log('Focus corrections: 300-minute replacement, duplicate IDs, raw preservation, extra sessions, other tasks, and all period totals passed.');
