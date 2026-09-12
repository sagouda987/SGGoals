import { z } from 'zod';
import { GOAL_PRIORITIES, type GoalPriority } from '@/lib/goals/category-score';

export type DailyReviewContext = {
  dateKey: string;
  completed: Array<{ title: string; category: GoalPriority; minutes: number }>;
  missed: Array<{ title: string; category: GoalPriority; reason: string | null }>;
  notes: Array<{ source: string; title: string; text: string }>;
  categoryScores: Array<{ priority: GoalPriority; score: number }>;
  currentStreakDays: number;
  tomorrowCandidates: Array<{ id: string; title: string; category: GoalPriority; weight: number }>;
};

export const dailyReviewContentSchema = z
  .object({
    dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dailyReview: z.string().trim().min(1).max(800),
    missedPriorities: z.array(z.object({
      title: z.string().trim().min(1).max(120),
      category: z.enum(GOAL_PRIORITIES),
      reason: z.string().trim().min(1).max(240)
    }).strict()).max(5),
    progressInsight: z.string().trim().min(1).max(500),
    tomorrowFocus: z.array(z.object({
      taskId: z.string().min(1).nullable(),
      title: z.string().trim().min(1).max(120),
      category: z.enum(GOAL_PRIORITIES)
    }).strict()).min(1).max(3),
    flags: z.array(z.string().trim().min(1).max(180)).max(5)
  })
  .strict();

export const storedDailyReviewSchema = dailyReviewContentSchema.extend({
  source: z.enum(['provider', 'deterministic']),
  generatedAt: z.string().datetime()
});

export type DailyReviewContent = z.infer<typeof dailyReviewContentSchema>;
export type StoredDailyReview = z.infer<typeof storedDailyReviewSchema>;
