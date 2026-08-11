-- =============================================================================
-- HollyCRM — Storage, agent assignment support, and analytics helpers
-- Run AFTER 0001_hollycrm_init.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. PRIVATE media bucket  (C3)
-- Passport and visa scans are sensitive personal data. This bucket is private;
-- Green API is handed a SHORT-LIVED SIGNED URL, never a public object URL.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wa-media', 'wa-media', false, 26214400,   -- 25 MB, WhatsApp's practical ceiling
  array['image/jpeg','image/png','image/webp','application/pdf',
        'audio/ogg','audio/mpeg','video/mp4']
)
on conflict (id) do nothing;

-- Objects are keyed <org_id>/<chat_id>/<filename>, so the first path segment
-- carries the tenant and can be checked directly.
create policy "wa-media read own org"
on storage.objects for select to authenticated
using (
  bucket_id = 'wa-media'
  and (storage.foldername(name))[1] = app.current_org_id()::text
);

create policy "wa-media insert own org"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'wa-media'
  and (storage.foldername(name))[1] = app.current_org_id()::text
);

create policy "wa-media delete supervisors"
on storage.objects for delete to authenticated
using (
  bucket_id = 'wa-media'
  and (storage.foldername(name))[1] = app.current_org_id()::text
  and app.is_supervisor()
);

-- -----------------------------------------------------------------------------
-- 2. Assignment rules  (C5)
-- An agent may CLAIM an unassigned chat and RELEASE their own. Only supervisors
-- may hand a chat to a different agent. Enforcing this in SQL means the UI
-- cannot be bypassed by calling PostgREST directly.
-- -----------------------------------------------------------------------------
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
  if v_chat.org_id <> app.current_org_id() then
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

grant execute on function public.assign_chat(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. System-authored notes
-- The bot writes a note when it hands a chat to a human, and it has no profile
-- row. Safe to re-run if 0001 already made the column nullable.
-- -----------------------------------------------------------------------------
alter table public.internal_notes alter column author_id drop not null;

-- -----------------------------------------------------------------------------
-- 4. Unread counter — reset when an agent opens the chat
-- -----------------------------------------------------------------------------
create or replace function public.mark_chat_read(p_chat_id uuid)
returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.chats set unread_count = 0
   where id = p_chat_id and org_id = app.current_org_id();
$$;

grant execute on function public.mark_chat_read(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Analytics  (Module 5 / E5)
-- Every figure here is derived from lead_stage_events and chats.first_agent_reply_at,
-- which is precisely why PRD v1.1 could not produce any of them.
-- security invoker => an agent sees their own numbers, a supervisor sees the org.
-- -----------------------------------------------------------------------------
create or replace function public.analytics_summary(p_days int default 30)
returns jsonb
language sql stable security invoker set search_path = public, pg_temp as $$
  with window_start as (select now() - make_interval(days => greatest(p_days, 1)) as t),
  scoped_leads as (
    select l.*, c.chat_type
    from public.leads l
    join public.chats c on c.id = l.chat_id
    where l.created_at >= (select t from window_start)
  ),
  funnel as (
    select jsonb_object_agg(stage, n) as v
    from (select stage::text as stage, count(*) as n from scoped_leads group by stage) s
  ),
  reached as (
    -- how many leads ever reached each stage, not just where they sit now
    select jsonb_object_agg(to_stage, n) as v
    from (
      select e.to_stage::text as to_stage, count(distinct e.lead_id) as n
      from public.lead_stage_events e
      join scoped_leads l on l.id = e.lead_id
      group by e.to_stage
    ) s
  ),
  frt as (
    select round(avg(extract(epoch from (c.first_agent_reply_at - c.created_at)) / 60)::numeric, 1) as minutes
    from public.chats c
    where c.first_agent_reply_at is not null
      and c.created_at >= (select t from window_start)
  ),
  automation as (
    select
      count(*) filter (where by_bot) as bot_moves,
      count(*)                       as total_moves
    from public.lead_stage_events e
    join scoped_leads l on l.id = e.lead_id
  ),
  by_channel as (
    select jsonb_object_agg(chat_type, stats) as v
    from (
      select
        chat_type::text,
        jsonb_build_object(
          'leads', count(*),
          'won',   count(*) filter (where stage = 'closed_won'),
          'lost',  count(*) filter (where stage = 'closed_lost')
        ) as stats
      from scoped_leads
      group by chat_type
    ) s
  ),
  ai as (
    select
      count(*)                                    as calls,
      count(*) filter (where not succeeded)       as failures,
      round(avg(latency_ms)::numeric, 0)          as avg_latency_ms,
      round((percentile_cont(0.95) within group (order by latency_ms))::numeric, 0) as p95_latency_ms
    from public.ai_runs
    where created_at >= (select t from window_start)
  )
  select jsonb_build_object(
    'window_days',      p_days,
    'funnel_current',   coalesce((select v from funnel), '{}'::jsonb),
    'funnel_reached',   coalesce((select v from reached), '{}'::jsonb),
    'first_response_minutes', (select minutes from frt),
    'automation', jsonb_build_object(
      'bot_stage_moves',   (select bot_moves from automation),
      'total_stage_moves', (select total_moves from automation),
      'rate', case when (select total_moves from automation) > 0
                   then round((select bot_moves::numeric / total_moves from automation) * 100, 1)
                   else null end
    ),
    'by_channel',       coalesce((select v from by_channel), '{}'::jsonb),
    'ai', jsonb_build_object(
      'calls',          (select calls from ai),
      'failures',       (select failures from ai),
      'avg_latency_ms', (select avg_latency_ms from ai),
      'p95_latency_ms', (select p95_latency_ms from ai)
    )
  );
$$;

grant execute on function public.analytics_summary(int) to authenticated;
