export type MotivationDay = {
  dateKey: string;
  completedPoints: number;
  focusMinutes: number;
  completedTasks: Array<{ text: string; points: number }>;
};

export type GoalLink = {
  goal: string;
  weeklyAction?: string;
  monthlyMilestone?: string;
  dailyHabit?: string;
};

function sundayKey(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
}

export function buildWeeklyPersonalBests(days: MotivationDay[], currentDateKey: string) {
  const weeks = new Map<string, { points: number; focusMinutes: number; completedTasks: number }>();
  days.forEach((day) => {
    const key = sundayKey(day.dateKey);
    const current = weeks.get(key) || { points: 0, focusMinutes: 0, completedTasks: 0 };
    current.points += Math.max(0, day.completedPoints);
    current.focusMinutes += Math.max(0, day.focusMinutes);
    current.completedTasks += day.completedTasks.length;
    weeks.set(key, current);
  });

  const currentKey = sundayKey(currentDateKey);
  const current = weeks.get(currentKey) || { points: 0, focusMinutes: 0, completedTasks: 0 };
  const previous = [...weeks.entries()].filter(([key]) => key < currentKey).map(([, value]) => value);
  const bestBeforeCurrent = previous.reduce(
    (best, week) => ({
      points: Math.max(best.points, week.points),
      focusMinutes: Math.max(best.focusMinutes, week.focusMinutes),
      completedTasks: Math.max(best.completedTasks, week.completedTasks)
    }),
    { points: 0, focusMinutes: 0, completedTasks: 0 }
  );
  return {
    current,
    bestBeforeCurrent,
    isBest: {
      points: current.points > 0 && current.points > bestBeforeCurrent.points,
      focusMinutes: current.focusMinutes > 0 && current.focusMinutes > bestBeforeCurrent.focusMinutes,
      completedTasks: current.completedTasks > 0 && current.completedTasks > bestBeforeCurrent.completedTasks
    }
  };
}

export function findMeaningfulGoal<T extends { id: string; text: string; priority: string }>(
  task: T | null,
  yearlyGoals: T[],
  breakdowns: Record<string, { monthlyMilestone: string; weeklyAction: string; dailyHabit: string }>,
  weeklyPlan: { mainGoal: string; studyPlan: string; workPlan: string; healthPlan: string }
): GoalLink | null {
  if (!task) return null;
  const matchingGoal = yearlyGoals.find((goal) => goal.priority === task.priority) || yearlyGoals[0];
  const breakdown = matchingGoal ? breakdowns[matchingGoal.id] : undefined;
  const categoryPlan = task.priority === 'health'
    ? weeklyPlan.healthPlan
    : task.priority === 'career'
      ? weeklyPlan.workPlan || weeklyPlan.studyPlan
      : weeklyPlan.mainGoal;
  const goal = matchingGoal?.text || weeklyPlan.mainGoal || categoryPlan;
  if (!goal && !breakdown?.weeklyAction && !breakdown?.monthlyMilestone) return null;
  return {
    goal: goal || 'Your weekly goal',
    weeklyAction: breakdown?.weeklyAction || categoryPlan || undefined,
    monthlyMilestone: breakdown?.monthlyMilestone || undefined,
    dailyHabit: breakdown?.dailyHabit || undefined
  };
}

export function buildEndOfDayEncouragement(input: {
  completedTasks: string[];
  focusMinutes: number;
  pendingTask?: string;
  rests: number;
}) {
  const win = input.completedTasks[0]
    ? `You completed ${input.completedTasks[0]}${input.focusMinutes ? ` and recorded ${input.focusMinutes} focused minutes` : ''}.`
    : input.focusMinutes
      ? `You protected ${input.focusMinutes} focused minutes today.`
      : input.rests
        ? 'You chose recovery deliberately instead of treating it as failure.'
        : 'A quiet day is still useful feedback. Restart with one small action.';
  const next = input.pendingTask
    ? `Tomorrow, begin with ${input.pendingTask}.`
    : 'Tomorrow, choose one meaningful task before the day gets noisy.';
  return { win, next };
}
