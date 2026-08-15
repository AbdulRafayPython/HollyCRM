-- =============================================================================
-- 0029 — One WhatsApp gateway per workspace
--
-- 0028 allowed Green API and WasenderAPI side by side. Running both against the
-- SAME WhatsApp number turned out to be actively harmful:
--
--   * Which gateway sends became a coin flip. Whichever webhook landed first
--     created the chat and stamped chats.provider, so with one gateway rate
--     limited (WasenderAPI's trial allows 1 request/minute) roughly half of new
--     conversations got a bot that could not reply — intermittently, invisibly.
--   * Two unofficial multi-device clients hold sockets on one account, which
--     measurably raises the odds of the number being restricted (E1/D6).
--
-- So a workspace now commits to one. Switching means disconnecting the other
-- first, which is a deliberate act rather than a silent overlap.
--
-- Enforced by trigger, not just in the API routes: the instances_admin and
-- wasender_admin policies give supervisors full write access to both tables, so
-- a direct PostgREST insert would otherwise walk straight past a route check.
-- =============================================================================

create or replace function app.assert_single_gateway() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  conflicting int;
  other_name  text;
begin
  -- Each trigger names the table it must stay clear of. Being explicit beats
  -- inferring it from TG_TABLE_NAME, which would silently do nothing if either
  -- table were ever renamed.
  if TG_ARGV[0] = 'wasender_sessions' then
    select count(*) into conflicting
      from public.wasender_sessions where org_id = new.org_id;
    other_name := 'WasenderAPI';
  else
    select count(*) into conflicting
      from public.green_api_instances where org_id = new.org_id;
    other_name := 'Green API';
  end if;

  if conflicting > 0 then
    -- SQLSTATE 23505 (unique_violation) so the app layer can recognise this as
    -- "already taken" rather than an unexpected server fault.
    raise exception
      'This workspace is already connected to %. Disconnect it before connecting another WhatsApp gateway.',
      other_name
      using errcode = '23505';
  end if;

  return new;
end;
$$;

/*
 * BEFORE INSERT only.
 *
 * Both connect routes use upsert. When an upsert lands on an existing row of
 * its OWN provider it still fires this trigger, but the count it runs is
 * against the OTHER table — which is empty in that case — so reconnecting or
 * re-saving credentials for the gateway you already use passes cleanly.
 *
 * Existing rows are untouched: a workspace that already has both connected
 * (as this one does) keeps working and simply cannot add more until one side
 * is removed. Deleting is the user's decision, not a migration's.
 */
drop trigger if exists green_single_gateway on public.green_api_instances;
create trigger green_single_gateway
  before insert on public.green_api_instances
  for each row execute function app.assert_single_gateway('wasender_sessions');

drop trigger if exists wasender_single_gateway on public.wasender_sessions;
create trigger wasender_single_gateway
  before insert on public.wasender_sessions
  for each row execute function app.assert_single_gateway('green_api_instances');
