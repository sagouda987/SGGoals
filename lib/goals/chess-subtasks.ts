/** Keep the Chess daily habit and give it a fixed four-item subtask list. */

import { istFocusDateKey } from '../must-focus-targets';

export type ChessSubtask = {
  id: string;
  text: string;
  done: boolean;
  updatedAt: string;
  completedAt?: string;
};

export const CHESS_SUBTASK_TEXTS = [
  '1 hour Chess.com puzzles',
  '1 hour Lichess puzzles',
  'Opening study',
  'Endgame study'
] as const;

function compactKey(text: string) {
  return text.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function subtaskDayKey(subtask: ChessSubtask) {
  const stamp = subtask.completedAt || (subtask.done ? subtask.updatedAt : undefined);
  return stamp ? istFocusDateKey(stamp) : null;
}

/** The kept Chess habit only — not "Chess practice", weekly chess goals, etc. */
export function isChessHabitText(text: string) {
  const compact = compactKey(text);
  return compact === 'CHESS' || compact === 'STUDY2' || compact === 'STUDY2HOUR';
}

/** Other chess habits, goals and study blocks that should disappear from every scope. */
export function isRemovedChessItemText(text: string) {
  if (isChessHabitText(text)) return false;
  const key = compactKey(text);
  if (key.startsWith('CHESS')) return true;
  if (key.includes('PUZZLE') && (key.includes('RAPIDGAME') || key.includes('RAPIDGAMES'))) return true;
  return false;
}

export function chessSubtasksComplete(subtasks: ChessSubtask[] | undefined) {
  const list = subtasks || [];
  if (list.length !== CHESS_SUBTASK_TEXTS.length) return false;
  const present = new Set(list.map((subtask) => compactKey(subtask.text)));
  return CHESS_SUBTASK_TEXTS.every((text) => present.has(compactKey(text))) && list.every((subtask) => subtask.done);
}

export function ensureChessSubtasks(
  subtasks: ChessSubtask[] | undefined,
  todayKey: string,
  nowIso: string,
  nextId: () => string
): ChessSubtask[] {
  const byKey = new Map<string, ChessSubtask>();
  for (const subtask of subtasks || []) {
    const key = compactKey(subtask.text);
    if (!byKey.has(key)) byKey.set(key, subtask);
  }
  return CHESS_SUBTASK_TEXTS.map((text) => {
    const previous = byKey.get(compactKey(text));
    if (!previous) {
      return { id: nextId(), text, done: false, updatedAt: nowIso };
    }
    const completedToday = Boolean(previous.done) && subtaskDayKey(previous) === todayKey;
    if (previous.text === text && previous.done === completedToday && (completedToday || !previous.completedAt)) {
      return previous;
    }
    return {
      ...previous,
      text,
      done: completedToday,
      completedAt: completedToday ? previous.completedAt : undefined,
      updatedAt: previous.text === text && previous.done === completedToday ? previous.updatedAt : nowIso
    };
  });
}

export function withChessDayState<T extends { text: string; allowSubtasks?: boolean; subtasks?: ChessSubtask[]; updatedAt: string }>(
  task: T,
  todayKey: string,
  nowIso: string,
  nextId: () => string
): T {
  if (!isChessHabitText(task.text)) return task;
  const subtasks = ensureChessSubtasks(task.subtasks, todayKey, nowIso, nextId);
  const sameSubtasks =
    subtasks.length === (task.subtasks?.length ?? 0) &&
    subtasks.every((subtask, index) => subtask === task.subtasks![index]);
  if (task.allowSubtasks === true && sameSubtasks) return task;
  return {
    ...task,
    allowSubtasks: true,
    subtasks,
    updatedAt: sameSubtasks ? task.updatedAt : nowIso
  };
}
