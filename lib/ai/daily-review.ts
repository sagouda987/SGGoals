import { dailyReviewContentSchema, storedDailyReviewSchema, type DailyReviewContent, type DailyReviewContext, type StoredDailyReview } from '@/lib/ai/daily-review-schema';
import type { AIProvider } from '@/lib/ai/provider';

function deterministicDailyReview(context: DailyReviewContext): DailyReviewContent {
  const completedMinutes = context.completed.reduce((sum, item) => sum + item.minutes, 0);
  const strongest = [...context.categoryScores].sort((a, b) => b.score - a.score)[0];
  const weakest = [...context.categoryScores].sort((a, b) => a.score - b.score)[0];
  const completedNames = context.completed.slice(0, 3).map((item) => item.title);
  const review = context.completed.length
    ? `You completed ${context.completed.length} activit${context.completed.length === 1 ? 'y' : 'ies'}${completedNames.length ? `, including ${completedNames.join(', ')}` : ''}${completedMinutes ? `, with ${completedMinutes} recorded minutes` : ''}.`
    : 'No completed activities were recorded for this reporting day.';

  const missedPriorities = context.missed.slice(0, 5).map((item) => ({
    title: item.title,
    category: item.category,
    reason: item.reason || 'Not completed during the reporting day.'
  }));

  const tomorrowFocus: DailyReviewContent['tomorrowFocus'] = context.tomorrowCandidates.slice(0, 3).map((task) => ({
    taskId: task.id,
    title: task.title,
    category: task.category
  }));
  if (!tomorrowFocus.length) {
    tomorrowFocus.push({ taskId: null, title: 'Choose the first concrete task for tomorrow', category: 'other' });
  }

  const flags: string[] = [];
  if (context.missed.length > context.completed.length) flags.push('Missed activities exceeded completed activities.');
  if (context.currentStreakDays === 0) flags.push('Consistency streak is currently at zero days.');
  if (weakest && weakest.score < 30) flags.push(`${weakest.priority} needs attention at ${weakest.score}/100.`);
  if (context.notes.length) flags.push(`${context.notes.length} note${context.notes.length === 1 ? '' : 's'} from the day were included in this review.`);
  const noteInsight = context.notes.length
    ? ` Notes from the day: ${context.notes.slice(0, 2).map((note) => `${note.title} — ${note.text}`).join('; ')}`
    : '';

  return dailyReviewContentSchema.parse({
    dateKey: context.dateKey,
    dailyReview: review,
    missedPriorities,
    progressInsight: ((strongest
      ? `${strongest.priority} is currently strongest at ${strongest.score}/100. ${weakest?.priority ?? 'other'} has the most room to improve at ${weakest?.score ?? 0}/100. Current consistency is ${context.currentStreakDays} day${context.currentStreakDays === 1 ? '' : 's'}.`
      : `Current consistency is ${context.currentStreakDays} day${context.currentStreakDays === 1 ? '' : 's'}.`) + noteInsight).slice(0, 500),
    tomorrowFocus,
    flags
  });
}

function matchesContext(review: DailyReviewContent, context: DailyReviewContext) {
  if (review.dateKey !== context.dateKey) return false;
  const candidates = new Map(context.tomorrowCandidates.map((task) => [task.id, task]));
  return review.tomorrowFocus.every((focus) => {
    if (focus.taskId === null) return context.tomorrowCandidates.length === 0;
    const task = candidates.get(focus.taskId);
    return Boolean(task && task.category === focus.category);
  });
}

export async function generateDailyReview(input: { context: DailyReviewContext; provider?: AIProvider | null; now?: Date }): Promise<StoredDailyReview> {
  if (input.provider?.generateDailyReview) {
    try {
      const candidate = dailyReviewContentSchema.safeParse(await input.provider.generateDailyReview(input.context));
      if (candidate.success && matchesContext(candidate.data, input.context)) {
        return storedDailyReviewSchema.parse({ ...candidate.data, source: 'provider', generatedAt: (input.now ?? new Date()).toISOString() });
      }
    } catch {
      // Invalid output and provider failures use the validated deterministic review.
    }
  }

  return storedDailyReviewSchema.parse({
    ...deterministicDailyReview(input.context),
    source: 'deterministic',
    generatedAt: (input.now ?? new Date()).toISOString()
  });
}
