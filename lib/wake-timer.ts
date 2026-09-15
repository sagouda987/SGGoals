export const BEDTIME_HOUR_IST = 23;

export type WakeLog = {
  dateKey: string;
  wakeTime: string;
  wakeAt: string;
  previousBedtimeAt: string;
  bedtimeAt: string;
  loggedAt: string;
};

export type WakeTimer = {
  sleepMinutes: number;
  awakeWindowMinutes: number;
  remainingMs: number;
  bedtimeReached: boolean;
  wokeBeforeEight: boolean;
};

export function istCalendarDateKey(timestamp: number | string | Date = Date.now()) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() + 330 * 60000).toISOString().slice(0, 10);
}

export function istTimeInput(timestamp: number | string | Date = Date.now()) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '';
  const shifted = new Date(date.getTime() + 330 * 60000);
  return `${String(shifted.getUTCHours()).padStart(2, '0')}:${String(shifted.getUTCMinutes()).padStart(2, '0')}`;
}

function istDateTime(dateKey: string, time: string) {
  return new Date(`${dateKey}T${time}:00+05:30`);
}

function previousDateKey(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function createWakeLog(input: { dateKey: string; wakeTime: string; loggedAt?: Date }): WakeLog {
  const wakeAt = istDateTime(input.dateKey, input.wakeTime);
  const previousBedtimeAt = istDateTime(previousDateKey(input.dateKey), '23:00');
  const bedtimeAt = istDateTime(input.dateKey, '23:00');
  return {
    dateKey: input.dateKey,
    wakeTime: input.wakeTime,
    wakeAt: wakeAt.toISOString(),
    previousBedtimeAt: previousBedtimeAt.toISOString(),
    bedtimeAt: bedtimeAt.toISOString(),
    loggedAt: (input.loggedAt ?? new Date()).toISOString()
  };
}

export function calculateWakeTimer(log: WakeLog, now: number | Date = Date.now()): WakeTimer {
  const wakeAt = new Date(log.wakeAt).getTime();
  const previousBedtimeAt = new Date(log.previousBedtimeAt).getTime();
  const bedtimeAt = new Date(log.bedtimeAt).getTime();
  const nowMs = new Date(now).getTime();
  return {
    sleepMinutes: Math.max(0, Math.round((wakeAt - previousBedtimeAt) / 60000)),
    awakeWindowMinutes: Math.max(0, Math.round((bedtimeAt - wakeAt) / 60000)),
    remainingMs: Math.max(0, bedtimeAt - nowMs),
    bedtimeReached: nowMs >= bedtimeAt,
    wokeBeforeEight: inputTimeMinutes(log.wakeTime) < 8 * 60
  };
}

export function calculateBedtimeRemaining(dateKey: string, now: number | Date = Date.now()) {
  const bedtimeAt = istDateTime(dateKey, '23:00').getTime();
  const nowMs = new Date(now).getTime();
  return { remainingMs: Math.max(0, bedtimeAt - nowMs), bedtimeReached: nowMs >= bedtimeAt };
}

export function inputTimeMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function formatWakeCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
