export type MotivationDay = {
  dateKey: string;
  completedPoints: number;
  focusMinutes: number;
  completedTasks: Array<{ text: string; points: number }>;
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
