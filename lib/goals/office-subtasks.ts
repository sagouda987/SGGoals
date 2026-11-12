import { istFocusDateKey } from '../must-focus-targets';

export type OfficeSubtask = {
  id: string;
  text: string;
  done: boolean;
  updatedAt: string;
  completedAt?: string;
};

export const OFFICE_SUBTASK_EMPTY_PROMPT = "Add today's top office task and finish it before chess.";
export const OFFICE_SUBTASK_PLACEHOLDER = "Add today's top office task";

/** Matches the Office work daily habit and close variants such as "Office work - zero escalation". */
export function isOfficeWorkText(text: string) {
  const compact = text.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return compact === 'OFFICEWORK' || compact === 'OFFICEWORK2' || compact === 'OFFICEWORK2HOUR' || compact.startsWith('OFFICEWORK');
}

function subtaskDayKey(subtask: OfficeSubtask) {
  const stamp = subtask.completedAt || (subtask.done ? subtask.updatedAt : undefined);
  return stamp ? istFocusDateKey(stamp) : null;
}

/** Keep pending subtasks and any completed on this reporting day. Drop ones finished earlier. */
export function retainOfficeSubtasksForDay(subtasks: OfficeSubtask[] | undefined, todayKey: string): OfficeSubtask[] {
  return (subtasks || []).filter((subtask) => {
    if (!subtask.done) return true;
    return subtaskDayKey(subtask) === todayKey;
  });
}

/** Copy unfinished subtasks onto a new day as pending items. */
export function carryUnfinishedOfficeSubtasks(
  subtasks: OfficeSubtask[] | undefined,
  nowIso: string,
  nextId: () => string
): OfficeSubtask[] {
  return (subtasks || [])
    .filter((subtask) => !subtask.done && subtask.text.trim())
    .map((subtask) => ({
      id: nextId(),
      text: subtask.text,
      done: false,
      updatedAt: nowIso
    }));
}

/** Office work is complete only when it has at least one subtask and every subtask is ticked. */
export function officeWorkSubtasksComplete(subtasks: OfficeSubtask[] | undefined) {
  const list = subtasks || [];
  return list.length > 0 && list.every((subtask) => subtask.done);
}

export function withOfficeWorkDayState<T extends { text: string; allowSubtasks?: boolean; subtasks?: OfficeSubtask[]; updatedAt: string }>(
  task: T,
  todayKey: string,
  nowIso: string
): T {
  if (!isOfficeWorkText(task.text)) return task;
  const subtasks = retainOfficeSubtasksForDay(task.subtasks, todayKey);
  const sameSubtasks = subtasks.length === (task.subtasks?.length ?? 0) && subtasks.every((subtask, index) => subtask === task.subtasks![index]);
  if (task.allowSubtasks === true && sameSubtasks) return task;
  return {
    ...task,
    allowSubtasks: true,
    subtasks,
    updatedAt: sameSubtasks ? task.updatedAt : nowIso
  };
}

export function unfinishedOfficeSubtasksFrom(tasks: Array<{ text: string; subtasks?: OfficeSubtask[] }>, nowIso: string, nextId: () => string) {
  const source = [...tasks].reverse().find((task) => isOfficeWorkText(task.text) && (task.subtasks || []).some((subtask) => !subtask.done));
  return carryUnfinishedOfficeSubtasks(source?.subtasks, nowIso, nextId);
}
