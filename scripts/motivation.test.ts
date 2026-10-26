import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as motivation from '../lib/goals/motivation';

const { buildWeeklyPersonalBests } = motivation;

const bests = buildWeeklyPersonalBests([
  { dateKey: '2026-09-13', completedPoints: 4, focusMinutes: 30, completedTasks: [{ text: 'A', points: 4 }] },
  { dateKey: '2026-09-20', completedPoints: 5, focusMinutes: 60, completedTasks: [{ text: 'B', points: 5 }] }
], '2026-09-20');
assert.deepEqual(bests.current, { points: 5, focusMinutes: 60, completedTasks: 1 });
assert.equal(bests.isBest.points, true);
assert.equal(bests.isBest.focusMinutes, true);

// Removed at SK's request (26 Oct 2026): the "Progress toward a meaningful goal" and
// "End-of-day encouragement" cards must not come back.
const component = readFileSync(join(__dirname, '..', 'components', 'goals', 'sg-goals-app.tsx'), 'utf8');
assert.doesNotMatch(component, /Progress toward a meaningful goal/);
assert.doesNotMatch(component, /End-of-day encouragement/);
assert.equal('findMeaningfulGoal' in motivation, false);
assert.equal('buildEndOfDayEncouragement' in motivation, false);

console.log('Motivation tests passed.');
