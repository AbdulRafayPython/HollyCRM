-- =============================================================================
-- HollyCRM 0031 — destinations are rows, not an enum
--
-- `public.city_name` is `enum ('Makkah','Madinah')`, frozen into the schema in
-- 0001 and reached by hotels.city, search_hotels(p_city), the extractor's slot
-- vocabulary and the inventory form. It was the right shape for an Umrah-only
-- product and it is the reason no operator can sell Jeddah, Dubai or Istanbul:
-- there is no value to store, and adding one is a schema migration the customer
-- cannot perform. It also blocks covering a market by name, because a market
-- the database cannot name cannot be assigned to anybody (0033).
--
-- The enum stays. Dropping it means rewriting every dependent function and
-- column in one transaction, and the two values in it are correct — they are
-- just not the whole world. What changes is which column is authoritative:
--
--   hotels.destination_id  ->  the truth, an org-owned row
--   hotels.city            ->  a mirror, maintained by trigger, kept because
--                              commit_inventory_import() (0019) and the import
--                              mapper still write it and a migration that makes
--                              the importer fail is an outage
--
-- Neither column is required at write time. A caller supplying either one gets
-- the other filled in, so every writer that predates this migration keeps
-- working untouched and new writers can name a destination the enum never had.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The table
-- -----------------------------------------------------------------------------

create table if not exists public.destinations (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 80),
  -- Free text, not an ISO code: it is a grouping label an operator reads
  -- ("Saudi Arabia", "UAE"), and coverage is assigned per destination anyway.
  country    text,
  -- Distances in this product are "to the Haram". For a destination that has no
  -- Haram the same column is still a distance to whatever the operator anchors
  -- on, and the label is what stops the inventory UI printing nonsense.
  anchor_label text not null default 'Haram',
  is_active  boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Case-insensitive, because the enum mirror and the import mapper both match on
-- the name and "makkah" must not become a second Makkah.
create unique index if not exists destinations_name_per_org
  on public.destinations (org_id, lower(name));

create index if not exists destinations_by_org
  on public.destinations (org_id, sort_order) where is_active;

drop trigger if exists set_updated_at on public.destinations;
create trigger set_updated_at before update on public.destinations
  for each row execute function app.set_updated_at();

-- Every workspace starts with the two the enum already guaranteed, so an
-- existing org sees no change and a new one is not asked to configure a
-- destination before it can add its first hotel.
insert into public.destinations (org_id, name, country, anchor_label, sort_order)
select o.id, v.name, 'Saudi Arabia', 'Haram', v.sort
  from public.organizations o
  cross join (values ('Makkah', 10), ('Madinah', 20)) as v(name, sort)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 2. hotels.destination_id, and the mirror that keeps hotels.city honest
-- -----------------------------------------------------------------------------

alter table public.hotels
  add column if not exists destination_id uuid
    references public.destinations(id) on delete restrict;

update public.hotels h
   set destination_id = d.id
  from public.destinations d
 where h.destination_id is null
   and d.org_id = h.org_id
   and lower(d.name) = lower(h.city::text);

alter table public.hotels alter column city drop not null;

-- One of the two must be present or the hotel is unsearchable. Deliberately not
-- `destination_id is not null`: commit_inventory_import() supplies only city,
-- and the trigger below is what turns that into a destination.
alter table public.hotels drop constraint if exists hotels_has_a_place;
alter table public.hotels add constraint hotels_has_a_place
  check (destination_id is not null or city is not null);

create index if not exists hotels_by_destination
  on public.hotels (destination_id) where is_active;

/**
 * Fills in whichever of (destination_id, city) the writer left out.
 *
 * Auto-creating the destination from a city name is intentional: the import
 * path (0019) maps a supplier's spreadsheet and cannot be made to look up ids,
 * and rejecting its rows for a destination the operator obviously wants is a
 * worse failure than an extra row in a small table.
 *
 * city is only ever set to a value the enum actually carries. A Dubai hotel
 * leaves it null, which is why 0031 dropped the NOT NULL.
 */
create or replace function app.sync_hotel_destination() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_name text;
begin
  if new.destination_id is null and new.city is not null then
    select id into new.destination_id
      from public.destinations
     where org_id = new.org_id and lower(name) = lower(new.city::text);

    if new.destination_id is null then
      insert into public.destinations (org_id, name)
      values (new.org_id, new.city::text)
      on conflict do nothing
      returning id into new.destination_id;

      -- on conflict do nothing returns no row when another statement won the
      -- race; read the winner rather than leaving the hotel unplaced.
      if new.destination_id is null then
        select id into new.destination_id
          from public.destinations
         where org_id = new.org_id and lower(name) = lower(new.city::text);
      end if;
    end if;
  end if;

  if new.destination_id is not null then
    select name into v_name from public.destinations where id = new.destination_id;
    new.city := case when lower(v_name) in ('makkah', 'madinah')
                     then v_name::public.city_name
                     else null end;
  end if;

  return new;
end $$;

drop trigger if exists sync_hotel_destination on public.hotels;
create trigger sync_hotel_destination before insert or update on public.hotels
  for each row execute function app.sync_hotel_destination();

-- -----------------------------------------------------------------------------
-- 3. RLS — same shape as inventory: everyone reads, supervisors write
-- -----------------------------------------------------------------------------

alter table public.destinations enable row level security;

drop policy if exists destinations_read on public.destinations;
create policy destinations_read on public.destinations for select to authenticated
  using (org_id = app.current_org_id());

drop policy if exists destinations_write on public.destinations;
create policy destinations_write on public.destinations for all to authenticated
  using  (org_id = app.current_org_id() and app.is_supervisor())
  with check (org_id = app.current_org_id() and app.is_supervisor());

-- -----------------------------------------------------------------------------
-- 4. search_hotels() filters on the destination
-- -----------------------------------------------------------------------------
-- p_city becomes text. The bot has always sent a JSON string over PostgREST and
-- relied on Postgres coercing it to the enum, so the RPC call site is unchanged
-- — but a string that is not one of the two enum values used to raise
-- `invalid input value for enum city_name` before a single row was scanned,
-- which is how "Dubai" failed. It now simply matches a destination or does not.
--
-- Every other line is 0017's, unchanged: an explicit room count wins over a
-- derived one, and rates/allotment still come from SQL rather than the model.

do $$
declare fn record;
begin
  for fn in
    select oid::regprocedure as sig from pg_proc
     where pronamespace = 'public'::regnamespace and proname = 'search_hotels'
  loop
    execute 'drop function ' || fn.sig;
  end loop;
end $$;

create function public.search_hotels(
  p_city                 text,
  p_check_in             date,
  p_check_out            date,
  p_pax                  int     default 2,
  p_rooms                int     default null,   -- null => derive from the party size
  p_max_price_per_night  numeric default null,
  p_max_distance_m       int     default null,
  p_min_stars            int     default null,
  p_shuttle_ok           boolean default true,
  p_query_embedding      extensions.vector(384) default null,
  p_limit                int     default 5
)
returns table (
  hotel_id        uuid,
  hotel_name      text,
  star_rating     int,
  distance_m      int,
  has_shuttle     boolean,
  room_type       text,
  capacity        int,
  rooms_needed    int,
  nights          int,
  price_per_night numeric,
  total_price     numeric,
  currency        text,
  rooms_available int,
  description     text
)
language sql stable security invoker set search_path = public, extensions, pg_temp as $$
  with days as (
    select gs::date as d
    from generate_series(p_check_in, p_check_out - 1, interval '1 day') gs
  ),
  candidates as (
    select
      h.id, h.name, h.star_rating, h.distance_to_haram_m, h.has_shuttle,
      h.description, h.embedding,
      rt.name as rt_name, rt.capacity,
      coalesce(
        p_rooms,
        greatest(ceil(coalesce(p_pax, 1)::numeric / rt.capacity)::int, 1)
      )                                as rooms_req,
      count(distinct d.d)              as covered_days,
      round(avg(r.price_per_night), 2) as avg_price,
      sum(r.price_per_night)           as room_total,
      min(r.allotment)                 as min_allotment,
      min(r.currency)                  as currency
    from public.hotels h
    join public.destinations dst on dst.id = h.destination_id
    join public.hotel_room_types rt on rt.hotel_id = h.id
    cross join days d
    join public.hotel_rates r
      on r.room_type_id = rt.id
     and d.d between r.valid_from and r.valid_to
    where h.is_active
      and dst.is_active
      and lower(dst.name) = lower(trim(coalesce(p_city, '')))
      and (p_min_stars is null or h.star_rating >= p_min_stars)
      and (p_max_distance_m is null
           or h.distance_to_haram_m <= p_max_distance_m
           or (p_shuttle_ok and h.has_shuttle))
    group by h.id, rt.id, rt.name, rt.capacity
  )
  select
    c.id, c.name, c.star_rating, c.distance_to_haram_m, c.has_shuttle,
    c.rt_name, c.capacity, c.rooms_req,
    (select count(*)::int from days),
    c.avg_price,
    round(c.room_total * c.rooms_req, 2),
    c.currency,
    c.min_allotment,
    c.description
  from candidates c
  where c.covered_days = (select count(*) from days)      -- fully priced for the stay
    and c.min_allotment >= c.rooms_req                    -- actually available
    and c.capacity * c.rooms_req >= coalesce(p_pax, 1)    -- fits the party
    and (p_max_price_per_night is null or c.avg_price <= p_max_price_per_night)
  order by
    case when p_query_embedding is null then 0
         else (c.embedding <=> p_query_embedding) end,    -- optional semantic re-rank
    c.rooms_req,
    c.distance_to_haram_m nulls last,
    c.avg_price
  limit greatest(p_limit, 1);
$$;

comment on function public.search_hotels is
  'A3: the only source of a price, a distance or an availability figure. The '
  'model never sees the inventory tables — it receives these rows.';
