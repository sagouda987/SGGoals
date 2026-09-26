import { NextResponse } from 'next/server';
import { readConnection, recordConnection } from '@/lib/mcp/connection-store';
import { connectionStatus } from '@/lib/mcp/connection-status';
import { verifyConnectionReport } from '@/lib/mcp/connection-auth';

export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const body = await request.text();
  if (body.length > 1024) return NextResponse.json({ error: 'Report too large.' }, { status: 413 });
  const patch = verifyConnectionReport(body, request.headers.get('x-sg-signature') || '');
  if (!patch) return NextResponse.json({ error: 'Invalid or expired connector report.' }, { status: 401 });
  try {
    await recordConnection(patch);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Unable to save connector status.' }, { status: 503 });
  }
}
export async function GET() {
  try {
    return NextResponse.json(connectionStatus(await readConnection()), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ state: 'Offline', message: 'Unable to check connection status. Try again shortly.', lastSuccessfulReviewAt: null }, { status: 503 });
  }
}
