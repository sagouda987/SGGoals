export const GOAL_PRIORITIES = ['health', 'career', 'communication', 'looks', 'other'] as const;

export type GoalPriority = (typeof GOAL_PRIORITIES)[number];

export const CATEGORY_WEEKLY_MINUTES: Record<GoalPriority, number> = {
  health: 180,
  career: 300,
  communication: 90,
  looks: 45,
  other: 60
};

export type GoalCategoryScoreInput = {
  priority: GoalPriority;
  completions: number;
  failures: number;
  undos: number;
  minutes: number;
  daysHit: number;
  windowDays: number;
};

export function scoreGoalCategory(input: GoalCategoryScoreInput) {
  const totalActions = input.completions + input.failures + input.undos;
  const consistency = input.windowDays ? input.daysHit / input.windowDays : 0;
  const completionRate = totalActions ? input.completions / totalActions : 0;
  const timeTarget = Math.max(1, Math.round((CATEGORY_WEEKLY_MINUTES[input.priority] / 7) * Math.max(input.windowDays, 1)));
  const timeScore = Math.min(input.minutes / timeTarget, 1);
  const raw = completionRate * 0.45 + consistency * 0.35 + timeScore * 0.2;

  return Math.round(raw * 100);
}
