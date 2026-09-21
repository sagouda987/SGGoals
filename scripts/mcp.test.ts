import assert from 'node:assert/strict';
import { authorizeMcpRequest, requireConfiguredMcpToken } from '../lib/mcp/auth';
import { SgGoalsMcpError } from '../lib/mcp/errors';
import { buildDailyActivitySummary, type McpActivityRecord, type McpTaskRecord } from '../lib/mcp/reporting';
import { dailyReportInputSchema, goalProgressInputSchema, missedTasksInputSchema, priorityReviewInputSchema, weeklySummaryInputSchema } from '../lib/mcp/schemas';
import { HttpSgGoalsMcpDataSource, SgGoalsMcpService, type SgGoalsMcpDataSource } from '../lib/mcp/service';
import { istFocusDateKey, reportingDayBounds } from '../lib/must-focus-targets';

function activity(input: Partial<McpActivityRecord> & Pick<McpActivityRecord, 'id' | 'taskText' | 'kind' | 'createdAt'>): McpActivityRecord {
  return {
    scope: 'today', priority: 'career', reason: null, note: null, minutes: null,
    startedAt: null, completedAt: null, ...input
  };
}

function note(points: number, focusMinutes?: number) {
  return `[sg-activity-meta:${Buffer.from(JSON.stringify({ points, focusMinutes }), 'utf8').toString('base64')}]`;
}

class MemorySource implements SgGoalsMcpDataSource {
  constructor(private readonly tasks: McpTaskRecord[] = [], private readonly activities: McpActivityRecord[] = []) {}
  async getTasks() { return this.tasks; }
  async getActivities(start: Date, end: Date, limit = 5000) {
    return this.activities.filter((item) => {
      const time = new Date(item.createdAt).getTime();
      return time >= start.getTime() && time < end.getTime();
    }).slice(0, limit);
  }
}

async function run() {
  const configured = '0123456789abcdef0123456789abcdef';
  assert.equal(requireConfiguredMcpToken(configured), configured);
  assert.doesNotThrow(() => authorizeMcpRequest(`Bearer ${configured}`, configured));
  assert.throws(() => authorizeMcpRequest('Bearer incorrect-token-value', configured), (error) => error instanceof SgGoalsMcpError && error.code === 'UNAUTHORIZED');
  assert.throws(() => requireConfiguredMcpToken('short'));

  assert.equal(istFocusDateKey('2026-09-22T02:59:00+05:30'), '2026-09-21');
  assert.equal(istFocusDateKey('2026-09-22T03:00:00+05:30'), '2026-09-22');
  assert.equal(istFocusDateKey('2026-09-22T03:01:00+05:30'), '2026-09-22');
  const bounds = reportingDayBounds('2026-09-22');
  assert.equal(bounds.start.toISOString(), '2026-09-21T21:30:00.000Z');
  assert.equal(bounds.end.toISOString(), '2026-09-22T21:30:00.000Z');

  const taskNote = `Revise database joins\n[sg-task-meta:${Buffer.from(JSON.stringify({ weight: 5 }), 'utf8').toString('base64')}]`;
  const tasks: McpTaskRecord[] = [
    { id: 'study', scope: 'today', text: 'Study', priority: 'career', block: 'morning', done: true, note: taskNote, investedMinutes: 60 },
    { id: '__weekly_plan__', scope: '__meta__', text: 'Weekly planning state', priority: 'other', block: null, done: false, note: JSON.stringify({ mainGoal: 'Finish DBT', notes: 'Protect study time' }), investedMinutes: null }
  ];
  const activities = [
    activity({ id: 'done', taskText: 'Study', kind: 'completion', note: `Finished chapter 3\n${note(5)}`, minutes: 60, createdAt: '2026-09-21T22:00:00.000Z' }),
    activity({ id: 'focus', taskText: 'Study', kind: 'focus-session', note: note(0, 60), minutes: 60, createdAt: '2026-09-21T22:05:00.000Z' }),
    activity({ id: 'miss', taskText: 'Read', kind: 'failure', note: note(2), reason: 'Busy', createdAt: '2026-09-22T10:00:00.000Z' })
  ];
  const service = new SgGoalsMcpService(new MemorySource(tasks, activities));
  const now = new Date('2026-09-22T04:00:00+05:30');
  const status = await service.getTodayStatus(now);
  assert.equal(status.date, '2026-09-22');
  assert.equal(status.completedTasks, 1);
  assert.equal(status.completedPoints, 5);
  assert.equal(status.totalPoints, 5);
  assert.equal(status.missedTasks, 1);
  assert.equal(status.timeInvestedMinutes, 60);

  const report = await service.getDailyReport('2026-09-22', now);
  assert.equal(report.completedPoints, 5);
  assert.equal(report.missedPoints, 2);
  assert.equal(report.taskSource, 'current_task_snapshot_and_activity_history');

  const weekly = await service.getWeeklySummary({ startDate: '2026-09-20', endDate: '2026-09-26' }, now);
  assert.equal(weekly.completedTasks, 1);
  assert.equal(weekly.totalTasks, 2);
  assert.equal(weekly.pointsEarned, 5);
  assert.equal(weekly.studyTimeMinutes, 60);
  const misses = await service.getMissedTasks({ days: 7, limit: 20 }, now);
  assert.equal(misses[0]?.taskName, 'Read');
  assert.equal(misses[0]?.frequencyInWindow, 1);
  const progress = await service.getGoalProgress({ category: 'career', days: 7 }, now);
  assert.equal(progress.points, 5);
  assert.equal(progress.missedTasks, 1);
  assert.equal((await service.getNextAction(now)).taskId, null);
  const priorityReview = await service.getPriorityReview({ period: 'week', date: '2026-09-22' }, now);
  assert.deepEqual(priorityReview.range, { startDate: '2026-09-20', endDate: '2026-09-22' });
  assert.deepEqual(priorityReview.comparisonRange, { startDate: '2026-09-17', endDate: '2026-09-19' });
  assert.equal(priorityReview.current.completedPoints, 5);
  assert.equal(priorityReview.current.missedTasks, 1);
  assert.equal(priorityReview.priorityPlan.today[0]?.title, 'Study');
  assert.equal(priorityReview.taskContext.find((task) => task.id === 'study')?.note, 'Revise database joins');
  const weeklyPlanning = priorityReview.planningContext.find((item) => item.id === '__weekly_plan__')?.data;
  assert.equal(weeklyPlanning && typeof weeklyPlanning === 'object' ? (weeklyPlanning as { notes?: string }).notes : null, 'Protect study time');
  assert.equal(priorityReview.activityHistory.find((item) => item.id === 'done')?.note, 'Finished chapter 3');
  assert.equal(priorityReview.activityHistory.find((item) => item.id === 'miss')?.reason, 'Busy');
  assert.deepEqual(priorityReview.dataCoverage, { taskCount: 1, taskNotes: 1, planningRecords: 1, activityEvents: 3, activityNotes: 1, missedReasons: 1 });
  assert.equal(priorityReview.nextAction.source, 'deterministic');

  const sequence = [
    activity({ id: 'c1', taskText: 'Gym', kind: 'completion', note: note(5), createdAt: '2026-09-21T22:00:00Z' }),
    activity({ id: 'u1', taskText: 'Gym', kind: 'undo', note: note(5), createdAt: '2026-09-21T23:00:00Z' })
  ];
  assert.equal(buildDailyActivitySummary([...sequence].reverse(), '2026-09-22').completedPoints, 0);
  const zeroPoint = activity({ id: 'zero', taskText: 'Zero task', kind: 'completion', note: note(0), createdAt: '2026-09-21T22:00:00Z' });
  assert.equal(buildDailyActivitySummary([zeroPoint], '2026-09-22').completedPoints, 0);

  const empty = new SgGoalsMcpService(new MemorySource());
  const emptyStatus = await empty.getTodayStatus(now);
  assert.equal(emptyStatus.totalTasks, 0);
  assert.equal(emptyStatus.overallScore, 0);
  const emptyWeek = await empty.getWeeklySummary({}, now);
  assert.equal(emptyWeek.totalTasks, 0);
  assert.equal(emptyWeek.dailySummaries.length, 7);

  assert.equal(dailyReportInputSchema.safeParse({ date: '2026-02-30' }).success, false);
  assert.equal(weeklySummaryInputSchema.safeParse({ startDate: '2026-01-01' }).success, false);
  assert.equal(weeklySummaryInputSchema.safeParse({ startDate: '2025-01-01', endDate: '2026-09-22' }).success, false);
  assert.equal(missedTasksInputSchema.safeParse({ days: 366, limit: 20 }).success, false);
  assert.equal(goalProgressInputSchema.safeParse({ category: 'money', days: 30 }).success, false);
  assert.equal(priorityReviewInputSchema.safeParse({ period: 'year' }).success, false);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const pathname = new URL(String(input)).pathname;
    if (pathname === '/api/goals') return Response.json({ store: { today: [{ id: 'zero-task', scope: 'today', text: 'Zero', priority: 'career', done: true, weight: 0 }] } });
    return Response.json({ activities: [
      { id: 'later', scope: 'today', priority: 'career', taskText: 'Zero', kind: 'undo', points: 0, createdAt: '2026-09-22T01:00:00Z' },
      { id: 'earlier', scope: 'today', priority: 'career', taskText: 'Zero', kind: 'completion', points: 0, createdAt: '2026-09-22T00:00:00Z' }
    ] });
  }) as typeof fetch;
  try {
    const httpSource = new HttpSgGoalsMcpDataSource('https://sg-goals.example');
    const remoteTasks = await httpSource.getTasks();
    const remoteActivities = await httpSource.getActivities(new Date('2026-09-21T23:00:00Z'), new Date('2026-09-22T02:00:00Z'));
    assert.match(remoteTasks[0]?.note ?? '', /sg-task-meta/);
    assert.deepEqual(remoteActivities.map((item) => item.id), ['earlier', 'later']);
    assert.match(remoteActivities[0]?.note ?? '', /sg-activity-meta/);
    assert.equal(buildDailyActivitySummary(remoteActivities, '2026-09-22').completedPoints, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log('MCP: auth, IST boundary, today status, daily report, weekly aggregation, priority review, point chronology, remote live-data mapping, empty data, and input validation passed.');
}

void run();
