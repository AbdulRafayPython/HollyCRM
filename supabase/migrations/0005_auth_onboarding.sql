-- =============================================================================
-- HollyCRM 0005 — automatic onboarding for every new auth user
--
-- Root cause this fixes: RLS keys everything off public.profiles, so a user who
-- signs in through Google (or any future provider) but has no profiles row sees
-- a completely empty app — no chats, no leads, no error. A DB trigger creates
-- the profile at the moment auth.users gets the row, regardless of which
-- provider created it. App code cannot forget to do this.
--
-- Assumption (PRD v2 §9 open decision #1): single organisation per deployment.
-- New signups join the first org as 'agent'. Multi-tenant onboarding would
-- replace the org lookup with an invite flow.
-- =============================================================================

create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, org_id, role, full_name)
  values (
    new.id,
    (select id from public.organizations order by created_at limit 1),
    'agent',
    coalesce(
      new.raw_user_meta_data->>'full_name',   -- Google supplies this
      new.raw_user_meta_data->>'name',
      split_part(coalesce(new.email, 'user'), '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();

-- Backfill anyone who signed up before this trigger existed.
insert into public.profiles (id, org_id, role, full_name)
select
  u.id,
  (select id from public.organizations order by created_at limit 1),
  'agent',
  coalesce(u.raw_user_meta_data->>'full_name', split_part(coalesce(u.email, 'user'), '@', 1))
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;
