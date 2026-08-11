-- =============================================================================
-- HollyCRM 0011 — one workspace per signup, and an invitation flow for agents
--
-- What was wrong: 0005 assigned EVERY new auth user to
-- `(select id from organizations order by created_at limit 1)` — an explicit
-- "single organisation per deployment" assumption. Two people signing up
-- therefore landed in the same organisation and saw the same inbox, the same
-- WhatsApp instance and the same leads. RLS was never the problem: every policy
-- is already keyed on app.current_org_id(). Nothing ever created a SECOND
-- organisation for that key to separate.
--
-- After this migration:
--   * a signup with no invitation creates its own organisation and owns it
--   * a signup carrying an invitation token joins THAT organisation as a
--     sales agent, and the invitation is consumed
--
-- Invitation links are bearer tokens: single use, seven days, revocable. The
-- email on the invitation is a label for the owner's benefit, not a lock — the
-- point of a copyable link is that the owner can send it wherever the person
-- actually reads mail.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Role vocabulary (values added in 0010, usable now that it has committed)
-- -----------------------------------------------------------------------------
update public.profiles set role = 'owner'       where role in ('super_admin', 'team_lead');
update public.profiles set role = 'sales_agent' where role = 'agent';

create or replace function app.is_supervisor() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  -- Legacy values kept so any row missed by the remap still resolves.
  select coalesce(app.current_role() in ('owner', 'super_admin', 'team_lead'), false)
$$;

create or replace function app.is_owner() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(app.current_role() in ('owner', 'super_admin'), false)
$$;

-- -----------------------------------------------------------------------------
-- 2. Invitations
-- -----------------------------------------------------------------------------
create table if not exists public.invitations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  email       text not null,
  role        public.app_role not null default 'sales_agent',
  token       text not null unique,
  invited_by  uuid references public.profiles(id) on delete set null,
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  revoked_at  timestamptz,
  expires_at  timestamptz not null default now() + interval '7 days',
  created_at  timestamptz not null default now()
);

create index if not exists invitations_org_idx on public.invitations (org_id, created_at desc);

-- One live invitation per email per workspace: re-inviting should replace the
-- pending one, not accumulate links that all still work.
create unique index if not exists invitations_pending_email_idx
  on public.invitations (org_id, lower(email))
  where accepted_at is null and revoked_at is null;

alter table public.invitations enable row level security;

-- Only the owner deals with invitations at all. Agents cannot enumerate who
-- else has been invited, which is also what stops an agent minting a link.
create policy invitations_owner_all on public.invitations for all to authenticated
  using (org_id = app.current_org_id() and app.is_owner())
  with check (org_id = app.current_org_id() and app.is_owner());

/**
 * What an invitation link can reveal BEFORE anyone has signed in.
 *
 * The accept page has to name the workspace, or the invitee is asked to join
 * "something". SECURITY DEFINER with a token lookup exposes exactly those three
 * fields for one valid token, rather than opening the table to anon.
 */
create or replace function public.invitation_preview(invite_token text)
returns table (workspace text, email text, role public.app_role)
language sql stable security definer set search_path = public, pg_temp as $$
  select o.name, i.email, i.role
  from public.invitations i
  join public.organizations o on o.id = i.org_id
  where i.token = invite_token
    and i.accepted_at is null
    and i.revoked_at is null
    and i.expires_at > now()
$$;

grant execute on function public.invitation_preview(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Signup: own workspace, or join the one that invited you
-- -----------------------------------------------------------------------------
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  invite      public.invitations%rowtype;
  target_org  uuid;
  target_role public.app_role;
  person      text;
  workspace   text;
begin
  person := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(coalesce(new.email, 'user'), '@', 1)
  );

  -- ---- invited? ----
  if coalesce(new.raw_user_meta_data->>'invitation_token', '') <> '' then
    select * into invite
    from public.invitations
    where token = new.raw_user_meta_data->>'invitation_token'
      and accepted_at is null
      and revoked_at is null
      and expires_at > now()
    for update;

    if found then
      target_org  := invite.org_id;
      target_role := invite.role;
    end if;
  end if;

  -- ---- otherwise this person owns a brand new workspace ----
  if target_org is null then
    workspace := nullif(trim(coalesce(new.raw_user_meta_data->>'workspace_name', '')), '');
    if workspace is null then
      workspace := person || '''s workspace';
    end if;

    insert into public.organizations (name)
    values (workspace)
    returning id into target_org;

    target_role := 'owner';

    -- Settings → AI reads this row; without it a new workspace shows the
    -- assistant as unconfigured even though it has working defaults.
    insert into public.bot_settings (org_id) values (target_org)
    on conflict (org_id) do nothing;
  end if;

  insert into public.profiles (id, org_id, role, full_name)
  values (new.id, target_org, target_role, person)
  on conflict (id) do nothing;

  if invite.id is not null then
    update public.invitations
    set accepted_at = now(), accepted_by = new.id
    where id = invite.id;
  end if;

  return new;
end $$;

-- -----------------------------------------------------------------------------
-- 4. One-time split of the accounts that 0005 merged
--
-- Every profile that was auto-joined to someone else's organisation gets its
-- own workspace. "Auto-joined" = not the earliest profile in that organisation
-- and never accepted an invitation, which describes exactly the accounts 0005
-- created and nothing a person deliberately set up.
-- -----------------------------------------------------------------------------
do $$
declare
  stray   record;
  new_org uuid;
begin
  for stray in
    select p.id, p.full_name, p.org_id
    from public.profiles p
    where p.id <> (
            select p2.id from public.profiles p2
            where p2.org_id = p.org_id
            order by p2.created_at, p2.id
            limit 1)
      and not exists (
            select 1 from public.invitations i
            where i.accepted_by = p.id)
  loop
    insert into public.organizations (name)
    values (coalesce(nullif(trim(stray.full_name), ''), 'My') || '''s workspace')
    returning id into new_org;

    insert into public.bot_settings (org_id) values (new_org)
    on conflict (org_id) do nothing;

    update public.profiles
    set org_id = new_org, role = 'owner'
    where id = stray.id;

    raise notice 'moved profile % into its own workspace %', stray.id, new_org;
  end loop;
end $$;

-- Whoever remains as the earliest member of an existing organisation owns it.
update public.profiles p
set role = 'owner'
where p.role <> 'owner'
  and p.id = (
    select p2.id from public.profiles p2
    where p2.org_id = p.org_id
    order by p2.created_at, p2.id
    limit 1);
