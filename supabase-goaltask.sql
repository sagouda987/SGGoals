alter table public."GoalTask"
  add column if not exists "startedAt" timestamp(3) without time zone,
  add column if not exists "completedAt" timestamp(3) without time zone,
  add column if not exists "investedMinutes" integer;

