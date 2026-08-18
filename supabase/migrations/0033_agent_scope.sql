-- =============================================================================
-- HollyCRM 0033 — coverage is a boundary, not a preference
--
-- 0030, 0031 and 0032 built vocabulary and nothing else: a third role no policy
-- recognises, destinations nothing is scoped to, suppliers and clients nobody is
-- assigned. This is where those rows start deciding what a person can read, and
-- it is the migration that can lock a workspace out, so every rule it applies is
-- written down here rather than left for a policy to imply.
--
-- THE HOLE IT CLOSES. app.can_access_chat() (0001) grants an agent their own
-- chats plus the ENTIRE unassigned pool. Splitting a team by market is
-- decoration while every unassigned Dubai conversation is readable by the Makkah
-- desk, and no amount of UI filtering changes that — the anon key ships to the
-- browser and PostgREST answers directly. Scoping that does not rewrite this
-- function is not scoping.
--
-- THE RULE THAT MAKES IT SHIPPABLE. An empty coverage set means UNRESTRICTED,
-- not invisible. On the morning this runs nobody has a coverage row, and the
-- other reading empties every inbox in every workspace at once. A migration that
-- requires configuration before the product works again is an outage — the same
-- reasoning that keeps the .env fallbacks alive in resolveLlm().
--
-- HOW THE DIMENSIONS COMBINE. AND across dimensions, OR within one. "You cover
-- Makkah and Dubai" widens; "you cover Makkah, for Al Safwa" narrows. A
-- dimension with no rows is not a constraint at all, which is what lets an
-- operator adopt one dimension without having to answer for the other three.
--
-- WHAT A NULL MEANS. A null on a scoped dimension is IN scope — unknown is not
-- elsewhere. The alternative hides a brand-new inquiry from everybody scoped by
-- destination, because the bot has not extracted a city yet, and a conversation
-- nobody can see is a conversation nobody answers. Note the practical split that
-- creates: customer-country bites on the first message (the dialling prefix is
-- readable immediately — 0021), destination only once requirements land.
--
-- WHAT COVERAGE NEVER TAKES AWAY. A chat assigned to you stays readable however
-- far outside your coverage it sits. Somebody put it in your hands on purpose,
-- and having the row vanish from the person holding it is a worse failure than
-- the leak scoping exists to prevent. It is also the escape hatch: assignment
-- beats scope, so an out-of-market handover needs no configuration change.
--
-- WHICH SIDE EACH DIMENSION APPLIES TO. Supplier is an inventory dimension — a
-- conversation is not supplied by anybody. Client and customer-country are
-- conversation dimensions — a hotel has no client. Destination is the only one
-- that constrains both, which is what made the enum surgery in 0031 worth doing.
--
-- OWNERS ARE NEVER SCOPED; SUPERVISORS CAN BE. "Makkah desk lead" has to mean
-- something, so a supervisor holding coverage rows supervises inside their
-- market rather than over the whole workspace. The owner is the unscoped role by
-- definition, and the only account guaranteed to be able to see everything.
-- =============================================================================


-- =============================================================================
-- 1. The role starts counting — and the policies it must NOT inherit
-- =============================================================================
-- 0030 added the enum value and deliberately used it nowhere. Flipping
-- is_supervisor() on is a privilege grant across every policy written before the
-- role existed, and several of them hand over the workspace itself: the WhatsApp
-- instance rows, the LLM provider rows, the raw webhook log. 0030's own header
-- says a desk lead has no business rotating the LLM key or reconnecting
-- WhatsApp. Re-gating those to is_owner() in the SAME migration that activates
-- the role is what keeps that sentence true — split across two files there is a
-- window in which 'supervisor' means 'owner'.

-- Compared as text, not as app_role. A bare 'supervisor' literal is coerced to
-- the enum when the body is parsed, and Postgres refuses to resolve an enum
-- value added in the same still-open transaction ("unsafe use of new value") —
-- which is what makes 0030 and this file impossible to run or verify together
-- while the comparison is typed. The cast costs nothing and the values are the
-- same ones app_role carries.
create or replace function app.is_supervisor() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  -- 'super_admin'/'team_lead' are pre-0011 rows the remap may have missed.
  select coalesce(
    app.current_role()::text in ('owner', 'supervisor', 'super_admin', 'team_lead'),
    false)
$$;

comment on function app.is_supervisor is
  'Owner OR desk lead. Grants team and rate-sheet work, never credentials — '
  'those are app.is_owner(). isSupervisor() in src/lib/types.ts mirrors this.';

-- -----------------------------------------------------------------------------
-- 1a. Credentials and infrastructure become owner-only
-- -----------------------------------------------------------------------------

drop policy if exists instances_admin on public.green_api_instances;
create policy instances_admin on public.green_api_instances for all to authenticated
  using  (org_id = app.current_org_id() and app.is_owner())
  with check (org_id = app.current_org_id() and app.is_owner());

drop policy if exists wasender_admin on public.wasender_sessions;
create policy wasender_admin on public.wasender_sessions for all to authenticated
  using  (org_id = app.current_org_id() and app.is_owner())
  with check (org_id = app.current_org_id() and app.is_owner());

drop policy if exists llm_providers_read on public.llm_providers;
create policy llm_providers_read on public.llm_providers for select to authenticated
  using (org_id = app.current_org_id() and app.is_owner());

drop policy if exists llm_providers_write on public.llm_providers;
create policy llm_providers_write on public.llm_providers for all to authenticated
  using  (org_id = app.current_org_id() and app.is_owner())
  with check (org_id = app.current_org_id() and app.is_owner());

-- webhook_events and ai_runs carry raw message bodies and raw prompts for the
-- whole workspace, and neither has a chat to scope by. A scoped desk lead
-- reading either would walk straight around section 5.
drop policy if exists webhooks_admin on public.webhook_events;
create policy webhooks_admin on public.webhook_events for select to authenticated
  using (app.is_owner());

drop policy if exists ai_runs_admin on public.ai_runs;
create policy ai_runs_admin on public.ai_runs for select to authenticated
  using (org_id = app.current_org_id() and app.is_owner());

-- -----------------------------------------------------------------------------
-- 1b. The two SECURITY DEFINER functions that carry their own copy of the check
-- -----------------------------------------------------------------------------
-- A definer function runs as its owner, so the caller's RLS does not apply
-- inside it and the policies above do not reach it. Both are reproduced verbatim
-- from their original migrations with one predicate changed, because that is the
-- only honest way to append-only a function body.

/**
 * 0022's set_llm_key with is_supervisor() -> is_owner(). A supervisor can no
 * longer read llm_providers at all, and a writer who cannot see the row it is
 * writing to is the shape of an escalation.
 */
create or replace function public.set_llm_key(
  p_provider_id uuid,
  p_key         text
)
returns jsonb
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_org_id    uuid;
  v_secret_id uuid;
  v_hint      text;
begin
  select org_id, secret_id into v_org_id, v_secret_id
    from public.llm_providers where id = p_provider_id;

  if v_org_id is null then
    raise exception 'Unknown provider.';
  end if;

  -- The function runs as its owner, so the caller's RLS does not apply inside
  -- it. Re-check authorisation explicitly, or any authenticated user could
  -- write a key into any workspace by guessing a uuid.
  if v_org_id is distinct from app.current_org_id() or not app.is_owner() then
    raise exception 'Only the workspace owner can set this workspace''s model key.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_key is null or length(trim(p_key)) < 8 then
    raise exception 'That does not look like an API key.';
  end if;

  v_hint := '...' || right(trim(p_key), 4);

  if v_secret_id is null then
    v_secret_id := vault.create_secret(
      trim(p_key),
      'llm_key_' || p_provider_id::text,
      'LLM API key for provider ' || p_provider_id::text
    );
    update public.llm_providers
       set secret_id = v_secret_id, key_hint = v_hint
     where id = p_provider_id;
  else
    perform vault.update_secret(v_secret_id, trim(p_key));
    update public.llm_providers set key_hint = v_hint where id = p_provider_id;
  end if;

  -- Returns the hint, never the key. A function that can echo a secret back is
  -- one refactor away from a route that does.
  return jsonb_build_object('ok', true, 'key_hint', v_hint);
end;
$$;

/**
 * 0008's cleanup_conversations with is_supervisor() -> is_owner(). Bulk,
 * irreversible and org-wide: p_scope = 'all' deletes every chat, contact,
 * ai_run and webhook_event in the workspace without consulting a single chat.
 * It is the one supervisor capability a coverage boundary cannot contain.
 */
create or replace function public.cleanup_conversations(p_scope text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org   uuid := app.current_org_id();
  v_ids   uuid[];
  v_count int := 0;
begin
  if not app.is_owner() then
    raise exception 'Only the workspace owner can bulk-delete conversations';
  end if;
  if p_scope not in ('archived', 'no_value', 'all') then
    raise exception 'scope must be archived, no_value or all';
  end if;

  select array_agg(c.id) into v_ids
  from public.chats c
  where c.org_id = v_org
    and (
      p_scope = 'all'
      or (p_scope = 'archived' and c.is_archived)
      or (p_scope = 'no_value' and not exists (
            select 1 from public.leads l
            where l.chat_id = c.id
              and (l.stage = 'closed_won'
                   or exists (select 1 from public.quotes q where q.lead_id = l.id))
          ))
    );

  if v_ids is null then
    return jsonb_build_object('deleted', 0, 'org_id', v_org, 'chat_ids', '[]'::jsonb);
  end if;

  -- Cascades to messages, leads, lead_stage_events, quotes, documents, notes.
  delete from public.chats where id = any(v_ids);
  get diagnostics v_count = row_count;

  -- A full reset also clears the derived/log tables, otherwise the analytics
  -- pages would keep reporting activity for conversations that no longer exist.
  if p_scope = 'all' then
    delete from public.contacts       where org_id = v_org;
    delete from public.ai_runs        where org_id = v_org;
    delete from public.webhook_events where true;
  end if;

  return jsonb_build_object('deleted', v_count, 'org_id', v_org, 'chat_ids', to_jsonb(v_ids));
end $$;

-- Everything else stays at supervisor deliberately: bot settings and the kill
-- switch (0007), the knowledge base (0019), inventory writes (0007), regions
-- (0021), the workflow editor (0024/0025), destinations/suppliers/clients
-- (0031/0032), agent capacity (0021) and single-chat deletion. That is desk
-- work, and a desk lead who cannot do it is a sales agent with a title.


-- =============================================================================
-- 2. A conversation can name a market
-- =============================================================================
-- leads.city (0016) is text behind `check (city in ('Makkah','Madinah'))` — the
-- same frozen world 0031 took out of the hotels table, and the reason a lead
-- cannot be scoped to a destination the operator actually sells. The column
-- stays because the extractor, the slot merge and the pipeline board all read
-- it; what changes is that it is now a mirror of an org-owned row, exactly as
-- hotels.city became one.

alter table public.leads
  add column if not exists destination_id uuid
    references public.destinations(id) on delete set null;

-- on delete set null, not restrict: a destination an operator retires must not
-- be undeletable because a closed lead from last season still points at it.

-- Dropped by shape, not by name. `add column ... check (...)` (0016) leaves
-- Postgres to name the constraint, and a hand-applied environment can carry a
-- different one — a migration that silently fails to drop the ceiling would let
-- every Dubai lead through the trigger below and then reject the write.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.leads'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%Makkah%'
  loop
    execute format('alter table public.leads drop constraint %I', c.conname);
  end loop;
end $$;

update public.leads l
   set destination_id = d.id
  from public.destinations d
 where l.destination_id is null
   and l.city is not null
   and d.org_id = l.org_id
   and lower(d.name) = lower(l.city);

create index if not exists leads_by_destination
  on public.leads (org_id, destination_id)
  where stage not in ('closed_won', 'closed_lost');

/**
 * Fills in whichever of (destination_id, city) the writer left out — the same
 * contract as app.sync_hotel_destination() (0031), and for the same reason: the
 * extractor writes a city string and knows nothing about ids, and a bot path
 * that starts failing on an unknown destination is a silent outage on the reply
 * path rather than a visible one at deploy time.
 *
 * Unlike hotels.city this column is plain text, so a Dubai lead keeps its name
 * instead of going null.
 */
create or replace function app.sync_lead_destination() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_name text;
begin
  if new.destination_id is null and new.city is not null then
    select id into new.destination_id
      from public.destinations
     where org_id = new.org_id and lower(name) = lower(new.city);

    if new.destination_id is null then
      insert into public.destinations (org_id, name)
      values (new.org_id, new.city)
      on conflict do nothing
      returning id into new.destination_id;

      -- `on conflict do nothing` returns no row when another statement won the
      -- race; read the winner rather than leaving the lead unplaced.
      if new.destination_id is null then
        select id into new.destination_id
          from public.destinations
         where org_id = new.org_id and lower(name) = lower(new.city);
      end if;
    end if;
  end if;

  if new.destination_id is not null then
    select name into v_name from public.destinations where id = new.destination_id;
    new.city := v_name;
  end if;

  return new;
end $$;

drop trigger if exists sync_lead_destination on public.leads;
create trigger sync_lead_destination before insert or update of city, destination_id
  on public.leads
  for each row execute function app.sync_lead_destination();

comment on column public.leads.city is
  'Which destination the customer is asking about. A mirror of '
  'destinations.name, kept because the extractor and the pipeline board write '
  'and read a name. leads.destination_id is the authoritative value (0033).';


-- =============================================================================
-- 3. Coverage — which slice of the workspace is yours
-- =============================================================================
-- Join tables rather than array columns on profiles, matching agent_regions
-- (0021): a person covers several destinations, a destination is covered by
-- several people, and the policies join from both directions. Cascade on both
-- sides — removing a person or retiring a destination must not leave a coverage
-- row that grants nothing and blocks the delete.
--
-- Customer-country coverage is NOT redefined here. public.agent_regions already
-- exists and already means "this desk handles these dialling prefixes"; 0021
-- only ever read it to route a handoff. Section 4 gives the same rows a second
-- job without changing a column — behind the opt-in below, which is not
-- optional politeness.
--
-- The other three dimensions are safe on day one by construction: the tables are
-- created empty in this migration, so "no coverage rows" is true for everybody
-- and nothing narrows. agent_regions is the exception, and it is populated. On
-- this project's own database a sales agent already carries the default region
-- "All customers" (codes 92, 966) purely so the router had somewhere to send a
-- handoff. Reading that row as a visibility boundary would hide every customer
-- dialling from anywhere else the moment the migration ran — the outage the
-- header of this file promises to avoid, delivered by the one dimension that
-- looked free because it was already built.
--
-- So the region dimension only restricts once a workspace says so. Default
-- false: an operator who wants it turns it on in Settings, having been shown
-- who covers what.

alter table public.bot_settings
  add column if not exists enforce_region_scope boolean not null default false;

comment on column public.bot_settings.enforce_region_scope is
  'Does agent_regions (0021) restrict what an agent can SEE, or only where the '
  'router sends a handoff? Off by default because those rows predate 0033 and '
  'were written for routing — switching it on retroactively narrows inboxes.';

create table if not exists public.agent_destinations (
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  destination_id uuid not null references public.destinations(id) on delete cascade,
  primary key (profile_id, destination_id)
);
create index if not exists agent_destinations_by_destination
  on public.agent_destinations (destination_id);

create table if not exists public.agent_suppliers (
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  primary key (profile_id, supplier_id)
);
create index if not exists agent_suppliers_by_supplier
  on public.agent_suppliers (supplier_id);

create table if not exists public.agent_clients (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  client_id  uuid not null references public.clients(id) on delete cascade,
  primary key (profile_id, client_id)
);
create index if not exists agent_clients_by_client
  on public.agent_clients (client_id);


-- =============================================================================
-- 4. The scope predicates
-- =============================================================================
-- Every one of these answers true in three cases before it looks at anything:
-- the caller is an owner, the value is unknown, or the caller holds no rows in
-- that dimension. Those three short-circuits are the whole safety argument of
-- this migration and they are repeated in each function on purpose — a shared
-- helper here would be one edit away from removing all four at once.

-- Declared before its callers, not after: a `language sql` body is parsed and
-- validated at CREATE time, so a helper referenced above its own definition
-- fails the migration outright. Same constraint that put can_access_chat() in
-- section 10 of 0001 rather than beside the other helpers.

/** Has this workspace opted the region dimension in? See section 3. */
create or replace function app.region_scope_enforced() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select enforce_region_scope from public.bot_settings
                    where org_id = app.current_org_id()), false)
$$;

/**
 * Does the current user have ANY coverage row at all?
 *
 * The fast bail. In a workspace that has never opened the coverage UI — which is
 * every workspace the day this ships — this is the only extra work an inbox
 * query does, and can_access_chat() stays the cheap function 0023 tuned.
 */
create or replace function app.is_scoped() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.agent_destinations
                  where profile_id = (select auth.uid()))
      or exists (select 1 from public.agent_suppliers
                  where profile_id = (select auth.uid()))
      or exists (select 1 from public.agent_clients
                  where profile_id = (select auth.uid()))
      or (app.region_scope_enforced()
          and exists (select 1 from public.agent_regions
                       where profile_id = (select auth.uid())))
$$;

create or replace function app.covers_destination(p_destination_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_destination_id is null
      or app.is_owner()
      or not exists (select 1 from public.agent_destinations
                      where profile_id = (select auth.uid()))
      or exists (select 1 from public.agent_destinations
                  where profile_id = (select auth.uid())
                    and destination_id = p_destination_id)
$$;

create or replace function app.covers_supplier(p_supplier_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_supplier_id is null
      or app.is_owner()
      or not exists (select 1 from public.agent_suppliers
                      where profile_id = (select auth.uid()))
      or exists (select 1 from public.agent_suppliers
                  where profile_id = (select auth.uid())
                    and supplier_id = p_supplier_id)
$$;

create or replace function app.covers_client(p_client_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_client_id is null
      or app.is_owner()
      or not exists (select 1 from public.agent_clients
                      where profile_id = (select auth.uid()))
      or exists (select 1 from public.agent_clients
                  where profile_id = (select auth.uid())
                    and client_id = p_client_id)
$$;

/**
 * Customer-country coverage, resolved through the same longest-prefix rule
 * assign_conversation() uses (0021): '1868' must beat '1', and a number that
 * matches nothing falls to the org's default region so a new market is never in
 * a silent hole.
 *
 * The router keeps its own inline copy of that match. Rewriting a 150-line
 * SECURITY DEFINER router to share this helper is a behaviour change with its
 * own failure modes and does not belong in a migration about visibility — but
 * the two are now the same rule written twice, and changing one means changing
 * the other.
 */
create or replace function app.covers_country(p_country text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select nullif(trim(coalesce(p_country, '')), '') is null
      or app.is_owner()
      or not app.region_scope_enforced()
      or not exists (select 1 from public.agent_regions
                      where profile_id = (select auth.uid()))
      or exists (
           select 1 from public.agent_regions ar
            where ar.profile_id = (select auth.uid())
              and ar.region_id = (
                select coalesce(
                  (select r.id
                     from public.regions r
                    where r.org_id = app.current_org_id()
                      and r.is_active
                      and exists (select 1 from unnest(r.country_codes) as code
                                   where p_country like code || '%')
                    order by (select max(length(code))
                                from unnest(r.country_codes) as code
                               where p_country like code || '%') desc
                    limit 1),
                  (select r.id
                     from public.regions r
                    where r.org_id = app.current_org_id()
                      and r.is_active and r.is_default
                    limit 1))
              )
         )
$$;

/**
 * Is this conversation inside the current user's coverage?
 *
 * AND across the three dimensions a conversation has, OR within the destination
 * one — because a chat is not limited to a single lead. A group holds several
 * (B1), and the bot opens a fresh one per enquiry, so the obvious reading
 * ("consult the newest lead") is wrong twice over: a newer lead that has not
 * reached the city question yet carries destination_id = null and would drop the
 * whole conversation out of scope, and a group discussing Makkah and Dubai would
 * answer to whichever enquiry happened to arrive last.
 *
 * So: if no lead on the chat names a destination, the destination is unknown and
 * the null rule applies. If any does, covering any one of them is enough.
 */
create or replace function app.covers_chat(p_chat_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select app.is_owner()
      or not app.is_scoped()
      or exists (
           select 1
             from public.chats c
             left join public.contacts ct on ct.id = c.contact_id
            where c.id = p_chat_id
              and app.covers_client(c.client_id)
              and (
                not exists (select 1 from public.leads l
                             where l.chat_id = c.id and l.destination_id is not null)
                or exists (select 1 from public.leads l
                            where l.chat_id = c.id
                              and l.destination_id is not null
                              and app.covers_destination(l.destination_id))
              )
              and app.covers_country(
                    coalesce(ct.country_code,
                             regexp_replace(coalesce(ct.phone_e164, ''), '\D', '', 'g')))
         )
$$;


-- =============================================================================
-- 5. can_access_chat() — the unassigned pool stops being everybody's
-- =============================================================================
-- The one function this whole migration exists to change. Read the branches in
-- order, because the order is the policy:
--
--   assigned to you        always readable, coverage or not (see the header)
--   supervisor             every chat in the org, narrowed by coverage
--   unassigned             readable only if it is inside your coverage
--   assigned to someone    still invisible to an agent, exactly as before
--
-- With no coverage rows anywhere, app.covers_chat() short-circuits to true and
-- this reduces to 0001's function line for line.

create or replace function app.can_access_chat(p_chat_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.chats c
    where c.id = p_chat_id
      and c.org_id = app.current_org_id()
      and (
        c.assigned_agent_id = (select auth.uid())
        or ((app.is_supervisor() or c.assigned_agent_id is null)
            and app.covers_chat(c.id))
      )
  )
$$;

comment on function app.can_access_chat is
  'C5 + 0033: own chats always; the unassigned pool and a supervisor''s org-wide '
  'view are both narrowed to the caller''s coverage. Assignment beats scope.';

-- -----------------------------------------------------------------------------
-- 5a. Two reads that were org-wide and should never have been
-- -----------------------------------------------------------------------------
-- quotes and documents both hang off a lead, and both were readable by anyone in
-- the workspace. That was survivable while every agent could see every
-- unassigned chat anyway; it is a hole the moment coverage means anything, and
-- documents is the one holding passport scans (PDPL).

drop policy if exists quotes_read on public.quotes;
create policy quotes_read on public.quotes for select to authenticated
  using (org_id = app.current_org_id()
         and exists (select 1 from public.leads l
                      where l.id = lead_id and app.can_access_chat(l.chat_id)));

drop policy if exists quotes_insert on public.quotes;
create policy quotes_insert on public.quotes for insert to authenticated
  with check (org_id = app.current_org_id()
              and exists (select 1 from public.leads l
                           where l.id = lead_id and app.can_access_chat(l.chat_id)));

drop policy if exists documents_read on public.documents;
create policy documents_read on public.documents for select to authenticated
  using (org_id = app.current_org_id()
         and (chat_id is null or app.can_access_chat(chat_id)));

drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert to authenticated
  with check (org_id = app.current_org_id()
              and (chat_id is null or app.can_access_chat(chat_id)));

-- Single-chat deletion follows the same boundary: a scoped desk lead may delete
-- inside their market and nowhere else.
drop policy if exists chats_delete on public.chats;
create policy chats_delete on public.chats for delete to authenticated
  using (org_id = app.current_org_id()
         and app.is_supervisor()
         and app.covers_chat(id));


-- =============================================================================
-- 6. Inventory narrows to covered destinations and suppliers
-- =============================================================================
-- hotels_read was org-wide (0001). An agent scoped to Makkah who can still read
-- every Dubai rate can still quote one.
--
-- search_hotels() is `security invoker` (0031), so an agent calling it through
-- PostgREST is filtered by these policies for free. The bot is unaffected: it
-- reaches Postgres with the service role, which bypasses RLS entirely, and a bot
-- that could only search one desk's inventory would be a different product.

drop policy if exists hotels_read on public.hotels;
create policy hotels_read on public.hotels for select to authenticated
  using (org_id = app.current_org_id()
         and app.covers_destination(destination_id)
         and app.covers_supplier(supplier_id));

drop policy if exists hotels_write on public.hotels;
create policy hotels_write on public.hotels for all to authenticated
  using  (org_id = app.current_org_id() and app.is_supervisor()
          and app.covers_destination(destination_id)
          and app.covers_supplier(supplier_id))
  with check (org_id = app.current_org_id() and app.is_supervisor()
          and app.covers_destination(destination_id)
          and app.covers_supplier(supplier_id));

-- Room types and rates are restated rather than left to inherit the hotels
-- policy through their subquery. RLS does apply to a table referenced inside
-- another table's policy, but a boundary that depends on remembering that is a
-- boundary that breaks the next time one of these is rewritten.
drop policy if exists room_types_read on public.hotel_room_types;
create policy room_types_read on public.hotel_room_types for select to authenticated
  using (exists (select 1 from public.hotels h
                  where h.id = hotel_id
                    and h.org_id = app.current_org_id()
                    and app.covers_destination(h.destination_id)
                    and app.covers_supplier(h.supplier_id)));

drop policy if exists room_types_write on public.hotel_room_types;
create policy room_types_write on public.hotel_room_types for all to authenticated
  using  (app.is_supervisor() and exists (select 1 from public.hotels h
                  where h.id = hotel_id
                    and h.org_id = app.current_org_id()
                    and app.covers_destination(h.destination_id)
                    and app.covers_supplier(h.supplier_id)))
  with check (app.is_supervisor() and exists (select 1 from public.hotels h
                  where h.id = hotel_id
                    and h.org_id = app.current_org_id()
                    and app.covers_destination(h.destination_id)
                    and app.covers_supplier(h.supplier_id)));

drop policy if exists rates_read on public.hotel_rates;
create policy rates_read on public.hotel_rates for select to authenticated
  using (exists (select 1 from public.hotel_room_types rt
                   join public.hotels h on h.id = rt.hotel_id
                  where rt.id = room_type_id
                    and h.org_id = app.current_org_id()
                    and app.covers_destination(h.destination_id)
                    and app.covers_supplier(h.supplier_id)));

drop policy if exists rates_write on public.hotel_rates;
create policy rates_write on public.hotel_rates for all to authenticated
  using  (app.is_supervisor() and exists (select 1 from public.hotel_room_types rt
                   join public.hotels h on h.id = rt.hotel_id
                  where rt.id = room_type_id
                    and h.org_id = app.current_org_id()
                    and app.covers_destination(h.destination_id)
                    and app.covers_supplier(h.supplier_id)))
  with check (app.is_supervisor() and exists (select 1 from public.hotel_room_types rt
                   join public.hotels h on h.id = rt.hotel_id
                  where rt.id = room_type_id
                    and h.org_id = app.current_org_id()
                    and app.covers_destination(h.destination_id)
                    and app.covers_supplier(h.supplier_id)));

-- The dimension tables themselves. A scoped agent picking a destination from a
-- dropdown should not be offered a market they cannot sell — and the list is a
-- map of the business, which is a thing a departing agent should not be able to
-- take with them.
drop policy if exists destinations_read on public.destinations;
create policy destinations_read on public.destinations for select to authenticated
  using (org_id = app.current_org_id() and app.covers_destination(id));

drop policy if exists suppliers_read on public.suppliers;
create policy suppliers_read on public.suppliers for select to authenticated
  using (org_id = app.current_org_id() and app.covers_supplier(id));

drop policy if exists clients_read on public.clients;
create policy clients_read on public.clients for select to authenticated
  using (org_id = app.current_org_id() and app.covers_client(id));


-- =============================================================================
-- 7. assign_chat() — you cannot hand out a conversation you cannot see
-- =============================================================================
-- 0003's version authorises on `v_chat.org_id <> app.current_org_id()` alone.
-- SECURITY DEFINER means section 5 never runs, so a scoped desk lead could
-- assign — or claim — a chat in a market they have no read access to, and find
-- out by watching it vanish. Reproduced from 0003 with the org check replaced by
-- the access check that now says more than org membership does.

create or replace function public.assign_chat(p_chat_id uuid, p_agent_id uuid)
returns public.chats
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_chat public.chats;
  v_me   uuid := auth.uid();
begin
  select * into v_chat from public.chats where id = p_chat_id;
  if not found then
    raise exception 'chat not found';
  end if;
  -- Subsumes the org check: can_access_chat() is false for every other
  -- workspace, and now also for a chat outside the caller's coverage.
  if not app.can_access_chat(p_chat_id) then
    raise exception 'forbidden';
  end if;

  if not app.is_supervisor() then
    -- claim an unassigned chat, or release/keep your own
    if v_chat.assigned_agent_id is not null and v_chat.assigned_agent_id <> v_me then
      raise exception 'chat is assigned to another agent';
    end if;
    if p_agent_id is not null and p_agent_id <> v_me then
      raise exception 'only a supervisor can assign to another agent';
    end if;
  else
    if p_agent_id is not null and not exists (
      select 1 from public.profiles
      where id = p_agent_id and org_id = v_chat.org_id and is_active
    ) then
      raise exception 'target agent is not in this organisation';
    end if;
  end if;

  update public.chats
     set assigned_agent_id = p_agent_id
   where id = p_chat_id
  returning * into v_chat;

  -- Keep the open lead's owner in step with the chat's owner.
  update public.leads
     set assigned_agent_id = p_agent_id
   where chat_id = p_chat_id
     and stage not in ('closed_won','closed_lost');

  return v_chat;
end $$;


-- =============================================================================
-- 8. RLS on the coverage tables
-- =============================================================================
-- Read your own coverage, plus the whole org's if you supervise it — an agent
-- has to be able to see what they cover to understand an empty inbox, and a
-- desk lead has to see the roster to hand work over. Write is supervisor-only:
-- self-assigned coverage is self-assigned access.

alter table public.agent_destinations enable row level security;
alter table public.agent_suppliers    enable row level security;
alter table public.agent_clients      enable row level security;

drop policy if exists agent_destinations_read on public.agent_destinations;
create policy agent_destinations_read on public.agent_destinations for select to authenticated
  using (profile_id = (select auth.uid())
         or (app.is_supervisor() and exists (
               select 1 from public.profiles p
                where p.id = profile_id and p.org_id = app.current_org_id())));

drop policy if exists agent_destinations_write on public.agent_destinations;
create policy agent_destinations_write on public.agent_destinations for all to authenticated
  using  (app.is_supervisor() and exists (
            select 1 from public.destinations d
             where d.id = destination_id and d.org_id = app.current_org_id()))
  with check (app.is_supervisor() and exists (
            select 1 from public.destinations d
             where d.id = destination_id and d.org_id = app.current_org_id())
          and exists (
            select 1 from public.profiles p
             where p.id = profile_id and p.org_id = app.current_org_id()));

drop policy if exists agent_suppliers_read on public.agent_suppliers;
create policy agent_suppliers_read on public.agent_suppliers for select to authenticated
  using (profile_id = (select auth.uid())
         or (app.is_supervisor() and exists (
               select 1 from public.profiles p
                where p.id = profile_id and p.org_id = app.current_org_id())));

drop policy if exists agent_suppliers_write on public.agent_suppliers;
create policy agent_suppliers_write on public.agent_suppliers for all to authenticated
  using  (app.is_supervisor() and exists (
            select 1 from public.suppliers s
             where s.id = supplier_id and s.org_id = app.current_org_id()))
  with check (app.is_supervisor() and exists (
            select 1 from public.suppliers s
             where s.id = supplier_id and s.org_id = app.current_org_id())
          and exists (
            select 1 from public.profiles p
             where p.id = profile_id and p.org_id = app.current_org_id()));

drop policy if exists agent_clients_read on public.agent_clients;
create policy agent_clients_read on public.agent_clients for select to authenticated
  using (profile_id = (select auth.uid())
         or (app.is_supervisor() and exists (
               select 1 from public.profiles p
                where p.id = profile_id and p.org_id = app.current_org_id())));

drop policy if exists agent_clients_write on public.agent_clients;
create policy agent_clients_write on public.agent_clients for all to authenticated
  using  (app.is_supervisor() and exists (
            select 1 from public.clients cl
             where cl.id = client_id and cl.org_id = app.current_org_id()))
  with check (app.is_supervisor() and exists (
            select 1 from public.clients cl
             where cl.id = client_id and cl.org_id = app.current_org_id())
          and exists (
            select 1 from public.profiles p
             where p.id = profile_id and p.org_id = app.current_org_id()));

-- agent_regions (0021) gains a read policy for the agent themselves. Its
-- existing read policy is org-wide and its write policy is already supervisor-
-- only, so only the "see your own coverage" half was missing.
drop policy if exists agent_regions_read on public.agent_regions;
create policy agent_regions_read on public.agent_regions for select to authenticated
  using (profile_id = (select auth.uid())
         or exists (select 1 from public.regions r
                     where r.id = region_id and r.org_id = app.current_org_id()));
