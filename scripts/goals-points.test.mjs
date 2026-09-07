import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

// Exercise the existing private functions without importing route modules,
// initializing Prisma, or mounting the component (which triggers cloud writes).
function loadFunctions(file, names, globals = {}) {
  const filename = fileURLToPath(new URL(`../${file}`, import.meta.url));
  const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = names.map((name) => {
    const declaration = source.statements.find((node) =>
      (ts.isFunctionDeclaration(node) && node.name?.text === name) ||
      (ts.isVariableStatement(node) && node.declarationList.declarations.some((item) => item.name.getText(source) === name))
    );
    assert.ok(declaration, `Missing production declaration: ${name}`);
    return declaration.getText(source);
  });
  const context = vm.createContext({ Buffer, exports: {}, ...globals });
  const code = ts.transpileModule(declarations.join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText;
  vm.runInContext(code, context, { filename });
  return context;
}

const activityApi = loadFunctions('app/api/goals/activities/route.ts', [
  'activityMetaNotePattern', 'normalizeActivityPoints', 'normalizeFocusMinutes',
  'composeActivityNote', 'splitActivityNote', 'toActivity'
]);
const taskApi = loadFunctions('app/api/goals/route.ts', [
  'taskMetaNotePattern', 'subtaskNotePattern', 'normalizeTaskWeight', 'parseTaskMeta',
  'parseSubtasks', 'composeStoredTaskNote', 'splitStoredTaskNote'
]);
const rollover = loadFunctions('app/api/goals/rollover/route.ts', [
  'taskMetaNotePattern', 'activityMetaNotePattern', 'AUTO_HABIT_MISS_NOTE',
  'habitDefaultWeights', 'normalizeHabitCode', 'normalizeTaskWeight',
  'taskWeightFromNote', 'composeAutoMissNote', 'activityPointsFromNote'
]);
const focus = loadFunctions('lib/must-focus-targets.ts', ['istFocusDateKey']);
const history = loadFunctions('components/goals/sg-goals-app.tsx', [
  'habitDefaultWeights', 'AUTO_HABIT_MISS_NOTE', 'normalizeTaskWeight', 'taskWeight',
  'buildScopeCompletion', 'normalizeStrikeCode', 'isHabitTask', 'defaultHabitWeight',
  'defaultTaskWeightFromText', 'activityPoints', 'toISODate', 'emptyMustTaskFocusMinutes',
  'isAutoHabitMiss', 'completedFocusMinutes', 'buildPointHistory'
], {
  istFocusDateKey: focus.istFocusDateKey,
  // Target-time presentation is unrelated to weighted points.
  buildMustFocusDayProgress: () => ({})
});

function event(kind, hour, points = 5) {
  return { id: `${kind}-${hour}`, kind, points, scope: 'today', priority: 'health',
    taskText: 'Gym', createdAt: `2026-09-07T${hour}:00:00Z` };
}
function day(events) {
  return history.buildPointHistory(events, [new Date('2026-09-07T12:00:00Z')])[0];
}
function reload(activity, note) {
  return activityApi.toActivity({ ...activity, note, reason: null, minutes: null,
    startedAt: null, completedAt: null, createdAt: new Date(activity.createdAt) });
}

test('5-point complete then undo = 0, including newest-first and unsorted input', () => {
  const complete = event('completion', '10');
  const undo = event('undo', '11');
  const events = Object.freeze([undo, complete]);
  assert.equal(day(events).completedPoints, 0);
  assert.equal(day([complete, undo]).completedPoints, 0);
  assert.equal(events[0], undo, 'History must not reorder the activity feed');
});

test('0-point completed task and activity remain 0 after save/reload', () => {
  const taskNote = taskApi.composeStoredTaskNote('Keep this note', undefined, 0);
  const task = taskApi.splitStoredTaskNote(taskNote);
  assert.equal(task.weight, 0);
  assert.equal(task.note, 'Keep this note');
  const complete = event('completion', '10', task.weight);
  const note = activityApi.composeActivityNote('Keep this note', complete.points, undefined);
  const restored = reload(complete, note);
  assert.equal(restored.points, 0);
  assert.equal(restored.note, 'Keep this note');
  assert.equal(day([restored]).completedPoints, 0);
  assert.equal(history.buildScopeCompletion([{ weight: task.weight, done: true }]).donePoints, 0);
});

test('0-point rollover remains 0 in auto-miss storage, reload, and archive calculation', () => {
  const taskNote = taskApi.composeStoredTaskNote(undefined, undefined, 0);
  const points = rollover.taskWeightFromNote(taskNote, 4);
  assert.equal(points, 0);
  const note = rollover.composeAutoMissNote('2026-09-07', points);
  assert.equal(rollover.activityPointsFromNote(note, 'Gym'), 0);
  const restored = reload(event('failure', '11', 0), note);
  assert.equal(restored.points, 0);
  assert.equal(day([restored]).failedPoints, 0);
});

test('repeated complete/undo sequences produce the correct final points', () => {
  const events = [event('completion', '09'), event('undo', '10'),
    event('completion', '11'), event('undo', '12')];
  assert.equal(day([...events].reverse()).completedPoints, 0);
  const last = event('completion', '13');
  assert.equal(day([last, ...events].reverse()).completedPoints, 5);
  assert.equal(day([events[2], last, events[0], events[3], events[1]]).completedPoints, 5);
});

test('missing and invalid points still use defaults, positive points are preserved', () => {
  for (const value of [undefined, null, '', -1, 'invalid']) {
    assert.equal(activityApi.normalizeActivityPoints(value), undefined);
    assert.equal(rollover.normalizeTaskWeight(value, 4), 4);
  }
  assert.equal(rollover.activityPointsFromNote(null, 'Gym'), 4);
  assert.equal(history.activityPoints({ taskText: 'Gym' }), 4);
  const note = activityApi.composeActivityNote(undefined, 5, undefined);
  assert.equal(activityApi.splitActivityNote(note).points, 5);
  assert.equal(rollover.activityPointsFromNote(note, 'Gym'), 5);
});
