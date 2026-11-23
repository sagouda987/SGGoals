import assert from 'node:assert/strict';
import {
  NIGHT_SKIN_CARE_TEXT,
  NO_MASTURBATION_TEXT,
  canonicalKeptHabitText,
  dedupeHabitStore,
  isRemovedDuplicateHabitText,
  isRemovedNoMbOrSexText,
  isRemovedPractiseBText,
  mappedDuplicateHabitCode,
  planCloudHabitDedupe
} from '../lib/goals/habit-dedupe';
import { isRemovedChessItemText } from '../lib/goals/chess-subtasks';

assert.equal(mappedDuplicateHabitCode('No masturbation (this week)'), 'NOMB');
assert.equal(mappedDuplicateHabitCode('No sex (this week)'), 'NOMB');
assert.equal(mappedDuplicateHabitCode('NoFap'), 'NOMB');
assert.equal(mappedDuplicateHabitCode('masterbate'), 'NOMB');
assert.equal(mappedDuplicateHabitCode('Evening skin care'), 'SKINCAREEVENING');
assert.equal(mappedDuplicateHabitCode('Skin care - night'), 'SKINCAREEVENING');
assert.equal(mappedDuplicateHabitCode('Night skin care'), 'SKINCAREEVENING');
assert.equal(mappedDuplicateHabitCode('Morning skin care'), 'SKINCAREMORNING');
assert.equal(mappedDuplicateHabitCode('Ice skin care'), 'ICESKINCARE');
assert.equal(mappedDuplicateHabitCode('Gym'), null);
assert.equal(mappedDuplicateHabitCode('Office work'), null);
assert.equal(mappedDuplicateHabitCode('Skin care routine daily - 7/7'), null);
assert.equal(mappedDuplicateHabitCode('Consistent skin care - 28+ days'), null);
assert.equal(mappedDuplicateHabitCode('Family / relationship time'), null);

assert.equal(canonicalKeptHabitText('No sex (this week)'), null);
assert.equal(canonicalKeptHabitText('Evening skin care'), NIGHT_SKIN_CARE_TEXT);
assert.equal(canonicalKeptHabitText('Skin care - night'), NIGHT_SKIN_CARE_TEXT);
assert.equal(isRemovedDuplicateHabitText('Morning skin care'), true);
assert.equal(isRemovedDuplicateHabitText('Ice skin care'), true);
assert.equal(isRemovedDuplicateHabitText(NO_MASTURBATION_TEXT), true);
assert.equal(isRemovedDuplicateHabitText('No sex (this week)'), true);
assert.equal(isRemovedNoMbOrSexText('No masturbation 7 days (Nov 2–8)'), true);
assert.equal(isRemovedNoMbOrSexText('No sex 7 days (Nov 2–8)'), true);
assert.equal(isRemovedPractiseBText('Practise B'), true);
assert.equal(isRemovedPractiseBText('Practice B'), true);
assert.equal(isRemovedDuplicateHabitText('Practise B'), true);
assert.equal(isRemovedChessItemText('Chess'), false);
assert.equal(isRemovedChessItemText('Chess practice'), true);
assert.equal(isRemovedChessItemText('Chess: 30 puzzles (85%+ accuracy) + 3 rapid 15+10 + review losses'), true);
assert.equal(isRemovedChessItemText('Chess endgame 15 min'), true);
assert.equal(isRemovedChessItemText('Chess: Rapid 1779 → 1820 by Sun Nov 9'), true);
assert.equal(isRemovedChessItemText('Chess daily: 30 puzzles + 3 rapid games (15+10), review every loss, zero bullet'), true);
assert.equal(isRemovedChessItemText('~600 puzzles + ~80 rapid games reviewed'), true);
assert.equal(isRemovedChessItemText('Office: finish top-priority Deloitte task daily before chess'), false);
assert.equal(isRemovedDuplicateHabitText('Night skin care'), false);
assert.equal(isRemovedDuplicateHabitText('Office work'), false);
assert.equal(isRemovedDuplicateHabitText('Chess'), false);

const store = dedupeHabitStore({
  today: [
    { id: 'sex', text: 'No sex (this week)', done: true, updatedAt: '2026-11-20T02:00:00.000Z' },
    { id: 'nomb', text: 'No masturbation (this week)', done: false, updatedAt: '2026-11-20T03:00:00.000Z' },
    { id: 'practise', text: 'Practise B', done: false, updatedAt: '2026-11-20T03:00:00.000Z' },
    { id: 'practice', text: 'Practice B', done: true, updatedAt: '2026-11-20T03:00:00.000Z' },
    { id: 'chess-practice', text: 'Chess practice', done: true, updatedAt: '2026-11-20T02:00:00.000Z' },
    { id: 'chess-target', text: 'Chess: 30 puzzles (85%+ accuracy) + 3 rapid 15+10 + review losses', done: false, updatedAt: '2026-11-20T02:00:00.000Z' },
    { id: 'chess-endgame', text: 'Chess endgame 15 min', done: false, updatedAt: '2026-11-20T02:00:00.000Z' },
    { id: 'morning', text: 'Morning skin care', done: true, updatedAt: '2026-11-20T02:00:00.000Z' },
    { id: 'ice', text: 'Ice skin care', done: true, updatedAt: '2026-11-20T02:00:00.000Z' },
    { id: 'evening', text: 'Evening skin care', done: false, updatedAt: '2026-11-20T03:00:00.000Z' },
    { id: 'night', text: 'Skin care - night', done: true, updatedAt: '2026-11-20T01:00:00.000Z' },
    { id: 'office', text: 'Office work', done: false, updatedAt: '2026-11-20T04:00:00.000Z', subtasks: [{ id: 't1', text: 'Ticket', done: false }] } as any,
    { id: 'chess', text: 'Chess', done: true, updatedAt: '2026-11-20T04:00:00.000Z' }
  ],
  weekly: [
    { id: 'weekly-skin', text: 'Skin care routine daily - 7/7', done: false, updatedAt: '2026-11-16T00:00:00.000Z' },
    { id: 'weekly-sex', text: 'No sex (this week)', done: false, updatedAt: '2026-11-16T00:00:00.000Z' },
    { id: 'weekly-nomb', text: 'No masturbation 7 days (Nov 2–8)', done: false, updatedAt: '2026-11-16T00:00:00.000Z' },
    { id: 'weekly-chess', text: 'Chess: Rapid 1779 → 1820 by Sun Nov 9', done: false, updatedAt: '2026-11-16T00:00:00.000Z' },
    { id: 'weekly-office', text: 'Office: finish top-priority Deloitte task daily before chess', done: false, updatedAt: '2026-11-16T00:00:00.000Z' }
  ],
  weekend: [],
  monthly: [
    { id: 'monthly-skin', text: 'Consistent skin care - 28+ days', done: false, updatedAt: '2026-11-01T00:00:00.000Z' },
    { id: 'monthly-puzzles', text: '~600 puzzles + ~80 rapid games reviewed', done: false, updatedAt: '2026-11-01T00:00:00.000Z' },
    { id: 'monthly-chess', text: 'Chess: about 120 hours of study, reach 2000+ online', done: false, updatedAt: '2026-11-01T00:00:00.000Z' }
  ],
  yearly: [],
  tomorrow: [
    { id: 'tom-ice', text: 'Ice skin care', done: false, updatedAt: '2026-11-20T00:00:00.000Z' },
    { id: 'tom-practise', text: 'Practise B', done: false, updatedAt: '2026-11-20T00:00:00.000Z' },
    { id: 'tom-nomb', text: 'No masturbation (this week)', done: false, updatedAt: '2026-11-20T00:00:00.000Z' }
  ]
});

assert.deepEqual(store.today.map((task) => [task.id, task.text, task.done]), [
  ['night', 'Night skin care', true],
  ['office', 'Office work', false],
  ['chess', 'Chess', true]
]);
assert.equal((store.today.find((task) => task.id === 'office') as any).subtasks[0].text, 'Ticket');
assert.deepEqual(store.weekly.map((task) => [task.id, task.text]), [
  ['weekly-skin', 'Skin care routine daily - 7/7'],
  ['weekly-office', 'Office: finish top-priority Deloitte task daily before chess']
]);
assert.deepEqual(store.monthly.map((task) => task.text), ['Consistent skin care - 28+ days']);
assert.deepEqual(store.tomorrow, []);

const unchanged = {
  today: [{ id: 'night', text: NIGHT_SKIN_CARE_TEXT, done: false, updatedAt: '2026-11-20T03:00:00.000Z' }],
  weekly: [],
  weekend: [],
  monthly: [],
  yearly: [],
  tomorrow: []
};
assert.equal(dedupeHabitStore(unchanged), unchanged);

const plan = planCloudHabitDedupe([
  { id: 'morning', scope: 'today', text: 'Morning skin care', done: true, updatedAt: '2026-11-20T02:00:00.000Z' },
  { id: 'evening', scope: 'today', text: 'Evening skin care', done: false, updatedAt: '2026-11-20T03:00:00.000Z' },
  { id: 'night', scope: 'today', text: 'Skin care - night', done: true, updatedAt: '2026-11-20T01:00:00.000Z' },
  { id: 'sex', scope: 'today', text: 'No sex (this week)', done: true, updatedAt: '2026-11-20T02:00:00.000Z' },
  { id: 'nomb', scope: 'today', text: 'No masturbation (this week)', done: false, updatedAt: '2026-11-20T03:00:00.000Z' },
  { id: 'practise', scope: 'today', text: 'Practise B', done: false, updatedAt: '2026-11-20T03:00:00.000Z' },
  { id: 'chess-practice', scope: 'today', text: 'Chess practice', done: false, updatedAt: '2026-11-20T03:00:00.000Z' },
  { id: 'chess', scope: 'today', text: 'Chess', done: false, updatedAt: '2026-11-20T04:00:00.000Z' },
  { id: 'office', scope: 'today', text: 'Office work', done: false, updatedAt: '2026-11-20T04:00:00.000Z' },
  { id: 'weekly-chess', scope: 'weekly', text: 'Chess daily: 30 puzzles + 3 rapid games (15+10), review every loss, zero bullet', done: false, updatedAt: '2026-11-16T00:00:00.000Z' },
  { id: 'monthly-puzzles', scope: 'monthly', text: '~600 puzzles + ~80 rapid games reviewed', done: false, updatedAt: '2026-11-01T00:00:00.000Z' },
  { id: 'meta', scope: '__meta__', text: 'Morning skin care', done: false, updatedAt: '2026-11-20T04:00:00.000Z' }
]);
assert.ok(plan.deleteIds.includes('morning'));
assert.ok(plan.deleteIds.includes('evening'));
assert.ok(!plan.deleteIds.includes('night'));
assert.ok(plan.deleteIds.includes('sex'));
assert.ok(plan.deleteIds.includes('nomb'));
assert.ok(plan.deleteIds.includes('practise'));
assert.ok(plan.deleteIds.includes('chess-practice'));
assert.ok(plan.deleteIds.includes('weekly-chess'));
assert.ok(plan.deleteIds.includes('monthly-puzzles'));
assert.ok(!plan.deleteIds.includes('chess'));
assert.ok(!plan.deleteIds.includes('office'));
assert.ok(!plan.deleteIds.includes('meta'));
assert.deepEqual(plan.renames, [
  { id: 'night', text: 'Night skin care' }
]);

console.log('Habit dedupe tests passed');
