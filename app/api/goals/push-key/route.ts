import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY || '';
  return NextResponse.json({ publicKey, enabled: Boolean(publicKey) });
}
