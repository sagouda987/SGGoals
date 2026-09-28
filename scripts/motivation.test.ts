import assert from 'node:assert/strict';
import { buildEndOfDayEncouragement, buildWeeklyPersonalBests, findMeaningfulGoal } from '../lib/goals/motivation';

const bests = buildWeeklyPersonalBests([
  { dateKey: '2026-09-13', completedPoints: 4, focusMinutes: 30, completedTasks: [{ text: 'A', points: 4 }] },
  { dateKey: '2026-09-20', completedPoints: 5, focusMinutes: 60, completedTasks: [{ text: 'B', points: 5 }] }
], '2026-09-20');
assert.deepEqual(bests.current, { points: 5, focusMinutes: 60, completedTasks: 1 });
assert.equal(bests.isBest.points, true);
assert.equal(bests.isBest.focusMinutes, true);

const goal = findMeaningfulGoal(
  { id: 'today', text: 'Study Spark', priority: 'career' },
  [{ id: 'year', text: 'Change job', priority: 'career' }],
  { year: { monthlyMilestone: 'Finish Spark', weeklyAction: 'Study five hours', dailyHabit: 'Study one hour' } },
  { mainGoal: '', studyPlan: '', workPlan: '', healthPlan: '' }
);
assert.equal(goal?.goal, 'Change job');
assert.equal(goal?.weeklyAction, 'Study five hours');

const encouragement = buildEndOfDayEncouragement({ completedTasks: [], focusMinutes: 0, pendingTask: 'L1', rests: 1 });
assert.match(encouragement.win, /recovery/i);
assert.match(encouragement.next, /L1/);

console.log('Motivation tests passed.');
