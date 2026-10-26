import assert from 'node:assert/strict';
import {
  DEFAULT_BUDGET_PAISE,
  budgetLimitFromRupees,
  budgetMessage,
  budgetNotificationText,
  budgetNotificationToSend,
  budgetStatus,
  formatBudgetRupees,
  markBudgetNotified,
  parseExpenseBudgetNote,
  type BudgetAlertLevel
} from '../lib/goals/expense-budget';
import { currentExpenseCycleKey } from '../lib/goals/expense-cycle';

const rupees = (value: number) => Math.round(value * 100);

// Defaults: ₹80,000 limit, warning at ₹64,000.
const empty = parseExpenseBudgetNote(null);
assert.equal(empty.limitPaise, DEFAULT_BUDGET_PAISE);
assert.equal(DEFAULT_BUDGET_PAISE, rupees(80000));
assert.equal(budgetStatus(0, DEFAULT_BUDGET_PAISE).warningAtPaise, rupees(64000));

// 80% boundary (exact integer maths, no float drift).
assert.equal(budgetStatus(rupees(63999.99), DEFAULT_BUDGET_PAISE).level, 'ok');
assert.equal(budgetStatus(rupees(63999.99), DEFAULT_BUDGET_PAISE).percent, 79);
assert.equal(budgetStatus(rupees(64000), DEFAULT_BUDGET_PAISE).level, 'warning');
assert.equal(budgetStatus(rupees(64000), DEFAULT_BUDGET_PAISE).percent, 80);
// 100% boundary.
assert.equal(budgetStatus(rupees(79999.99), DEFAULT_BUDGET_PAISE).level, 'warning');
assert.equal(budgetStatus(rupees(79999.99), DEFAULT_BUDGET_PAISE).percent, 99);
assert.equal(budgetStatus(rupees(80000), DEFAULT_BUDGET_PAISE).level, 'over');
assert.equal(budgetStatus(rupees(80000), DEFAULT_BUDGET_PAISE).remainingPaise, 0);
assert.equal(budgetStatus(rupees(80000), DEFAULT_BUDGET_PAISE).overPaise, 0);
// Odd limit: 80% of ₹1,001 = ₹800.80.
assert.equal(budgetStatus(rupees(800.79), rupees(1001)).level, 'ok');
assert.equal(budgetStatus(rupees(800.80), rupees(1001)).level, 'warning');

// October's real number: ₹1,01,851.53 against ₹80,000.
const october = budgetStatus(rupees(101851.53), DEFAULT_BUDGET_PAISE);
assert.equal(october.level, 'over');
assert.equal(october.percent, 127);
assert.equal(october.barPercent, 100);
assert.equal(october.overPaise, rupees(21851.53));
assert.equal(formatBudgetRupees(october.spentPaise), '₹1,01,852');
assert.equal(formatBudgetRupees(october.overPaise), '₹21,852');
assert.equal(budgetMessage(october), 'Over budget by ₹21,852 (127% of your ₹80,000 budget)');
const warning = budgetStatus(rupees(70000), DEFAULT_BUDGET_PAISE);
assert.equal(budgetMessage(warning), "You've used 87% of your ₹80,000 budget, ₹10,000 left");
assert.equal(formatBudgetRupees(rupees(10000000)), '₹1,00,00,000');

// Limit input validation.
assert.equal(budgetLimitFromRupees('80000'), rupees(80000));
assert.equal(budgetLimitFromRupees('₹1,20,000'), rupees(120000));
assert.equal(budgetLimitFromRupees(999), null);
assert.equal(budgetLimitFromRupees(''), null);
assert.equal(budgetLimitFromRupees('abc'), null);
assert.equal(budgetLimitFromRupees(100000001), null);
assert.equal(parseExpenseBudgetNote(JSON.stringify({ limitPaise: 5 })).limitPaise, DEFAULT_BUDGET_PAISE, 'invalid stored limit falls back');
assert.equal(parseExpenseBudgetNote('not json').limitPaise, DEFAULT_BUDGET_PAISE);

// Notification dedup: 80% once, 100% once, per spending cycle (keyed by cycle start).
let notified: Record<string, BudgetAlertLevel> = {};
const ok = budgetStatus(rupees(10000), DEFAULT_BUDGET_PAISE);
assert.equal(budgetNotificationToSend(ok, '2026-10-30', notified), null);
assert.equal(budgetNotificationToSend(warning, '2026-10-30', notified), 80);
notified = markBudgetNotified(notified, '2026-10-30', 80);
assert.equal(budgetNotificationToSend(warning, '2026-10-30', notified), null, '80% does not repeat');
assert.equal(budgetNotificationToSend(october, '2026-10-30', notified), 100);
notified = markBudgetNotified(notified, '2026-10-30', 100);
assert.equal(budgetNotificationToSend(october, '2026-10-30', notified), null, '100% does not repeat');
assert.equal(budgetNotificationToSend(warning, '2026-10-30', notified), null, 'dropping back (e.g. raised limit) does not re-alert 80%');
assert.equal(markBudgetNotified(notified, '2026-10-30', 80)['2026-10-30'], 100, 'never downgrades');
// Jumping straight past 100% sends just the over-budget alert.
assert.equal(budgetNotificationToSend(october, '2026-09-30', {}), 100);
assert.deepEqual(budgetNotificationText(100, october).title, 'Monthly budget exceeded');

// A new cycle starts clean; old cycles are pruned.
assert.equal(budgetNotificationToSend(warning, '2026-11-30', notified), 80);
let many: Record<string, BudgetAlertLevel> = {};
for (const cycle of ['2026-07-30', '2026-08-30', '2026-09-30', '2026-10-30', '2026-11-30']) many = markBudgetNotified(many, cycle, 100);
assert.deepEqual(Object.keys(many).sort(), ['2026-09-30', '2026-10-30', '2026-11-30']);
// The cycle key flips at 30th 00:00 IST.
assert.equal(currentExpenseCycleKey(new Date('2026-10-29T23:59:00+05:30')), '2026-09-30');
assert.equal(currentExpenseCycleKey(new Date('2026-10-30T00:00:00+05:30')), '2026-10-30');
// Budget % uses only the current cycle's spend: Oct 1-26 (current cycle) counts, 30 Oct starts at 0.
// Stored dedup survives a round trip; junk entries are dropped.
const stored = parseExpenseBudgetNote(JSON.stringify({ limitPaise: rupees(90000), notified: { '2026-10-30': 100, bad: 80, '2026-11-30': 50 } }));
assert.equal(stored.limitPaise, rupees(90000));
assert.deepEqual(stored.notified, { '2026-10-30': 100 });
// Migration: the live record { "2026-10": 100 } (calendar October) becomes the current cycle 30 Sep – 29 Oct,
// so the 100% alert already sent this cycle is not sent again, and 30 Oct starts clean.
const migrated = parseExpenseBudgetNote(JSON.stringify({ limitPaise: rupees(80000), notified: { '2026-10': 100 } }));
assert.deepEqual(migrated.notified, { '2026-09-30': 100 });
assert.equal(budgetNotificationToSend(october, currentExpenseCycleKey(new Date('2026-10-26T15:00:00+05:30')), migrated.notified), null);
assert.equal(budgetNotificationToSend(october, currentExpenseCycleKey(new Date('2026-10-30T00:00:00+05:30')), migrated.notified), 100);
// Old and new keys for the same cycle merge to the higher level.
assert.deepEqual(parseExpenseBudgetNote(JSON.stringify({ notified: { '2026-10': 80, '2026-09-30': 100 } })).notified, { '2026-09-30': 100 });

console.log('Expense budget tests passed.');
