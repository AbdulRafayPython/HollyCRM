-- =============================================================================
-- HollyCRM 0034 — a role becomes a set of permissions, not a rung on a ladder
--
-- Until now "what may this person do" had exactly two answers, app.is_owner()
-- and app.is_supervisor(), consulted by 32 policies and 10 function bodies. The
-- ladder is totally ordered, so every capability a supervisor has is one an
-- owner has, and there is no way to write down "keeps the rate sheet current but
-- must not reassign conversations". 0030 could add a rung because a desk lead
-- genuinely sits between the two; it could not have added a role that sits
-- beside them, and that is the shape most agencies actually need.
--
-- WHAT THIS MIGRATION DOES NOT DO. It does not change a single access decision.
-- Every policy still asks the same two questions it asked yesterday. This file
-- only builds the vocabulary — the catalogue, the roles, the grants, and
-- app.has_permission() — and backfills it so that it already returns the right
-- answer for everybody BEFORE 0035 rewires the policies to consult it. A
-- permission system that flips authority and storage in one migration has no
-- moment where it can be checked against the behaviour it replaces.
--
-- THE ENUM STAYS, AND STAYS AUTHORITATIVE FOR ONE THING. public.app_role and
-- profiles.role are not retired. app.is_owner() keeps reading the enum, because
-- ownership is the lockout guarantee and it must not depend on the table this
-- migration introduces: if role_permissions were emptied by accident, an
-- enum-backed owner can still sign in and repair it. That is also why
-- has_permission() falls back to the old tier whenever a profile has no role_id
-- — a signup path or an old row that predates this file grants exactly what it
-- granted before rather than nothing at all.
--
-- OWNER IS SEALED. The Owner role holds every permission implicitly, cannot be
-- edited, cannot be deleted, and its permission rows are not the source of its
-- power — has_permission() short-circuits on it. A permission matrix whose
-- administrator can revoke their own ability to administer it is a workspace
-- one careless click from being unrecoverable, and "restore it with direct SQL"
-- is not a feature a customer has.
--
-- COVERAGE IS NOT A PERMISSION. Roles answer what you may do; the 0033 coverage
-- tables answer which rows you may do it to. They stay independent, so "Makkah
-- desk lead" is a role plus a coverage tick rather than a role per market — the
-- alternative multiplies roles by destinations and still cannot express a
-- one-off exception for a single person.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The catalogue
-- -----------------------------------------------------------------------------
-- Not org-scoped: the set of things this PRODUCT can gate is a property of the
-- code, not of a customer. A workspace composes roles out of these; it cannot
-- invent a capability the policies would never consult.
--
-- The keys are grouped by the area an operator recognises, which is how the 26
-- gated tables actually cluster. Finer resolution (view vs edit, or one key per
-- table) was considered and rejected: a matrix nobody can read is administered
-- by ticking everything.

create table if not exists public.permissions (
  key         text primary key,
  label       text not null,
  description text not null,
  category    text not null,
  sort_order  int  not null default 100
);

insert into public.permissions (key, label, description, category, sort_order) values
  ('credentials.manage', 'Manage connections & keys',
   'Connect or disconnect WhatsApp, and set the model provider and API key.',
   'Workspace', 10),
  ('team.manage', 'Manage people',
   'Invite colleagues, change their role, and deactivate accounts.',
   'Workspace', 20),
  ('logs.read', 'Read raw logs',
   'Inbound gateway payloads and every AI run, across the whole workspace.',
   'Workspace', 30),
  ('data.purge', 'Bulk-delete conversations',
   'Irreversible. Removes conversations in bulk, including a full workspace reset.',
   'Workspace', 40),

  ('chats.read_all', 'See every conversation',
   'Read conversations assigned to other people, not just your own and the unassigned queue.',
   'Conversations', 50),
  ('chats.reassign', 'Assign conversations',
   'Hand a conversation or lead to somebody else.',
   'Conversations', 60),
  ('chats.delete', 'Delete conversations',
   'Delete a single conversation or lead, and everything attached to it.',
   'Conversations', 70),

  ('inventory.manage', 'Manage inventory',
   'Hotels, room types, rates, imports, destinations and suppliers.',
   'Selling', 80),
  ('clients.manage', 'Manage client accounts',
   'The B2B accounts that conversations and bookings belong to.',
   'Selling', 90),
  ('coverage.manage', 'Assign coverage',
   'Decide which destinations, suppliers, clients and regions each person can see.',
   'Selling', 100),

  ('knowledge.manage', 'Manage AI knowledge',
   'The documents the bot is allowed to answer from.',
   'AI', 110),
  ('bot.configure', 'Configure the AI',
   'Personality, guardrails, the kill switch, workflow and operator rules.',
   'AI', 120)
on conflict (key) do update
  set label = excluded.label,
      description = excluded.description,
      category = excluded.category,
      sort_order = excluded.sort_order;

-- Readable by every signed-in user: the settings screen has to render the
-- matrix, and the catalogue is not sensitive — it is a list of feature names.
-- No write policy at all, so it is deny-by-default for everyone; the rows come
-- from migrations, which is what makes a permission a contract with the code
-- rather than something an operator can invent and then wonder why it does
-- nothing.
alter table public.permissions enable row level security;
drop policy if exists permissions_read on public.permissions;
create policy permissions_read on public.permissions for select to authenticated
  using (true);


-- -----------------------------------------------------------------------------
-- 2. Roles
-- -----------------------------------------------------------------------------

create table if not exists public.roles (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 60),
  description text,
  -- Sealed. Today exactly one role per org carries this: Owner. It is set by
  -- this migration and by nothing else — there is deliberately no route that
  -- can create a second system role, because "sealed" is only a guarantee if
  -- the set of sealed things is fixed by the schema.
  is_system   boolean not null default false,
  -- Which rung of the old ladder this role corresponds to. Keeps profiles.role
  -- meaningful for is_owner(), for the bot, and for anything not yet migrated —
  -- and is what the sync trigger below writes.
  legacy_role public.app_role not null default 'sales_agent',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists roles_name_per_org
  on public.roles (org_id, lower(name));
create index if not exists roles_by_org on public.roles (org_id);
-- At most one sealed role per workspace, enforced rather than assumed.
create unique index if not exists roles_one_system_per_org
  on public.roles (org_id) where is_system;

drop trigger if exists set_updated_at on public.roles;
create trigger set_updated_at before update on public.roles
  for each row execute function app.set_updated_at();

create table if not exists public.role_permissions (
  role_id    uuid not null references public.roles(id) on delete cascade,
  permission text not null references public.permissions(key) on delete cascade,
  primary key (role_id, permission)
);
create index if not exists role_permissions_by_permission
  on public.role_permissions (permission);

alter table public.profiles
  add column if not exists role_id uuid references public.roles(id) on delete set null;

-- on delete set null, not restrict or cascade: deleting a role must not delete
-- the person holding it, and must not be blocked by them either. A profile with
-- a null role_id falls back to its enum tier (section 4), so the worst case of
-- a deleted role is yesterday's behaviour, not a locked-out colleague.

create index if not exists profiles_by_role on public.profiles (role_id);


-- -----------------------------------------------------------------------------
-- 3. Seed the three presets, and put everybody on one
-- -----------------------------------------------------------------------------
-- The grants below are not a redesign. They are today's behaviour written down:
-- what is currently owner-gated goes to Owner, what is currently supervisor-
-- gated goes to Supervisor, and Sales agent gets nothing — which is exactly
-- what a sales agent can do now.

insert into public.roles (org_id, name, description, is_system, legacy_role)
select o.id, 'Owner',
       'Runs the workspace. Holds every permission, including future ones, and cannot be edited.',
       true, 'owner'
  from public.organizations o
on conflict do nothing;

insert into public.roles (org_id, name, description, is_system, legacy_role)
select o.id, 'Supervisor',
       'Runs a desk: the rate sheet, the AI, coverage and reassignment — but not the workspace''s credentials or its people.',
       false, 'supervisor'
  from public.organizations o
on conflict do nothing;

insert into public.roles (org_id, name, description, is_system, legacy_role)
select o.id, 'Sales agent',
       'Sells. Reads inventory and knowledge, works their own conversations and the unassigned queue.',
       false, 'sales_agent'
  from public.organizations o
on conflict do nothing;

-- Owner's rows are seeded for the UI's benefit only. has_permission() does not
-- read them (section 4), so deleting them cannot cost anyone their workspace.
insert into public.role_permissions (role_id, permission)
select r.id, p.key
  from public.roles r cross join public.permissions p
 where r.is_system
on conflict do nothing;

insert into public.role_permissions (role_id, permission)
select r.id, p.key
  from public.roles r
  cross join public.permissions p
 where r.legacy_role = 'supervisor'
   and not r.is_system
   and p.key in ('chats.read_all', 'chats.reassign', 'chats.delete',
                 'inventory.manage', 'clients.manage', 'coverage.manage',
                 'knowledge.manage', 'bot.configure')
on conflict do nothing;

-- Everyone lands on the preset matching the tier they already had. The legacy
-- aliases are mapped here rather than left to fall through, because a
-- super_admin row that ended up on 'Sales agent' would be a demotion performed
-- silently by a migration.
update public.profiles p
   set role_id = r.id
  from public.roles r
 where p.role_id is null
   and r.org_id = p.org_id
   and r.legacy_role = case
         when p.role in ('owner', 'super_admin')     then 'owner'
         when p.role in ('supervisor', 'team_lead')  then 'supervisor'
         else 'sales_agent'
       end::public.app_role;


-- -----------------------------------------------------------------------------
-- 4. app.has_permission() — the new authority
-- -----------------------------------------------------------------------------
-- Three branches, in this order, and the order is the safety argument:
--
--   1. Sealed owner  -> true, always, without reading role_permissions at all.
--   2. A granted row -> what the matrix says.
--   3. No role_id    -> the pre-0034 tier, so a profile this migration never
--                       reached keeps exactly the access it had.
--
-- Branch 3 is what makes 0035 safe to apply: a policy rewritten to ask
-- has_permission() cannot accidentally deny somebody the backfill missed.

create or replace function app.has_permission(p_key text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select
    -- 1. Sealed owner. Reads the enum, not the matrix, so ownership survives
    --    any state the permission tables can get into.
    app.is_owner()
    -- 2. Granted explicitly.
    or exists (
         select 1
           from public.profiles p
           join public.role_permissions rp on rp.role_id = p.role_id
          where p.id = (select auth.uid())
            and rp.permission = p_key
       )
    -- 3. Unmigrated profile: fall back to the tier that used to decide this.
    or (
         (select role_id from public.profiles where id = (select auth.uid())) is null
         and case
               when p_key in ('credentials.manage', 'team.manage',
                              'logs.read', 'data.purge')
                 then app.is_owner()
               else app.is_supervisor()
             end
       )
$$;

comment on function app.has_permission is
  '0034: the single question every policy asks from 0035 onward. Sealed owners '
  'short-circuit; a profile with no role_id falls back to its app_role tier so '
  'nothing the backfill missed loses access.';

-- app.is_owner() and app.is_supervisor() are deliberately NOT redefined here.
-- is_owner() remains enum-backed because it is the lockout guarantee and branch
-- 1 above depends on it. is_supervisor() remains enum-backed because branch 3
-- depends on it. After 0035 neither is consulted by a policy directly; they
-- survive as the floor under the new mechanism, not as the mechanism.


-- -----------------------------------------------------------------------------
-- 5. Keeping profiles.role honest, and the seal enforced
-- -----------------------------------------------------------------------------

/**
 * profiles.role mirrors the assigned role's tier.
 *
 * Both columns have to agree or is_owner() and the matrix will disagree about
 * the same person — and is_owner() is the one that can hand back a locked-out
 * workspace, so it must never be stale. Writing the mirror here rather than
 * asking every caller to set both is what stops a route updating one of them.
 */
create or replace function app.sync_profile_role_tier() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.role_id is not null then
    select r.legacy_role into new.role from public.roles r where r.id = new.role_id;
  end if;
  return new;
end $$;

drop trigger if exists sync_profile_role_tier on public.profiles;
create trigger sync_profile_role_tier before insert or update of role_id on public.profiles
  for each row execute function app.sync_profile_role_tier();

/**
 * The seal.
 *
 * A trigger rather than a policy check because the supervisor-style policies on
 * these tables allow direct PostgREST writes, and 0029 already established that
 * a rule which must hold against PostgREST belongs in a trigger — a route guard
 * is a suggestion.
 */
create or replace function app.protect_system_role() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    if old.is_system then
      raise exception 'The Owner role cannot be deleted.'
        using errcode = 'insufficient_privilege';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    -- The description is editable; what the role IS is not.
    if old.is_system and (new.is_system is distinct from old.is_system
                          or new.legacy_role is distinct from old.legacy_role
                          or lower(new.name) is distinct from lower(old.name)) then
      raise exception 'The Owner role cannot be renamed or re-scoped.'
        using errcode = 'insufficient_privilege';
    end if;
    -- Nothing may be promoted into the sealed slot afterwards.
    if new.is_system and not old.is_system then
      raise exception 'A role cannot be made a system role.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists protect_system_role on public.roles;
create trigger protect_system_role before update or delete on public.roles
  for each row execute function app.protect_system_role();

/** The sealed role's grants are fixed too, so the UI can render them read-only. */
create or replace function app.protect_system_role_permissions() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_system boolean;
begin
  select r.is_system into v_system from public.roles r
   where r.id = coalesce(new.role_id, old.role_id);

  if coalesce(v_system, false) then
    raise exception 'The Owner role holds every permission and cannot be changed.'
      using errcode = 'insufficient_privilege';
  end if;

  return coalesce(new, old);
end $$;

drop trigger if exists protect_system_role_permissions on public.role_permissions;
create trigger protect_system_role_permissions
  before insert or update or delete on public.role_permissions
  for each row execute function app.protect_system_role_permissions();

-- Future permissions are granted to sealed roles automatically, so a later
-- migration adding a capability never leaves owners without it. This runs as
-- the migration's own role, which is why it is a statement here rather than
-- something the trigger above would have to make an exception for.
insert into public.role_permissions (role_id, permission)
select r.id, p.key from public.roles r cross join public.permissions p
 where r.is_system
on conflict do nothing;


-- -----------------------------------------------------------------------------
-- 6. Who may change a role assignment
-- -----------------------------------------------------------------------------
-- profiles.role has been locked to owners since 0015, and role_id is the same
-- fact under a new name — leaving it unguarded would be a way to hand yourself
-- a role by PATCHing your own profile row. Reproduced from 0021's version with
-- role_id added.

create or replace function app.protect_privileged_columns() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Server-side work with the service role — migrations, the signup trigger,
  -- admin routes — has no auth.uid() and is not what this guards against.
  if (select auth.uid()) is null then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.role_id is distinct from old.role_id
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

    -- A role from somebody else's workspace would silently grant whatever that
    -- workspace had configured.
    if new.role_id is not null and not exists (
      select 1 from public.roles r where r.id = new.role_id and r.org_id = new.org_id
    ) then
      raise exception 'That role belongs to a different workspace.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- Supervisor, not owner: capacity is day-to-day team management, unlike a
  -- role change. Self-service is what is being prevented, not delegation.
  if new.max_open_chats is distinct from old.max_open_chats
     and not app.is_supervisor()
  then
    raise exception 'Only a supervisor can change an agent''s chat capacity.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end $$;


-- -----------------------------------------------------------------------------
-- 7. RLS on the new tables
-- -----------------------------------------------------------------------------
-- Roles are readable workspace-wide: the team screen shows who holds what, and
-- a person is entitled to know what their own role permits. Writing is
-- team.manage, which today means owners and nobody else — the same set that
-- could change a role before this migration existed.

alter table public.roles            enable row level security;
alter table public.role_permissions enable row level security;

drop policy if exists roles_read on public.roles;
create policy roles_read on public.roles for select to authenticated
  using (org_id = app.current_org_id());

drop policy if exists roles_write on public.roles;
create policy roles_write on public.roles for all to authenticated
  using  (org_id = app.current_org_id() and app.has_permission('team.manage'))
  with check (org_id = app.current_org_id() and app.has_permission('team.manage'));

drop policy if exists role_permissions_read on public.role_permissions;
create policy role_permissions_read on public.role_permissions for select to authenticated
  using (exists (select 1 from public.roles r
                  where r.id = role_id and r.org_id = app.current_org_id()));

drop policy if exists role_permissions_write on public.role_permissions;
create policy role_permissions_write on public.role_permissions for all to authenticated
  using  (app.has_permission('team.manage') and exists (
            select 1 from public.roles r
             where r.id = role_id and r.org_id = app.current_org_id()))
  with check (app.has_permission('team.manage') and exists (
            select 1 from public.roles r
             where r.id = role_id and r.org_id = app.current_org_id()));
