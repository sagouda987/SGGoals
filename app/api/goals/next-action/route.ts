import { NextResponse } from 'next/server';
import { buildAIContext } from '@/lib/ai/context-builder';
import { getNextBestAction } from '@/lib/ai/next-best-action';
import { nextActionRequestSchema } from '@/lib/ai/schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = nextActionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Available time must be between 5 and 480 minutes.' }, { status: 400 });
  }

  try {
    const context = await buildAIContext({ availableMinutes: parsed.data.availableMinutes });
    const recommendation = await getNextBestAction({ context, provider: null });
    return NextResponse.json({ recommendation, generatedAt: context.generatedAt });
  } catch (error) {
    console.error('Failed to build next best action', error);
    return NextResponse.json({ error: 'Unable to analyze SG Goals right now.' }, { status: 500 });
  }
}
