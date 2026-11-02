'use client';

import { useEffect } from 'react';

const CLIENT_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || 'dev';
const POLL_MS = 3 * 60 * 1000;
let installed = false;
let reloading = false;

function reloadToLatest() {
  if (reloading) return;
  reloading = true;
  window.location.reload();
}

/**
 * Tags SG Goals writes with this tab's build id, reloads when the server rejects an old build,
 * and reloads proactively when /api/version reports a newer deployment.
 */
export function useBuildGuard() {
  useEffect(() => {
    if (CLIENT_BUILD_ID === 'dev') return;
    if (!installed) {
      installed = true;
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
        const isGoalsWrite = method !== 'GET' && /(^|\/\/[^/]+)\/api\/goals(\/|$|\?)/.test(url);
        if (!isGoalsWrite) return originalFetch(input, init);
        if (reloading) return new Response(JSON.stringify({ error: 'Reloading' }), { status: 426 });
        const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
        headers.set('x-sg-build', CLIENT_BUILD_ID);
        const response = await originalFetch(input, { ...init, headers });
        if (response.status === 426) reloadToLatest();
        return response;
      };
    }

    let cancelled = false;
    const check = async () => {
      if (cancelled || reloading) return;
      try {
        const response = await fetch('/api/version', { cache: 'no-store' });
        if (!response.ok) return;
        const data = (await response.json()) as { buildId?: string };
        if (data.buildId && data.buildId !== 'dev' && data.buildId !== CLIENT_BUILD_ID) reloadToLatest();
      } catch {
        // offline: try again later
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    void check();
    const interval = window.setInterval(check, POLL_MS);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}
