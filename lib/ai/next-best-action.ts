import type { AIContext } from '@/lib/ai/context-builder';
import { recommendDeterministically } from '@/lib/ai/deterministic-provider';
import type { AIProvider } from '@/lib/ai/provider';
import { nextActionResponseSchema, providerRecommendationSchema, type NextActionRecommendation } from '@/lib/ai/schema';

function recommendationMatchesContext(recommendation: NextActionRecommendation | Omit<NextActionRecommendation, 'source'>, context: AIContext) {
  if (recommendation.suggestedMinutes > context.availableMinutes) return false;
  if (recommendation.taskId === null) return !context.tasks.some((task) => !task.done && (task.scope === 'today' || task.scope === 'weekly'));
  const task = context.tasks.find((candidate) => candidate.id === recommendation.taskId);
  return Boolean(task && !task.done && (task.scope === 'today' || task.scope === 'weekly') && task.priority === recommendation.category);
}

export async function getNextBestAction(input: { context: AIContext; provider?: AIProvider | null }): Promise<NextActionRecommendation> {
  if (input.provider) {
    try {
      const candidate = providerRecommendationSchema.safeParse(await input.provider.recommendNextAction(input.context));
      if (candidate.success && recommendationMatchesContext(candidate.data, input.context)) {
        return nextActionResponseSchema.parse({ ...candidate.data, source: 'provider' });
      }
    } catch {
      // Provider outages and malformed output both fall back to the same validated result.
    }
  }

  return nextActionResponseSchema.parse({ ...recommendDeterministically(input.context), source: 'deterministic' });
}
