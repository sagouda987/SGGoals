'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

type Status = { state: 'Connected' | 'Offline' | 'Retrying'; message: string; lastSuccessfulReviewAt: string | null };
export function ReviewConnectionStatus() {
  const [status, setStatus] = useState<Status>({ state: 'Retrying', message: 'Checking connector…', lastSuccessfulReviewAt: null });
  const busy = useRef(false);
  const check = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setStatus(current => ({ ...current, state: 'Retrying' }));
    try {
      const response = await fetch('/api/goals/connection-status', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Status unavailable');
      setStatus(await response.json() as Status);
    } catch {
      setStatus(current => ({ ...current, state: 'Offline', message: 'Status check failed. Check your internet connection, then retry.' }));
    } finally { busy.current = false; }
  }, []);
  useEffect(() => {
    void check();
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void check(); }, 30000);
    window.addEventListener('focus', check);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', check); };
  }, [check]);
  return <div className="my-3 rounded-lg border border-[#4f8ef740] p-3 text-xs" role="status" aria-live="polite">
    <div className="flex items-center justify-between gap-3"><strong>ChatGPT connection: {status.state}</strong><button type="button" onClick={() => void check()} className="underline">Check again</button></div>
    <p className="mt-1 text-[#a8a8c7]">{status.message}</p>
    <p className="mt-1 text-[#a8a8c7]">Last successful review data fetch: {status.lastSuccessfulReviewAt ? new Date(status.lastSuccessfulReviewAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST' : 'None recorded yet'}. This does not confirm ChatGPT finished its answer.</p>
  </div>;
}
