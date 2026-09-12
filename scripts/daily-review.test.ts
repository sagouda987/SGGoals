import assert from 'node:assert/strict';
import { generateDailyReview } from '../lib/ai/daily-review';
import type { DailyReviewContext } from '../lib/ai/daily-review-schema';

const context: DailyReviewContext = {
  dateKey: '2026-09-12',
  completed: [
    { title: 'Study', category: 'career', minutes: 60 },
    { title: 'Gym', category: 'health', minutes: 45 }
  ],
  missed: [{ title: 'Communication practice', category: 'communication', reason: 'Ran out of time' }],
  notes: [{ source: 'today', title: 'Study', text: 'Reviewed SQL joins' }],
  categoryScores: [
    { priority: 'health', score: 70 },
    { priority: 'career', score: 62 },
    { priority: 'communication', score: 20 },
    { priority: 'looks', score: 40 },
    { priority: 'other', score: 50 }
  ],
  currentStreakDays: 3,
  tomorrowCandidates: [{ id: 'study-tomorrow', title: 'Study', category: 'career', weight: 5 }]
};

async function run() {
  const deterministic = await generateDailyReview({ context, now: new Date('2026-09-12T21:30:00.000Z') });
  assert.equal(deterministic.source, 'deterministic');
  assert.equal(deterministic.dateKey, context.dateKey);
  assert.match(deterministic.dailyReview, /2 activities/);
  assert.equal(deterministic.missedPriorities[0].title, 'Communication practice');
  assert.equal(deterministic.tomorrowFocus[0].taskId, 'study-tomorrow');
  assert.match(deterministic.progressInsight, /Reviewed SQL joins/);

  const invalidProvider = {
    name: 'invalid',
    async recommendNextAction() { return {}; },
    async generateDailyReview() {
      return { ...deterministic, dateKey: '2026-09-11', source: undefined, generatedAt: undefined };
    }
  };
  assert.equal((await generateDailyReview({ context, provider: invalidProvider })).source, 'deterministic');

  const validProvider = {
    name: 'valid',
    async recommendNextAction() { return {}; },
    async generateDailyReview() {
      return {
        dateKey: context.dateKey,
        dailyReview: 'Two important activities were completed.',
        missedPriorities: [],
        progressInsight: 'Career and health both moved forward.',
        tomorrowFocus: [{ taskId: 'study-tomorrow', title: 'Study', category: 'career' }],
        flags: []
      };
    }
  };
  assert.equal((await generateDailyReview({ context, provider: validProvider })).source, 'provider');

  const inventedTaskProvider = {
    ...validProvider,
    async generateDailyReview() {
      return {
        dateKey: context.dateKey,
        dailyReview: 'Review.',
        missedPriorities: [],
        progressInsight: 'Insight.',
        tomorrowFocus: [{ taskId: 'invented', title: 'Invented task', category: 'career' }],
        flags: []
      };
    }
  };
  assert.equal((await generateDailyReview({ context, provider: inventedTaskProvider })).source, 'deterministic');

  console.log('Daily review: deterministic summary, required sections, provider validation, context validation, and fallback passed.');
}

void run();
