export const MUST_FOCUS_TARGET_START = '2026-09-04';
export const MUST_FOCUS_TARGET_CODES = ['BOOK', 'GYM', 'STUDY2'] as const;
export type MustFocusTargetCode = (typeof MUST_FOCUS_TARGET_CODES)[number];
export const MUST_FOCUS_WEEKDAY_MINUTES = { BOOK: 30, GYM: 90, STUDY2: 300 };
export const MUST_FOCUS_WEEKEND_MINUTES = { BOOK: 45, GYM: 120, STUDY2: 420 };

type FocusSession = { code: string; createdAt: string; minutes: number };

export function buildPeriodTimeTargets(sessions: FocusSession[], todayKey: string, period: 'weekly' | 'monthly' | 'yearly') {
  const today = new Date(`${todayKey}T00:00:00Z`);
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const start = period === 'weekly' ? shiftDay(todayKey, -today.getUTCDay())
    : period === 'monthly' ? `${todayKey.slice(0, 7)}-01` : `${year}-01-01`;
  const end = period === 'weekly' ? shiftDay(start, 6)
    : period === 'monthly' ? new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10) : `${year}-12-31`;
  const trackedStart = start < MUST_FOCUS_TARGET_START ? MUST_FOCUS_TARGET_START : start;
  const totals = { BOOK: 0, GYM: 0, STUDY2: 0 };
  const completed = { BOOK: 0, GYM: 0, STUDY2: 0 };
  for (let day = trackedStart; day <= end; day = shiftDay(day, 1)) {
    const targets = mustFocusTargets(day).minutes;
    MUST_FOCUS_TARGET_CODES.forEach((code) => { totals[code] += targets[code]; });
  }
  sessions.forEach((session) => {
    const day = istFocusDateKey(session.createdAt);
    if (day < trackedStart || day > end || day > todayKey || !Number.isFinite(session.minutes) || session.minutes <= 0) return;
    if (!(MUST_FOCUS_TARGET_CODES as readonly string[]).includes(session.code)) return;
    completed[session.code as MustFocusTargetCode] += Math.round(session.minutes);
  });
  const items = MUST_FOCUS_TARGET_CODES.map((code) => ({
    code, target: totals[code], completed: completed[code],
    remaining: Math.max(0, totals[code] - completed[code]),
    ahead: Math.max(0, completed[code] - totals[code])
  }));
  return { start: trackedStart, end, items };
}

export function istFocusDateKey(timestamp: number | string) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '';
  // Shift IST back three hours so each reporting day begins at 03:00 IST.
  return new Date(date.getTime() + 150 * 60000).toISOString().slice(0, 10);
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

export function buildMustFocusDayProgress(dateKey: string, input: Partial<Record<MustFocusTargetCode, number>>) {
  const { weekend, minutes: targets } = mustFocusTargets(dateKey);
  const minutes = Object.fromEntries(MUST_FOCUS_TARGET_CODES.map((code) => [code, Math.max(0, Math.round(Number(input[code]) || 0))])) as Record<MustFocusTargetCode, number>;
  const tracked = dateKey >= MUST_FOCUS_TARGET_START;
  const met = tracked ? MUST_FOCUS_TARGET_CODES.filter((code) => minutes[code] >= targets[code]).length : 0;
  const completedMinutes = MUST_FOCUS_TARGET_CODES.reduce((sum, code) => sum + minutes[code], 0);
  const creditedMinutes = MUST_FOCUS_TARGET_CODES.reduce((sum, code) => sum + Math.min(minutes[code], targets[code]), 0);
  const targetMinutes = MUST_FOCUS_TARGET_CODES.reduce((sum, code) => sum + targets[code], 0);
  const percent = tracked ? Math.floor(creditedMinutes / targetMinutes * 100) : 0;
  return { dateKey, weekend, targets, minutes, completedMinutes, creditedMinutes, targetMinutes, tracked, met, percent, complete: met === 3 };
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

  const buildDay = (dateKey: string) => buildMustFocusDayProgress(dateKey, totals.get(dateKey) || {});

  let streak = 0;
  let best = 0;
  let current = 0;
  let trackedDays = 0;
  let achievedDays = 0;
  const yesterday = shiftDay(todayKey, -1);
  for (let key = MUST_FOCUS_TARGET_START; key <= todayKey; key = shiftDay(key, 1)) {
    const day = buildDay(key);
    trackedDays += 1;
    if (day.complete) achievedDays += 1;
    streak = day.complete ? streak + 1 : 0;
    best = Math.max(best, streak);
    // An unfinished today does not break yesterday's earned streak.
    if (key === yesterday || (key === todayKey && day.complete)) current = streak;
  }
  return {
    current,
    best,
    trackedDays,
    achievedDays,
    achievedDaysPercent: trackedDays ? Math.floor(achievedDays / trackedDays * 100) : 0,
    today: buildDay(todayKey),
    history: Array.from({ length: 14 }, (_, index) => buildDay(shiftDay(todayKey, index - 13)))
  };
}
