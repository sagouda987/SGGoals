'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, Copy, Download, Edit3, RotateCcw, Save, Trash2, Upload } from 'lucide-react';

type Scope = 'today' | 'weekly' | 'monthly' | 'yearly';
type Priority = 'health' | 'career' | 'communication' | 'looks';
type Block = 'morning' | 'afternoon' | 'evening';

type GoalTask = {
  id: string;
  text: string;
  note?: string;
  priority: Priority;
  block?: Block;
  done: boolean;
  updatedAt: string;
};

type GoalsStore = Record<Scope, GoalTask[]>;

const STORAGE_KEY = 'sg-goals-store-v1';
const SAVE_DEBOUNCE_MS = 600;

const priorities: Record<Priority, { label: string; color: string; soft: string }> = {
  health: { label: 'Health', color: '#00d97e', soft: 'rgba(0,217,126,.12)' },
  career: { label: 'Career', color: '#4f8ef7', soft: 'rgba(79,142,247,.12)' },
  communication: { label: 'Communication', color: '#f7a04f', soft: 'rgba(247,160,79,.12)' },
  looks: { label: 'Looks', color: '#c084fc', soft: 'rgba(192,132,252,.12)' }
};

const blocks: Record<Block, { label: string; time: string }> = {
  morning: { label: 'Morning', time: '6:00 AM - 12:00 PM' },
  afternoon: { label: 'Afternoon', time: '12:00 PM - 6:00 PM' },
  evening: { label: 'Evening', time: '6:00 PM - 12:00 AM' }
};

const starterStore: GoalsStore = {
  today: [
    makeTask('Pray', 'Morning ritual', 'health', 'morning'),
    makeTask('Gym workout', '45 min', 'health', 'morning'),
    makeTask('Office work - zero escalation', 'Focus block', 'career', 'afternoon'),
    makeTask('Study DSA / Databricks / Spark', '1 hour minimum', 'career', 'evening'),
    makeTask('Communication practice', 'Speak or read English', 'communication', 'evening'),
    makeTask('Skin care - night', 'Routine', 'looks', 'evening')
  ],
  weekly: [
    makeTask('Gym minimum 4 times this week', undefined, 'health'),
    makeTask('Study Databricks/Spark - 5 hours total', undefined, 'career'),
    makeTask('Communication practice daily - 7/7', undefined, 'communication'),
    makeTask('Skin care routine daily - 7/7', undefined, 'looks')
  ],
  monthly: [
    makeTask('Reach weight 68 kg', undefined, 'health'),
    makeTask('Complete Databricks and Spark course', undefined, 'career'),
    makeTask('Daily communication practice - 30 days', undefined, 'communication'),
    makeTask('Consistent skin care - 28+ days', undefined, 'looks')
  ],
  yearly: [
    makeTask('Have gym body - visible muscle definition', undefined, 'health'),
    makeTask('Change job - 40 LPA package', undefined, 'career'),
    makeTask('Improve personality and communication significantly', undefined, 'communication'),
    makeTask('Learn Kannada fluently', undefined, 'looks')
  ]
};

function makeTask(text: string, note: string | undefined, priority: Priority, block?: Block): GoalTask {
  return {
    id: cryptoSafeId(),
    text,
    note,
    priority,
    block,
    done: false,
    updatedAt: new Date().toISOString()
  };
}

function cryptoSafeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadStore(): GoalsStore {
  if (typeof window === 'undefined') return starterStore;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return starterStore;
  try {
    const parsed = JSON.parse(raw) as Partial<GoalsStore>;
    return {
      today: Array.isArray(parsed.today) ? parsed.today : starterStore.today,
      weekly: Array.isArray(parsed.weekly) ? parsed.weekly : starterStore.weekly,
      monthly: Array.isArray(parsed.monthly) ? parsed.monthly : starterStore.monthly,
      yearly: Array.isArray(parsed.yearly) ? parsed.yearly : starterStore.yearly
    };
  } catch {
    return starterStore;
  }
}

export function SgGoalsApp() {
  const [store, setStore] = useState<GoalsStore>(starterStore);
  const [ready, setReady] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const [syncState, setSyncState] = useState<'loading' | 'local' | 'saving' | 'saved' | 'error'>('loading');
  const [scope, setScope] = useState<Scope>('today');
  const [editing, setEditing] = useState<GoalTask | null>(null);
  const [draft, setDraft] = useState({ text: '', note: '', priority: 'career' as Priority, block: 'morning' as Block });

  useEffect(() => {
    let cancelled = false;
    const localStore = loadStore();
    setStore(localStore);

    async function loadCloudStore() {
      try {
        const response = await fetch('/api/goals', { cache: 'no-store' });
        if (!response.ok) throw new Error('Cloud database is not ready.');
        const data = (await response.json()) as { store?: GoalsStore; hasCloudData?: boolean };
        if (cancelled) return;
        if (data.hasCloudData && data.store) {
          setStore(data.store);
        } else {
          await fetch('/api/goals', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ store: localStore })
          });
        }
        setCloudReady(true);
        setSyncState('saved');
      } catch {
        if (!cancelled) {
          setCloudReady(false);
          setSyncState('local');
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    loadCloudStore();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (ready) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }, [ready, store]);

  useEffect(() => {
    if (!ready || !cloudReady) return;
    setSyncState('saving');
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch('/api/goals', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ store })
        });
        if (!response.ok) throw new Error('Save failed.');
        setSyncState('saved');
      } catch {
        setSyncState('error');
      }
    }, SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [cloudReady, ready, store]);

  const activeTasks = store[scope];
  const completion = useMemo(() => {
    const total = activeTasks.length;
    const done = activeTasks.filter((task) => task.done).length;
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
  }, [activeTasks]);

  function persist(mutator: (current: GoalsStore) => GoalsStore) {
    setStore((current) => mutator(current));
  }

  function resetDraft() {
    setEditing(null);
    setDraft({ text: '', note: '', priority: 'career', block: 'morning' });
  }

  function saveTask() {
    const text = draft.text.trim();
    if (!text) return;
    const note = draft.note.trim() || undefined;
    persist((current) => {
      const next = { ...current };
      if (editing) {
        next[scope] = current[scope].map((task) =>
          task.id === editing.id
            ? { ...task, text, note, priority: draft.priority, block: scope === 'today' ? draft.block : undefined, updatedAt: new Date().toISOString() }
            : task
        );
      } else {
        next[scope] = [...current[scope], makeTask(text, note, draft.priority, scope === 'today' ? draft.block : undefined)];
      }
      return next;
    });
    resetDraft();
  }

  function beginEdit(task: GoalTask) {
    setEditing(task);
    setDraft({ text: task.text, note: task.note || '', priority: task.priority, block: task.block || 'morning' });
  }

  function toggleTask(taskId: string) {
    persist((current) => ({
      ...current,
      [scope]: current[scope].map((task) => (task.id === taskId ? { ...task, done: !task.done, updatedAt: new Date().toISOString() } : task))
    }));
  }

  function deleteTask(taskId: string) {
    persist((current) => ({ ...current, [scope]: current[scope].filter((task) => task.id !== taskId) }));
    if (editing?.id === taskId) resetDraft();
  }

  function resetAll() {
    if (!window.confirm('Reset SG Goals back to the starter tasks?')) return;
    setStore(starterStore);
    resetDraft();
  }

  async function copyBackup() {
    await navigator.clipboard.writeText(JSON.stringify(store, null, 2));
  }

  function downloadBackup() {
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sg-goals-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function importBackup(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as GoalsStore;
        setStore({
          today: parsed.today || [],
          weekly: parsed.weekly || [],
          monthly: parsed.monthly || [],
          yearly: parsed.yearly || []
        });
      } catch {
        alert('That backup file could not be imported.');
      }
    };
    reader.readAsText(file);
  }

  const groupedToday = (Object.keys(blocks) as Block[]).map((block) => ({
    block,
    tasks: activeTasks.filter((task) => task.block === block)
  }));

  const groupedPriority = (Object.keys(priorities) as Priority[]).map((priority) => ({
    priority,
    tasks: activeTasks.filter((task) => task.priority === priority)
  }));

  return (
    <main className="min-h-screen bg-[#07070f] pb-24 text-[#e8e8f5]">
      <section className="border-b border-[#1a1a30] bg-[#0b0b1c] px-5 pb-5 pt-10">
        <div className="mx-auto flex max-w-4xl flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.3em] text-[#52527a]">SG Goals</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight">Daily dashboard</h1>
              <p className="mt-1 text-sm text-[#8b8bb3]">
                {syncState === 'saved'
                  ? 'Saved to Supabase and backed up in this browser.'
                  : syncState === 'saving'
                    ? 'Saving changes to Supabase...'
                    : syncState === 'error'
                      ? 'Cloud save failed. Browser backup is still active.'
                      : syncState === 'local'
                        ? 'Browser backup active. Add DATABASE_URL to enable Supabase sync.'
                        : 'Loading your saved goals...'}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <CalendarDays className="mt-1 h-7 w-7 text-[#00d97e]" />
              <span
                className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                  syncState === 'saved'
                    ? 'border-[#00d97e40] text-[#00d97e]'
                    : syncState === 'saving'
                      ? 'border-[#4f8ef740] text-[#4f8ef7]'
                      : 'border-[#ff6b6b44] text-[#ff6b6b]'
                }`}
              >
                {syncState === 'saved' ? 'Cloud saved' : syncState === 'saving' ? 'Saving' : syncState === 'loading' ? 'Loading' : 'Local only'}
              </span>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-[#8b8bb3]">
              <span>{completion.done}/{completion.total} complete</span>
              <span className="font-bold text-[#00d97e]">{completion.pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#1a1a30]">
              <div className="h-full rounded-full bg-[#00d97e] transition-all" style={{ width: `${completion.pct}%` }} />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-4">
        <div className="grid grid-cols-4 gap-2">
          {(['today', 'weekly', 'monthly', 'yearly'] as Scope[]).map((item) => (
            <button
              key={item}
              onClick={() => {
                setScope(item);
                resetDraft();
              }}
              className={`rounded-lg border px-2 py-3 text-xs font-bold capitalize transition ${
                scope === item ? 'border-[#00d97e] bg-[#00d97e] text-black' : 'border-[#1a1a30] bg-[#0f0f1d] text-[#8b8bb3]'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-4xl gap-4 px-5 md:grid-cols-[1fr,320px]">
        <div className="space-y-4">
          {(scope === 'today' ? groupedToday : groupedPriority).map((group) => {
            const isToday = 'block' in group;
            const title = isToday ? blocks[group.block].label : priorities[group.priority].label;
            const sub = isToday ? blocks[group.block].time : 'Priority group';
            const color = isToday ? '#4f8ef7' : priorities[group.priority].color;
            return (
              <div key={isToday ? group.block : group.priority} className="overflow-hidden rounded-xl border border-[#1a1a30] bg-[#0f0f1d]">
                <div className="flex items-center justify-between border-b border-[#1a1a30] px-4 py-3">
                  <div>
                    <h2 className="text-sm font-bold" style={{ color }}>{title}</h2>
                    <p className="text-[11px] text-[#52527a]">{sub}</p>
                  </div>
                  <span className="text-xs font-bold" style={{ color }}>{group.tasks.filter((task) => task.done).length}/{group.tasks.length}</span>
                </div>

                {group.tasks.length ? (
                  group.tasks.map((task) => (
                    <article key={task.id} className="flex items-stretch border-b border-[#1a1a30] last:border-b-0">
                      <button onClick={() => toggleTask(task.id)} className="flex flex-1 items-start gap-3 px-4 py-3 text-left">
                        <span
                          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border"
                          style={{ borderColor: priorities[task.priority].color, background: task.done ? priorities[task.priority].soft : 'transparent' }}
                        >
                          {task.done ? <Check className="h-3.5 w-3.5" style={{ color: priorities[task.priority].color }} /> : null}
                        </span>
                        <span className="min-w-0">
                          <span className={`block text-sm ${task.done ? 'text-[#52527a] line-through' : 'text-[#e8e8f5]'}`}>{task.text}</span>
                          <span className="mt-1 flex flex-wrap gap-2 text-[11px] text-[#52527a]">
                            <span style={{ color: priorities[task.priority].color }}>{priorities[task.priority].label}</span>
                            {task.note ? <span>{task.note}</span> : null}
                          </span>
                        </span>
                      </button>
                      <button aria-label="Edit task" onClick={() => beginEdit(task)} className="w-11 border-l border-[#1a1a30] text-[#4f8ef7]">
                        <Edit3 className="mx-auto h-4 w-4" />
                      </button>
                      <button aria-label="Delete task" onClick={() => deleteTask(task.id)} className="w-11 border-l border-[#1a1a30] text-[#ff6b6b]">
                        <Trash2 className="mx-auto h-4 w-4" />
                      </button>
                    </article>
                  ))
                ) : (
                  <div className="px-4 py-6 text-center text-sm text-[#52527a]">No tasks here yet.</div>
                )}
              </div>
            );
          })}
        </div>

        <aside className="h-fit rounded-xl border border-[#1a1a30] bg-[#13132a] p-4">
          <h2 className="text-sm font-bold">{editing ? 'Edit task' : 'Add task'}</h2>
          <div className="mt-3 space-y-3">
            <input
              value={draft.text}
              onChange={(event) => setDraft((current) => ({ ...current, text: event.target.value }))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') saveTask();
              }}
              placeholder="Task name"
              className="w-full rounded-lg border border-[#1a1a30] bg-[#0f0f1d] px-3 py-2 text-sm outline-none focus:border-[#00d97e]"
            />
            <input
              value={draft.note}
              onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
              placeholder="Note (optional)"
              className="w-full rounded-lg border border-[#1a1a30] bg-[#0f0f1d] px-3 py-2 text-sm outline-none focus:border-[#00d97e]"
            />
            <select
              value={draft.priority}
              onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as Priority }))}
              className="w-full rounded-lg border border-[#1a1a30] bg-[#0f0f1d] px-3 py-2 text-sm outline-none focus:border-[#00d97e]"
            >
              {Object.entries(priorities).map(([key, value]) => (
                <option key={key} value={key}>{value.label}</option>
              ))}
            </select>
            {scope === 'today' ? (
              <select
                value={draft.block}
                onChange={(event) => setDraft((current) => ({ ...current, block: event.target.value as Block }))}
                className="w-full rounded-lg border border-[#1a1a30] bg-[#0f0f1d] px-3 py-2 text-sm outline-none focus:border-[#00d97e]"
              >
                {Object.entries(blocks).map(([key, value]) => (
                  <option key={key} value={key}>{value.label}</option>
                ))}
              </select>
            ) : null}
            <button onClick={saveTask} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#00d97e] px-3 py-3 text-sm font-bold text-black">
              <Save className="h-4 w-4" />
              {editing ? 'Save changes' : 'Add task'}
            </button>
            {editing ? (
              <button onClick={resetDraft} className="w-full rounded-lg border border-[#1a1a30] px-3 py-2 text-sm text-[#8b8bb3]">Cancel edit</button>
            ) : null}
          </div>

          <div className="mt-5 border-t border-[#1a1a30] pt-4">
            <h3 className="text-xs font-bold uppercase tracking-[.2em] text-[#52527a]">Backup</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={copyBackup} className="flex items-center justify-center gap-2 rounded-lg border border-[#1a1a30] px-2 py-2 text-xs text-[#8b8bb3]">
                <Copy className="h-3.5 w-3.5" /> Copy
              </button>
              <button onClick={downloadBackup} className="flex items-center justify-center gap-2 rounded-lg border border-[#1a1a30] px-2 py-2 text-xs text-[#8b8bb3]">
                <Download className="h-3.5 w-3.5" /> Export
              </button>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#1a1a30] px-2 py-2 text-xs text-[#8b8bb3]">
                <Upload className="h-3.5 w-3.5" /> Import
                <input type="file" accept="application/json" className="hidden" onChange={(event) => importBackup(event.target.files?.[0])} />
              </label>
              <button onClick={resetAll} className="flex items-center justify-center gap-2 rounded-lg border border-[#ff6b6b44] px-2 py-2 text-xs text-[#ff6b6b]">
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </button>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
