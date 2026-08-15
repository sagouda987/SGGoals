import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const ownerKey = 'default';
const scopes = ['today', 'weekly', 'weekend', 'monthly', 'yearly', 'tomorrow'] as const;
const priorities = ['health', 'career', 'communication', 'looks', 'other'] as const;
const activityMetaNotePattern = /\n?\[sg-activity-meta:([A-Za-z0-9+/=]+)\]$/;

export const dynamic = 'force-dynamic';

type GoalActivityInput = {
  id: string;
  scope: string;
  priority: string;
  taskText: string;
  kind: string;
  reason?: string;
  note?: string;
  points?: number;
  minutes?: number;
  startedAt?: string;
  completedAt?: string;
  createdAt?: string;
};

type GoalActivityRow = {
  id: string;
  scope: string;
  priority: string;
  taskText: string;
  kind: string;
  reason: string | null;
  note: string | null;
  minutes: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
};

function isActivity(input: unknown): input is GoalActivityInput {
  if (!input || typeof input !== 'object') return false;
  const a = input as Partial<GoalActivityInput>;
  return (
    typeof a.id === 'string' &&
    typeof a.scope === 'string' &&
    typeof a.priority === 'string' &&
    typeof a.taskText === 'string' &&
    typeof a.kind === 'string'
  );
}

function normalizeActivityPoints(value: unknown) {
  const points = Number(value);
  if (!Number.isFinite(points) || points <= 0) return undefined;
  return Math.min(100, Math.max(1, Math.round(points)));
}

function splitActivityNote(note: string | null | undefined) {
  if (!note) return { note: undefined, points: undefined };
  const match = note.match(activityMetaNotePattern);
  if (!match) return { note, points: undefined };
  const visibleNote = note.replace(activityMetaNotePattern, '').trim() || undefined;
  try {
    const parsed = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8')) as Partial<{ points: unknown }>;
    return { note: visibleNote, points: normalizeActivityPoints(parsed.points) };
  } catch {
    return { note: visibleNote, points: undefined };
  }
}

function composeActivityNote(note: string | undefined, points: number | undefined) {
  let storedNote = note?.trim() || '';
  const normalizedPoints = normalizeActivityPoints(points);
  if (normalizedPoints !== undefined) {
    const payload = Buffer.from(JSON.stringify({ points: normalizedPoints }), 'utf8').toString('base64');
    storedNote = `${storedNote}\n[sg-activity-meta:${payload}]`.trim();
  }
  return storedNote || null;
}

function toActivity(row: GoalActivityRow): GoalActivityInput {
  const noteInfo = splitActivityNote(row.note);
  return {
    id: row.id,
    scope: row.scope,
    priority: row.priority,
    taskText: row.taskText,
    kind: row.kind,
    reason: row.reason || undefined,
    note: noteInfo.note,
    points: noteInfo.points,
    minutes: row.minutes ?? undefined,
    startedAt: row.startedAt ? row.startedAt.toISOString() : undefined,
    completedAt: row.completedAt ? row.completedAt.toISOString() : undefined,
    createdAt: row.createdAt.toISOString()
  };
}

export async function GET() {
  try {
    const rows = await prisma.goalActivity.findMany({
      where: { ownerKey },
      orderBy: { createdAt: 'desc' },
      take: 1000
    });
    return NextResponse.json({ activities: rows.map(toActivity) });
  } catch (error) {
    console.error('Failed to load goal activities', error);
    return NextResponse.json({ error: 'Database is not ready yet.' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { activity?: unknown };
    if (!isActivity(body.activity)) {
      return NextResponse.json({ error: 'Invalid activity payload.' }, { status: 400 });
    }

    const activity = body.activity;
    if (!scopes.includes(activity.scope as (typeof scopes)[number])) {
      return NextResponse.json({ error: 'Invalid scope.' }, { status: 400 });
    }
    if (!priorities.includes(activity.priority as (typeof priorities)[number])) {
      return NextResponse.json({ error: 'Invalid priority.' }, { status: 400 });
    }

    await prisma.goalActivity.create({
      data: {
        id: activity.id,
        ownerKey,
        scope: activity.scope,
        priority: activity.priority,
        taskText: activity.taskText,
        kind: activity.kind,
        reason: activity.reason || null,
        note: composeActivityNote(activity.note, activity.points),
        minutes: typeof activity.minutes === 'number' ? activity.minutes : null,
        startedAt: activity.startedAt ? new Date(activity.startedAt) : null,
        completedAt: activity.completedAt ? new Date(activity.completedAt) : null
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to save goal activity', error);
    return NextResponse.json({ error: 'Could not save activity.' }, { status: 503 });
  }
}
