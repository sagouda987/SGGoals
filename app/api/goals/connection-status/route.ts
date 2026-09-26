import { NextResponse } from 'next/server';
import { readConnection } from '@/lib/mcp/connection-store';
import { connectionStatus } from '@/lib/mcp/connection-status';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    return NextResponse.json(connectionStatus(await readConnection()), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ state: 'Offline', message: 'Unable to check connection status. Try again shortly.', lastSuccessfulReviewAt: null }, { status: 503 });
  }
}
