import assert from 'node:assert/strict';
import { latestTaskRevision, mergeGoalStores, storeRevisionConflicts } from '../lib/goals/store-sync';

type Task = { id: string; text: string; done: boolean; updatedAt: string };
const task = (id: string, done: boolean, updatedAt: string): Task => ({ id, text: id, done, updatedAt });
const base = { today: [task('study', false, '2026-09-22T01:00:00.000Z'), task('gym', false, '2026-09-22T01:00:00.000Z')] };

const independent = mergeGoalStores(
  base,
  { today: [task('study', true, '2026-09-22T02:00:00.000Z'), base.today[1]] },
  { today: [base.today[0], task('gym', true, '2026-09-22T03:00:00.000Z')] }
);
assert.equal(independent.today.find((item) => item.id === 'study')?.done, true);
assert.equal(independent.today.find((item) => item.id === 'gym')?.done, true);

const sameTask = mergeGoalStores(
  base,
  { today: [task('study', true, '2026-09-22T02:00:00.000Z'), base.today[1]] },
  { today: [task('study', false, '2026-09-22T03:00:00.000Z'), base.today[1]] }
);
assert.equal(sameTask.today.find((item) => item.id === 'study')?.done, false);

const localDelete = mergeGoalStores(base, { today: [base.today[1]] }, base);
assert.equal(localDelete.today.some((item) => item.id === 'study'), false);

assert.equal(latestTaskRevision([{ updatedAt: new Date('2026-09-22T01:00:00Z') }, { updatedAt: '2026-09-22T03:00:00.000Z' }]), '2026-09-22T03:00:00.000Z');
assert.equal(latestTaskRevision([]), null);
assert.equal(storeRevisionConflicts('2026-09-22T03:00:00.000Z', '2026-09-22T03:00:00.000Z'), false);
assert.equal(storeRevisionConflicts('2026-09-22T03:00:00.000Z', '2026-09-22T02:00:00.000Z'), true);
assert.equal(storeRevisionConflicts('2026-09-22T03:00:00.000Z', null), true);

console.log('Goal sync: independent edits merge, newest same-task edit wins, deletions persist, and revisions are stable.');
