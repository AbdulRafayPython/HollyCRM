-- =============================================================================
-- HollyCRM 0023 — the reply path stops paying for round trips it doesn't need
--
-- Every inbound message currently costs a fixed set of database round trips
-- before the model is even called, and two of them scale with data rather than
-- staying constant:
--
--   advanceStage() walks the funnel ONE UPDATE AT A TIME. Moving a lead from
--   new_inquiry to quotation_sent is three sequential statements, each a
--   separate network hop from Node, and it runs on every quote. The loop exists
--   for a good reason — lead_stage_events is written by a trigger, and jumping
--   straight to quotation_sent would skip the requirements_gathered event and
--   make the funnel report show more quotes than qualified leads — but the loop
--   belongs in the database, not across the wire.
--
--   The bot-message count in the social path and the open-chat count behind the
--   router both filter on columns with no index supporting the predicate. Each
--   is a scan today. They are small scans on a demo and linear ones in
--   production, which is the definition of a problem that ships quietly.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Walk the funnel in one call
-- -----------------------------------------------------------------------------
-- Same semantics as the Node loop it replaces: never demote, step one stage at
-- a time so every intermediate stage lands in lead_stage_events, and apply the
-- extracted requirement fields on the first move. `fields` is jsonb with nulls
-- already stripped by the caller — a key that is absent is left alone, which is
-- what keeps this from erasing memory the extractor didn't mention this turn.

create or replace function public.advance_lead_stage(
  p_lead_id uuid,
  p_target  public.lead_stage,
  p_fields  jsonb default '{}'::jsonb
)
returns public.lead_stage
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order    public.lead_stage[] := array[
    'new_inquiry', 'requirements_gathered', 'quotation_sent',
    'under_negotiation', 'closed_won', 'closed_lost'
  ]::public.lead_stage[];
  v_current  public.lead_stage;
  v_target   public.lead_stage := p_target;
  v_from     int;
  v_to       int;
  i          int;
  v_applied  boolean := false;
begin
  select stage into v_current from public.leads where id = p_lead_id;
  if v_current is null then
    return null;
  end if;

  -- The caller asks for new_inquiry when it could not search; if the lead now
  -- holds all three required slots it has in fact gathered requirements.
  if p_target = 'new_inquiry'
     and p_fields ? 'city'
     and p_fields ? 'check_in_date'
     and p_fields ? 'check_out_date'
  then
    v_target := 'requirements_gathered';
  end if;

  v_from := array_position(v_order, v_current);
  v_to   := array_position(v_order, v_target);

  -- No forward movement still persists whatever was extracted this turn. This
  -- is the path that used to throw away a city the customer had just given.
  if v_to <= v_from then
    update public.leads
       set city               = coalesce((p_fields ->> 'city')::text, city),
           min_stars          = coalesce((p_fields ->> 'min_stars')::int, min_stars),
           check_in_date      = coalesce((p_fields ->> 'check_in_date')::date, check_in_date),
           check_out_date     = coalesce((p_fields ->> 'check_out_date')::date, check_out_date),
           pax_count          = coalesce((p_fields ->> 'pax_count')::int, pax_count),
           rooms_count        = coalesce((p_fields ->> 'rooms_count')::int, rooms_count),
           room_configuration = coalesce((p_fields ->> 'room_configuration')::public.room_config, room_configuration),
           max_distance_m     = coalesce((p_fields ->> 'max_distance_m')::int, max_distance_m),
           budget_amount      = coalesce((p_fields ->> 'budget_amount')::numeric, budget_amount),
           clarify_attempts   = coalesce((p_fields ->> 'clarify_attempts')::int, clarify_attempts)
     where id = p_lead_id;
    return v_current;
  end if;

  -- One statement per stage, so log_stage_change() fires for each and the funnel
  -- counts every stage this lead ever reached. Still one network round trip.
  for i in (v_from + 1)..v_to loop
    if not v_applied then
      update public.leads
         set stage              = v_order[i],
             city               = coalesce((p_fields ->> 'city')::text, city),
             min_stars          = coalesce((p_fields ->> 'min_stars')::int, min_stars),
             check_in_date      = coalesce((p_fields ->> 'check_in_date')::date, check_in_date),
             check_out_date     = coalesce((p_fields ->> 'check_out_date')::date, check_out_date),
             pax_count          = coalesce((p_fields ->> 'pax_count')::int, pax_count),
             rooms_count        = coalesce((p_fields ->> 'rooms_count')::int, rooms_count),
             room_configuration = coalesce((p_fields ->> 'room_configuration')::public.room_config, room_configuration),
             max_distance_m     = coalesce((p_fields ->> 'max_distance_m')::int, max_distance_m),
             budget_amount      = coalesce((p_fields ->> 'budget_amount')::numeric, budget_amount),
             clarify_attempts   = coalesce((p_fields ->> 'clarify_attempts')::int, clarify_attempts)
       where id = p_lead_id;
      v_applied := true;
    else
      update public.leads set stage = v_order[i] where id = p_lead_id;
    end if;
  end loop;

  return v_target;
end;
$$;

revoke all on function public.advance_lead_stage(uuid, public.lead_stage, jsonb) from public;
grant execute on function public.advance_lead_stage(uuid, public.lead_stage, jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- 2. Indexes for predicates the hot path actually uses
-- -----------------------------------------------------------------------------

-- social() counts bot messages per chat to decide first contact. Without this
-- it scans every message in the chat on every social reply.
create index if not exists messages_bot_per_chat
  on public.messages (chat_id)
  where sender_type = 'bot';

-- available_agents counts open chats per agent. The 0001 index leads with
-- org_id, so a lookup by agent alone cannot use it.
create index if not exists chats_open_per_agent
  on public.chats (assigned_agent_id)
  where not is_archived and assigned_agent_id is not null;

-- The router resolves a group's person from its most recent client message.
create index if not exists messages_client_recent
  on public.messages (chat_id, wa_timestamp desc)
  where sender_type = 'client' and sender_contact_id is not null;

-- loadSlots reads one lead by id (primary key, fine), but the per-person lookup
-- in ingest filters chat_id + contact_id + open stage on every single message.
create index if not exists leads_open_by_chat_contact
  on public.leads (chat_id, contact_id)
  where stage not in ('closed_won', 'closed_lost');

-- Knowledge retrieval joins chunks to their source and filters on the source
-- being active, ready and knowledge-purpose. Without this the planner filters
-- sources after the join.
create index if not exists knowledge_sources_searchable
  on public.knowledge_sources (org_id, purpose)
  where is_active and status = 'ready';
