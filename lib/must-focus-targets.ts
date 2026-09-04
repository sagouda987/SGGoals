export const MUST_FOCUS_TARGET_START = '2026-09-04';
export const MUST_FOCUS_TARGET_CODES = ['BOOK', 'GYM', 'STUDY2'] as const;
export type MustFocusTargetCode = (typeof MUST_FOCUS_TARGET_CODES)[number];
export const MUST_FOCUS_WEEKDAY_MINUTES = { BOOK: 30, GYM: 90, STUDY2: 300 };
export const MUST_FOCUS_WEEKEND_MINUTES = { BOOK: 45, GYM: 120, STUDY2: 420 };

type FocusSession = { code: string; createdAt: string; minutes: number };

export function istFocusDateKey(timestamp: number | string) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() + 330 * 60000).toISOString().slice(0, 10);
}

function shiftDay(dateKey: string, offset: number) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function mustFocusTargets(dateKey: string) {
  const day = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  const weekend = day === 0 || day === 6;
  return { weekend, minutes: weekend ? MUST_FOCUS_WEEKEND_MINUTES : MUST_FOCUS_WEEKDAY_MINUTES };
}

export function buildMustFocusTargetProgress(sessions: FocusSession[], todayKey: string) {
  const totals = new Map<string, Record<MustFocusTargetCode, number>>();
  sessions.forEach((session) => {
    if (!(MUST_FOCUS_TARGET_CODES as readonly string[]).includes(session.code)) return;
    if (!Number.isFinite(session.minutes) || session.minutes <= 0) return;
    const key = istFocusDateKey(session.createdAt);
    if (!key || key < MUST_FOCUS_TARGET_START || key > todayKey) return;
    const day = totals.get(key) || { BOOK: 0, GYM: 0, STUDY2: 0 };
    day[session.code as MustFocusTargetCode] += Math.round(session.minutes);
    totals.set(key, day);
  });

  const buildDay = (dateKey: string) => {
    const { weekend, minutes: targets } = mustFocusTargets(dateKey);
    const minutes = totals.get(dateKey) || { BOOK: 0, GYM: 0, STUDY2: 0 };
    const tracked = dateKey >= MUST_FOCUS_TARGET_START;
    const met = tracked ? MUST_FOCUS_TARGET_CODES.filter((code) => minutes[code] >= targets[code]).length : 0;
    const percent = tracked ? Math.floor(MUST_FOCUS_TARGET_CODES.reduce((sum, code) => sum + Math.min(1, minutes[code] / targets[code]), 0) / 3 * 100) : 0;
    return { dateKey, weekend, targets, minutes, tracked, met, percent, complete: met === 3 };
  };

  let streak = 0;
  let best = 0;
  let current = 0;
  const yesterday = shiftDay(todayKey, -1);
  for (let key = MUST_FOCUS_TARGET_START; key <= todayKey; key = shiftDay(key, 1)) {
    const day = buildDay(key);
    streak = day.complete ? streak + 1 : 0;
    best = Math.max(best, streak);
    // An unfinished today does not break yesterday's earned streak.
    if (key === yesterday || (key === todayKey && day.complete)) current = streak;
  }
  return {
    current,
    best,
    today: buildDay(todayKey),
    history: Array.from({ length: 14 }, (_, index) => buildDay(shiftDay(todayKey, index - 13)))
  };
}
