import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createWakeLog, inputTimeMinutes, type WakeLog } from '@/lib/wake-timer';

const OWNER_KEY = 'default';
const WAKE_SCOPE = '__wake_time__';
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const wakeRequestSchema = z.object({
  dateKey: dateSchema,
  wakeTime: z.string().regex(/^([01]\d|2[0-2]):[0-5]\d$/)
}).strict();

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function idForDate(dateKey: string) {
  return `__wake_time__:${dateKey}`;
}

function parseWakeLog(note: string | null): WakeLog | null {
  if (!note) return null;
  try {
    const value = JSON.parse(note) as Partial<WakeLog>;
    return dateSchema.safeParse(value.dateKey).success && typeof value.wakeTime === 'string' && typeof value.wakeAt === 'string' &&
      typeof value.previousBedtimeAt === 'string' && typeof value.bedtimeAt === 'string' && typeof value.loggedAt === 'string'
      ? value as WakeLog : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const parsedDate = dateSchema.safeParse(request.nextUrl.searchParams.get('dateKey'));
  if (!parsedDate.success) return NextResponse.json({ error: 'A valid date is required.' }, { status: 400 });
  try {
    const row = await prisma.goalTask.findUnique({ where: { id: idForDate(parsedDate.data) }, select: { note: true } });
    return NextResponse.json({ wakeLog: parseWakeLog(row?.note ?? null) });
  } catch (error) {
    console.error('Failed to load wake time', error);
    return NextResponse.json({ error: 'Unable to load wake time.' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const parsed = wakeRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || inputTimeMinutes(parsed.data?.wakeTime ?? '23:00') >= 23 * 60) {
    return NextResponse.json({ error: 'Enter a wake-up time before 11:00 PM.' }, { status: 400 });
  }
  const wakeLog = createWakeLog(parsed.data);
  if (new Date(wakeLog.wakeAt).getTime() > Date.now() + 5 * 60 * 1000) {
    return NextResponse.json({ error: 'Wake-up time cannot be in the future.' }, { status: 400 });
  }
  try {
    await prisma.goalTask.upsert({
      where: { id: idForDate(wakeLog.dateKey) },
      create: {
        id: idForDate(wakeLog.dateKey), ownerKey: OWNER_KEY, scope: WAKE_SCOPE,
        text: `Wake time ${wakeLog.dateKey}`, note: JSON.stringify(wakeLog), priority: 'health', done: true, position: 0,
        completedAt: new Date(wakeLog.wakeAt)
      },
      update: { note: JSON.stringify(wakeLog), completedAt: new Date(wakeLog.wakeAt), updatedAt: new Date() }
    });
    return NextResponse.json({ wakeLog });
  } catch (error) {
    console.error('Failed to save wake time', error);
    return NextResponse.json({ error: 'Unable to save wake time.' }, { status: 503 });
  }
}
