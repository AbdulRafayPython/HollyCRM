-- =============================================================================
-- HollyCRM 0032 — who supplies a hotel, and who the business belongs to
--
-- Two entities the schema has never had, each blocking something an operator
-- already does on paper:
--
--   SUPPLIERS   hotels.org_id says which workspace owns the ROW. It does not
--               say who the allotment was contracted from. An agency buys the
--               same hotel from two DMCs at two prices, and when a rate sheet
--               is re-imported (0019) there is nothing to attribute the change
--               to. It is also the natural unit of a desk: "you handle Al Safwa
--               Group" is how the work is actually divided.
--
--   CLIENTS     `contacts` are WhatsApp identities — a jid and a phone number.
--               In the B2B half of this business the customer is an agency that
--               sends work through several numbers, and every one of them looks
--               to the CRM like an unrelated stranger. The result is that
--               "everything for this client" is a question the product cannot
--               answer, and an agent cannot be given a book of accounts.
--
-- Both are nullable everywhere they attach. Inventory with no supplier and a
-- conversation with no client are the normal state on the day this ships, and
-- must keep working exactly as before — the columns are something to grow into,
-- not a form to fill in before the inbox opens again.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Suppliers
-- -----------------------------------------------------------------------------

create table if not exists public.suppliers (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  name          text not null check (length(trim(name)) between 1 and 120),
  -- What kind of counterparty this is. Free-ish text behind a check, because
  -- the list is short and stable but not worth a second enum after 0031.
  kind          text not null default 'dmc'
                check (kind in ('dmc', 'hotel_direct', 'wholesaler', 'other')),
  contact_name  text,
  contact_phone text,
  contact_email text,
  notes         text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists suppliers_name_per_org
  on public.suppliers (org_id, lower(name));
create index if not exists suppliers_by_org
  on public.suppliers (org_id) where is_active;

drop trigger if exists set_updated_at on public.suppliers;
create trigger set_updated_at before update on public.suppliers
  for each row execute function app.set_updated_at();

-- on delete set null, not cascade: losing a supplier relationship must never
-- delete the inventory and the quotes that were built on it.
alter table public.hotels
  add column if not exists supplier_id uuid
    references public.suppliers(id) on delete set null;

create index if not exists hotels_by_supplier
  on public.hotels (supplier_id) where is_active;

-- -----------------------------------------------------------------------------
-- 2. Clients (accounts)
-- -----------------------------------------------------------------------------

create table if not exists public.clients (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  name          text not null check (length(trim(name)) between 1 and 120),
  -- b2b: an agency that sends work. b2c: a family or individual pilgrim who is
  -- worth keeping as an account because they come back every year.
  kind          text not null default 'b2b' check (kind in ('b2b', 'b2c')),
  country       text,
  contact_name  text,
  contact_phone text,
  contact_email text,
  notes         text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists clients_name_per_org
  on public.clients (org_id, lower(name));
create index if not exists clients_by_org
  on public.clients (org_id) where is_active;

drop trigger if exists set_updated_at on public.clients;
create trigger set_updated_at before update on public.clients
  for each row execute function app.set_updated_at();

alter table public.contacts
  add column if not exists client_id uuid
    references public.clients(id) on delete set null;

-- Denormalised onto the chat on purpose. Resolving chat -> client through
-- contacts works for direct chats and not for groups, where chats.contact_id is
-- null (0021 hit the same wall routing a handoff) — and this column is read by
-- an RLS predicate on every message row, where a correlated lookup through the
-- most recent client sender would be ruinous.
alter table public.chats
  add column if not exists client_id uuid
    references public.clients(id) on delete set null;

create index if not exists contacts_by_client on public.contacts (client_id);
create index if not exists chats_by_client on public.chats (org_id, client_id);

/**
 * Keeps chats.client_id in step with the contact it belongs to.
 *
 * Fires from both directions because the two facts arrive in either order: a
 * chat can be created for a contact already linked to an account, and an
 * account can be attached to a contact whose chats already exist.
 *
 * A client set directly on the chat always wins — a group booked by one agency
 * on behalf of another is exactly the case a human overrides, and having the
 * trigger quietly undo that override is the bug this comment exists to prevent.
 */
create or replace function app.sync_chat_client() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.client_id is null and new.contact_id is not null then
    select c.client_id into new.client_id
      from public.contacts c where c.id = new.contact_id;
  end if;
  return new;
end $$;

drop trigger if exists sync_chat_client on public.chats;
create trigger sync_chat_client before insert or update of contact_id on public.chats
  for each row execute function app.sync_chat_client();

create or replace function app.cascade_contact_client() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.client_id is distinct from old.client_id then
    update public.chats
       set client_id = new.client_id
     where contact_id = new.id
       and (client_id is null or client_id = old.client_id);
  end if;
  return new;
end $$;

drop trigger if exists cascade_contact_client on public.contacts;
create trigger cascade_contact_client after update of client_id on public.contacts
  for each row execute function app.cascade_contact_client();

-- -----------------------------------------------------------------------------
-- 3. RLS
-- -----------------------------------------------------------------------------
-- Read org-wide and write supervisor-only, matching hotels. 0033 narrows the
-- read side for a scoped agent; the org boundary is stated here so that the
-- tables are never briefly readable across workspaces if 0033 is rolled back.

alter table public.suppliers enable row level security;
alter table public.clients   enable row level security;

drop policy if exists suppliers_read on public.suppliers;
create policy suppliers_read on public.suppliers for select to authenticated
  using (org_id = app.current_org_id());

drop policy if exists suppliers_write on public.suppliers;
create policy suppliers_write on public.suppliers for all to authenticated
  using  (org_id = app.current_org_id() and app.is_supervisor())
  with check (org_id = app.current_org_id() and app.is_supervisor());

drop policy if exists clients_read on public.clients;
create policy clients_read on public.clients for select to authenticated
  using (org_id = app.current_org_id());

drop policy if exists clients_write on public.clients;
create policy clients_write on public.clients for all to authenticated
  using  (org_id = app.current_org_id() and app.is_supervisor())
  with check (org_id = app.current_org_id() and app.is_supervisor());

-- contacts_write (0001) already allows any member of the org to update a
-- contact, which now includes attaching it to a client account. That is
-- deliberate: linking the number you are talking to is day-to-day sales work,
-- not administration.
