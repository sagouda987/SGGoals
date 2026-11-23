/** Every-other-day Book reading schedule, independent of focus-target minutes. */

export const BOOK_SPEAKING_START_DATE = '2026-10-26';
export type BookSpeakingMode = 'book' | 'speaking' | 'combined';

const DAY_MS = 86400000;

export function bookSpeakingMode(dateKey: string): BookSpeakingMode {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return 'combined';
  if (dateKey < BOOK_SPEAKING_START_DATE) return 'combined';
  const diff = Math.round((Date.parse(`${dateKey}T00:00:00Z`) - Date.parse(`${BOOK_SPEAKING_START_DATE}T00:00:00Z`)) / DAY_MS);
  return diff % 2 === 0 ? 'book' : 'speaking';
}

/** True on days the Book reading habit should appear and can be missed. */
export function isBookReadingDay(dateKey: string) {
  const mode = bookSpeakingMode(dateKey);
  return mode === 'book' || mode === 'combined';
}
