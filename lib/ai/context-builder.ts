import 'server-only';

import { prisma } from '@/lib/prisma';
import { buildAIContextFromRecords } from '@/lib/ai/context';

export type { AIContext, AIContextActivity, AIContextTask, ContextActivityRecord, ContextTaskRecord } from '@/lib/ai/context';
export { buildAIContextFromRecords } from '@/lib/ai/context';

export async function buildAIContext(input: { availableMinutes: number; now?: Date }) {
  const now = input.now ?? new Date();
  const historyStart = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);
  const [tasks, activities] = await Promise.all([
    prisma.goalTask.findMany({ where: { ownerKey: 'default', scope: { not: '__connection__' } }, orderBy: [{ scope: 'asc' }, { position: 'asc' }] }),
    prisma.goalActivity.findMany({
      where: { ownerKey: 'default', createdAt: { gte: historyStart } },
      orderBy: { createdAt: 'desc' },
      take: 300
    })
  ]);
  return buildAIContextFromRecords({ tasks, activities, availableMinutes: input.availableMinutes, now });
}
