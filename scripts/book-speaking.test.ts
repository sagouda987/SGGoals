import assert from 'node:assert/strict';
import {
  BOOK_SPEAKING_START_DATE,
  LEGACY_BOOK_LABEL,
  bookSpeakingLabel,
  bookSpeakingMode,
  bookSpeakingTaskText,
  bookSpeakingTaskTextVariants,
  isBookSpeakingText
} from '../lib/goals/book-speaking';
import { istFocusDateKey } from '../lib/must-focus-targets';

// Anchor: Mon 26 Oct 2026 is Book reading, then it alternates every reporting day.
assert.equal(BOOK_SPEAKING_START_DATE, '2026-10-26');
assert.equal(bookSpeakingMode('2026-10-26'), 'book');
assert.equal(bookSpeakingMode('2026-10-27'), 'speaking');
assert.equal(bookSpeakingMode('2026-10-28'), 'book');
assert.equal(bookSpeakingMode('2026-10-31'), 'speaking');
assert.equal(bookSpeakingMode('2026-11-01'), 'book'); // month boundary keeps alternating (31-day October)
assert.equal(bookSpeakingMode('2026-12-31'), 'book');
assert.equal(bookSpeakingMode('2027-01-01'), 'speaking'); // year boundary
for (let i = 0; i < 400; i += 1) {
  const date = new Date(Date.UTC(2026, 9, 26 + i)).toISOString().slice(0, 10);
  const next = new Date(Date.UTC(2026, 9, 27 + i)).toISOString().slice(0, 10);
  assert.notEqual(bookSpeakingMode(date), bookSpeakingMode(next), `${date} and ${next} must differ`);
}

// Same rule expressed with the day counter (1 Sep 2026 = Day 1): even Day numbers are Book reading.
const dayNumber = (key: string) => Math.round((Date.parse(`${key}T00:00:00Z`) - Date.parse('2026-09-01T00:00:00Z')) / 86400000) + 1;
assert.equal(dayNumber('2026-10-26'), 56);
assert.equal(bookSpeakingMode('2026-10-26'), dayNumber('2026-10-26') % 2 === 0 ? 'book' : 'speaking');
assert.equal(bookSpeakingMode('2026-11-15'), dayNumber('2026-11-15') % 2 === 0 ? 'book' : 'speaking');

// History before the change keeps the old combined task.
assert.equal(bookSpeakingMode('2026-10-25'), 'combined');
assert.equal(bookSpeakingLabel('2026-09-10'), LEGACY_BOOK_LABEL);
assert.equal(bookSpeakingTaskText('2026-10-25'), LEGACY_BOOK_LABEL);

// Weekday 30m / weekend 45m targets are unchanged and shown in the task text.
assert.equal(bookSpeakingTaskText('2026-10-26'), '📖 Book reading (30m)'); // Monday
assert.equal(bookSpeakingTaskText('2026-10-27'), '🗣️ Speaking practice (30m)'); // Tuesday
assert.equal(bookSpeakingTaskText('2026-10-31'), '🗣️ Speaking practice (45m)'); // Saturday
assert.equal(bookSpeakingTaskText('2026-11-01'), '📖 Book reading (45m)'); // Sunday

// Day boundary is the app's 03:00 IST reporting day, not midnight.
assert.equal(bookSpeakingLabel(istFocusDateKey(Date.parse('2026-10-27T02:59:00+05:30'))), 'Book reading');
assert.equal(bookSpeakingLabel(istFocusDateKey(Date.parse('2026-10-27T03:00:00+05:30'))), 'Speaking practice');

// Every old and new label maps to the same BOOK priority; unrelated text does not.
for (const text of [LEGACY_BOOK_LABEL, 'Book read', '📖 Book reading (30m)', '🗣️ Speaking practice (45m)', 'Speaking practice', 'Book reading / Speaking practice']) {
  assert.equal(isBookSpeakingText(text), true, text);
}
for (const text of ['Book club', 'Speaking', 'Read', 'Practise B']) assert.equal(isBookSpeakingText(text), false, text);

// The rollover's exact-match query must include every text the task can be stored under.
const variants = bookSpeakingTaskTextVariants();
for (const text of [LEGACY_BOOK_LABEL, '📖 Book reading (30m)', '📖 Book reading (45m)', '🗣️ Speaking practice (30m)', '🗣️ Speaking practice (45m)']) {
  assert.ok(variants.includes(text), text);
}
for (const text of variants) assert.equal(isBookSpeakingText(text), true, text);

console.log('Book / speaking alternation tests passed.');
