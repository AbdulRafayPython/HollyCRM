-- =============================================================================
-- HollyCRM — corrected initial schema (replaces PRD v1.1 §5)
-- Target: Supabase Postgres 15+
-- Run in: Supabase Dashboard → SQL Editor (or `supabase db push`)
--
-- Fixes applied vs PRD v1.1 — see ARCHITECTURE_REVIEW.md:
--   B1  chats/conversation entity introduced (messages no longer hang off leads)
--   B2  message history survives lead deletion
--   B3  per-date, per-room-type rates and allotment
--   B4  internal_notes, participants, quotes, documents, stage history, instances
--   B6  updated_at triggers that actually fire
--   B7  WhatsApp-side timestamp preserved for correct ordering
--   B8  full index coverage
--   B9  enums instead of free-text status columns
--   B10 org_id on every business table
--   B13 SAR-first currency handling
--   C1  RLS role checks never touch auth.users
--   C2  messages has explicit policies (was deny-all)
--   C4  RLS on every table in public
--   C5  WITH CHECK on updates; explicit insert/delete policies
--   C8  (select auth.uid()) for InitPlan caching
--   C9  Realtime Broadcast authorized via realtime.messages RLS
--   A2  vector(384) for Supabase gte-small, not OpenAI's 1536
-- =============================================================================

create extension if not exists vector      with schema extensions;
create extension if not exists pg_trgm     with schema extensions;
create extension if not exists btree_gist  with schema extensions;
-- pg_cron: enable from Dashboard → Database → Extensions (needed for bot auto-resume)

-- =============================================================================
-- 1. ENUMS  (B9)
-- =============================================================================

create type public.app_role        as enum ('super_admin','team_lead','agent');
create type public.chat_type       as enum ('direct','group');
create type public.sender_type     as enum ('client','agent','bot','system');
create type public.msg_direction   as enum ('in','out');
create type public.msg_type        as enum ('text','image','document','audio','video','location','contact','sticker','unsupported');
create type public.delivery_status as enum ('pending','sent','delivered','read','failed');
create type public.lead_stage      as enum ('new_inquiry','requirements_gathered','quotation_sent','under_negotiation','closed_won','closed_lost');
create type public.city_name       as enum ('Makkah','Madinah');
create type public.room_config     as enum ('single','double','triple','quad','sharing');
create type public.instance_state  as enum ('authorized','notAuthorized','blocked','sleepMode','starting','unknown');

-- =============================================================================
-- 2. TENANCY + IDENTITY  (B10, C1)
-- =============================================================================

create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  timezone   text not null default 'Asia/Riyadh',   -- E6
  currency   text not null default 'SAR',           -- B13
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Role lives here, NOT in auth.users. RLS policies may not read auth.users. (C1)
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  role       public.app_role not null default 'agent',
  full_name  text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.profiles (org_id, role) where is_active;

-- Green API credentials are referenced, never stored in plaintext. (C7)
create table public.green_api_instances (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  instance_id       text not null unique,
  own_jid           text,                        -- E2: used to detect @mentions of the bot
  token_vault_id    uuid,                        -- vault.create_secret() -> id
  webhook_token     text,                        -- C6: verified as Bearer on inbound
  state             public.instance_state not null default 'unknown',  -- D5
  state_changed_at  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- =============================================================================
-- 3. RLS HELPERS  (C1 — SECURITY DEFINER so policies never touch auth.users,
--                  and so profiles lookups don't recurse into their own RLS)
-- =============================================================================

create schema if not exists app;

create or replace function app.current_org_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select org_id from public.profiles where id = (select auth.uid())
$$;

create or replace function app.current_role() returns public.app_role
language sql stable security definer set search_path = public, pg_temp as $$
  select role from public.profiles where id = (select auth.uid())
$$;

create or replace function app.is_supervisor() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(app.current_role() in ('super_admin','team_lead'), false)
$$;

grant usage on schema app to authenticated;

-- NOTE: app.can_access_chat() is defined in section 10, not here. A `language sql`
-- function body is parsed and validated at CREATE time, so it cannot reference
-- public.chats until that table exists.

-- =============================================================================
-- 4. CONVERSATIONS  (B1 — the entity PRD v1.1 was missing)
-- =============================================================================

create table public.contacts (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  wa_jid       text not null,                    -- 9665XXXXXXXX@c.us
  phone_e164   text,
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (org_id, wa_jid)
);

create table public.chats (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  instance_id          uuid references public.green_api_instances(id) on delete set null,
  chat_jid             text not null,            -- ...@c.us or ...@g.us
  chat_type            public.chat_type not null,
  title                text,
  contact_id           uuid references public.contacts(id) on delete set null,  -- direct only
  participant_count    int not null default 0,
  assigned_agent_id    uuid references public.profiles(id) on delete set null,
  is_bot_paused        boolean not null default false,
  bot_resume_at        timestamptz,              -- E4: pg_cron clears is_bot_paused
  bot_replies_today    int not null default 0,   -- E3: per-group throttle
  last_bot_reply_at    timestamptz,
  last_message_at      timestamptz,
  first_agent_reply_at timestamptz,              -- E5: makes FRT computable
  unread_count         int not null default 0,
  is_archived          boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (org_id, chat_jid)
);
create index on public.chats (org_id, is_archived, last_message_at desc);
create index on public.chats (org_id, assigned_agent_id) where not is_archived;
create index on public.chats (bot_resume_at) where bot_resume_at is not null;

create table public.chat_participants (
  chat_id    uuid not null references public.chats(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  is_admin   boolean not null default false,
  joined_at  timestamptz not null default now(),
  primary key (chat_id, contact_id)
);

-- =============================================================================
-- 5. LEADS + PIPELINE  (B5, B9, E5)
-- =============================================================================

create table public.leads (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  chat_id            uuid not null references public.chats(id) on delete cascade,
  contact_id         uuid references public.contacts(id) on delete set null,
  assigned_agent_id  uuid references public.profiles(id) on delete set null,
  stage              public.lead_stage not null default 'new_inquiry',
  makkah_hotel_pref  text,
  madinah_hotel_pref text,
  check_in_date      date,
  check_out_date     date,
  nights             int generated always as (check_out_date - check_in_date) stored,  -- B5
  pax_count          int check (pax_count is null or pax_count > 0),
  rooms_count        int check (rooms_count is null or rooms_count > 0),
  room_configuration public.room_config,          -- B5
  max_distance_m     int,                         -- B5
  shuttle_acceptable boolean not null default true,
  budget_amount      numeric(12,2),
  budget_currency    text not null default 'SAR', -- B13
  drop_reason        text,                        -- B5 (§3.1 mandatory on closed_lost)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint leads_dates_sane   check (check_out_date is null or check_in_date is null
                                       or check_out_date > check_in_date),
  constraint leads_drop_reason  check (stage <> 'closed_lost' or drop_reason is not null)
);
create index on public.leads (org_id, stage);
create index on public.leads (org_id, assigned_agent_id) where stage not in ('closed_won','closed_lost');
create index on public.leads (chat_id);

-- E5: without this table the funnel and automation-rate reports cannot be built.
create table public.lead_stage_events (
  id         bigserial primary key,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  lead_id    uuid not null references public.leads(id) on delete cascade,
  from_stage public.lead_stage,
  to_stage   public.lead_stage not null,
  changed_by uuid references public.profiles(id) on delete set null,
  by_bot     boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.lead_stage_events (lead_id, created_at);
create index on public.lead_stage_events (org_id, to_stage, created_at);

-- =============================================================================
-- 6. MESSAGES  (B2, B7, B11, B14)
-- =============================================================================

create table public.messages (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations(id) on delete cascade,
  chat_id               uuid not null references public.chats(id) on delete cascade,
  lead_id               uuid references public.leads(id) on delete set null,  -- B2: no cascade
  wa_message_id         text,
  direction             public.msg_direction not null,
  sender_type           public.sender_type not null,
  sender_contact_id     uuid references public.contacts(id) on delete set null,
  sender_agent_id       uuid references public.profiles(id) on delete set null,
  message_type          public.msg_type not null default 'text',
  body                  text,
  media_path            text,                     -- C3: Storage object path, never a public URL
  media_mime            text,
  reply_to_wa_message_id text,                    -- B11
  wa_timestamp          timestamptz not null,     -- B7: order by this, not created_at
  delivery_status       public.delivery_status not null default 'sent',  -- B14
  created_at            timestamptz not null default now()
);
-- B8: the index that keeps the inbox fast at 18M+ rows
create index on public.messages (chat_id, wa_timestamp desc);
create index on public.messages (org_id, created_at desc);
create index on public.messages (lead_id) where lead_id is not null;
-- D3: idempotency for Green API webhook retries.
-- A real CONSTRAINT, not a partial index: PostgREST upsert emits
-- ON CONFLICT (org_id, wa_message_id) with no WHERE clause, and Postgres cannot
-- use a partial unique index as the arbiter for that — every inbound insert
-- would fail with 42P10. NULL wa_message_id rows stay allowed (NULLs are
-- distinct in unique constraints).
alter table public.messages
  add constraint messages_org_wa_message_unique unique (org_id, wa_message_id);

create table public.internal_notes (      -- B4 (§2.2 referenced it, never defined it)
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  chat_id      uuid not null references public.chats(id) on delete cascade,
  lead_id      uuid references public.leads(id) on delete set null,
  -- nullable: bot/system notes (e.g. "handed off to a human") have no human author
  author_id    uuid references public.profiles(id) on delete cascade,
  body         text not null,
  mentioned_ids uuid[] not null default '{}',
  created_at   timestamptz not null default now()
);
create index on public.internal_notes (chat_id, created_at desc);

-- C3: passports/vouchers tracked separately, always private storage
create table public.documents (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  lead_id       uuid references public.leads(id) on delete cascade,
  chat_id       uuid references public.chats(id) on delete set null,
  kind          text not null check (kind in ('passport','visa','voucher','receipt','other')),
  storage_path  text not null,          -- private bucket only
  uploaded_by   uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index on public.documents (lead_id);

-- =============================================================================
-- 7. HOLLYLAND INVENTORY  (B3, A2, A3)
-- =============================================================================

create table public.hotels (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  name                text not null,
  city                public.city_name not null,
  star_rating         int check (star_rating between 1 and 5),
  distance_to_haram_m int,
  has_shuttle         boolean not null default false,
  shuttle_minutes     int,
  description         text,
  amenities           text[] not null default '{}',
  is_active           boolean not null default true,
  embedding           extensions.vector(384),      -- A2: Supabase gte-small, not OpenAI 1536
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on public.hotels (org_id, city, star_rating) where is_active;
create index on public.hotels (city, distance_to_haram_m) where is_active;
create index on public.hotels using gin (name extensions.gin_trgm_ops);
-- A3: vector index exists but is a re-ranker, never the filter. Safe to skip until data is embedded.
create index hotels_embedding_idx on public.hotels
  using hnsw (embedding extensions.vector_cosine_ops);

create table public.hotel_room_types (
  id       uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  name     text not null,
  config   public.room_config not null,
  capacity int not null check (capacity > 0),
  unique (hotel_id, name)
);

-- B3: rates vary 5-10x between off-peak and Ramadan/Hajj. One price column cannot work.
create table public.hotel_rates (
  id            uuid primary key default gen_random_uuid(),
  room_type_id  uuid not null references public.hotel_room_types(id) on delete cascade,
  valid_from    date not null,
  valid_to      date not null,
  price_per_night numeric(12,2) not null check (price_per_night >= 0),
  currency      text not null default 'SAR',
  allotment     int not null default 0 check (allotment >= 0),
  season_label  text,                            -- E6: 'Ramadan', 'Hajj', 'Off-peak'
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (valid_to >= valid_from),
  -- prevents two overlapping prices for the same room type
  constraint hotel_rates_no_overlap exclude using gist (
    room_type_id with =,
    daterange(valid_from, valid_to, '[]') with &&
  )
);
create index on public.hotel_rates (room_type_id, valid_from, valid_to);

create table public.quotes (               -- B4 (§3.1 stage 3 had no storage)
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  lead_id      uuid not null references public.leads(id) on delete cascade,
  created_by   uuid references public.profiles(id) on delete set null,
  by_bot       boolean not null default false,
  total_amount numeric(12,2),
  currency     text not null default 'SAR',
  payload      jsonb not null default '{}',   -- the hotel/room/night breakdown as sent
  sent_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index on public.quotes (lead_id, created_at desc);

-- =============================================================================
-- 8. INGESTION + AI OBSERVABILITY  (D3, D4, A6)
-- =============================================================================

create table public.webhook_events (
  id            bigserial primary key,
  instance_id   text,
  wa_message_id text,
  event_type    text,
  payload       jsonb not null,
  status        text not null default 'pending' check (status in ('pending','done','failed','skipped')),
  attempts      int not null default 0,
  error         text,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz
);
-- D3: Green API retries on slow 200s. This is what stops duplicate leads and double bot replies.
create unique index webhook_events_dedup
  on public.webhook_events (instance_id, wa_message_id) where wa_message_id is not null;
create index on public.webhook_events (status, received_at) where status <> 'done';

create table public.ai_runs (              -- A6: without this, a DeepSeek outage is invisible
  id             bigserial primary key,
  org_id         uuid references public.organizations(id) on delete cascade,
  chat_id        uuid references public.chats(id) on delete set null,
  model          text not null,
  purpose        text not null,            -- 'extract_requirements' | 'compose_reply' | 'embed'
  latency_ms     int,
  prompt_tokens  int,
  output_tokens  int,
  succeeded      boolean not null default true,
  error          text,
  created_at     timestamptz not null default now()
);
create index on public.ai_runs (org_id, created_at desc);
create index on public.ai_runs (succeeded, created_at desc) where not succeeded;

-- =============================================================================
-- 9. TRIGGERS  (B6, E5, C9)
-- =============================================================================

create or replace function app.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['organizations','profiles','green_api_instances','contacts',
                           'chats','leads','hotels','hotel_rates']
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function app.set_updated_at()', t);
  end loop;
end $$;

-- E5: record every stage transition so the funnel and FRT reports are computable
create or replace function app.log_stage_change() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    insert into public.lead_stage_events (org_id, lead_id, from_stage, to_stage, changed_by, by_bot)
    values (new.org_id, new.id,
            case when tg_op = 'UPDATE' then old.stage end,
            new.stage, auth.uid(), auth.uid() is null);
  end if;
  return new;
end $$;

create trigger log_stage_change after insert or update of stage on public.leads
  for each row execute function app.log_stage_change();

-- C9 + §1.3: push new messages over Realtime Broadcast (no WAL parsing).
create or replace function app.broadcast_message() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'id', new.id, 'chat_id', new.chat_id, 'body', new.body,
      'sender_type', new.sender_type, 'message_type', new.message_type,
      'wa_timestamp', new.wa_timestamp),
    'new_message',
    'chat:' || new.chat_id::text,
    true                       -- private channel: subscription is authorized below
  );
  return new;
end $$;

create trigger broadcast_message after insert on public.messages
  for each row execute function app.broadcast_message();

-- =============================================================================
-- 10. ROW LEVEL SECURITY  (C1, C2, C4, C5, C8, C9)
-- Every table in public gets RLS. No exceptions — the anon key ships to browsers.
-- =============================================================================

-- Defined here rather than with the other helpers: public.chats has to exist
-- before a `language sql` body referencing it will parse.
-- Agents see their own chats + the unassigned pool; supervisors see the whole org.
create or replace function app.can_access_chat(p_chat_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.chats c
    where c.id = p_chat_id
      and c.org_id = app.current_org_id()
      and (app.is_supervisor()
           or c.assigned_agent_id = (select auth.uid())
           or c.assigned_agent_id is null)
  )
$$;

alter table public.organizations       enable row level security;
alter table public.profiles            enable row level security;
alter table public.green_api_instances enable row level security;
alter table public.contacts            enable row level security;
alter table public.chats               enable row level security;
alter table public.chat_participants   enable row level security;
alter table public.leads               enable row level security;
alter table public.lead_stage_events   enable row level security;
alter table public.messages            enable row level security;
alter table public.internal_notes      enable row level security;
alter table public.documents           enable row level security;
alter table public.hotels              enable row level security;
alter table public.hotel_room_types    enable row level security;
alter table public.hotel_rates         enable row level security;
alter table public.quotes              enable row level security;
alter table public.webhook_events      enable row level security;
alter table public.ai_runs             enable row level security;

-- Org + profiles
create policy org_read on public.organizations for select to authenticated
  using (id = app.current_org_id());

create policy profiles_read on public.profiles for select to authenticated
  using (org_id = app.current_org_id());
create policy profiles_self_update on public.profiles for update to authenticated
  using  (id = (select auth.uid()))
  with check (id = (select auth.uid()) and org_id = app.current_org_id());

-- Instances and webhook/AI logs: supervisors only (service role bypasses RLS entirely)
create policy instances_admin on public.green_api_instances for all to authenticated
  using (org_id = app.current_org_id() and app.is_supervisor())
  with check (org_id = app.current_org_id() and app.is_supervisor());
create policy webhooks_admin on public.webhook_events for select to authenticated
  using (app.is_supervisor());
create policy ai_runs_admin on public.ai_runs for select to authenticated
  using (org_id = app.current_org_id() and app.is_supervisor());

-- Contacts
create policy contacts_read on public.contacts for select to authenticated
  using (org_id = app.current_org_id());
create policy contacts_write on public.contacts for update to authenticated
  using  (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

-- Chats: agents see own + unassigned; supervisors see all. C5: WITH CHECK blocks
-- an agent from reassigning a chat away from themselves.
create policy chats_read on public.chats for select to authenticated
  using (app.can_access_chat(id));
create policy chats_update on public.chats for update to authenticated
  using (app.can_access_chat(id))
  with check (
    org_id = app.current_org_id()
    and (app.is_supervisor() or assigned_agent_id = (select auth.uid()))
  );

create policy participants_read on public.chat_participants for select to authenticated
  using (app.can_access_chat(chat_id));

-- Leads
create policy leads_read on public.leads for select to authenticated
  using (app.can_access_chat(chat_id));
create policy leads_insert on public.leads for insert to authenticated
  with check (org_id = app.current_org_id() and app.can_access_chat(chat_id));
create policy leads_update on public.leads for update to authenticated
  using (app.can_access_chat(chat_id))
  with check (
    org_id = app.current_org_id()
    and (app.is_supervisor() or assigned_agent_id = (select auth.uid()))
  );
create policy leads_delete on public.leads for delete to authenticated
  using (org_id = app.current_org_id() and app.is_supervisor());

create policy stage_events_read on public.lead_stage_events for select to authenticated
  using (org_id = app.current_org_id());

-- C2: PRD v1.1 enabled RLS here and defined no policy at all -> inbox showed nothing.
create policy messages_read on public.messages for select to authenticated
  using (app.can_access_chat(chat_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (org_id = app.current_org_id() and app.can_access_chat(chat_id)
              and direction = 'out' and sender_type = 'agent');

create policy notes_read on public.internal_notes for select to authenticated
  using (app.can_access_chat(chat_id));
create policy notes_insert on public.internal_notes for insert to authenticated
  with check (org_id = app.current_org_id() and author_id = (select auth.uid())
              and app.can_access_chat(chat_id));

create policy documents_read on public.documents for select to authenticated
  using (org_id = app.current_org_id());
create policy documents_insert on public.documents for insert to authenticated
  with check (org_id = app.current_org_id());

-- Inventory: readable org-wide, writable by supervisors only
create policy hotels_read on public.hotels for select to authenticated
  using (org_id = app.current_org_id());
create policy hotels_write on public.hotels for all to authenticated
  using (org_id = app.current_org_id() and app.is_supervisor())
  with check (org_id = app.current_org_id() and app.is_supervisor());
create policy room_types_read on public.hotel_room_types for select to authenticated
  using (exists (select 1 from public.hotels h
                 where h.id = hotel_id and h.org_id = app.current_org_id()));
create policy rates_read on public.hotel_rates for select to authenticated
  using (exists (select 1 from public.hotel_room_types rt
                 join public.hotels h on h.id = rt.hotel_id
                 where rt.id = room_type_id and h.org_id = app.current_org_id()));

create policy quotes_read on public.quotes for select to authenticated
  using (org_id = app.current_org_id());
create policy quotes_insert on public.quotes for insert to authenticated
  with check (org_id = app.current_org_id());

-- C9: Realtime Broadcast is NOT access-controlled by default. Without this,
-- any signed-in agent could subscribe to any chat topic.
create or replace function app.topic_chat_id(p_topic text) returns uuid
language plpgsql stable as $$
begin
  return substring(p_topic from '^chat:(.+)$')::uuid;
exception when others then
  return null;
end $$;

create policy realtime_chat_subscribe on realtime.messages for select to authenticated
  using (app.can_access_chat(app.topic_chat_id(realtime.topic())));

-- Granted last so it covers every function in the schema, including the two
-- defined in this section.
grant execute on all functions in schema app to authenticated;

-- =============================================================================
-- 11. HOTEL SEARCH  (A3 — exact SQL filtering; embedding is an optional re-rank)
-- This is the single tool the DeepSeek bot is allowed to call.
-- Passing p_query_embedding => NULL works perfectly, so the bot is usable before
-- any embeddings exist.
-- =============================================================================

create or replace function public.search_hotels(
  p_city                 public.city_name,
  p_check_in             date,
  p_check_out            date,
  p_pax                  int     default 2,
  p_rooms                int     default 1,
  p_max_price_per_night  numeric default null,
  p_max_distance_m       int     default null,
  p_min_stars            int     default null,
  p_shuttle_ok           boolean default true,
  p_query_embedding      extensions.vector(384) default null,
  p_limit                int     default 5
)
returns table (
  hotel_id        uuid,
  hotel_name      text,
  star_rating     int,
  distance_m      int,
  has_shuttle     boolean,
  room_type       text,
  capacity        int,
  nights          int,
  price_per_night numeric,
  total_price     numeric,
  currency        text,
  rooms_available int,
  description     text
)
language sql stable security invoker set search_path = public, extensions, pg_temp as $$
  with days as (
    select gs::date as d
    from generate_series(p_check_in, p_check_out - 1, interval '1 day') gs
  ),
  candidates as (
    select
      h.id, h.name, h.star_rating, h.distance_to_haram_m, h.has_shuttle,
      h.description, h.embedding,
      rt.name as rt_name, rt.capacity,
      count(distinct d.d)              as covered_days,
      round(avg(r.price_per_night), 2) as avg_price,
      sum(r.price_per_night)           as room_total,
      min(r.allotment)                 as min_allotment,
      min(r.currency)                  as currency
    from public.hotels h
    join public.hotel_room_types rt on rt.hotel_id = h.id
    cross join days d
    join public.hotel_rates r
      on r.room_type_id = rt.id
     and d.d between r.valid_from and r.valid_to
    where h.is_active
      and h.city = p_city
      and (p_min_stars is null or h.star_rating >= p_min_stars)
      and (p_max_distance_m is null
           or h.distance_to_haram_m <= p_max_distance_m
           or (p_shuttle_ok and h.has_shuttle))
    group by h.id, rt.id, rt.name, rt.capacity
  )
  select
    c.id, c.name, c.star_rating, c.distance_to_haram_m, c.has_shuttle,
    c.rt_name, c.capacity,
    (select count(*)::int from days),
    c.avg_price,
    round(c.room_total * p_rooms, 2),
    c.currency,
    c.min_allotment,
    c.description
  from candidates c
  where c.covered_days = (select count(*) from days)      -- fully priced for the stay
    and c.min_allotment >= p_rooms                        -- actually available
    and c.capacity * p_rooms >= p_pax                     -- fits the party
    and (p_max_price_per_night is null or c.avg_price <= p_max_price_per_night)
  order by
    case when p_query_embedding is null then 0
         else (c.embedding <=> p_query_embedding) end,    -- optional semantic re-rank
    c.distance_to_haram_m nulls last,
    c.avg_price
  limit greatest(p_limit, 1);
$$;

-- =============================================================================
-- 12. BOT AUTO-RESUME  (E4 — §2.2 specified this with no scheduler)
-- After enabling pg_cron from the Dashboard:
--   select cron.schedule('bot-auto-resume','*/5 * * * *',
--     $$update public.chats set is_bot_paused = false, bot_resume_at = null
--       where is_bot_paused and bot_resume_at is not null and bot_resume_at <= now()$$);
-- =============================================================================
