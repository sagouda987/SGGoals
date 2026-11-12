import assert from 'node:assert/strict';
import {
  OFFICE_SUBTASK_EMPTY_PROMPT,
  OFFICE_SUBTASK_PLACEHOLDER,
  carryUnfinishedOfficeSubtasks,
  isOfficeWorkText,
  officeWorkSubtasksComplete,
  retainOfficeSubtasksForDay,
  unfinishedOfficeSubtasksFrom,
  withOfficeWorkDayState,
  type OfficeSubtask
} from '../lib/goals/office-subtasks';

const todayKey = '2026-11-12';
const yesterdayIso = '2026-11-11T10:00:00+05:30';
const todayIso = '2026-11-12T10:00:00+05:30';
const afterMidnightBeforeRollover = '2026-11-13T02:30:00+05:30'; // still 12 Nov reporting day
const afterRollover = '2026-11-13T03:00:00+05:30';

let seq = 0;
const nextId = () => `id-${++seq}`;

function subtask(partial: Partial<OfficeSubtask> & Pick<OfficeSubtask, 'text' | 'done'>): OfficeSubtask {
  return {
    id: partial.id || nextId(),
    text: partial.text,
    done: partial.done,
    updatedAt: partial.updatedAt || yesterdayIso,
    completedAt: partial.completedAt
  };
}

assert.equal(isOfficeWorkText('Office work'), true);
assert.equal(isOfficeWorkText('Office work 2 hour'), true);
assert.equal(isOfficeWorkText('Office work - zero escalation'), true);
assert.equal(isOfficeWorkText('office-work'), true);
assert.equal(isOfficeWorkText('Chess'), false);
assert.equal(isOfficeWorkText('Gym'), false);
assert.equal(isOfficeWorkText('Office course'), false);

const previous = [
  subtask({ text: 'Finish Deloitte ticket', done: false }),
  subtask({ text: 'Send weekly update', done: true, completedAt: yesterdayIso, updatedAt: yesterdayIso }),
  subtask({ text: 'Review PR', done: false })
];

const kept = retainOfficeSubtasksForDay(previous, todayKey);
assert.deepEqual(kept.map((item) => item.text), ['Finish Deloitte ticket', 'Review PR']);

const carried = carryUnfinishedOfficeSubtasks(previous, todayIso, nextId);
assert.deepEqual(carried.map((item) => item.text), ['Finish Deloitte ticket', 'Review PR']);
assert.ok(carried.every((item) => item.done === false && item.id.startsWith('id-') && !item.completedAt));
assert.notEqual(carried[0].id, previous[0].id);

const todayDone = retainOfficeSubtasksForDay(
  [
    subtask({ text: 'Done today', done: true, completedAt: todayIso, updatedAt: todayIso }),
    subtask({ text: 'Done yesterday', done: true, completedAt: yesterdayIso, updatedAt: yesterdayIso }),
    subtask({ text: 'Still open', done: false, updatedAt: yesterdayIso })
  ],
  todayKey
);
assert.deepEqual(todayDone.map((item) => item.text), ['Done today', 'Still open']);

// A tick just before 3 AM IST still belongs to the previous reporting day and is not kept the next morning.
const lateNight = retainOfficeSubtasksForDay(
  [subtask({ text: 'Late tick', done: true, completedAt: afterMidnightBeforeRollover, updatedAt: afterMidnightBeforeRollover })],
  '2026-11-13'
);
assert.deepEqual(lateNight, []);
const sameReportingDay = retainOfficeSubtasksForDay(
  [subtask({ text: 'Late tick', done: true, completedAt: afterMidnightBeforeRollover, updatedAt: afterMidnightBeforeRollover })],
  todayKey
);
assert.equal(sameReportingDay.length, 1);
const afterThree = retainOfficeSubtasksForDay(
  [subtask({ text: 'Early morning', done: true, completedAt: afterRollover, updatedAt: afterRollover })],
  '2026-11-13'
);
assert.equal(afterThree.length, 1);

assert.equal(officeWorkSubtasksComplete([]), false);
assert.equal(officeWorkSubtasksComplete(undefined), false);
assert.equal(officeWorkSubtasksComplete([subtask({ text: 'Only one', done: false })]), false);
assert.equal(officeWorkSubtasksComplete([subtask({ text: 'Only one', done: true, completedAt: todayIso })]), true);
assert.equal(
  officeWorkSubtasksComplete([
    subtask({ text: 'A', done: true, completedAt: todayIso }),
    subtask({ text: 'B', done: false })
  ]),
  false
);

const officeTask = withOfficeWorkDayState(
  { id: 't1', text: 'Office work', allowSubtasks: false, subtasks: previous, updatedAt: yesterdayIso, done: false },
  todayKey,
  todayIso
);
assert.equal(officeTask.allowSubtasks, true);
assert.deepEqual(officeTask.subtasks?.map((item) => item.text), ['Finish Deloitte ticket', 'Review PR']);
assert.equal(officeTask.updatedAt, todayIso);

const alreadyFresh = withOfficeWorkDayState(officeTask, todayKey, '2026-11-12T12:00:00+05:30');
assert.equal(alreadyFresh, officeTask);

const chess = { id: 't2', text: 'Chess', allowSubtasks: false, updatedAt: yesterdayIso, done: false };
assert.equal(withOfficeWorkDayState(chess, todayKey, todayIso), chess);

const seeded = unfinishedOfficeSubtasksFrom(
  [
    { text: 'Chess', subtasks: [subtask({ text: 'Ignore me', done: false })] },
    { text: 'Office work', subtasks: previous }
  ],
  todayIso,
  nextId
);
assert.deepEqual(seeded.map((item) => item.text), ['Finish Deloitte ticket', 'Review PR']);

const noSource = unfinishedOfficeSubtasksFrom([{ text: 'Office work', subtasks: [subtask({ text: 'All done', done: true, completedAt: yesterdayIso })] }], todayIso, nextId);
assert.deepEqual(noSource, []);

assert.ok(OFFICE_SUBTASK_EMPTY_PROMPT.includes('before chess'));
assert.ok(OFFICE_SUBTASK_PLACEHOLDER.includes('top office task'));

console.log('Office work subtask carry-over and completion tests passed.');
