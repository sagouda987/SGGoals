import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SgGoalsMcpService } from '@/lib/mcp/service';
import { controlledError, SgGoalsMcpError } from '@/lib/mcp/errors';
import {
  dailyReportInputSchema,
  goalProgressInputSchema,
  missedTasksInputSchema,
  noInputSchema,
  priorityReviewInputSchema,
  weeklySummaryInputSchema,
  weeklySummaryToolInputSchema
} from '@/lib/mcp/schemas';

function success(data: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
    structuredContent: data
  };
}

function failure(error: unknown) {
  const controlled = controlledError(error);
  return {
    isError: true,
    content: [{ type: 'text' as const, text: JSON.stringify({ error: controlled }) }],
    structuredContent: { error: controlled }
  };
}

const readOnlyAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export function createSgGoalsMcpServer(service: SgGoalsMcpService) {
  const server = new McpServer({ name: 'sg-goals', version: '1.0.0' });

  server.registerTool('get_today_status', {
    description: 'Return the current SG Goals day status using the 03:00 Asia/Kolkata boundary.',
    inputSchema: noInputSchema,
    annotations: readOnlyAnnotations
  }, async () => {
    try { return success(await service.getTodayStatus()); } catch (error) { return failure(error); }
  });

  server.registerTool('get_daily_report', {
    description: 'Return recorded tasks, outcomes, points, time, misses, and notes for one SG Goals reporting day.',
    inputSchema: dailyReportInputSchema,
    annotations: readOnlyAnnotations
  }, async ({ date }) => {
    try { return success(await service.getDailyReport(date)); } catch (error) { return failure(error); }
  });

  server.registerTool('get_weekly_summary', {
    description: 'Aggregate SG Goals activity over a bounded date range, defaulting to the current Sunday-through-Saturday reporting week.',
    inputSchema: weeklySummaryToolInputSchema,
    annotations: readOnlyAnnotations
  }, async (input) => {
    try {
      const parsed = weeklySummaryInputSchema.safeParse(input);
      if (!parsed.success) throw new SgGoalsMcpError('INVALID_DATE', parsed.error.issues[0]?.message || 'The date range is invalid.');
      return success(await service.getWeeklySummary(parsed.data));
    } catch (error) { return failure(error); }
  });

  server.registerTool('get_missed_tasks', {
    description: 'Return recent recorded task failures with frequency information.',
    inputSchema: missedTasksInputSchema,
    annotations: readOnlyAnnotations
  }, async (input) => {
    try { return success({ missedTasks: await service.getMissedTasks(input) }); } catch (error) { return failure(error); }
  });

  server.registerTool('get_next_action', {
    description: 'Return the existing deterministic SG Goals next-best-action recommendation.',
    inputSchema: noInputSchema,
    annotations: readOnlyAnnotations
  }, async () => {
    try { return success(await service.getNextAction()); } catch (error) { return failure(error); }
  });

  server.registerTool('get_goal_progress', {
    description: 'Return recorded completion, points, time, trend, and misses for one SG Goals category.',
    inputSchema: goalProgressInputSchema,
    annotations: readOnlyAnnotations
  }, async (input) => {
    try { return success(await service.getGoalProgress(input)); } catch (error) { return failure(error); }
  });

  server.registerTool('get_priority_review', {
    description: 'Return a compact, priority-aware SG Goals review for a day, week-to-date, or month-to-date, including comparison data and improvement evidence for ChatGPT coaching.',
    inputSchema: priorityReviewInputSchema,
    annotations: readOnlyAnnotations
  }, async (input) => {
    try { return success(await service.getPriorityReview(input)); } catch (error) { return failure(error); }
  });

  return server;
}
