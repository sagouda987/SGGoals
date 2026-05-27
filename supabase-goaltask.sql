alter table public."GoalTask"
  add column if not exists "startedAt" timestamp(3) without time zone,
  add column if not exists "completedAt" timestamp(3) without time zone,
  add column if not exists "investedMinutes" integer;

create table if not exists public."GoalActivity" (
  id text primary key,
  "ownerKey" text not null default 'default',
  scope text not null,
  priority text not null,
  "taskText" text not null,
  kind text not null,
  reason text,
  note text,
  minutes integer,
  "startedAt" timestamp(3) without time zone,
  "completedAt" timestamp(3) without time zone,
  "createdAt" timestamp(3) without time zone not null default current_timestamp
);

create index if not exists "GoalActivity_ownerKey_createdAt_idx"
on public."GoalActivity" ("ownerKey", "createdAt");

create index if not exists "GoalActivity_ownerKey_scope_priority_createdAt_idx"
on public."GoalActivity" ("ownerKey", scope, priority, "createdAt");
