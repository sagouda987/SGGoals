import { NextResponse } from 'next/server';
import { getLatestDailyReview } from '@/lib/ai/daily-review-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    return NextResponse.json({ review: await getLatestDailyReview() });
  } catch (error) {
    console.error('Failed to load daily review', error);
    return NextResponse.json({ error: 'Unable to load the daily review.' }, { status: 503 });
  }
}
