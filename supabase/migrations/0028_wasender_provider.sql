-- =============================================================================
-- 0028 — WasenderAPI as a second WhatsApp provider
--
-- Green API is not replaced. A workspace connects whichever gateway it wants
-- (or both), and every chat remembers which one delivered it, because a reply
-- has to leave from the same number the customer messaged. Sending a WasenderAPI
-- conversation's answer through Green API would arrive from a different phone —
-- to the customer that reads as a stranger joining the thread.
-- =============================================================================

-- 1. Sessions -----------------------------------------------------------------
-- Mirrors green_api_instances: same demo posture (plaintext credential column,
-- supervisor-only via RLS, never selected by the browser role in app code).
create table if not exists public.wasender_sessions (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  -- WasenderAPI's own session id. Text, not int: it is an opaque handle and the
  -- webhook envelope carries it as a string.
  session_id       text not null unique,
  session_name     text,
  -- Bearer token for POST /api/send-message, issued per session.
  api_key          text,
  -- Compared against the X-Webhook-Signature header on every inbound request.
  webhook_secret   text,
  phone            text,
  own_jid          text,                       -- E2: used to detect @mentions of the bot
  status           text not null default 'unknown',
  status_changed_at timestamptz,
  is_active        boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Same constraint Green API instances carry: one sending session per workspace.
create unique index if not exists wasender_one_active_per_org
  on public.wasender_sessions (org_id) where is_active;

create index if not exists wasender_sessions_org
  on public.wasender_sessions (org_id);

-- 2. Which gateway owns a chat -------------------------------------------------
-- Every existing row predates WasenderAPI, so the default backfills them
-- correctly and no data migration is needed.
alter table public.chats
  add column if not exists provider text not null default 'green_api'
    check (provider in ('green_api', 'wasender'));

-- Nullable: a wasender chat has no green_api_instances row to point at, and
-- chats.instance_id is an FK to that table.
alter table public.chats
  add column if not exists wasender_session_id uuid
    references public.wasender_sessions(id) on delete set null;

-- 3. RLS ------------------------------------------------------------------------
alter table public.wasender_sessions enable row level security;

-- Supervisors only, exactly like instances_admin (0001). The service role used
-- by the webhook route bypasses RLS entirely.
drop policy if exists wasender_admin on public.wasender_sessions;
create policy wasender_admin on public.wasender_sessions for all to authenticated
  using (org_id = app.current_org_id() and app.is_supervisor())
  with check (org_id = app.current_org_id() and app.is_supervisor());

-- 4. Notes ----------------------------------------------------------------------
-- webhook_events needs no change. Its dedup index is on (instance_id,
-- wa_message_id) where instance_id is free text, so WasenderAPI events are
-- written with a 'wasender:<session_id>' key and dedupe in the same index
-- without colliding with a numeric Green API instance id.
