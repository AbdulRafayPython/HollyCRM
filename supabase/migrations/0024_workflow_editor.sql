-- =============================================================================
-- HollyCRM 0024 — the workflow becomes an editor, and new workspaces get built
--
-- Two gaps, both about the same thing: the product assumed a configured
-- workspace and gave nobody a way to configure one.
--
--   The workflow view was a DIAGRAM. Fixed layout, nothing to grab, nothing to
--   switch off. Reading it once told you the shape of the pipeline and after
--   that it was wallpaper — you cannot arrange it around how you actually think
--   about your funnel, and you cannot turn a branch off without hunting through
--   four separate settings pages for the toggle that governs it.
--
--   A new workspace had NO first run. Sign up, and the agent is already live on
--   whatever defaults shipped, with no key, no knowledge and no idea what
--   business it works for. The first person to message you finds out.
--
-- Node positions are stored per workspace, not per user: a team argues about
-- the funnel together, and two people looking at "the workflow" during the same
-- call must be looking at the same picture.
-- =============================================================================

alter table public.bot_settings
  -- { "<node id>": { "x": 120, "y": 340 } } — absolute canvas coordinates.
  -- jsonb rather than a table: it is one blob, written whole on every drag-end,
  -- read whole on every open, and never queried by key.
  add column if not exists workflow_layout jsonb not null default '{}'::jsonb,

  -- Branch switches the canvas can toggle directly. greeting_enabled,
  -- smalltalk_enabled and auto_assign_enabled already exist and are reused —
  -- a second copy of a switch is a second answer to the same question.
  add column if not exists knowledge_enabled boolean not null default true,
  add column if not exists inventory_enabled boolean not null default true,

  -- Who the agent works for. Feeds the system prompt, so the assistant stops
  -- describing itself in the generic terms the demo shipped with.
  add column if not exists business_name text,
  add column if not exists business_url text,
  add column if not exists business_description text,
  add column if not exists onboarded_at timestamptz;

comment on column public.bot_settings.knowledge_enabled is
  'Whether non-price questions are answered from uploaded documents. Off sends '
  'every such question straight to a human, which is the right setting for a '
  'workspace that has not uploaded anything it trusts yet.';

comment on column public.bot_settings.inventory_enabled is
  'Whether the agent quotes live rates. Off still gathers requirements and '
  'hands the enquiry to a person — used while inventory is being loaded, so the '
  'agent never quotes from a half-imported rate sheet.';

comment on column public.bot_settings.onboarded_at is
  'When the build-your-agent wizard was completed. Null means the workspace is '
  'running on shipped defaults and the AI page should lead with setup rather '
  'than with configuration.';

-- -----------------------------------------------------------------------------
-- Test runs
-- -----------------------------------------------------------------------------
-- A workflow test is a real trip through the real pipeline with delivery
-- switched off. Keeping the results means a change can be compared against what
-- the agent did before it — "it used to answer this" is otherwise an argument
-- nobody can settle.

create table if not exists public.workflow_test_runs (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  message    text not null,
  -- Per-node outcome: what each step decided, how long it took, what it saw.
  trace      jsonb not null default '[]'::jsonb,
  reply      text,
  intent     text,
  succeeded  boolean not null default true,
  latency_ms int,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists workflow_test_runs_recent
  on public.workflow_test_runs (org_id, created_at desc);

alter table public.workflow_test_runs enable row level security;

drop policy if exists test_runs_read on public.workflow_test_runs;
create policy test_runs_read on public.workflow_test_runs for select to authenticated
  using (org_id = app.current_org_id());

drop policy if exists test_runs_write on public.workflow_test_runs;
create policy test_runs_write on public.workflow_test_runs for all to authenticated
  using  (org_id = app.current_org_id() and app.is_supervisor())
  with check (org_id = app.current_org_id() and app.is_supervisor());
