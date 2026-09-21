import { z } from 'zod';
import { GOAL_PRIORITIES } from '@/lib/goals/category-score';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export const dateKeySchema = z.string().regex(datePattern, 'Use YYYY-MM-DD.').refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Date is not valid.');

export const dailyReportInputSchema = z.object({ date: dateKeySchema }).strict();

export const weeklySummaryToolInputSchema = z.object({
  startDate: dateKeySchema.optional(),
  endDate: dateKeySchema.optional()
}).strict();

export const weeklySummaryInputSchema = weeklySummaryToolInputSchema.superRefine((value, context) => {
  if ((value.startDate && !value.endDate) || (!value.startDate && value.endDate)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Provide both startDate and endDate, or omit both.' });
    return;
  }
  if (value.startDate && value.endDate) {
    if (value.startDate > value.endDate) context.addIssue({ code: z.ZodIssueCode.custom, message: 'startDate must not be after endDate.' });
    const days = Math.floor((Date.parse(`${value.endDate}T00:00:00Z`) - Date.parse(`${value.startDate}T00:00:00Z`)) / 86400000) + 1;
    if (days > 365) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Date range cannot exceed 365 days.' });
  }
});

export const missedTasksInputSchema = z.object({
  days: z.number().int().min(1).max(365).default(7),
  limit: z.number().int().min(1).max(100).default(20)
}).strict();

export const goalProgressInputSchema = z.object({
  category: z.enum(GOAL_PRIORITIES),
  days: z.number().int().min(1).max(365).default(30)
}).strict();

export const priorityReviewInputSchema = z.object({
  period: z.enum(['day', 'week', 'month']),
  date: dateKeySchema.optional()
}).strict();

export const noInputSchema = z.object({}).strict();
