import { mustFocusTargets } from '@/lib/must-focus-targets';

/**
 * The daily "BOOK" priority alternates between book reading and speaking practice.
 * Keys are the app's reporting day keys (the day starts at 03:00 IST, see istFocusDateKey),
 * so the switch happens at 3 AM IST, the same moment habits, targets and rollover change day.
 *
 * Rule: 2026-10-26 (the first alternating day) is Book reading; every day an even number of
 * days away from it is Book reading, every odd day is Speaking practice. Equivalently, with
 * 1 Sep 2026 as Day 1, even Day numbers are Book reading and odd Day numbers are Speaking practice.
 * Days before 2026-10-26 keep the old combined task so history reads as it was recorded.
 *
 * The internal code stays "BOOK" so time targets (30m weekdays / 45m weekends), points (4),
 * streaks, stopwatches and stored history are unchanged.
 */
export const BOOK_SPEAKING_START_DATE = '2026-10-26';
export const LEGACY_BOOK_LABEL = 'Book read and communication practice';
export const BOOK_SPEAKING_GENERIC_LABEL = 'Book reading / Speaking practice';

export type BookSpeakingMode = 'book' | 'speaking' | 'combined';

const DAY_MS = 86400000;

export function bookSpeakingMode(dateKey: string): BookSpeakingMode {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return 'combined';
  if (dateKey < BOOK_SPEAKING_START_DATE) return 'combined';
  const diff = Math.round((Date.parse(`${dateKey}T00:00:00Z`) - Date.parse(`${BOOK_SPEAKING_START_DATE}T00:00:00Z`)) / DAY_MS);
  return diff % 2 === 0 ? 'book' : 'speaking';
}

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
  return mustFocusTargets(dateKey).minutes.BOOK;
}

/** Task-list text for that day, e.g. "📖 Book reading (30m)" or "🗣️ Speaking practice (45m)". */
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
  // A Mon..Sun week starting at the anchor covers both modes on weekdays and weekends.
  for (let offset = 0; offset < 14; offset += 1) {
    texts.add(bookSpeakingTaskText(new Date(Date.parse(`${BOOK_SPEAKING_START_DATE}T00:00:00Z`) + offset * DAY_MS).toISOString().slice(0, 10)));
  }
  return [...texts];
}
