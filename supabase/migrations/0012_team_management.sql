-- =============================================================================
-- HollyCRM 0012 — the owner can manage their team
--
-- profiles only ever allowed profiles_self_update, which is correct for a
-- deployment where an administrator edits rows by hand and wrong for a product
-- where the owner adds and removes the people who sell for them.
--
-- Deactivation, not deletion: a removed agent's name still has to render on the
-- messages they sent and the leads they touched, and deleting the profile would
-- either break those foreign keys or blank the history. is_active = false is
-- what the rest of the app already filters on.
-- =============================================================================

drop policy if exists profiles_owner_manage on public.profiles;
create policy profiles_owner_manage on public.profiles for update to authenticated
  using (org_id = app.current_org_id() and app.is_owner())
  with check (org_id = app.current_org_id() and app.is_owner());

/**
 * A workspace must never be left without an owner — nobody could then connect
 * WhatsApp, invite anyone, or change settings, and there is no support desk to
 * repair it. Enforced in the database because three different routes can write
 * this column.
 */
create or replace function app.protect_last_owner() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (old.role in ('owner', 'super_admin') and new.role not in ('owner', 'super_admin'))
     or (old.role in ('owner', 'super_admin') and old.is_active and not new.is_active)
  then
    if not exists (
      select 1 from public.profiles
      where org_id = old.org_id
        and id <> old.id
        and role in ('owner', 'super_admin')
        and is_active
    ) then
      raise exception 'This is the only owner of the workspace. Promote another member first.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists protect_last_owner on public.profiles;
create trigger protect_last_owner before update on public.profiles
  for each row execute function app.protect_last_owner();
