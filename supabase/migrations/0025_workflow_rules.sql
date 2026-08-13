-- =============================================================================
-- HollyCRM 0025 — if / else the operator writes, not the developer
--
-- Everything the agent decides has so far been decided in code. Sensible
-- defaults, but every workspace wants one or two of its own:
--
--   "VIP enquiries over 50,000 SAR go straight to Ahmed, never to the bot."
--   "Anyone writing in Urdu goes to the Pakistan desk."
--   "Group chats from unknown numbers get a human, always."
--   "Anything mentioning 'complaint' skips the AI entirely."
--
-- None of those are worth a code change, and all of them are the difference
-- between a CRM the customer configures and one they file tickets against.
--
-- A rule is CONDITIONS + AN ACTION, evaluated once per inbound message after
-- the extractor has run — so conditions can read what the customer actually
-- said (intent, city, party size, budget) and not just the raw text.
--
-- Deliberately NOT a general expression language. Conditions are a typed list
-- of {field, operator, value}, which means the UI can build them with dropdowns,
-- they can be validated before they are saved, and a malformed rule fails to
-- save rather than failing at 2am against a real customer. A workspace that
-- needs arbitrary logic needs a developer, and should know that.
-- =============================================================================

create table if not exists public.workflow_rules (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  name       text not null check (length(name) between 1 and 100),

  -- Lower runs first. Ties break on created_at so ordering is always total —
  -- two rules at the same priority must not evaluate in whatever order the
  -- planner felt like today.
  priority   int not null default 100,

  -- 'all' = AND, 'any' = OR. Nesting is not supported on purpose: a UI that can
  -- express (A and B) or (C and not D) is a UI nobody can read six months later.
  -- Two rules express the same thing and each one is legible on its own.
  match_type text not null default 'all' check (match_type in ('all', 'any')),

  -- [{ "field": "budget", "op": "gt", "value": "50000" }]
  conditions jsonb not null default '[]'::jsonb,

  -- { "type": "assign_agent", "agent_id": "..." }
  action     jsonb not null,

  -- A matched rule normally ENDS evaluation, because two rules both trying to
  -- assign a chat is a race with no correct answer. `continue_on_match` lets a
  -- tagging rule run and hand over to the next one.
  continue_on_match boolean not null default false,

  is_active  boolean not null default true,
  -- Bumped whenever the rule fires, so a workspace can see which of its rules
  -- actually earn their place and which have never matched anything.
  match_count bigint not null default 0,
  last_matched_at timestamptz,

  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workflow_rules_active
  on public.workflow_rules (org_id, priority, created_at) where is_active;

comment on table public.workflow_rules is
  'Operator-defined if/else applied to every inbound message after extraction. '
  'Evaluated in priority order; the first match acts unless it sets '
  'continue_on_match.';

drop trigger if exists set_updated_at on public.workflow_rules;
create trigger set_updated_at before update on public.workflow_rules
  for each row execute function app.set_updated_at();

alter table public.workflow_rules enable row level security;

drop policy if exists rules_read on public.workflow_rules;
create policy rules_read on public.workflow_rules for select to authenticated
  using (org_id = app.current_org_id());

drop policy if exists rules_write on public.workflow_rules;
create policy rules_write on public.workflow_rules for all to authenticated
  using  (org_id = app.current_org_id() and app.is_supervisor())
  with check (org_id = app.current_org_id() and app.is_supervisor());

-- -----------------------------------------------------------------------------
-- Counting matches
-- -----------------------------------------------------------------------------
-- A bare UPDATE from the bot would need a write policy for the service role and
-- would race two concurrent messages hitting the same rule. One statement,
-- incremented in place.

create or replace function public.record_rule_match(p_rule_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.workflow_rules
     set match_count = match_count + 1,
         last_matched_at = now()
   where id = p_rule_id;
$$;

revoke all on function public.record_rule_match(uuid) from public;
grant execute on function public.record_rule_match(uuid) to service_role;
