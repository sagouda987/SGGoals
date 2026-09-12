import { z } from 'zod';
import { GOAL_PRIORITIES } from '@/lib/goals/category-score';

export const nextActionRequestSchema = z
  .object({
    availableMinutes: z.number().int().min(5).max(480).default(30)
  })
  .strict();

export const providerRecommendationSchema = z
  .object({
    taskId: z.string().min(1).nullable(),
    title: z.string().trim().min(1).max(120),
    reason: z.string().trim().min(1).max(500),
    category: z.enum(GOAL_PRIORITIES),
    suggestedMinutes: z.number().int().min(5).max(480),
    confidence: z.number().min(0).max(1)
  })
  .strict();

export const nextActionResponseSchema = providerRecommendationSchema.extend({
  source: z.enum(['provider', 'deterministic'])
});

export type ProviderRecommendation = z.infer<typeof providerRecommendationSchema>;
export type NextActionRecommendation = z.infer<typeof nextActionResponseSchema>;
