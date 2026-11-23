import assert from 'node:assert/strict';
import {
  CHESS_SUBTASK_TEXTS,
  chessSubtasksComplete,
  ensureChessSubtasks,
  isChessHabitText,
  isRemovedChessItemText,
  withChessDayState
} from '../lib/goals/chess-subtasks';

assert.deepEqual([...CHESS_SUBTASK_TEXTS], [
  '1 hour Chess.com puzzles',
  '1 hour Lichess puzzles',
  'Opening study',
  'Endgame study'
]);
assert.equal(isChessHabitText('Chess'), true);
assert.equal(isChessHabitText('chess'), true);
assert.equal(isChessHabitText('Chess practice'), false);
assert.equal(isChessHabitText('Chess endgame 15 min'), false);
assert.equal(isRemovedChessItemText('Chess'), false);
assert.equal(isRemovedChessItemText('Office work'), false);

const todayKey = '2026-11-23';
const todayIso = '2026-11-23T10:00:00+05:30';
const yesterdayIso = '2026-11-22T10:00:00+05:30';
let seq = 0;
const nextId = () => `c-${++seq}`;

const seeded = ensureChessSubtasks(
  [
    { id: 'old-open', text: 'Openings repertoire', done: false, updatedAt: yesterdayIso },
    { id: 'old-end', text: 'Endgame study', done: true, completedAt: yesterdayIso, updatedAt: yesterdayIso },
    { id: 'keep-puzzles', text: '1 hour Chess.com puzzles', done: true, completedAt: todayIso, updatedAt: todayIso }
  ],
  todayKey,
  todayIso,
  nextId
);
assert.deepEqual(seeded.map((item) => [item.text, item.done, item.id]), [
  ['1 hour Chess.com puzzles', true, 'keep-puzzles'],
  ['1 hour Lichess puzzles', false, 'c-1'],
  ['Opening study', false, 'c-2'],
  ['Endgame study', false, 'old-end']
]);
assert.equal(seeded[3].completedAt, undefined);
assert.equal(chessSubtasksComplete(seeded), false);

const complete = ensureChessSubtasks(
  CHESS_SUBTASK_TEXTS.map((text, index) => ({
    id: `done-${index}`,
    text,
    done: true,
    completedAt: todayIso,
    updatedAt: todayIso
  })),
  todayKey,
  todayIso,
  nextId
);
assert.equal(chessSubtasksComplete(complete), true);

const unchangedTask = {
  id: 'chess',
  text: 'Chess',
  allowSubtasks: true as const,
  updatedAt: '2026-11-23T04:00:00.000Z',
  subtasks: complete
};
assert.equal(withChessDayState(unchangedTask, todayKey, todayIso, nextId), unchangedTask);

const office = { id: 'office', text: 'Office work', allowSubtasks: true, updatedAt: todayIso, subtasks: [] };
assert.equal(withChessDayState(office, todayKey, todayIso, nextId), office);

const filled = withChessDayState({ id: 'chess', text: 'Chess', updatedAt: yesterdayIso }, todayKey, todayIso, nextId);
assert.equal(filled.allowSubtasks, true);
assert.deepEqual(filled.subtasks?.map((item) => item.text), [...CHESS_SUBTASK_TEXTS]);
assert.ok(filled.subtasks?.every((item) => item.done === false));

console.log('Chess subtask tests passed');
