import assert from 'node:assert/strict';
import type { AIContext } from '../lib/ai/context-builder';
import { getNextBestAction } from '../lib/ai/next-best-action';
import { scoreGoalCategory } from '../lib/goals/category-score';

const context: AIContext = {
  generatedAt: '2026-09-13T10:00:00.000Z',
  reportingDate: '2026-09-13',
  availableMinutes: 30,
  tasks: [
    { id: 'book', scope: 'today', text: 'Read book', priority: 'career', block: 'evening', done: false, weight: 4, investedMinutes: 0 },
    { id: 'study', scope: 'today', text: 'Study', priority: 'career', block: 'morning', done: false, weight: 5, investedMinutes: 0 },
    { id: 'gym', scope: 'today', text: 'Gym', priority: 'health', block: 'morning', done: true, weight: 4, investedMinutes: 45 }
  ],
  recentActivities: [],
  missedActivities: [
    { id: 'miss-study', taskText: 'Study', priority: 'career', kind: 'failure', minutes: 0, reason: 'Tired', createdAt: '2026-09-12T10:00:00.000Z' }
  ],
  categoryScores: [
    { priority: 'health', score: 70, completions: 3, failures: 0, undos: 0, minutes: 150, daysHit: 3 },
    { priority: 'career', score: 25, completions: 1, failures: 1, undos: 0, minutes: 30, daysHit: 1 },
    { priority: 'communication', score: 0, completions: 0, failures: 0, undos: 0, minutes: 0, daysHit: 0 },
    { priority: 'looks', score: 0, completions: 0, failures: 0, undos: 0, minutes: 0, daysHit: 0 },
    { priority: 'other', score: 0, completions: 0, failures: 0, undos: 0, minutes: 0, daysHit: 0 }
  ],
  currentStreakDays: 2
};

async function run() {
  const deterministic = await getNextBestAction({ context });
  assert.equal(deterministic.taskId, 'study');
  assert.equal(deterministic.suggestedMinutes, 30);
  assert.equal(deterministic.source, 'deterministic');

  const malformedProvider = {
    name: 'malformed',
    async recommendNextAction() {
      return { taskId: 'invented', title: '', suggestedMinutes: 9999 };
    }
  };
  assert.equal((await getNextBestAction({ context, provider: malformedProvider })).source, 'deterministic');

  const mismatchedProvider = {
    name: 'mismatched',
    async recommendNextAction() {
      return { taskId: 'gym', title: 'Gym', reason: 'Already done', category: 'health', suggestedMinutes: 20, confidence: 0.9 };
    }
  };
  assert.equal((await getNextBestAction({ context, provider: mismatchedProvider })).taskId, 'study');

  const validProvider = {
    name: 'valid',
    async recommendNextAction() {
      return { taskId: 'book', title: 'Read book', reason: 'A valid pending task.', category: 'career', suggestedMinutes: 20, confidence: 0.8 };
    }
  };
  assert.equal((await getNextBestAction({ context, provider: validProvider })).source, 'provider');

  assert.equal(scoreGoalCategory({ priority: 'career', completions: 2, failures: 1, undos: 1, minutes: 120, daysHit: 2, windowDays: 7 }), 41);

  console.log('Next best action: deterministic ranking, time limit, provider validation, semantic validation, fallback, and shared scoring passed.');
}

void run();
