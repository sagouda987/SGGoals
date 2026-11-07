import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rejectStaleBuild } from '@/lib/goals/build-version';
export const dynamic = 'force-dynamic';
const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date));
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date') || '';
  if (!validDate(date)) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  try {
    const row = await prisma.goalTask.findUnique({ where: { id: `__daily_metrics_${date}` } });
    return NextResponse.json(row?.note ? JSON.parse(row.note) : { puzzles: 0, steps: 0, blitzTarget: 1621 });
  } catch { return NextResponse.json({ error: 'Cloud unavailable; browser backup retained' }, { status: 503 }); }
}
export async function PATCH(req: NextRequest) {
  const stale = rejectStaleBuild(req); if (stale) return stale;
  const body = await req.json();
  const { date, field, value, increment } = body;
  if (typeof date !== 'string' || !validDate(date) || !['puzzles', 'steps', 'blitzTarget'].includes(field) ||
      !Number.isInteger(value) || value < 0 || value > 200000 || (field === 'blitzTarget' && (value < 100 || value > 4000)) ||
      (increment && (field !== 'puzzles' || ![1, 5].includes(value)))) return NextResponse.json({ error: 'Invalid metrics' }, { status: 400 });
  try {
    const result = await prisma.$transaction(async tx => {
      const id = `__daily_metrics_${date}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
      const row = await tx.goalTask.findUnique({ where: { id } });
      const data = row?.note ? JSON.parse(row.note) : { puzzles: 0, steps: 0, blitzTarget: 1621 };
      data[field] = increment ? (data[field] || 0) + value : value;
      await tx.goalTask.upsert({ where: { id }, create: { id, ownerKey: 'default', scope: '__meta__', text: 'Daily chess and steps', priority: 'other', position: 0, note: JSON.stringify(data) }, update: { note: JSON.stringify(data) } });
      return data;
    });
    return NextResponse.json(result);
  } catch { return NextResponse.json({ error: 'Cloud save failed; browser backup retained' }, { status: 503 }); }
}
