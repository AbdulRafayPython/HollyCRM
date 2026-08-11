-- =============================================================================
-- HollyCRM 0008 — scoped bulk cleanup of conversations
--
-- Deliberately NOT a "delete everything" button. Industry practice (HubSpot has
-- no reset-all at all; Dynamics exposes a filtered, admin-only deletion job) is
-- a SCOPED delete with a preview and an explicit confirmation. The scopes here:
--
--   archived  — conversations the team already closed out (safest)
--   no_value  — conversations that never produced a quote and never closed won,
--               i.e. test chats and idle chatter. Won deals and quoted leads
--               are structurally excluded, so the money can't be deleted by
--               accident.
--   all       — full reset, for wiping a demo/test environment
--
-- Supervisor-only, checked inside the function so no API path can bypass it.
-- =============================================================================

/** Counts for the confirmation screen: never delete what wasn't previewed. */
create or replace function public.conversation_cleanup_preview()
returns jsonb
language sql stable security invoker set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'total',    (select count(*) from public.chats),
    'archived', (select count(*) from public.chats where is_archived),
    'no_value', (
      select count(*) from public.chats c
      where not exists (
        select 1 from public.leads l
        where l.chat_id = c.id
          and (l.stage = 'closed_won'
               or exists (select 1 from public.quotes q where q.lead_id = l.id))
      )
    ),
    'protected', (
      select count(*) from public.chats c
      where exists (
        select 1 from public.leads l
        where l.chat_id = c.id
          and (l.stage = 'closed_won'
               or exists (select 1 from public.quotes q where q.lead_id = l.id))
      )
    ),
    'messages', (select count(*) from public.messages)
  );
$$;

grant execute on function public.conversation_cleanup_preview() to authenticated;

create or replace function public.cleanup_conversations(p_scope text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org   uuid := app.current_org_id();
  v_ids   uuid[];
  v_count int := 0;
begin
  if not app.is_supervisor() then
    raise exception 'Only a supervisor can bulk-delete conversations';
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

grant execute on function public.cleanup_conversations(text) to authenticated;
