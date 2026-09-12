import type { AIContext, AIContextTask } from '@/lib/ai/context-builder';
import type { ProviderRecommendation } from '@/lib/ai/schema';

const PRIORITY_VALUE = { career: 14, health: 12, communication: 10, looks: 8, other: 6 } as const;

function normalizedText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function suggestedMinutes(task: AIContextTask, availableMinutes: number) {
  const text = normalizedText(task.text);
  const preferred = text.includes('study') || text.includes('office') ? 60
    : text.includes('gym') ? 45
      : text.includes('book') || text.includes('read') ? 30
        : 25;
  return Math.max(5, Math.min(availableMinutes, preferred));
}

function rankTask(task: AIContextTask, context: AIContext) {
  const categoryScore = context.categoryScores.find((item) => item.priority === task.priority)?.score ?? 0;
  const misses = context.missedActivities.filter((activity) => normalizedText(activity.taskText) === normalizedText(task.text)).length;
  const scopeValue = task.scope === 'today' ? 30 : task.scope === 'weekly' ? 10 : 0;
  return scopeValue + task.weight * 6 + (100 - categoryScore) * 0.35 + misses * 15 + PRIORITY_VALUE[task.priority];
}

export function recommendDeterministically(context: AIContext): ProviderRecommendation {
  const candidates = context.tasks
    .filter((task) => !task.done && (task.scope === 'today' || task.scope === 'weekly'))
    .sort((a, b) => rankTask(b, context) - rankTask(a, context) || b.weight - a.weight || a.text.localeCompare(b.text));

  const task = candidates[0];
  if (!task) {
    return {
      taskId: null,
      title: 'Review and choose tomorrow’s first task',
      reason: `Your current Today and Weekly tasks are complete. Use ${context.availableMinutes} minutes to prepare the next clear action and protect your ${context.currentStreakDays}-day consistency streak.`,
      category: 'other',
      suggestedMinutes: Math.min(context.availableMinutes, 15),
      confidence: 0.72
    };
  }

  const category = context.categoryScores.find((item) => item.priority === task.priority);
  const misses = context.missedActivities.filter((activity) => normalizedText(activity.taskText) === normalizedText(task.text)).length;
  const reasons = [`${task.weight} point priority`, `${task.priority} score ${category?.score ?? 0}/100`];
  if (misses) reasons.push(`${misses} recent miss${misses === 1 ? '' : 'es'}`);

  return {
    taskId: task.id,
    title: task.text,
    reason: `This is the highest-value pending action based on its ${reasons.join(', ')} and your available time.`,
    category: task.priority,
    suggestedMinutes: suggestedMinutes(task, context.availableMinutes),
    confidence: Math.min(0.95, 0.72 + task.weight / 100 + (misses ? 0.05 : 0))
  };
}
