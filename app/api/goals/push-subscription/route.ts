import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const ownerKey = 'default';
const pushSubscriptionId = '__push_subscription__';
const targetStateScope = '__meta__';

export const dynamic = 'force-dynamic';

function isPushSubscription(value: unknown) {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<{ endpoint: unknown; keys: unknown }>;
  const keys = candidate.keys as Partial<{ p256dh: unknown; auth: unknown }> | undefined;
  return typeof candidate.endpoint === 'string' && Boolean(candidate.endpoint) && typeof keys?.p256dh === 'string' && typeof keys.auth === 'string';
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { subscription?: unknown };
    if (!isPushSubscription(body.subscription)) {
      return NextResponse.json({ error: 'Invalid push subscription.' }, { status: 400 });
    }

    await prisma.goalTask.upsert({
      where: { id: pushSubscriptionId },
      create: {
        id: pushSubscriptionId,
        ownerKey,
        scope: targetStateScope,
        text: 'Push alarm subscription',
        note: JSON.stringify(body.subscription),
        priority: 'other',
        done: false,
        position: 3
      },
      update: {
        note: JSON.stringify(body.subscription),
        updatedAt: new Date()
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to save push subscription', error);
    return NextResponse.json({ error: 'Could not save alarm subscription.' }, { status: 503 });
  }
}
