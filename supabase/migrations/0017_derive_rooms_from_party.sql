-- =============================================================================
-- HollyCRM 0017 — "5 people" must not return zero hotels
--
-- search_hotels() filters on `capacity * p_rooms >= p_pax`, and the orchestrator
-- called it with `p_rooms: req.rooms ?? 1`. A customer who says how many people
-- are travelling but not how many rooms they want — which is almost everyone —
-- was therefore searched as ONE room. Any party larger than the biggest single
-- room type came back empty:
--
--   Makkah, 12-30 Sep, 5 pax, 5-star, p_rooms => 1  ->  0 rows
--   Makkah, 12-30 Sep, 5 pax, 5-star, p_rooms => 2  ->  1 row
--
-- The customer then got "We don't have options matching those exact dates and
-- requirements right now" for a request the inventory could satisfy perfectly
-- well with two quad rooms, and the lead was handed to a human for nothing.
--
-- p_rooms is now nullable and means "the customer told us a room count, honour
-- it". When null, each candidate derives the rooms that party actually needs for
-- that room type — ceil(pax / capacity) — so a 5-person enquiry matches a quad at
-- 2 rooms and a double at 3, and the totals scale accordingly. That number is
-- returned as rooms_needed so the reply can say "2 × Quad Room" instead of
-- quoting a per-room price the customer has to multiply themselves.
--
-- Return type gains a column, so the function must be dropped and recreated
-- rather than replaced.
-- =============================================================================

drop function if exists public.search_hotels(
  public.city_name, date, date, int, int, numeric, int, int, boolean,
  extensions.vector(384), int
);

create function public.search_hotels(
  p_city                 public.city_name,
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
      -- An explicit room count always wins; otherwise take the fewest rooms of
      -- THIS type that seat the party. greatest(...,1) covers a null/zero pax.
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
    join public.hotel_room_types rt on rt.hotel_id = h.id
    cross join days d
    join public.hotel_rates r
      on r.room_type_id = rt.id
     and d.d between r.valid_from and r.valid_to
    where h.is_active
      and h.city = p_city
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
    -- Fewer rooms first: one quad beats two doubles for the same five people.
    c.rooms_req,
    c.distance_to_haram_m nulls last,
    c.avg_price
  limit greatest(p_limit, 1);
$$;
