-- =============================================================================
-- HollyCRM 0035 — the policies stop asking about roles and start asking about
-- permissions
--
-- 0034 built the matrix, backfilled it, and proved it returns the same answer as
-- the old ladder for every existing member — 48 checks, no disagreements. This
-- file is the switch: every one of the 32 policies and the function bodies that
-- carried an inline role test now calls app.has_permission().
--
-- The mapping is not a redesign. Each gate keeps the audience it had; it is only
-- described differently. Owner-gated became one of the four workspace
-- permissions, supervisor-gated became whichever area the table belongs to, and
-- an owner still holds all twelve implicitly, so no existing member's access
-- changes on the day this runs. What changes is that the audience is now
-- editable, which it has never been.
--
-- WHY THE OLD FUNCTIONS SURVIVE. app.is_owner() and app.is_supervisor() are not
-- dropped. is_owner() is branch 1 of has_permission() and the guarantee that a
-- workspace cannot be locked out of itself; is_supervisor() is branch 3, the
-- fallback for a profile with no role_id. Deleting either would remove the floor
-- underneath the mechanism this file installs. They simply stop being what a
-- policy consults.
--
-- COVERAGE IS UNTOUCHED. app.covers_*() still short-circuit on app.is_owner()
-- rather than on a permission, because "the owner is never scoped" is a property
-- of ownership, not a capability somebody grants. A custom role with every
-- permission is still subject to its holder's coverage — which is the whole
-- point of keeping the two axes independent (0033).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Workspace: credentials, logs, people, destruction
-- -----------------------------------------------------------------------------

drop policy if exists instances_admin on public.green_api_instances;
create policy instances_admin on public.green_api_instances for all to authenticated
  using  (org_id = app.current_org_id() and app.has_permission('credentials.manage'))
  with check (org_id = app.current_org_id() and app.has_permission('credentials.manage'));

drop policy if exists wasender_admin on public.wasender_sessions;
create policy wasender_admin on public.wasender_sessions for all to authenticated
  using  (org_id = app.current_org_id() and app.has_permission('credentials.manage'))
  with check (org_id = app.current_org_id() and app.has_permission('credentials.manage'));

drop policy if exists llm_providers_read on public.llm_providers;
create policy llm_providers_read on public.llm_providers for select to authenticated
  using (org_id = app.current_org_id() and app.has_permission('credentials.manage'));

drop policy if exists llm_providers_write on public.llm_providers;
create policy llm_providers_write on public.llm_providers for all to authenticated
  using  (org_id = app.current_org_id() and app.has_permission('credentials.manage'))
  with check (org_id = app.current_org_id() and app.has_permission('credentials.manage'));

drop policy if exists webhooks_admin on public.webhook_events;
create policy webhooks_admin on public.webhook_events for select to authenticated
  using (app.has_permission('logs.read'));

drop policy if exists ai_runs_admin on public.ai_runs;
create policy ai_runs_admin on public.ai_runs for select to authenticated
  using (org_id = app.current_org_id() and app.has_permission('logs.read'));

drop policy if exists invitations_owner_all on public.invitations;
create policy invitations_owner_all on public.invitations for all to authenticated
  using  (org_id = app.current_org_id() and app.has_permission('team.manage'))
  with check (org_id = app.current_org_id() and app.has_permission('team.manage'));

drop policy if exists profiles_owner_manage on public.profiles;
create policy profiles_owner_manage on public.profiles for update to authenticated
  using  (org_id = app.current_org_id() and app.has_permission('team.manage'))
  with check (org_id = app.current_org_id() and app.has_permission('team.manage'));


-- -----------------------------------------------------------------------------
-- 2. Conversations
-- -----------------------------------------------------------------------------
-- chats.read_all is the permission that used to be spelled "is a supervisor"
-- inside can_access_chat(). It is on the hot path — every message row is checked
-- against it — which is why has_permission() short-circuits on the owner before
-- touching a table, and why the coverage fast-bail from 0033 is still the first
-- thing covers_chat() evaluates.

create or replace function app.can_access_chat(p_chat_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.chats c
    where c.id = p_chat_id
      and c.org_id = app.current_org_id()
      and (
        c.assigned_agent_id = (select auth.uid())
        or ((app.has_permission('chats.read_all') or c.assigned_agent_id is null)
            and app.covers_chat(c.id))
      )
  )
$$;

comment on function app.can_access_chat is
  'C5 + 0033 + 0035: own chats always; the unassigned pool and the '
  'chats.read_all view are both narrowed to the caller''s coverage. '
  'Assignment beats scope.';

drop policy if exists chats_update on public.chats;
create policy chats_update on public.chats for update to authenticated
  using (app.can_access_chat(id))
  with check (
    org_id = app.current_org_id()
    and (app.has_permission('chats.reassign') or assigned_agent_id = (select auth.uid()))
  );

drop policy if exists chats_delete on public.chats;
create policy chats_delete on public.chats for delete to authenticated
  using (org_id = app.current_org_id()
         and app.has_permission('chats.delete')
         and app.covers_chat(id));

drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads for update to authenticated
  using (app.can_access_chat(chat_id))
  with check (
    org_id = app.current_org_id()
    and (app.has_permission('chats.reassign') or assigned_agent_id = (select auth.uid()))
  );

drop policy if exists leads_delete on public.leads;
create policy leads_delete on public.leads for delete to authenticated
  using (org_id = app.current_org_id() and app.has_permission('chats.delete'));


-- -----------------------------------------------------------------------------
-- 3. Selling: inventory, clients, coverage
-- -----------------------------------------------------------------------------

drop policy if exists hotels_write on public.hotels;
create policy hotels_write on public.hotels for all to authenticated
  using  (org_id = app.current_org_id() and app.has_permission('inventory.manage')
          and app.covers_destination(destination_id) and app.covers_supplier(supplier_id))
  with check (org_id = app.current_org_id() and app.has_permission('inventory.manage')
          and app.covers_destination(destination_id) and app.covers_supplier(supplier_id));

drop policy if exists room_types_write on public.hotel_room_types;
create policy room_types_write on public.hotel_room_types for all to authenticated
  using  (app.has_permission('inventory.manage') and exists (select 1 from public.hotels h
            where h.id = hotel_id and h.org_id = app.current_org_id()
              and app.covers_destination(h.destination_id) and app.covers_supplier(h.supplier_id)))
  with check (app.has_permission('inventory.manage') and exists (select 1 from public.hotels h
            where h.id = hotel_id and h.org_id = app.current_org_id()
              and app.covers_destination(h.destination_id) and app.covers_supplier(h.supplier_id)));

drop policy if exists rates_write on public.hotel_rates;
create policy rates_write on public.hotel_rates for all to authenticated
  using  (app.has_permission('inventory.manage') and exists (
            select 1 from public.hotel_room_types rt join public.hotels h on h.id = rt.hotel_id
             where rt.id = room_type_id and h.org_id = app.current_org_id()
               and app.covers_destination(h.destination_id) and app.covers_supplier(h.supplier_id)))
  with check (app.has_permission('inventory.manage') and exists (
            select 1 from public.hotel_room_types rt join public.hotels h on h.id = rt.hotel_id
             where rt.id = room_type_id and h.org_id = app.current_org_id()
               and app.covers_destination(h.destination_id) and app.covers_supplier(h.supplier_id)));

drop policy if exists import_rows_write on public.inventory_import_rows;
create policy import_rows_write on public.inventory_import_rows for all to authenticated
  using  (org_id = app.current_org_id() and app.has_permission('inventory.manage'))
  with check (org_id = app.current_org_id() and app.has_permission('inventory.manage'));

drop policy if exists destinations_write on public.destinations;
create policy destinations_write on public.destinations for all to authenticated
  using  (org_id = app.current_org_id() and app.has_permission('inventory.manage'))
  with check (org_id = app.current_org_id() and app.has_permission('inventory.manage'));

drop policy if exists suppliers_write on public.suppliers;
create policy suppliers_write on public.suppliers for all to authenticated
  using  (org_id = app.current_org_id() and app.has_permission('inventory.manage'))
  with check (org_id = app.current_org_id() and app.has_permission('inventory.manage'));

drop policy if exists clients_write on public.clients;
create policy clients_write on public.clients for all to authenticated
  using  (org_id = app.current_org_id() and app.has_permission('clients.manage'))
  with check (org_id = app.current_org_id() and app.has_permission('clients.manage'));

drop policy if exists regions_write on public.regions;
create policy regions_write on public.regions for all to authenticated
  using  (org_id = app.current_org_id() and app.has_permission('coverage.manage'))
  with check (org_id = app.current_org_id() and app.has_permission('coverage.manage'));

drop policy if exists agent_regions_write on public.agent_regions;
create policy agent_regions_write on public.agent_regions for all to authenticated
  using  (app.has_permission('coverage.manage') and exists (
            select 1 from public.regions r where r.id = region_id and r.org_id = app.current_org_id()))
  with check (app.has_permission('coverage.manage') and exists (
            select 1 from public.regions r where r.id = region_id and r.org_id = app.current_org_id()));

drop policy if exists agent_destinations_read on public.agent_destinations;
create policy agent_destinations_read on public.agent_destinations for select to authenticated
  using (profile_id = (select auth.uid())
         or (app.has_permission('coverage.manage') and exists (
               select 1 from public.profiles p
                where p.id = profile_id and p.org_id = app.current_org_id())));

drop policy if exists agent_destinations_write on public.agent_destinations;
create policy agent_destinations_write on public.agent_destinations for all to authenticated
  using  (app.has_permission('coverage.manage') and exists (
            select 1 from public.destinations d
             where d.id = destination_id and d.org_id = app.current_org_id()))
  with check (app.has_permission('coverage.manage') and exists (
            select 1 from public.destinations d
             where d.id = destination_id and d.org_id = app.current_org_id())
          and exists (select 1 from public.profiles p
             where p.id = profile_id and p.org_id = app.current_org_id()));

drop policy if exists agent_suppliers_read on public.agent_suppliers;
create policy agent_suppliers_read on public.agent_suppliers for select to authenticated
  using (profile_id = (select auth.uid())
         or (app.has_permission('coverage.manage') and exists (
               select 1 from public.profiles p
                where p.id = profile_id and p.org_id = app.current_org_id())));

drop policy if exists agent_suppliers_write on public.agent_suppliers;
create policy agent_suppliers_write on public.agent_suppliers for all to authenticated
  using  (app.has_permission('coverage.manage') and exists (
            select 1 from public.suppliers s
             where s.id = supplier_id and s.org_id = app.current_org_id()))
  with check (app.has_permission('coverage.manage') and exists (
            select 1 from public.suppliers s
             where s.id = supplier_id and s.org_id = app.current_org_id())
          and exists (select 1 from public.profiles p
             where p.id = profile_id and p.org_id = app.current_org_id()));

drop policy if exists agent_clients_read on public.agent_clients;
create policy agent_clients_read on public.agent_clients for select to authenticated
  using (profile_id = (select auth.uid())
         or (app.has_permission('coverage.manage') and exists (
               select 1 from public.profiles p
                where p.id = profile_id and p.org_id = app.current_org_id())));

drop policy if exists agent_clients_write on public.agent_clients;
create policy agent_clients_write on public.agent_clients for all to authenticated
  using  (app.has_permission('coverage.manage') and exists (
            select 1 from public.clients cl
             where cl.id = client_id and cl.org_id = app.current_org_id()))
  with check (app.has_permission('coverage.manage') and exists (
            select 1 from public.clients cl
             where cl.id = client_id and cl.org_id = app.current_org_id())
          and exists (select 1 from public.profiles p
             where p.id = profile_id and p.org_id = app.current_org_id()));


-- -----------------------------------------------------------------------------
-- 4. AI: knowledge and behaviour
-- -----------------------------------------------------------------------------

drop policy if exists sources_write on public.knowledge_sources;
create policy sources_write on public.knowledge_sources for all to authenticated
  using  (org_id = app.current_org_id() and app.has_permission('knowledge.manage'))
  with check (org_id = app.current_org_id() and app.has_permission('knowledge.manage'));

drop policy if exists chunks_write on public.knowledge_chunks;
create policy chunks_write on public.knowledge_chunks for all to authenticated
  using  (org_id = app.current_org_id() and app.has_permission('knowledge.manage'))
  with check (org_id = app.current_org_id() and app.has_permission('knowledge.manage'));

drop policy if exists bot_settings_write on public.bot_settings;
create policy bot_settings_write on public.bot_settings for all to authenticated
  using  (org_id = app.current_org_id() and app.has_permission('bot.configure'))
  with check (org_id = app.current_org_id() and app.has_permission('bot.configure'));

drop policy if exists rules_write on public.workflow_rules;
create policy rules_write on public.workflow_rules for all to authenticated
  using  (org_id = app.current_org_id() and app.has_permission('bot.configure'))
  with check (org_id = app.current_org_id() and app.has_permission('bot.configure'));

drop policy if exists test_runs_write on public.workflow_test_runs;
create policy test_runs_write on public.workflow_test_runs for all to authenticated
  using  (org_id = app.current_org_id() and app.has_permission('bot.configure'))
  with check (org_id = app.current_org_id() and app.has_permission('bot.configure'));


-- -----------------------------------------------------------------------------
-- 5. The SECURITY DEFINER functions that carry their own check
-- -----------------------------------------------------------------------------
-- A definer function runs as its owner, so section 1-4 never reach inside one.
-- Each is reproduced from its original migration with the role test swapped.

/** 0003's assign_chat, gated on chats.reassign rather than on being a supervisor. */
create or replace function public.assign_chat(p_chat_id uuid, p_agent_id uuid)
returns public.chats
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_chat public.chats;
  v_me   uuid := auth.uid();
begin
  select * into v_chat from public.chats where id = p_chat_id;
  if not found then raise exception 'chat not found'; end if;
  if not app.can_access_chat(p_chat_id) then raise exception 'forbidden'; end if;

  if not app.has_permission('chats.reassign') then
    -- claim an unassigned chat, or release/keep your own
    if v_chat.assigned_agent_id is not null and v_chat.assigned_agent_id <> v_me then
      raise exception 'chat is assigned to another agent';
    end if;
    if p_agent_id is not null and p_agent_id <> v_me then
      raise exception 'you do not have permission to assign to another agent';
    end if;
  else
    if p_agent_id is not null and not exists (
      select 1 from public.profiles
      where id = p_agent_id and org_id = v_chat.org_id and is_active
    ) then
      raise exception 'target agent is not in this organisation';
    end if;
  end if;

  update public.chats set assigned_agent_id = p_agent_id
   where id = p_chat_id returning * into v_chat;

  update public.leads set assigned_agent_id = p_agent_id
   where chat_id = p_chat_id and stage not in ('closed_won','closed_lost');

  return v_chat;
end $$;

/** 0008's cleanup_conversations, gated on data.purge. */
create or replace function public.cleanup_conversations(p_scope text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org   uuid := app.current_org_id();
  v_ids   uuid[];
  v_count int := 0;
begin
  if not app.has_permission('data.purge') then
    raise exception 'You do not have permission to bulk-delete conversations';
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
                   or exists (select 1 from public.quotes q where q.lead_id = l.id))))
    );

  if v_ids is null then
    return jsonb_build_object('deleted', 0, 'org_id', v_org, 'chat_ids', '[]'::jsonb);
  end if;

  delete from public.chats where id = any(v_ids);
  get diagnostics v_count = row_count;

  if p_scope = 'all' then
    delete from public.contacts       where org_id = v_org;
    delete from public.ai_runs        where org_id = v_org;
    delete from public.webhook_events where true;
  end if;

  return jsonb_build_object('deleted', v_count, 'org_id', v_org, 'chat_ids', to_jsonb(v_ids));
end $$;

/** 0022's set_llm_key, gated on credentials.manage. */
create or replace function public.set_llm_key(p_provider_id uuid, p_key text)
returns jsonb
language plpgsql security definer set search_path = public, vault, pg_temp as $$
declare
  v_org_id    uuid;
  v_secret_id uuid;
  v_hint      text;
begin
  select org_id, secret_id into v_org_id, v_secret_id
    from public.llm_providers where id = p_provider_id;
  if v_org_id is null then raise exception 'Unknown provider.'; end if;

  -- The function runs as its owner, so the caller's RLS does not apply inside
  -- it. Re-check authorisation explicitly, or any authenticated user could
  -- write a key into any workspace by guessing a uuid.
  if v_org_id is distinct from app.current_org_id()
     or not app.has_permission('credentials.manage') then
    raise exception 'You do not have permission to set this workspace''s model key.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_key is null or length(trim(p_key)) < 8 then
    raise exception 'That does not look like an API key.';
  end if;

  v_hint := '...' || right(trim(p_key), 4);

  if v_secret_id is null then
    v_secret_id := vault.create_secret(trim(p_key), 'llm_key_' || p_provider_id::text,
      'LLM API key for provider ' || p_provider_id::text);
    update public.llm_providers set secret_id = v_secret_id, key_hint = v_hint
     where id = p_provider_id;
  else
    perform vault.update_secret(v_secret_id, trim(p_key));
    update public.llm_providers set key_hint = v_hint where id = p_provider_id;
  end if;

  return jsonb_build_object('ok', true, 'key_hint', v_hint);
end $$;

/**
 * The privileged-column guard, now permission-driven — with one rule that is
 * NOT a permission.
 *
 * team.manage lets you run the team. It does not let you mint an owner: handing
 * out the sealed role is how a merely-privileged account becomes an unremovable
 * one, and a permission that can grant itself is not a boundary. Only somebody
 * who already holds ownership can create another owner.
 */
create or replace function app.protect_privileged_columns() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_target_tier public.app_role;
begin
  -- Server-side work with the service role has no auth.uid() and is not what
  -- this guards against.
  if (select auth.uid()) is null then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.role_id is distinct from old.role_id
     or new.org_id is distinct from old.org_id
     or new.is_active is distinct from old.is_active
  then
    if not app.has_permission('team.manage') then
      raise exception 'You do not have permission to change roles or access.'
        using errcode = 'insufficient_privilege';
    end if;

    if new.org_id is distinct from old.org_id then
      raise exception 'A member cannot be moved to a different workspace.'
        using errcode = 'insufficient_privilege';
    end if;

    if new.role_id is not null then
      select r.legacy_role into v_target_tier
        from public.roles r where r.id = new.role_id and r.org_id = new.org_id;

      if v_target_tier is null then
        raise exception 'That role belongs to a different workspace.'
          using errcode = 'insufficient_privilege';
      end if;

      if v_target_tier = 'owner' and not app.is_owner() then
        raise exception 'Only an existing owner can make somebody an owner.'
          using errcode = 'insufficient_privilege';
      end if;
    end if;
  end if;

  -- Capacity is desk management, so it rides with coverage rather than with the
  -- team permission. Self-service is what is being prevented, not delegation:
  -- an agent who could set their own ceiling to 1 would silently opt out of the
  -- router (0021).
  if new.max_open_chats is distinct from old.max_open_chats
     and not app.has_permission('coverage.manage')
  then
    raise exception 'You do not have permission to change an agent''s chat capacity.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end $$;
