-- =============================================================================
-- HollyCRM 0015 — a member cannot promote themselves
--
-- profiles_self_update (0001) allows a user to update their own row, and RLS
-- has no column granularity: the policy that lets someone fix the spelling of
-- their name also lets them PATCH role='owner' straight at the REST API and
-- take over the workspace. Verified against a live sales-agent token before
-- writing this — the promotion succeeded.
--
-- The API routes never expose role on the profile form, but "the UI does not
-- offer it" is not a security control. PostgREST is a public endpoint and the
-- anon key is in the browser bundle.
--
-- Columns locked: role (privilege), org_id (which workspace's data you see),
-- is_active (whether a deactivated agent can restore themselves).
-- =============================================================================

create or replace function app.protect_privileged_columns() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Server-side work with the service role — migrations, the signup trigger,
  -- admin routes — has no auth.uid() and is not what this guards against.
  if (select auth.uid()) is null then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.org_id is distinct from old.org_id
     or new.is_active is distinct from old.is_active
  then
    if not app.is_owner() then
      raise exception 'Only the workspace owner can change roles or access.'
        using errcode = 'insufficient_privilege';
    end if;

    -- An owner may manage their team, but not reach into another workspace.
    if new.org_id is distinct from old.org_id then
      raise exception 'A member cannot be moved to a different workspace.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end $$;

-- Runs before protect_last_owner so an unauthorised caller is rejected on the
-- grounds of privilege rather than on how many owners happen to remain.
drop trigger if exists protect_privileged_columns on public.profiles;
create trigger protect_privileged_columns before update on public.profiles
  for each row execute function app.protect_privileged_columns();
