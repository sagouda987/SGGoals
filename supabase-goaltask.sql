create table if not exists public."GoalTask" (
  id text primary key,
  "ownerKey" text not null default 'default',
  scope text not null,
  text text not null,
  note text,
  priority text not null,
  block text,
  done boolean not null default false,
  position integer not null default 0,
  "createdAt" timestamp(3) without time zone not null default current_timestamp,
  "updatedAt" timestamp(3) without time zone not null default current_timestamp
);

create index if not exists "GoalTask_ownerKey_scope_position_idx"
on public."GoalTask" ("ownerKey", scope, position);

