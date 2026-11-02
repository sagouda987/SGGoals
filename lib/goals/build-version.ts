import { NextRequest, NextResponse } from 'next/server';

export const BUILD_HEADER = 'x-sg-build';
export const STALE_BUILD_STATUS = 426;

/** Server-side build id: the deployed git commit on Vercel, 'dev' locally. */
export function serverBuildId() {
  return process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_BUILD_ID || 'dev';
}

/**
 * Returns a 426 response when the write comes from a browser tab running an older build.
 * Non-browser callers (scripts, MCP) without the header are allowed.
 */
export function rejectStaleBuild(req: NextRequest) {
  const current = serverBuildId();
  if (current === 'dev') return null;
  const clientBuild = req.headers.get(BUILD_HEADER);
  const fromBrowser = Boolean(req.headers.get('sec-fetch-mode'));
  if (clientBuild ? clientBuild === current : !fromBrowser) return null;
  return NextResponse.json(
    { error: 'SG Goals was updated. Reloading to the latest version.', code: 'STALE_BUILD', currentBuild: current },
    { status: STALE_BUILD_STATUS, headers: { 'Cache-Control': 'no-store' } }
  );
}
