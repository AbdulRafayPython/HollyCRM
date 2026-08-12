-- =============================================================================
-- HollyCRM 0018 — the bot knows WHO it is talking to
--
-- 0016 gave the bot memory. It gave it one memory per CHAT, which is correct for
-- a direct conversation and actively wrong for a group:
--
--   Onais:  5 star in Makkah, 12-15 Sep, 4 people
--   Bot:    *Swissotel* — 5★ · 180m · ...
--   Bilal:  what about Madinah for 3 nights?
--   Bot:    (searches Madinah, 12-15 Sep, 4 people)          <- Onais's party
--   Onais:  can you do 6 people instead?
--   Bot:    (searches Madinah, 12-15 Sep, 6 people)          <- Bilal's city
--
-- Both of them were sharing ONE lead row, because ingest picked "the newest open
-- lead on this chat" regardless of who sent the message. Every slot either of
-- them filled overwrote the other's. There is no version of that conversation
-- that ends well.
--
-- Three changes:
--
--   1. A lead is now scoped to (chat, contact). Onais and Bilal negotiate side by
--      side in the same group, each with their own city, dates and party size,
--      and the pipeline board shows two real leads instead of one incoherent one.
--
--   2. contacts carry a durable profile — the language they actually write in,
--      and free-form facts ("travelling with elderly parents", "wants walking
--      distance") that no typed slot column can hold. This survives across
--      leads, so a returning customer is not re-interrogated from zero.
--
--   3. Leads remember which hotels have already been quoted, so the bot stops
--      re-offering the option the customer just turned down.
--
-- Free-form memory is a TABLE, not a jsonb blob on contacts: each fact needs its
-- own updated_at (a stale preference should lose to a fresh one) and the lead
-- panel has to list them for an agent to correct. 0016 rejected jsonb for the
-- typed slots for the opposite reason — those have SQL consumers. These do not.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Leads are per-person
-- -----------------------------------------------------------------------------

-- Backfill first: group chats accumulated one lead whose contact_id is whoever
-- happened to speak first. That row keeps its owner; nothing is split
-- retroactively, because we cannot know which of the merged slots belonged to
-- whom. Future messages from the other participants open their own leads.
update public.leads l
   set contact_id = c.contact_id
  from (
    select distinct on (m.lead_id) m.lead_id, m.sender_contact_id as contact_id
      from public.messages m
     where m.sender_type = 'client'
       and m.sender_contact_id is not null
       and m.lead_id is not null
     order by m.lead_id, m.wa_timestamp asc
  ) c
 where c.lead_id = l.id
   and l.contact_id is null;

-- Existing duplicates must be resolved BEFORE the unique index, or this
-- migration fails on any workspace that has them — and a migration that fails
-- halfway is far worse than the problem it was fixing.
--
-- Duplicates are rare but reachable: a chat whose lead was closed gets a new
-- one on the next message, and an agent reopening the closed one from the
-- pipeline board leaves two open leads for the same person. The newest is the
-- live negotiation, so older ones are closed rather than deleted — nothing is
-- destroyed, drop_reason says exactly what happened, and an agent who disagrees
-- can reopen the one they wanted.
update public.leads l
   set stage = 'closed_lost',
       drop_reason = 'Superseded: a newer open lead exists for this person in this chat (0018).'
  from (
    select id
      from (
        select id,
               row_number() over (
                 partition by chat_id, contact_id order by created_at desc, id desc
               ) as rn
          from public.leads
         where contact_id is not null
           and stage not in ('closed_won', 'closed_lost')
      ) ranked
     where rn > 1
  ) dupes
 where dupes.id = l.id;

-- One OPEN lead per person per chat. Closed leads are excluded so the same
-- person can start a fresh enquiry after a previous one is won or lost.
--
-- Nulls are distinct in a Postgres unique index, so leads with no contact (a
-- chat whose sender we could not resolve) are never blocked by this.
create unique index if not exists leads_one_open_per_contact
  on public.leads (chat_id, contact_id)
  where stage not in ('closed_won', 'closed_lost') and contact_id is not null;

alter table public.leads
  add column if not exists quoted_hotel_ids uuid[] not null default '{}';

comment on column public.leads.quoted_hotel_ids is
  'Hotels this lead has already been shown. The composer is told not to lead '
  'with them again, so a customer who says "anything else?" gets something else.';

-- -----------------------------------------------------------------------------
-- 2. The person behind the number
-- -----------------------------------------------------------------------------

alter table public.contacts
  add column if not exists preferred_language text
    check (preferred_language is null or preferred_language in ('en', 'ar', 'ur', 'other')),
  add column if not exists last_seen_at timestamptz;

comment on column public.contacts.preferred_language is
  'The language this person actually converses in, held across turns. A '
  'one-word reply ("Makkah") is Latin script and would otherwise flip an '
  'Arabic conversation into English for that turn and every turn after it.';

create table if not exists public.contact_memory (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  -- Short stable slug the extractor chooses: 'group_type', 'accessibility',
  -- 'budget_sensitivity', 'preferred_area'. Free-form on purpose — an enum here
  -- would be a list of every fact a traveller might ever mention.
  fact_key   text not null check (length(fact_key) between 1 and 60),
  fact_value text not null check (length(fact_value) between 1 and 400),
  source     text not null default 'bot' check (source in ('bot', 'agent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contact_id, fact_key)
);

create index if not exists contact_memory_by_contact
  on public.contact_memory (contact_id, updated_at desc);

comment on table public.contact_memory is
  'Durable free-form facts about a person, carried across every conversation '
  'and every lead they open. Typed booking slots live on leads (0016); this is '
  'for what a colleague would remember but no column can hold.';

drop trigger if exists set_updated_at on public.contact_memory;
create trigger set_updated_at before update on public.contact_memory
  for each row execute function app.set_updated_at();

alter table public.contact_memory enable row level security;

-- Guarded, to match the `if not exists` on the table above: a re-run of this
-- file must be a no-op rather than an error on the second policy.
drop policy if exists contact_memory_read on public.contact_memory;
create policy contact_memory_read on public.contact_memory for select to authenticated
  using (org_id = app.current_org_id());

drop policy if exists contact_memory_write on public.contact_memory;
create policy contact_memory_write on public.contact_memory for all to authenticated
  using  (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

-- -----------------------------------------------------------------------------
-- 3. Greeting mid-conversation is a setting, not a hardcoded once-per-chat rule
-- -----------------------------------------------------------------------------
--
-- The old behaviour was "greet only if the bot has never spoken here", which
-- made a later "Assalamualaikum" land in total silence. Acknowledging social
-- messages is now its own switch, on by default, throttled by SQL below rather
-- than by the accident of never having replied.

alter table public.bot_settings
  add column if not exists smalltalk_enabled boolean not null default true,
  add column if not exists smalltalk_cooldown_seconds int not null default 45
    check (smalltalk_cooldown_seconds between 0 and 3600);

comment on column public.bot_settings.smalltalk_enabled is
  'Whether the agent answers greetings, thanks and other non-booking messages '
  'at any point in a conversation rather than staying mute after first contact.';
comment on column public.bot_settings.smalltalk_cooldown_seconds is
  'Minimum gap between two social replies in one chat. Stops a rally of "ok" / '
  '"thanks" / "👍" from turning into the bot talking to itself.';

alter table public.chats
  add column if not exists last_smalltalk_reply_at timestamptz;

-- -----------------------------------------------------------------------------
-- 4. Claim a social reply atomically
-- -----------------------------------------------------------------------------
-- Same shape as bot_gate(): the cooldown is checked and the timestamp reserved
-- in ONE statement, because two messages seconds apart are processed in
-- concurrent after() callbacks and would otherwise both pass a read-then-write
-- check and both reply.

create or replace function public.claim_smalltalk_reply(p_chat_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_cooldown int;
  v_claimed  boolean;
begin
  select bs.smalltalk_cooldown_seconds
    into v_cooldown
    from public.chats c
    join public.bot_settings bs on bs.org_id = c.org_id
   where c.id = p_chat_id;

  if v_cooldown is null then
    v_cooldown := 45;
  end if;

  update public.chats
     set last_smalltalk_reply_at = now()
   where id = p_chat_id
     and (
       last_smalltalk_reply_at is null
       or last_smalltalk_reply_at < now() - make_interval(secs => v_cooldown)
     )
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

revoke all on function public.claim_smalltalk_reply(uuid) from public;
grant execute on function public.claim_smalltalk_reply(uuid) to service_role;

comment on function public.claim_smalltalk_reply(uuid) is
  'Reserves the right to send one social reply on this chat, or returns false '
  'if another concurrent webhook already did within the cooldown.';
