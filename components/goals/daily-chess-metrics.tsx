'use client';
import { useEffect, useState } from 'react';
type Metrics = { puzzles: number; steps: number; blitzTarget: number };
const defaults: Metrics = { puzzles: 0, steps: 0, blitzTarget: 1621 };
function useMetrics(dateKey: string) {
  const [data, setData] = useState<Metrics>(defaults);
  const [status, setStatus] = useState('Loading…');
  const [saving, setSaving] = useState(false);
  const key = `sg-daily-metrics:${dateKey}`;
  useEffect(() => {
    let active = true;
    try { setData(JSON.parse(localStorage.getItem(key) || 'null') || defaults); } catch { setData(defaults); }
    fetch(`/api/goals/daily-metrics?date=${dateKey}`).then(r => { if (!r.ok) throw Error(); return r.json(); }).then(d => {
      if (active) {
        const pending = JSON.parse(localStorage.getItem(`${key}:pending`) || '{}');
        const merged = { ...d, ...pending };
        setData(merged); localStorage.setItem(key, JSON.stringify(merged));
        setStatus(Object.keys(pending).length ? 'Unsynced browser values retained · edit/re-enter to retry' : 'Synced');
      }
    }).catch(() => { if (active) setStatus('Cloud unavailable · browser backup'); });
    return () => { active = false; };
  }, [dateKey, key]);
  async function save(field: keyof Metrics, value: number, increment = false) {
    if (saving || !Number.isFinite(value)) return;
    setSaving(true);
    const cached = JSON.parse(localStorage.getItem(key) || 'null') || data;
    const next = { ...cached, [field]: increment ? cached[field] + value : value };
    const pending = JSON.parse(localStorage.getItem(`${key}:pending`) || '{}');
    const hadPending = field in pending;
    pending[field] = next[field]; localStorage.setItem(`${key}:pending`, JSON.stringify(pending));
    setData(next); localStorage.setItem(key, JSON.stringify(next)); setStatus('Saving…');
    try {
      const r = await fetch('/api/goals/daily-metrics', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-sg-build': process.env.NEXT_PUBLIC_BUILD_ID || 'dev' }, body: JSON.stringify({ date: dateKey, field, value: hadPending ? next[field] : value, increment: increment && !hadPending }) });
      if (!r.ok) throw Error();
      const result = await r.json();
      delete pending[field]; localStorage.setItem(`${key}:pending`, JSON.stringify(pending));
      const merged = { ...result, ...pending }; setData(merged); localStorage.setItem(key, JSON.stringify(merged));
      setStatus(Object.keys(pending).length ? 'Other browser values still unsynced · re-enter to retry' : 'Synced');
    } catch { setStatus('Save failed · browser backup only. Retry your value when online.'); }
    finally { setSaving(false); }
  }
  return { data, status, saving, save };
}
const inputStyle = 'w-24 rounded border border-[#52527a] bg-[#0f0f1d] p-1 text-[#e8e8f5]';
export function DailySteps({ dateKey, done, onComplete }: { dateKey: string; done: boolean; onComplete: () => void }) {
  const { data, status, saving, save } = useMetrics(dateKey);
  useEffect(() => { if (data.steps >= 10000 && !done) onComplete(); }, [data.steps, done, onComplete]);
  return <div className="rounded-lg border border-[#24243e] bg-[#13132a] p-3 text-xs text-[#e8e8f5]">
    <h3 className="font-bold">Gym · daily steps</h3>
    <label className="mt-2 block">Steps <input aria-label="Daily steps" className={inputStyle} type="number" min="0" max="200000" disabled={saving} key={`${dateKey}-${data.steps}`} defaultValue={data.steps} onBlur={e => void save('steps', Math.max(0, Math.round(Number(e.target.value))))} /> / 10,000</label>
    <progress className="mt-3 w-full" value={data.steps} max={10000} />
    <p>{data.steps >= 10000 ? 'Target complete ✓' : `${Math.max(0, 10000 - data.steps).toLocaleString()} steps remaining`}</p>
    <button className="mt-2 rounded border px-3 py-1 disabled:opacity-40" disabled={done || data.steps < 10000} onClick={onComplete}>{done ? 'Task complete' : 'Complete task'}</button><p className="mt-2 text-[10px] text-[#8b8bb3]">{status} · no time target</p>
  </div>;
}
type Chess = { blitz: number | null; rapid: number | null; tactics: number | null; puzzleRush: number | null; games: {url: string; result: string; timeClass: string}[]; results: {wins: number; draws: number; losses: number} };
export function DailyChessMetrics({ dateKey, studyMinutes, done, onComplete }: { dateKey: string; studyMinutes: number; done: boolean; onComplete: () => void }) {
  const { data, status, saving, save } = useMetrics(dateKey);
  const [chess, setChess] = useState<Chess | null>(null);
  const [error, setError] = useState('');
  const refresh = () => fetch('/api/chess').then(async r => { const d = await r.json(); if (!r.ok) throw Error(d.error); setChess(d); setError(''); }).catch(e => setError(e.message));
  useEffect(() => { void refresh(); const id = setInterval(refresh, 60000); return () => clearInterval(id); }, []);
  const weekend = [0, 6].includes(new Date(`${dateKey}T12:00:00Z`).getUTCDay());
  const complete = data.puzzles >= 30 && studyMinutes >= (weekend ? 420 : 300);
  useEffect(() => { if (complete && !done) onComplete(); }, [complete, done, onComplete]);
  return <div className="mt-2 space-y-2 text-xs font-normal text-[#e8e8f5]">
    <p className="font-bold">Blitz {chess?.blitz ?? '—'} / daily target <input aria-label="Daily blitz rating target" className={inputStyle} type="number" min="100" max="4000" disabled={saving} key={`${dateKey}-${data.blitzTarget}`} defaultValue={data.blitzTarget} onBlur={e => void save('blitzTarget', Math.round(Number(e.target.value)))} /></p>
    <p>Rapid {chess?.rapid ?? '—'} · secondary</p>
    <p>Puzzles (manual) {data.puzzles} / 30</p>
    {[1, 5].map(n => <button key={n} disabled={saving} className="mr-2 rounded border border-[#52527a] px-3 py-1 disabled:opacity-40" onClick={() => void save('puzzles', n, true)}>+{n}</button>)}
    <label className="block">Correct count <input aria-label="Puzzle count" className={inputStyle} type="number" min="0" disabled={saving} key={`${dateKey}-${data.puzzles}`} defaultValue={data.puzzles} onBlur={e => void save('puzzles', Math.max(0, Math.round(Number(e.target.value))))} /></label>
    <p>{complete ? 'Chess complete ✓' : 'Complete 30 puzzles + study timer target below'} · rating is aspirational</p>
    <p>Today (IST): {chess?.games.length ?? '—'} games · {chess ? `${chess.results.wins}W ${chess.results.draws}D ${chess.results.losses}L` : 'Loading'}</p>
    <p>Tactics best {chess?.tactics ?? 'not available'} · Puzzle Rush best {chess?.puzzleRush ?? 'not available'}</p>
    {chess?.games.slice(-5).map(g => <a className="mr-2 underline" key={g.url} href={g.url} target="_blank" rel="noreferrer">{g.timeClass}: {g.result}</a>)}
    <button className="block underline" onClick={() => void refresh()}>Refresh Chess.com · santoshgouda</button>
    {error ? <p className="text-[#ff6b6b]">{error} · last successful ratings retained</p> : null}
    <p className="text-[10px] text-[#8b8bb3]">{status}</p>
  </div>;
}
