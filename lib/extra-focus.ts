export function extraFocusMinutes(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const minutes = Number(value);
  return Number.isSafeInteger(minutes) && minutes >= 1 && minutes <= 1440 ? minutes : null;
}
