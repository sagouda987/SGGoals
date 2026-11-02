import { NextResponse } from 'next/server';
import { serverBuildId } from '@/lib/goals/build-version';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ buildId: serverBuildId() }, { headers: { 'Cache-Control': 'no-store' } });
}
