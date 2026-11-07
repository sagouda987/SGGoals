# Chess and steps dashboard

- Chess reuses the legacy STUDY2 timer key to preserve focus sessions and stopwatch state. Weekday target: 300 minutes; weekend: 420 minutes.
- The chess rating target is aspirational (default blitz 1621); completion requires 30 manually recorded puzzles and the saved study-time target. Rapid is secondary.
- Gym uses 10,000 steps, with no new time goal. Historical gym focus records remain stored and visible in history.
- Daily metrics use separate dated GoalTask metadata rows; normal goal saves cannot delete them. Atomic puzzle increments use an advisory lock. Failed saves retain browser values and show an unsynced warning; re-enter a value to retry.
- Goals GET performs a locked, idempotent rename-only migration from legacy Study/Chess-study task names to Chess. Original rows are backed up in __chess_migration_backup_v1__. IDs, completion, timestamps, notes, invested time and weights are not rewritten. PUT canonicalizes legacy names too; the existing stale-build guard prevents old tabs writing.
- Goal/timer daily accounting retains the existing 03:00 IST training-day rollover. Chess.com today's games use calendar midnight IST and include the previous UTC month at month boundaries.
- Chess.com public data are fetched server-side with a User-Agent and short upstream cache. Puzzles completed are not public, so counts are manual. Upstream errors show explicitly and do not replace successful ratings with invented values.

Verification: npm run test:chess, existing goal-sync/book-speaking/recent-activity/expenses/expense-budget/motivation tests, and npm run build.
