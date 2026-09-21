import { buildAIContextFromRecords } from '@/lib/ai/context';
import { getNextBestAction } from '@/lib/ai/next-best-action';
import { prisma } from '@/lib/prisma';
import { istFocusDateKey, reportingDayBounds, reportingWeekBounds, shiftReportingDateKey } from '@/lib/must-focus-targets';
import {
  buildCategoryPerformance,
  buildCurrentTaskSummary,
  buildDailyActivitySummary,
  buildStreaks,
  buildTasks,
  enumerateDateKeys,
  normalizeHabitCode,
  type McpActivityRecord,
  type McpTaskRecord
} from '@/lib/mcp/reporting';

const OWNER_KEY = 'default';

export interface SgGoalsMcpDataSource {
  getTasks(): Promise<McpTaskRecord[]>;
  getActivities(start: Date, end: Date, limit?: number): Promise<McpActivityRecord[]>;
}

type GoalsApiTask = Omit<McpTaskRecord, 'block' | 'note' | 'investedMinutes'> & {
  block?: string;
  note?: string;
  weight?: number;
  investedMinutes?: number;
};

type GoalsApiActivity = Omit<McpActivityRecord, 'reason' | 'note' | 'minutes' | 'startedAt' | 'completedAt'> & {
  reason?: string;
  note?: string;
  points?: number;
  minutes?: number;
  focusMinutes?: number;
  startedAt?: string;
  completedAt?: string;
};

function appendEncodedMetadata(note: string | undefined, marker: string, value: object) {
  const encoded = Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
  return `${note?.trim() || ''}\n[${marker}:${encoded}]`.trim();
}

/** Reads the deployed SG Goals APIs so the private tunnel sees the same live data as the website. */
export class HttpSgGoalsMcpDataSource implements SgGoalsMcpDataSource {
  constructor(private readonly baseUrl: string) {}

  private async getJson(pathname: string) {
    const url = new URL(pathname, this.baseUrl);
    if (url.protocol !== 'https:' && url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
      throw new Error('SG Goals MCP data URL must use HTTPS.');
    }
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`SG Goals API returned ${response.status}.`);
    return response.json() as Promise<Record<string, unknown>>;
  }

  async getTasks() {
    const payload = await this.getJson('/api/goals');
    const store = payload.store;
    if (!store || typeof store !== 'object') throw new Error('SG Goals API returned an invalid task store.');
    return Object.values(store as Record<string, unknown>).flatMap((value) => Array.isArray(value) ? value : [])
      .filter((value): value is GoalsApiTask => Boolean(value) && typeof value === 'object' && typeof value.id === 'string' && typeof value.text === 'string')
      .map((task) => ({
        id: task.id,
        scope: task.scope,
        text: task.text,
        priority: task.priority,
        block: task.block ?? null,
        done: task.done,
        note: task.weight === undefined ? task.note ?? null : appendEncodedMetadata(task.note, 'sg-task-meta', { weight: task.weight }),
        investedMinutes: task.investedMinutes ?? null
      }));
  }

  async getActivities(start: Date, end: Date, limit = 5000) {
    const payload = await this.getJson('/api/goals/activities');
    const activities = payload.activities;
    if (!Array.isArray(activities)) throw new Error('SG Goals API returned invalid activities.');
    return activities
      .filter((value): value is GoalsApiActivity => Boolean(value) && typeof value === 'object' && typeof value.id === 'string' && typeof value.createdAt === 'string')
      .filter((activity) => {
        const createdAt = Date.parse(String(activity.createdAt));
        return createdAt >= start.getTime() && createdAt < end.getTime();
      })
      .sort((a, b) => Date.parse(String(a.createdAt)) - Date.parse(String(b.createdAt)))
      .slice(0, Math.min(limit, 10000))
      .map((activity) => ({
        id: activity.id,
        scope: activity.scope,
        priority: activity.priority,
        taskText: activity.taskText,
        kind: activity.kind,
        reason: activity.reason ?? null,
        note: activity.points === undefined && activity.focusMinutes === undefined
          ? activity.note ?? null
          : appendEncodedMetadata(activity.note, 'sg-activity-meta', { points: activity.points, focusMinutes: activity.focusMinutes }),
        minutes: activity.minutes ?? null,
        startedAt: activity.startedAt ?? null,
        completedAt: activity.completedAt ?? null,
        createdAt: activity.createdAt
      }));
  }
}

export class PrismaSgGoalsMcpDataSource implements SgGoalsMcpDataSource {
  async getTasks() {
    return prisma.goalTask.findMany({
      where: { ownerKey: OWNER_KEY },
      orderBy: [{ scope: 'asc' }, { position: 'asc' }],
      select: { id: true, scope: true, text: true, priority: true, block: true, done: true, note: true, investedMinutes: true }
    });
  }

  async getActivities(start: Date, end: Date, limit = 5000) {
    return prisma.goalActivity.findMany({
      where: { ownerKey: OWNER_KEY, createdAt: { gte: start, lt: end } },
      orderBy: { createdAt: 'asc' },
      take: Math.min(limit, 10000),
      select: {
        id: true, scope: true, priority: true, taskText: true, kind: true, reason: true,
        note: true, minutes: true, startedAt: true, completedAt: true, createdAt: true
      }
    });
  }
}

function dateRange(startDate: string, endDate: string) {
  const { start } = reportingDayBounds(startDate);
  const { end } = reportingDayBounds(endDate);
  return { start, end };
}

function normalizedName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function summarizeMisses(days: ReturnType<typeof buildDailyActivitySummary>[], limit = 10) {
  const groups = new Map<string, { taskName: string; category: string; count: number; lastMissedDate: string; reason: string | null }>();
  for (const day of days) {
    for (const miss of day.missedTasks) {
      const key = `${miss.category}:${normalizedName(miss.taskName)}`;
      const current = groups.get(key);
      if (!current) groups.set(key, { taskName: miss.taskName, category: miss.category, count: 1, lastMissedDate: day.date, reason: miss.reason });
      else {
        current.count += 1;
        if (day.date >= current.lastMissedDate) {
          current.lastMissedDate = day.date;
          current.reason = miss.reason;
        }
      }
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || b.lastMissedDate.localeCompare(a.lastMissedDate)).slice(0, limit);
}

export class SgGoalsMcpService {
  constructor(private readonly dataSource: SgGoalsMcpDataSource = new PrismaSgGoalsMcpDataSource()) {}

  async getTodayStatus(now = new Date()) {
    const date = istFocusDateKey(now.toISOString());
    const historyStart = reportingDayBounds(shiftReportingDateKey(date, -364)).start;
    const { end } = reportingDayBounds(date);
    const [taskRecords, activities] = await Promise.all([
      this.dataSource.getTasks(),
      this.dataSource.getActivities(historyStart, end)
    ]);
    const tasks = buildTasks(taskRecords, activities, now);
    const taskSummary = buildCurrentTaskSummary(tasks);
    const day = buildDailyActivitySummary(activities, date);
    const categoryStart = shiftReportingDateKey(date, -6);
    const categoryScores = Object.fromEntries(buildCategoryPerformance(activities, categoryStart, date).map((item) => [item.priority, item.score]));
    const streak = buildStreaks(activities, date);
    return {
      date,
      overallScore: taskSummary.completionPercentage,
      ...taskSummary,
      missedTasks: day.missedTasks.length,
      timeInvestedMinutes: day.timeInvestedMinutes,
      currentStreak: streak.current,
      bestStreak: streak.best,
      categoryScores
    };
  }

  async getDailyReport(date: string, now = new Date()) {
    const { start, end } = reportingDayBounds(date);
    const [taskRecords, activities] = await Promise.all([
      this.dataSource.getTasks(),
      this.dataSource.getActivities(start, end)
    ]);
    const day = buildDailyActivitySummary(activities, date);
    const currentDate = istFocusDateKey(now.toISOString());
    const currentTasks = date === currentDate ? buildTasks(taskRecords, activities, now).filter((task) => task.scope === 'today') : [];
    return {
      date,
      taskSource: date === currentDate ? 'current_task_snapshot_and_activity_history' : 'activity_history',
      tasks: date === currentDate
        ? currentTasks.map((task) => ({ id: task.id, taskName: task.text, category: task.priority, completed: task.done, points: task.weight, timeSpentMinutes: task.investedMinutes, note: task.note }))
        : day.activities.filter((activity) => ['completion', 'undo', 'failure'].includes(activity.kind)).map((activity) => ({
            id: activity.id, taskName: activity.taskName, category: activity.category, event: activity.kind,
            points: activity.points, timeSpentMinutes: activity.minutes, reason: activity.reason, note: activity.note, createdAt: activity.createdAt
          })),
      completedTasks: day.completedTasks.length,
      missedTasks: day.missedTasks.length,
      completedPoints: day.completedPoints,
      missedPoints: day.failedPoints,
      timeInvestedMinutes: day.timeInvestedMinutes,
      strikeCounts: null,
      notes: day.activities.filter((activity) => activity.note).map((activity) => ({ taskName: activity.taskName, note: activity.note })),
      nextAction: date === currentDate ? await this.getNextAction(now) : null
    };
  }

  async getWeeklySummary(input: { startDate?: string; endDate?: string }, now = new Date()) {
    const currentDate = istFocusDateKey(now.toISOString());
    const defaults = reportingWeekBounds(currentDate);
    const startDate = input.startDate ?? defaults.startDate;
    const endDate = input.endDate ?? defaults.endDate;
    const { start, end } = dateRange(startDate, endDate);
    const activities = await this.dataSource.getActivities(start, end);
    const days = enumerateDateKeys(startDate, endDate).map((date) => buildDailyActivitySummary(activities, date));
    const totalCompleted = days.reduce((sum, day) => sum + day.completedTasks.length, 0);
    const totalMissed = days.reduce((sum, day) => sum + day.missedTasks.length, 0);
    const totalTasks = totalCompleted + totalMissed;
    const pointsEarned = days.reduce((sum, day) => sum + day.completedPoints, 0);
    const missedPoints = days.reduce((sum, day) => sum + day.failedPoints, 0);
    const allActivities = days.flatMap((day) => day.activities);
    const focus = allActivities.filter((activity) => activity.kind === 'focus-session');
    const studyTimeMinutes = focus.filter((activity) => normalizeHabitCode(activity.taskName) === 'STUDY2').reduce((sum, activity) => sum + activity.focusMinutes, 0);
    const healthActivities = allActivities.filter((activity) => activity.category === 'health' && ['completion', 'focus-session'].includes(activity.kind)).length;
    const streak = buildStreaks(activities, endDate > currentDate ? currentDate : endDate);
    return {
      startDate,
      endDate,
      totalTasks,
      completedTasks: totalCompleted,
      completionPercentage: totalTasks ? Math.round(totalCompleted / totalTasks * 100) : 0,
      pointsEarned,
      pointsAvailableFromRecordedOutcomes: pointsEarned + missedPoints,
      totalTimeInvestedMinutes: days.reduce((sum, day) => sum + day.timeInvestedMinutes, 0),
      categoryPerformance: buildCategoryPerformance(activities, startDate, endDate),
      studyTimeMinutes,
      gymOrHealthActivityCount: healthActivities,
      mostFrequentlyMissedTasks: summarizeMisses(days),
      streak,
      dailySummaries: days.map((day) => ({
        date: day.date, completedTasks: day.completedTasks.length, missedTasks: day.missedTasks.length,
        completedPoints: day.completedPoints, missedPoints: day.failedPoints, timeInvestedMinutes: day.timeInvestedMinutes
      }))
    };
  }

  async getMissedTasks(input: { days: number; limit: number }, now = new Date()) {
    const endDate = istFocusDateKey(now.toISOString());
    const startDate = shiftReportingDateKey(endDate, -(input.days - 1));
    const { start, end } = dateRange(startDate, endDate);
    const activities = await this.dataSource.getActivities(start, end);
    const summaries = enumerateDateKeys(startDate, endDate).map((date) => buildDailyActivitySummary(activities, date));
    const frequency = new Map(summarizeMisses(summaries, 100).map((item) => [`${item.category}:${normalizedName(item.taskName)}`, item.count]));
    return summaries.flatMap((day) => day.missedTasks.map((miss) => ({
      taskName: miss.taskName,
      category: miss.category,
      missedDate: day.date,
      strikeCount: null,
      points: miss.points,
      recurrence: miss.scope,
      reason: miss.reason,
      frequencyInWindow: frequency.get(`${miss.category}:${normalizedName(miss.taskName)}`) ?? 1
    }))).sort((a, b) => b.missedDate.localeCompare(a.missedDate) || b.frequencyInWindow - a.frequencyInWindow).slice(0, input.limit);
  }

  async getNextAction(now = new Date()) {
    const reportingDate = istFocusDateKey(now.toISOString());
    const start = reportingDayBounds(shiftReportingDateKey(reportingDate, -20)).start;
    const end = reportingDayBounds(reportingDate).end;
    const [tasks, activities] = await Promise.all([this.dataSource.getTasks(), this.dataSource.getActivities(start, end, 300)]);
    const context = buildAIContextFromRecords({ tasks, activities, availableMinutes: 30, now });
    const recommendation = await getNextBestAction({ context, provider: null });
    return {
      taskId: recommendation.taskId,
      taskName: recommendation.title,
      category: recommendation.category,
      durationMinutes: recommendation.suggestedMinutes,
      points: recommendation.taskId ? context.tasks.find((task) => task.id === recommendation.taskId)?.weight ?? 0 : 0,
      reason: recommendation.reason,
      source: recommendation.source
    };
  }

  async getGoalProgress(input: { category: 'health' | 'career' | 'communication' | 'looks' | 'other'; days: number }, now = new Date()) {
    const endDate = istFocusDateKey(now.toISOString());
    const startDate = shiftReportingDateKey(endDate, -(input.days - 1));
    const { start, end } = dateRange(startDate, endDate);
    const activities = await this.dataSource.getActivities(start, end);
    const days = enumerateDateKeys(startDate, endDate).map((date) => buildDailyActivitySummary(activities, date));
    const matchingDays = days.map((day) => {
      const relevant = day.activities.filter((activity) => activity.category === input.category);
      const completed = relevant.filter((activity) => activity.kind === 'completion');
      const missed = relevant.filter((activity) => activity.kind === 'failure');
      return {
        date: day.date,
        completedTasks: completed.length,
        missedTasks: missed.length,
        points: completed.reduce((sum, activity) => sum + activity.points, 0),
        timeInvestedMinutes: relevant.filter((activity) => activity.kind === 'focus-session').reduce((sum, activity) => sum + activity.focusMinutes, 0)
      };
    });
    const performance = buildCategoryPerformance(activities, startDate, endDate).find((item) => item.priority === input.category)!;
    const completedTasks = matchingDays.reduce((sum, day) => sum + day.completedTasks, 0);
    const missedTasks = matchingDays.reduce((sum, day) => sum + day.missedTasks, 0);
    return {
      category: input.category,
      startDate,
      endDate,
      completionPercentage: completedTasks + missedTasks ? Math.round(completedTasks / (completedTasks + missedTasks) * 100) : 0,
      timeInvestedMinutes: matchingDays.reduce((sum, day) => sum + day.timeInvestedMinutes, 0),
      points: matchingDays.reduce((sum, day) => sum + day.points, 0),
      completedTasks,
      missedTasks,
      categoryScore: performance.score,
      trendByDay: matchingDays,
      frequentMisses: summarizeMisses(days.map((day) => ({ ...day, missedTasks: day.missedTasks.filter((miss) => miss.category === input.category) })))
    };
  }

  async getPriorityReview(input: { period: 'day' | 'week' | 'month'; date?: string }, now = new Date()) {
    const currentDate = istFocusDateKey(now.toISOString());
    const endDate = input.date && input.date < currentDate ? input.date : currentDate;
    const weekStart = reportingWeekBounds(endDate).startDate;
    const startDate = input.period === 'day' ? endDate : input.period === 'week' ? weekStart : `${endDate.slice(0, 7)}-01`;
    const elapsedDays = enumerateDateKeys(startDate, endDate).length;
    const previousEndDate = shiftReportingDateKey(startDate, -1);
    const previousStartDate = shiftReportingDateKey(previousEndDate, -(elapsedDays - 1));
    const { start } = reportingDayBounds(previousStartDate);
    const { end } = reportingDayBounds(endDate);
    const [taskRecords, activities] = await Promise.all([
      this.dataSource.getTasks(),
      this.dataSource.getActivities(start, end)
    ]);
    const currentActivities = activities.filter((activity) => {
      const date = istFocusDateKey(activity.createdAt instanceof Date ? activity.createdAt.toISOString() : activity.createdAt);
      return date >= startDate && date <= endDate;
    });
    const previousActivities = activities.filter((activity) => {
      const date = istFocusDateKey(activity.createdAt instanceof Date ? activity.createdAt.toISOString() : activity.createdAt);
      return date >= previousStartDate && date <= previousEndDate;
    });

    const summarize = (records: McpActivityRecord[], rangeStart: string, rangeEnd: string) => {
      const days = enumerateDateKeys(rangeStart, rangeEnd).map((date) => buildDailyActivitySummary(records, date));
      const completedTasks = days.reduce((sum, day) => sum + day.completedTasks.length, 0);
      const missedTasks = days.reduce((sum, day) => sum + day.missedTasks.length, 0);
      return {
        completedTasks,
        missedTasks,
        completedPoints: days.reduce((sum, day) => sum + day.completedPoints, 0),
        missedPoints: days.reduce((sum, day) => sum + day.failedPoints, 0),
        timeInvestedMinutes: days.reduce((sum, day) => sum + day.timeInvestedMinutes, 0),
        completionPercentage: completedTasks + missedTasks ? Math.round(completedTasks / (completedTasks + missedTasks) * 100) : 0,
        categoryPerformance: buildCategoryPerformance(records, rangeStart, rangeEnd),
        frequentMisses: summarizeMisses(days),
        dailyTrend: days.map((day) => ({
          date: day.date,
          completedTasks: day.completedTasks.length,
          missedTasks: day.missedTasks.length,
          completedPoints: day.completedPoints,
          missedPoints: day.failedPoints,
          timeInvestedMinutes: day.timeInvestedMinutes
        }))
      };
    };

    const current = summarize(currentActivities, startDate, endDate);
    const previous = summarize(previousActivities, previousStartDate, previousEndDate);
    const tasks = buildTasks(taskRecords, currentActivities, now);
    const priorityPlan = Object.fromEntries(['yearly', 'monthly', 'weekly', 'weekend', 'today', 'tomorrow'].map((scope) => [
      scope,
      tasks.filter((task) => task.scope === scope).map((task) => ({
        id: task.id,
        title: task.text,
        category: task.priority,
        points: task.weight,
        completed: task.done,
        timeInvestedMinutes: task.investedMinutes,
        note: task.note || null
      }))
    ]));
    const scoreChanges = current.categoryPerformance.map((category) => ({
      category: category.priority,
      score: category.score,
      previousScore: previous.categoryPerformance.find((item) => item.priority === category.priority)?.score ?? 0,
      change: category.score - (previous.categoryPerformance.find((item) => item.priority === category.priority)?.score ?? 0)
    }));
    const nextAction = await this.getNextAction(now);

    return {
      period: input.period,
      reportingBoundary: '03:00 Asia/Kolkata',
      range: { startDate, endDate },
      comparisonRange: { startDate: previousStartDate, endDate: previousEndDate },
      taskSource: 'current_goal_hierarchy_and_recorded_activity_history',
      current,
      previous,
      changes: {
        completionPercentage: current.completionPercentage - previous.completionPercentage,
        completedPoints: current.completedPoints - previous.completedPoints,
        timeInvestedMinutes: current.timeInvestedMinutes - previous.timeInvestedMinutes,
        missedTasks: current.missedTasks - previous.missedTasks,
        categoryScores: scoreChanges
      },
      priorityPlan,
      nextAction,
      coachingRequest: 'Identify progress, missed priorities, the biggest bottleneck, consistency risks, and the highest-value improvements while respecting the yearly, monthly, weekly, and daily priority hierarchy.'
    };
  }
}
