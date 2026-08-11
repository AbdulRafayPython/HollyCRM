-- =============================================================================
-- HollyCRM 0007 — in-app configuration (Kommo/Bitrix-style integrations)
--
-- Moves runtime configuration out of .env and into the database so it is
-- editable from the CRM UI:
--   1. green_api_instances gains credentials + an is_active switch — "which
--      WhatsApp are we using" becomes a radio button, and multiple numbers can
--      be registered with exactly one active per org.
--   2. bot_settings — the AI agent's personality and guardrails, org-scoped.
--   3. bot_gate() now reads its throttles from bot_settings instead of
--      hardcoded constants, and honors a global bot kill switch.
--   4. Write policies for room types and rates so inventory is manageable
--      from the UI by supervisors (hotels already had them).
-- =============================================================================

-- 1. Instance credentials live in the row now. (Demo posture: plaintext column,
--    supervisor-only via RLS + never selected by the browser role in app code.
--    Production should move api_token into Vault — token_vault_id is ready.)
alter table public.green_api_instances
  add column if not exists api_url   text,
  add column if not exists api_token text,
  add column if not exists phone     text,
  add column if not exists is_active boolean not null default false;

create unique index if not exists green_api_one_active_per_org
  on public.green_api_instances (org_id) where is_active;

-- 2. AI agent settings
create table public.bot_settings (
  org_id                 uuid primary key references public.organizations(id) on delete cascade,
  enabled                boolean not null default true,
  bot_name               text not null default 'Hollyland AI',
  greeting_enabled       boolean not null default true,
  greeting_en            text,
  greeting_ar            text,
  custom_instructions    text not null default '',
  group_keywords         text[] not null default array[
    'hotel','hotels','room','rooms','rate','rates','price','prices','quote',
    'booking','available','availability','makkah','mecca','madinah','medina',
    'haram','distance','فندق','فنادق','غرفة','غرف','سعر','أسعار','حجز','الحرم','متاح'],
  handoff_keywords       text[] not null default array['discount','manager','human','agent please','خصم'],
  group_cooldown_seconds int not null default 60  check (group_cooldown_seconds between 10 and 3600),
  group_daily_cap        int not null default 10  check (group_daily_cap between 1 and 200),
  updated_at             timestamptz not null default now()
);

create trigger set_updated_at before update on public.bot_settings
  for each row execute function app.set_updated_at();

alter table public.bot_settings enable row level security;
create policy bot_settings_read on public.bot_settings for select to authenticated
  using (org_id = app.current_org_id());
create policy bot_settings_write on public.bot_settings for all to authenticated
  using (org_id = app.current_org_id() and app.is_supervisor())
  with check (org_id = app.current_org_id() and app.is_supervisor());

insert into public.bot_settings (org_id)
select id from public.organizations
on conflict (org_id) do nothing;

-- 3. bot_gate honors the settings
create or replace function public.bot_gate(p_chat_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c          public.chats;
  v_today    date := (now() at time zone 'Asia/Riyadh')::date;
  v_last_day date;
  v_enabled  boolean := true;
  v_cooldown int := 60;
  v_cap      int := 10;
begin
  select * into c from public.chats where id = p_chat_id for update;
  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'chat_not_found');
  end if;

  select bs.enabled, bs.group_cooldown_seconds, bs.group_daily_cap
    into v_enabled, v_cooldown, v_cap
  from public.bot_settings bs where bs.org_id = c.org_id;
  if not found then v_enabled := true; v_cooldown := 60; v_cap := 10; end if;

  if not v_enabled then
    return jsonb_build_object('allowed', false, 'reason', 'bot_disabled');
  end if;

  if c.is_bot_paused and c.bot_resume_at is not null and c.bot_resume_at <= now() then
    update public.chats set is_bot_paused = false, bot_resume_at = null where id = c.id;
    c.is_bot_paused := false;
  end if;

  if c.is_bot_paused then
    return jsonb_build_object('allowed', false, 'reason', 'bot_paused');
  end if;

  if c.chat_type = 'group' then
    v_last_day := (c.last_bot_reply_at at time zone 'Asia/Riyadh')::date;
    if v_last_day is distinct from v_today then
      c.bot_replies_today := 0;
    end if;

    if c.last_bot_reply_at is not null
       and c.last_bot_reply_at > now() - make_interval(secs => v_cooldown) then
      return jsonb_build_object('allowed', false, 'reason', 'group_cooldown');
    end if;

    if c.bot_replies_today >= v_cap then
      return jsonb_build_object('allowed', false, 'reason', 'group_daily_cap');
    end if;

    update public.chats
       set bot_replies_today = c.bot_replies_today + 1,
           last_bot_reply_at = now()
     where id = c.id;
  end if;

  return jsonb_build_object('allowed', true, 'reason', 'ok');
end $$;

revoke execute on function public.bot_gate(uuid) from public, anon, authenticated;

-- 4. Inventory write access for supervisors (read policies existed since 0001)
create policy room_types_write on public.hotel_room_types for all to authenticated
  using (exists (select 1 from public.hotels h
                 where h.id = hotel_id and h.org_id = app.current_org_id())
         and app.is_supervisor())
  with check (exists (select 1 from public.hotels h
                      where h.id = hotel_id and h.org_id = app.current_org_id())
              and app.is_supervisor());

create policy rates_write on public.hotel_rates for all to authenticated
  using (exists (select 1 from public.hotel_room_types rt
                 join public.hotels h on h.id = rt.hotel_id
                 where rt.id = room_type_id and h.org_id = app.current_org_id())
         and app.is_supervisor())
  with check (exists (select 1 from public.hotel_room_types rt
                      join public.hotels h on h.id = rt.hotel_id
                      where rt.id = room_type_id and h.org_id = app.current_org_id())
              and app.is_supervisor());
