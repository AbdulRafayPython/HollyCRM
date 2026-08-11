-- =============================================================================
-- HollyCRM 0004 — move all racy state transitions into the database
--
-- Root cause being fixed: chat rollups (unread, ordering, FRT) and bot gating
-- (pause, resume, cooldown, daily cap) lived in Node as select-then-update
-- sequences. Concurrent webhooks race, counters drift, the daily cap never
-- reset, and auto-resume depended on a pg_cron job that was never enabled.
-- Everything below is a single-statement, atomic, trigger- or function-level
-- version of the same logic. The application code DELETES its copies.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Chat rollups as an AFTER INSERT trigger on messages
--    Replaces: ingest.ts unread bump, send route FRT update, and fixes the
--    "outbound never updates last_message_at" ordering bug in one place.
-- -----------------------------------------------------------------------------
create or replace function app.apply_message_rollups() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.chats c
     set last_message_at      = greatest(coalesce(c.last_message_at, new.wa_timestamp), new.wa_timestamp),
         unread_count         = c.unread_count + (case when new.direction = 'in' then 1 else 0 end),
         first_agent_reply_at = case
           when new.direction = 'out' and new.sender_type = 'agent'
             then coalesce(c.first_agent_reply_at, new.wa_timestamp)
           else c.first_agent_reply_at
         end
   where c.id = new.chat_id;
  return new;
end $$;

drop trigger if exists apply_message_rollups on public.messages;
create trigger apply_message_rollups after insert on public.messages
  for each row execute function app.apply_message_rollups();

-- -----------------------------------------------------------------------------
-- 2. Atomic bot gate
--    One call decides AND reserves: expired pauses auto-resume here (no pg_cron
--    needed), the daily counter resets on Riyadh day boundary (never needed a
--    cron job in the first place), and cooldown+cap are checked-and-claimed in
--    a single row lock so two concurrent webhooks cannot both pass.
-- -----------------------------------------------------------------------------
create or replace function public.bot_gate(p_chat_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c          public.chats;
  v_today    date := (now() at time zone 'Asia/Riyadh')::date;
  v_last_day date;
begin
  select * into c from public.chats where id = p_chat_id for update;
  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'chat_not_found');
  end if;

  -- E4: auto-resume without a scheduler. The expiry is applied lazily, at the
  -- exact moment it matters — when the next message asks whether the bot may speak.
  if c.is_bot_paused and c.bot_resume_at is not null and c.bot_resume_at <= now() then
    update public.chats
       set is_bot_paused = false, bot_resume_at = null
     where id = c.id;
    c.is_bot_paused := false;
  end if;

  if c.is_bot_paused then
    return jsonb_build_object('allowed', false, 'reason', 'bot_paused');
  end if;

  if c.chat_type = 'group' then
    v_last_day := (c.last_bot_reply_at at time zone 'Asia/Riyadh')::date;

    -- Day boundary: the counter resets itself. This is the root fix for the
    -- "10 replies ever, then silence forever" bug.
    if v_last_day is distinct from v_today then
      c.bot_replies_today := 0;
    end if;

    if c.last_bot_reply_at is not null
       and c.last_bot_reply_at > now() - interval '60 seconds' then
      return jsonb_build_object('allowed', false, 'reason', 'group_cooldown');
    end if;

    if c.bot_replies_today >= 10 then
      return jsonb_build_object('allowed', false, 'reason', 'group_daily_cap');
    end if;

    -- Reserve the slot inside the same row lock — check and claim are one step.
    update public.chats
       set bot_replies_today = c.bot_replies_today + 1,
           last_bot_reply_at = now()
     where id = c.id;
  end if;

  return jsonb_build_object('allowed', true, 'reason', 'ok');
end $$;

-- Service-role only: the gate is called from the webhook path, never the browser.
revoke execute on function public.bot_gate(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. RLS: agents were locked out of unassigned chats and leads
--    WITH CHECK required NEW.assigned_agent_id = auth.uid() or supervisor, so an
--    agent toggling the bot on an UNASSIGNED chat (which USING lets them see)
--    failed with 0 rows. Allowing NEW.assigned_agent_id IS NULL fixes pause/
--    archive on the unassigned pool and still forbids assigning to someone else.
-- -----------------------------------------------------------------------------
drop policy if exists chats_update on public.chats;
create policy chats_update on public.chats for update to authenticated
  using (app.can_access_chat(id))
  with check (
    org_id = app.current_org_id()
    and (app.is_supervisor()
         or assigned_agent_id = (select auth.uid())
         or assigned_agent_id is null)
  );

drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads for update to authenticated
  using (app.can_access_chat(chat_id))
  with check (
    org_id = app.current_org_id()
    and (app.is_supervisor()
         or assigned_agent_id = (select auth.uid())
         or assigned_agent_id is null)
  );

-- -----------------------------------------------------------------------------
-- 4. Broadcast payload was missing fields the UI renders
--    Without `direction`, a live-received bot/agent message rendered on the
--    wrong side of the thread until refresh.
-- -----------------------------------------------------------------------------
create or replace function app.broadcast_message() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      'chat_id', new.chat_id,
      'lead_id', new.lead_id,
      'direction', new.direction,
      'sender_type', new.sender_type,
      'message_type', new.message_type,
      'body', new.body,
      'media_path', new.media_path,
      'delivery_status', new.delivery_status,
      'wa_timestamp', new.wa_timestamp),
    'new_message',
    'chat:' || new.chat_id::text,
    true
  );
  return new;
end $$;
