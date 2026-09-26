import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const ownerKey = 'default';
const taskScopes = ['today', 'weekly', 'weekend', 'monthly', 'yearly', 'tomorrow'];
const planningIds = ['__target_state__', '__weekly_plan__', '__yearly_notes__'];

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const start = new Date(req.nextUrl.searchParams.get('start') || '');
    const end = new Date(req.nextUrl.searchParams.get('end') || '');
    const requestedLimit = Number(req.nextUrl.searchParams.get('limit') || 5000);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
      return NextResponse.json({ error: 'A valid review date range is required.' }, { status: 400 });
    }
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 10000) {
      return NextResponse.json({ error: 'Review activity limit must be between 1 and 10000.' }, { status: 400 });
    }

    const [tasks, activities] = await Promise.all([
      prisma.goalTask.findMany({
        where: {
          ownerKey,
          OR: [{ scope: { in: taskScopes } }, { id: { in: planningIds } }]
        },
        select: {
          id: true,
          scope: true,
          text: true,
          priority: true,
          block: true,
          done: true,
          note: true,
          investedMinutes: true
        },
        orderBy: [{ scope: 'asc' }, { position: 'asc' }]
      }),
      prisma.goalActivity.findMany({
        where: { ownerKey, createdAt: { gte: start, lt: end } },
        select: {
          id: true,
          scope: true,
          priority: true,
          taskText: true,
          kind: true,
          reason: true,
          note: true,
          minutes: true,
          startedAt: true,
          completedAt: true,
          createdAt: true
        },
        orderBy: { createdAt: 'asc' },
        take: requestedLimit
      })
    ]);

    return NextResponse.json({ tasks, activities });
  } catch (error) {
    console.error('Failed to load MCP review context', error);
    return NextResponse.json({ error: 'Could not load review context.' }, { status: 503 });
  }
}
