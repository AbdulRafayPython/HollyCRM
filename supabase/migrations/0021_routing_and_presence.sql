-- =============================================================================
-- HollyCRM 0021 — the bot hands off to a PERSON, not to nobody
--
-- handoff() has always done three things: pause the bot, write an internal note,
-- and tell the customer a colleague will follow up. It has never assigned that
-- colleague. The chat lands in the unassigned pool and waits for somebody to
-- notice it, which on a busy afternoon is the difference between "shortly" and
-- tomorrow. The customer was told a promise the system had no mechanism to keep.
--
-- Three things have to exist before that promise can be kept:
--
--   REGIONS      who covers which customers. An Umrah agency splits its desks by
--                the customer's country — the Pakistan desk and the Indonesia
--                desk are different people speaking different languages — and the
--                country is knowable from the phone number on the very first
--                message, before the customer has told us anything at all.
--
--   PRESENCE     who is actually at their desk right now. profiles.is_active
--                answers "does this account exist", which is a different question
--                and the one that would otherwise get used by mistake.
--
--   A ROUTER     which of them gets this chat. Region first, then availability,
--                then whoever is carrying the least work — so the fastest agent
--                does not silently absorb the entire queue.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Regions
-- -----------------------------------------------------------------------------
-- country_codes are DIALLING prefixes, not ISO letters: the routing key is the
-- phone number a message arrives from, and '92' is what we can read off it
-- without a lookup table. Longest-prefix wins at match time, so '1' (US/Canada)
-- and '1868' (Trinidad) can coexist.

create table if not exists public.regions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  name          text not null check (length(name) between 1 and 80),
  country_codes text[] not null default '{}',
  -- Exactly one default per org catches every customer no rule matched, so a
  -- new market never falls into a silent hole.
  is_default    boolean not null default false,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, name)
);

create index if not exists regions_by_org on public.regions (org_id) where is_active;

-- Partial unique index: at most one default region per org. Enforced in the
-- database because "two defaults" makes routing non-deterministic, and a
-- non-deterministic router produces bug reports nobody can reproduce.
create unique index if not exists regions_one_default_per_org
  on public.regions (org_id) where is_default and is_active;

create trigger set_updated_at before update on public.regions
  for each row execute function app.set_updated_at();

-- Which agents cover which regions. A join table rather than an array column on
-- profiles: an agent covers several regions, a region has several agents, and
-- the router joins from both directions.
create table if not exists public.agent_regions (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  region_id  uuid not null references public.regions(id) on delete cascade,
  primary key (profile_id, region_id)
);

create index if not exists agent_regions_by_region on public.agent_regions (region_id);

-- -----------------------------------------------------------------------------
-- 2. Presence
-- -----------------------------------------------------------------------------
-- Two signals, because either alone is wrong. A heartbeat alone cannot tell that
-- someone is at lunch with the tab open; a manual toggle alone cannot tell that
-- someone shut their laptop and went home — and that is the failure that hurts,
-- because the chat is assigned and the customer waits on a person who is gone.

alter table public.profiles
  add column if not exists presence text not null default 'available'
    check (presence in ('available', 'away')),
  add column if not exists last_seen_at timestamptz,
  -- A ceiling on concurrent work. Without it the least-busy rule still hands a
  -- 30th chat to whoever is least buried, and "assigned" starts to mean nothing.
  add column if not exists max_open_chats int not null default 15
    check (max_open_chats between 1 and 500);

comment on column public.profiles.presence is
  'What the agent says about themselves. Combined with last_seen_at, never '
  'trusted alone — see public.available_agents.';
comment on column public.profiles.last_seen_at is
  'Last heartbeat from an open CRM tab. Combined with presence, never trusted '
  'alone: a tab left open overnight is not an agent at their desk, but neither '
  'is an agent who forgot to toggle Away before leaving.';

create index if not exists profiles_available
  on public.profiles (org_id, presence, last_seen_at) where is_active;

-- Country code lives on the contact, resolved once at ingest rather than parsed
-- on every routing decision — and queryable, so "how many Pakistan leads" is a
-- filter rather than a scan with a regex in it.
alter table public.contacts
  add column if not exists country_code text
    check (country_code is null or country_code ~ '^\d{1,4}$');

create index if not exists contacts_by_country on public.contacts (org_id, country_code);

-- -----------------------------------------------------------------------------
-- 3. Routing settings
-- -----------------------------------------------------------------------------

alter table public.bot_settings
  add column if not exists auto_assign_enabled boolean not null default true,
  -- How stale a heartbeat may be before we stop calling someone online. Two
  -- minutes: long enough to survive a laptop sleeping briefly or a flaky
  -- connection, short enough that a closed laptop stops receiving work quickly.
  add column if not exists presence_timeout_seconds int not null default 120
    check (presence_timeout_seconds between 30 and 3600),
  -- When nobody in the customer's own region is free: widen to any available
  -- agent, or hold the chat unassigned for the region to pick up later.
  add column if not exists assign_outside_region boolean not null default true,
  add column if not exists fallback_message_en text,
  add column if not exists fallback_message_ar text;

comment on column public.bot_settings.assign_outside_region is
  'If the customer''s region has nobody available, may the chat go to an agent '
  'from another region? On for coverage, off when regions map to languages the '
  'other desks do not speak.';

-- -----------------------------------------------------------------------------
-- 4. Who is available, and how loaded
-- -----------------------------------------------------------------------------
-- A view so the router, the settings UI and the team page all agree on what
-- "available" means. Three copies of this predicate would disagree within a
-- month, and the one that disagreed would be the router.

create or replace view public.available_agents
with (security_invoker = true) as
select
  p.id,
  p.org_id,
  p.full_name,
  p.role,
  p.presence,
  p.last_seen_at,
  p.max_open_chats,
  coalesce(bs.presence_timeout_seconds, 120) as timeout_seconds,
  (
    p.is_active
    and p.presence = 'available'
    and p.last_seen_at is not null
    and p.last_seen_at > now() - make_interval(
      secs => coalesce(bs.presence_timeout_seconds, 120)
    )
  ) as is_online,
  (
    select count(*)
      from public.chats c
     where c.assigned_agent_id = p.id
       and not c.is_archived
  ) as open_chats
from public.profiles p
left join public.bot_settings bs on bs.org_id = p.org_id;

comment on view public.available_agents is
  'The single definition of "an agent who can take a chat right now". '
  'security_invoker: the caller''s RLS on profiles and chats still applies.';

-- -----------------------------------------------------------------------------
-- 5. RLS
-- -----------------------------------------------------------------------------

alter table public.regions       enable row level security;
alter table public.agent_regions enable row level security;

drop policy if exists regions_read on public.regions;
create policy regions_read on public.regions for select to authenticated
  using (org_id = app.current_org_id());

drop policy if exists regions_write on public.regions;
create policy regions_write on public.regions for all to authenticated
  using  (org_id = app.current_org_id() and app.is_supervisor())
  with check (org_id = app.current_org_id() and app.is_supervisor());

-- Agents may read the coverage map (the team page shows who covers what) but
-- only a supervisor changes it — otherwise an agent can quietly route the
-- whole Pakistan desk to themselves.
drop policy if exists agent_regions_read on public.agent_regions;
create policy agent_regions_read on public.agent_regions for select to authenticated
  using (exists (
    select 1 from public.regions r
     where r.id = region_id and r.org_id = app.current_org_id()
  ));

drop policy if exists agent_regions_write on public.agent_regions;
create policy agent_regions_write on public.agent_regions for all to authenticated
  using (app.is_supervisor() and exists (
    select 1 from public.regions r
     where r.id = region_id and r.org_id = app.current_org_id()
  ))
  with check (app.is_supervisor() and exists (
    select 1 from public.regions r
     where r.id = region_id and r.org_id = app.current_org_id()
  ));

-- Agents update their OWN presence. profiles_self_update (0001) already allows
-- a profile to update itself; 0015 locked the privileged columns so this cannot
-- be used to grant a role.
--
-- max_open_chats has to join that locked set. It is a workload control, and a
-- self-updatable one is a self-serve opt-out: an agent PATCHes their own row to
-- max_open_chats = 1 and the router stops giving them work, silently and
-- permanently. Presence is the honest way to say "not now" and stays open.

create or replace function app.protect_privileged_columns() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Server-side work with the service role — migrations, the signup trigger,
  -- admin routes — has no auth.uid() and is not what this guards against.
  if (select auth.uid()) is null then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.org_id is distinct from old.org_id
     or new.is_active is distinct from old.is_active
  then
    if not app.is_owner() then
      raise exception 'Only the workspace owner can change roles or access.'
        using errcode = 'insufficient_privilege';
    end if;

    -- An owner may manage their team, but not reach into another workspace.
    if new.org_id is distinct from old.org_id then
      raise exception 'A member cannot be moved to a different workspace.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- Supervisor, not owner: capacity is day-to-day team management, unlike a
  -- role change. Self-service is what is being prevented, not delegation.
  if new.max_open_chats is distinct from old.max_open_chats
     and not app.is_supervisor()
  then
    raise exception 'Only a supervisor can change an agent''s chat capacity.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end $$;

-- -----------------------------------------------------------------------------
-- 6. The router
-- -----------------------------------------------------------------------------
-- One SECURITY DEFINER function, called from the bot's handoff path with the
-- service role. Doing this in Node would mean read-then-write across three
-- tables with a network hop in the middle, and two customers handed off in the
-- same second would both be told they were assigned to the least-busy agent —
-- who would then be carrying two chats and still be counted as least busy.
--
-- Returns the chosen agent, or null with a reason. The caller uses that to pick
-- between "our team member will contact you shortly" and the fallback message,
-- so the customer is never told a person is coming when nobody is.

create or replace function public.assign_conversation(p_chat_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id       uuid;
  v_contact_id   uuid;
  v_country      text;
  v_region_id    uuid;
  v_region_name  text;
  v_agent_id     uuid;
  v_agent_name   text;
  v_widened      boolean := false;
  v_settings     record;
  v_already      uuid;
begin
  select c.org_id, c.contact_id, c.assigned_agent_id
    into v_org_id, v_contact_id, v_already
    from public.chats c
   where c.id = p_chat_id;

  if v_org_id is null then
    return jsonb_build_object('assigned', false, 'reason', 'chat_not_found');
  end if;

  -- Never reassign. A human already owning this chat outranks any rule here —
  -- silently moving a conversation out from under an agent mid-reply is worse
  -- than leaving it slightly mis-routed.
  if v_already is not null then
    return jsonb_build_object('assigned', true, 'reason', 'already_assigned',
                              'agent_id', v_already);
  end if;

  select auto_assign_enabled, assign_outside_region
    into v_settings
    from public.bot_settings where org_id = v_org_id;

  if v_settings.auto_assign_enabled is false then
    return jsonb_build_object('assigned', false, 'reason', 'auto_assign_disabled');
  end if;

  -- ---- which region does this customer belong to? ----
  --
  -- chats.contact_id is NULL for groups (ingest only sets it on direct chats),
  -- so a group has to resolve its person another way: the most recent client
  -- sender, who is whoever we are actually handing off about.
  --
  -- The chat_jid is deliberately NOT a fallback. A group's jid looks like
  -- 120363411449511029@g.us, whose digits prefix-match dialling code '1' — every
  -- group in the product would have routed to the US/Canada desk.
  if v_contact_id is null then
    select m.sender_contact_id into v_contact_id
      from public.messages m
     where m.chat_id = p_chat_id
       and m.sender_type = 'client'
       and m.sender_contact_id is not null
     order by m.wa_timestamp desc
     limit 1;
  end if;

  select coalesce(ct.country_code, regexp_replace(coalesce(ct.phone_e164, ''), '\D', '', 'g'))
    into v_country
    from public.contacts ct
   where ct.id = v_contact_id;

  v_country := nullif(v_country, '');

  -- Longest dialling prefix wins: '1868' must beat '1'.
  select r.id, r.name into v_region_id, v_region_name
    from public.regions r
   where r.org_id = v_org_id
     and r.is_active
     and exists (
       select 1 from unnest(r.country_codes) as code
        where v_country is not null and v_country like code || '%'
     )
   order by (
     select max(length(code)) from unnest(r.country_codes) as code
      where v_country like code || '%'
   ) desc
   limit 1;

  if v_region_id is null then
    select r.id, r.name into v_region_id, v_region_name
      from public.regions r
     where r.org_id = v_org_id and r.is_active and r.is_default
     limit 1;
  end if;

  -- ---- who in that region can take it? ----
  -- Least-busy first, then the longest-idle agent, so a quiet desk does not
  -- always hand every chat to the same alphabetically-first person.
  if v_region_id is not null then
    select a.id, a.full_name into v_agent_id, v_agent_name
      from public.available_agents a
      join public.agent_regions ar on ar.profile_id = a.id
     where a.org_id = v_org_id
       and ar.region_id = v_region_id
       and a.is_online
       and a.open_chats < a.max_open_chats
     order by a.open_chats asc, a.last_seen_at asc
     limit 1;
  end if;

  -- ---- nobody in-region: widen, if the workspace allows it ----
  if v_agent_id is null and coalesce(v_settings.assign_outside_region, true) then
    select a.id, a.full_name into v_agent_id, v_agent_name
      from public.available_agents a
     where a.org_id = v_org_id
       and a.is_online
       and a.open_chats < a.max_open_chats
     order by a.open_chats asc, a.last_seen_at asc
     limit 1;
    v_widened := v_agent_id is not null;
  end if;

  if v_agent_id is null then
    return jsonb_build_object(
      'assigned', false,
      'reason', 'no_agent_available',
      'region', v_region_name,
      'country_code', v_country
    );
  end if;

  -- The `assigned_agent_id is null` predicate makes this a CLAIM: if another
  -- concurrent handoff assigned this chat between our read and this write, that
  -- one wins and we report it rather than overwriting them.
  update public.chats
     set assigned_agent_id = v_agent_id
   where id = p_chat_id
     and assigned_agent_id is null;

  if not found then
    return jsonb_build_object('assigned', true, 'reason', 'raced',
                              'agent_id', (select assigned_agent_id from public.chats where id = p_chat_id));
  end if;

  -- The lead follows the chat, so the pipeline board and the inbox agree on who
  -- owns this customer.
  update public.leads
     set assigned_agent_id = v_agent_id
   where chat_id = p_chat_id
     and assigned_agent_id is null
     and stage not in ('closed_won', 'closed_lost');

  return jsonb_build_object(
    'assigned', true,
    'reason', case when v_widened then 'assigned_outside_region' else 'assigned_in_region' end,
    'agent_id', v_agent_id,
    'agent_name', v_agent_name,
    'region', v_region_name,
    'country_code', v_country
  );
end;
$$;

revoke all on function public.assign_conversation(uuid) from public;
grant execute on function public.assign_conversation(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 7. Seed a default region
-- -----------------------------------------------------------------------------
-- Without one, every workspace starts with a router that matches nothing and
-- silently falls through to "no agent available" — which looks exactly like a
-- broken feature rather than an unconfigured one.

insert into public.regions (org_id, name, country_codes, is_default)
select id, 'All customers', '{}', true
  from public.organizations
on conflict (org_id, name) do nothing;
