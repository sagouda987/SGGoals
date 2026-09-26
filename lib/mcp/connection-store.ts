import { prisma } from '@/lib/prisma';
import type { ConnectionRecord } from './connection-status';

const id = '__mcp_connection__';
export async function readConnection(): Promise<ConnectionRecord> {
  const row = await prisma.goalTask.findUnique({ where: { id }, select: { note: true } });
  try { return JSON.parse(row?.note || '{}') as ConnectionRecord; } catch { return {}; }
}

// Operational metadata only; no task, activity, or score records are changed.
export async function recordConnection(patch: ConnectionRecord) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
    const existing = await tx.goalTask.findUnique({ where: { id }, select: { note: true } });
    const value = { ...JSON.parse(existing?.note || '{}'), ...patch };
    // Late/replayed telemetry must not move a success or heartbeat backwards.
    const previous = JSON.parse(existing?.note || '{}');
    for (const field of ['heartbeatAt', 'lastSuccessfulReviewAt', 'lastReviewErrorAt'] as const) {
      if (Date.parse(previous[field]) > Date.parse(value[field])) value[field] = previous[field];
    }
    await tx.goalTask.upsert({ where: { id },
      create: { id, ownerKey: 'default', scope: '__connection__', text: 'MCP connection status', priority: 'other', position: 0, note: JSON.stringify(value) },
      update: { note: JSON.stringify(value) }
    });
  });
}
