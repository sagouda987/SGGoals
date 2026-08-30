import { NextRequest, NextResponse } from 'next/server';
import webPush, { PushSubscription } from 'web-push';
import { prisma } from '@/lib/prisma';

type TargetStateInput = {
  taskIds: string[];
  mode?: 'timer' | 'stopwatch';
  endAt: string;
  running: boolean;
  updatedAt: string;
};

const ownerKey = 'default';
const targetStateId = '__target_state__';
const pushSubscriptionId = '__push_subscription__';
const alarmStateId = '__alarm_state__';
const targetStateScope = '__meta__';

export const dynamic = 'force-dynamic';

function isTargetState(value: unknown): value is TargetStateInput {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TargetStateInput>;
  return (
    Array.isArray(candidate.taskIds) &&
    candidate.taskIds.every((taskId) => typeof taskId === 'string') &&
    (candidate.mode === undefined || candidate.mode === 'timer' || candidate.mode === 'stopwatch') &&
    typeof candidate.endAt === 'string' &&
    typeof candidate.running === 'boolean' &&
    typeof candidate.updatedAt === 'string'
  );
}

function parseJson(value: string | null | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function isPushSubscription(value: unknown): value is PushSubscription {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PushSubscription>;
  return typeof candidate.endpoint === 'string' && Boolean(candidate.endpoint) && typeof candidate.keys?.p256dh === 'string' && typeof candidate.keys.auth === 'string';
}

function envReady() {
  return Boolean(process.env.WEB_PUSH_PUBLIC_KEY && process.env.WEB_PUSH_PRIVATE_KEY && process.env.WEB_PUSH_SUBJECT);
}

function authorize(req: NextRequest) {
  const secret = process.env.ALARM_CRON_SECRET;
  if (!secret) return true;
  return req.nextUrl.searchParams.get('secret') === secret || req.headers.get('authorization') === `Bearer ${secret}`;
}

async function checkAlarm(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  if (!envReady()) {
    return NextResponse.json({ ok: false, reason: 'Web Push environment variables are missing.' }, { status: 200 });
  }

  webPush.setVapidDetails(process.env.WEB_PUSH_SUBJECT!, process.env.WEB_PUSH_PUBLIC_KEY!, process.env.WEB_PUSH_PRIVATE_KEY!);

  const [targetRow, subscriptionRow, alarmRow] = await Promise.all([
    prisma.goalTask.findUnique({ where: { id: targetStateId } }),
    prisma.goalTask.findUnique({ where: { id: pushSubscriptionId } }),
    prisma.goalTask.findUnique({ where: { id: alarmStateId } })
  ]);

  const targetState = parseJson(targetRow?.note);
  const subscription = parseJson(subscriptionRow?.note);
  if (!isTargetState(targetState)) return NextResponse.json({ ok: true, sent: false, reason: 'No active timer state.' });
  if (!isPushSubscription(subscription)) return NextResponse.json({ ok: true, sent: false, reason: 'No push subscription.' });
  if (targetState.mode === 'stopwatch' || !targetState.running || !targetState.endAt || new Date(targetState.endAt).getTime() > Date.now()) {
    return NextResponse.json({ ok: true, sent: false, reason: 'Timer is not due.' });
  }

  const alarmKey = `${targetState.updatedAt}|${targetState.endAt}|${targetState.taskIds.join(',')}`;
  const alarmState = parseJson(alarmRow?.note) as { alarmKey?: string } | null;
  if (alarmState?.alarmKey === alarmKey) {
    return NextResponse.json({ ok: true, sent: false, reason: 'Alarm already sent.' });
  }

  const tasks = targetState.taskIds.length
    ? await prisma.goalTask.findMany({
        where: { ownerKey, id: { in: targetState.taskIds } },
        select: { text: true }
      })
    : [];
  const taskText = tasks.map((task) => task.text).join(', ') || 'your selected target';

  await webPush.sendNotification(
    subscription,
    JSON.stringify({
      title: 'SG Goals alarm',
      body: `Time is up for: ${taskText}`,
      tag: 'sg-goals-target-complete'
    })
  );

  await prisma.goalTask.upsert({
    where: { id: alarmStateId },
    create: {
      id: alarmStateId,
      ownerKey,
      scope: targetStateScope,
      text: 'Push alarm state',
      note: JSON.stringify({ alarmKey, sentAt: new Date().toISOString() }),
      priority: 'other',
      done: false,
      position: 4
    },
    update: {
      note: JSON.stringify({ alarmKey, sentAt: new Date().toISOString() }),
      updatedAt: new Date()
    }
  });

  return NextResponse.json({ ok: true, sent: true });
}

export async function GET(req: NextRequest) {
  try {
    return await checkAlarm(req);
  } catch (error) {
    console.error('Alarm check failed', error);
    return NextResponse.json({ error: 'Alarm check failed.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
