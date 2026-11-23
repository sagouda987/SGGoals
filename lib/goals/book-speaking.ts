import { MUST_FOCUS_WEEKDAY_MINUTES, MUST_FOCUS_WEEKEND_MINUTES } from '@/lib/must-focus-targets';
import { BOOK_SPEAKING_START_DATE, bookSpeakingMode } from '@/lib/goals/book-schedule';

export { BOOK_SPEAKING_START_DATE, bookSpeakingMode, isBookReadingDay } from '@/lib/goals/book-schedule';
export type { BookSpeakingMode } from '@/lib/goals/book-schedule';

/**
 * Book reading is scheduled every other reporting day (the day starts at 03:00 IST,
 * see istFocusDateKey), so the switch happens at 3 AM IST with habits and rollover.
 *
 * Rule: 2026-10-26 is a Book reading day; every day an even number of days away from
 * it is also a reading day, and every odd day is an off day. Equivalently, with
 * 1 Sep 2026 as Day 1, even Day numbers are reading days. Days before 2026-10-26
 * keep the old combined daily task so history reads as it was recorded.
 *
 * Off days do not show the habit, do not count as misses, and have a 0-minute book
 * focus target. The internal code stays "BOOK" so points (4), streaks, stopwatches
 * and stored history stay on the same habit.
 */
export const LEGACY_BOOK_LABEL = 'Book read and communication practice';
export const BOOK_SPEAKING_GENERIC_LABEL = 'Book reading / Speaking practice';

const DAY_MS = 86400000;

export function bookSpeakingLabel(dateKey: string) {
  const mode = bookSpeakingMode(dateKey);
  if (mode === 'book') return 'Book reading';
  if (mode === 'speaking') return 'Speaking practice';
  return LEGACY_BOOK_LABEL;
}

export function bookSpeakingEmoji(dateKey: string) {
  const mode = bookSpeakingMode(dateKey);
  return mode === 'book' ? '📖' : mode === 'speaking' ? '🗣️' : '📚';
}

export function bookSpeakingTargetMinutes(dateKey: string) {
  const day = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  const weekend = day === 0 || day === 6;
  return (weekend ? MUST_FOCUS_WEEKEND_MINUTES : MUST_FOCUS_WEEKDAY_MINUTES).BOOK;
}

/** Task-list text for a reading day, e.g. "📖 Book reading (30m)". Off-day labels are kept for history. */
export function bookSpeakingTaskText(dateKey: string) {
  if (bookSpeakingMode(dateKey) === 'combined') return LEGACY_BOOK_LABEL;
  return `${bookSpeakingEmoji(dateKey)} ${bookSpeakingLabel(dateKey)} (${bookSpeakingTargetMinutes(dateKey)}m)`;
}

/** True for any old or new text of the BOOK priority, so history and new entries score the same. */
export function isBookSpeakingText(text: string) {
  const compact = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (compact === 'BOOKREAD' || compact === 'BOOKREADANDCOMMUNICATIONPRACTICE') return true;
  return /^(BOOKREADING|SPEAKINGPRACTICE)(\d+M)?$/.test(compact) || compact === 'BOOKREADINGSPEAKINGPRACTICE';
}

/** Every stored task text the BOOK priority can have, for exact-match database queries. */
export function bookSpeakingTaskTextVariants() {
  const texts = new Set<string>([LEGACY_BOOK_LABEL, BOOK_SPEAKING_GENERIC_LABEL, 'Book reading', 'Speaking practice']);
  // A Mon..Sun week starting at the anchor covers reading and leftover off-day labels on weekdays and weekends.
  for (let offset = 0; offset < 14; offset += 1) {
    texts.add(bookSpeakingTaskText(new Date(Date.parse(`${BOOK_SPEAKING_START_DATE}T00:00:00Z`) + offset * DAY_MS).toISOString().slice(0, 10)));
  }
  return [...texts];
}
