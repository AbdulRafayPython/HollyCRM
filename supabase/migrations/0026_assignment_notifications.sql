-- ---------------------------------------------------------------------------
-- Assignment notifications
--
-- An agent needs to be told when a conversation becomes theirs — otherwise the
-- chat is silently "blocked" to them (the bot pauses, the chat leaves the
-- unassigned queue) and nobody knows it is waiting.
--
-- Detecting that from the client is not reliable: assigned_agent_id is written
-- from three different places today — assign_conversation() during handoff, the
-- rules engine in lib/bot/orchestrator.ts, and the manual picker at
-- /api/chats/[chatId]/assign — and chats.updated_at moves for every inbound
-- message, so it cannot be used to mean "assigned just now".
--
-- So the moment of assignment is stamped in the database by a trigger. One
-- write path or five, present or future, they all get an accurate timestamp,
-- and the poll endpoint has a column it can compare a checkpoint against.
-- ---------------------------------------------------------------------------

alter table public.chats
  add column if not exists assigned_at timestamptz;

comment on column public.chats.assigned_at is
  'When assigned_agent_id last changed to a non-null value. Set by trigger, '
  'never by application code. Cleared when a chat is unassigned so the next '
  'assignment reads as new.';

create or replace function public.stamp_chat_assignment()
returns trigger
language plpgsql
as $$
begin
  -- `is distinct from` rather than <>: either side may be null, and a null
  -- comparison would let an unassign-then-reassign go unstamped.
  if tg_op = 'INSERT' then
    if new.assigned_agent_id is not null then
      new.assigned_at := now();
    end if;
    return new;
  end if;

  if new.assigned_agent_id is distinct from old.assigned_agent_id then
    new.assigned_at := case
      when new.assigned_agent_id is null then null
      else now()
    end;
  end if;

  return new;
end $$;

drop trigger if exists stamp_chat_assignment on public.chats;

create trigger stamp_chat_assignment
  before insert or update of assigned_agent_id on public.chats
  for each row execute function public.stamp_chat_assignment();

-- Feeds the notification poll: "chats assigned to me since <checkpoint>".
create index if not exists chats_assigned_recently
  on public.chats (assigned_agent_id, assigned_at desc)
  where assigned_agent_id is not null;

-- ---------------------------------------------------------------------------
-- The polling checkpoint has to come from the database clock.
--
-- The poll endpoint used to hand the browser `new Date()` from the Node
-- process and compare it against created_at, which Postgres writes from its
-- own clock. Any skew where Node runs ahead means rows written in the gap are
-- never returned — a silently dropped notification, unrecoverable because the
-- checkpoint has already moved past them. One source of time removes the class
-- of bug entirely.
-- ---------------------------------------------------------------------------
create or replace function public.db_now()
returns timestamptz
language sql
stable
as $$ select now() $$;

grant execute on function public.db_now() to authenticated;
