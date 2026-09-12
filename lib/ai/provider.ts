import type { AIContext } from '@/lib/ai/context-builder';
import type { DailyReviewContext } from '@/lib/ai/daily-review-schema';

export interface AIProvider {
  readonly name: string;
  recommendNextAction(context: AIContext): Promise<unknown>;
  generateDailyReview?(context: DailyReviewContext): Promise<unknown>;
}
