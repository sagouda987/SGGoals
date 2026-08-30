'use client';

import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

export default function GoalsError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('SG Goals client error', error);
  }, [error]);

  async function recoverApp() {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.update()));
    }
    window.location.reload();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#07070f] px-5 text-[#e8e8f5]">
      <section className="w-full max-w-md rounded-lg border border-[#1a1a30] bg-[#0f0f1d] p-6 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#ff6b6b]">SG Goals needs a refresh</p>
        <h1 className="mt-3 text-xl font-bold">Your saved tasks are safe.</h1>
        <p className="mt-2 text-sm leading-6 text-[#8b8bb3]">The installed app loaded an outdated screen. Refresh it to use the latest version.</p>
        <button
          type="button"
          onClick={() => void recoverApp()}
          className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#00d97e] px-4 text-sm font-bold text-black"
        >
          <RefreshCw className="h-4 w-4" />
          Reload SG Goals
        </button>
      </section>
    </main>
  );
}
