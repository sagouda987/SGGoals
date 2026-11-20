import assert from 'node:assert/strict';
import {
  NIGHT_SKIN_CARE_TEXT,
  NO_MASTURBATION_TEXT,
  canonicalKeptHabitText,
  dedupeHabitStore,
  isRemovedDuplicateHabitText,
  mappedDuplicateHabitCode,
  planCloudHabitDedupe
} from '../lib/goals/habit-dedupe';

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

assert.equal(canonicalKeptHabitText('No sex (this week)'), NO_MASTURBATION_TEXT);
assert.equal(canonicalKeptHabitText('Evening skin care'), NIGHT_SKIN_CARE_TEXT);
assert.equal(canonicalKeptHabitText('Skin care - night'), NIGHT_SKIN_CARE_TEXT);
assert.equal(isRemovedDuplicateHabitText('Morning skin care'), true);
assert.equal(isRemovedDuplicateHabitText('Ice skin care'), true);
assert.equal(isRemovedDuplicateHabitText('No sex (this week)'), false);
assert.equal(isRemovedDuplicateHabitText('Night skin care'), false);
assert.equal(isRemovedDuplicateHabitText('Office work'), false);

const store = dedupeHabitStore({
  today: [
    { id: 'sex', text: 'No sex (this week)', done: true, updatedAt: '2026-11-20T02:00:00.000Z' },
    { id: 'nomb', text: 'No masturbation (this week)', done: false, updatedAt: '2026-11-20T03:00:00.000Z' },
    { id: 'morning', text: 'Morning skin care', done: true, updatedAt: '2026-11-20T02:00:00.000Z' },
    { id: 'ice', text: 'Ice skin care', done: true, updatedAt: '2026-11-20T02:00:00.000Z' },
    { id: 'evening', text: 'Evening skin care', done: false, updatedAt: '2026-11-20T03:00:00.000Z' },
    { id: 'night', text: 'Skin care - night', done: true, updatedAt: '2026-11-20T01:00:00.000Z' },
    { id: 'office', text: 'Office work', done: false, updatedAt: '2026-11-20T04:00:00.000Z', subtasks: [{ id: 't1', text: 'Ticket', done: false }] } as any,
    { id: 'chess', text: 'Chess', done: true, updatedAt: '2026-11-20T04:00:00.000Z' }
  ],
  weekly: [
    { id: 'weekly-skin', text: 'Skin care routine daily - 7/7', done: false, updatedAt: '2026-11-16T00:00:00.000Z' },
    { id: 'weekly-sex', text: 'No sex (this week)', done: false, updatedAt: '2026-11-16T00:00:00.000Z' }
  ],
  weekend: [],
  monthly: [{ id: 'monthly-skin', text: 'Consistent skin care - 28+ days', done: false, updatedAt: '2026-11-01T00:00:00.000Z' }],
  yearly: [],
  tomorrow: [{ id: 'tom-ice', text: 'Ice skin care', done: false, updatedAt: '2026-11-20T00:00:00.000Z' }]
});

assert.deepEqual(store.today.map((task) => [task.id, task.text, task.done]), [
  ['sex', 'No masturbation (this week)', true],
  ['night', 'Night skin care', true],
  ['office', 'Office work', false],
  ['chess', 'Chess', true]
]);
assert.equal((store.today.find((task) => task.id === 'office') as any).subtasks[0].text, 'Ticket');
assert.deepEqual(store.weekly.map((task) => [task.id, task.text]), [
  ['weekly-skin', 'Skin care routine daily - 7/7'],
  ['weekly-sex', 'No masturbation (this week)']
]);
assert.deepEqual(store.monthly.map((task) => task.text), ['Consistent skin care - 28+ days']);
assert.deepEqual(store.tomorrow, []);

const unchanged = {
  today: [{ id: 'nomb', text: NO_MASTURBATION_TEXT, done: false, updatedAt: '2026-11-20T03:00:00.000Z' }],
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
  { id: 'office', scope: 'today', text: 'Office work', done: false, updatedAt: '2026-11-20T04:00:00.000Z' },
  { id: 'meta', scope: '__meta__', text: 'Morning skin care', done: false, updatedAt: '2026-11-20T04:00:00.000Z' }
]);
assert.ok(plan.deleteIds.includes('morning'));
assert.ok(plan.deleteIds.includes('evening'));
assert.ok(!plan.deleteIds.includes('night'));
assert.ok(!plan.deleteIds.includes('sex'));
assert.ok(plan.deleteIds.includes('nomb'));
assert.ok(!plan.deleteIds.includes('office'));
assert.ok(!plan.deleteIds.includes('meta'));
assert.deepEqual(plan.renames, [
  { id: 'night', text: 'Night skin care' },
  { id: 'sex', text: 'No masturbation (this week)' }
]);

console.log('Habit dedupe tests passed');
