-- =============================================================================
-- HollyCRM 0019 — inventory and knowledge become something you UPLOAD
--
-- Until now the only way to tell the agent anything was to type it into
-- Settings → Inventory, one hotel, one room type and one seasonal rate at a
-- time. A real agency has a rate sheet — an Excel file, a Google Sheet, a PDF
-- from a supplier — and re-keying two hundred rows by hand before the product
-- can answer a single question is not a configuration step anyone completes.
--
-- Two different things arrive in those files, and conflating them would break
-- the one guarantee this system is built on (A3: every number the bot says came
-- out of SQL, never out of a model).
--
--   PRICED INVENTORY  — rate sheets. Parsed into staging rows, reviewed by a
--                       human, then committed into hotels / room_types / rates.
--                       search_hotels() remains the only source of a price. The
--                       model never sees the file.
--
--   KNOWLEDGE         — policies, visa rules, transport, cancellation terms,
--                       FAQs. Chunked into text and retrieved at reply time so
--                       the agent can answer "do you arrange airport transfer?"
--                       instead of handing every such question to a human.
--                       Explicitly NOT a price source; the composer prompt says
--                       so, and prices in a policy PDF are stale by definition.
--
-- Retrieval here is Postgres full-text search, not embeddings. The hotels table
-- has had an unused vector column since 0001 and the demo has never had an
-- embedding step; ts_rank over a few hundred chunks is instant, needs no model
-- call on the reply path, and — unlike a cosine score — returns nothing at all
-- when nothing matches, which is the behaviour we want when a customer asks
-- about something the agency has not documented.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Where uploaded files live
-- -----------------------------------------------------------------------------
-- Private, like wa-media. A supplier rate sheet is commercially sensitive and a
-- policy document is not ours to serve to the open internet.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'knowledge', 'knowledge', false, 26214400,   -- 25 MB
  array[
    'application/pdf',
    'text/csv',
    'text/plain',
    'text/markdown',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "knowledge read own org" on storage.objects;
create policy "knowledge read own org"
on storage.objects for select to authenticated
using (
  bucket_id = 'knowledge'
  and (storage.foldername(name))[1] = app.current_org_id()::text
);

drop policy if exists "knowledge write supervisors" on storage.objects;
create policy "knowledge write supervisors"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'knowledge'
  and (storage.foldername(name))[1] = app.current_org_id()::text
  and app.is_supervisor()
);

drop policy if exists "knowledge delete supervisors" on storage.objects;
create policy "knowledge delete supervisors"
on storage.objects for delete to authenticated
using (
  bucket_id = 'knowledge'
  and (storage.foldername(name))[1] = app.current_org_id()::text
  and app.is_supervisor()
);

-- -----------------------------------------------------------------------------
-- 2. Sources
-- -----------------------------------------------------------------------------

-- Guarded: `create type` has no IF NOT EXISTS, and a partially applied
-- migration re-run should stop on a real problem, not on the first enum.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'source_kind') then
    create type public.source_kind as enum ('pdf', 'csv', 'xlsx', 'gsheet', 'text');
  end if;
  if not exists (select 1 from pg_type where typname = 'source_purpose') then
    create type public.source_purpose as enum ('knowledge', 'inventory');
  end if;
  if not exists (select 1 from pg_type where typname = 'source_status') then
    create type public.source_status as enum ('pending', 'processing', 'ready', 'failed');
  end if;
end $$;

create table public.knowledge_sources (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  purpose        public.source_purpose not null,
  kind           public.source_kind not null,
  title          text not null check (length(title) between 1 and 200),
  -- Exactly one of these is set: an uploaded object, or a link we re-fetch.
  storage_path   text,
  source_url     text,
  -- Pasted-in text needs neither, so this is a two-of-three check.
  raw_text       text,
  status         public.source_status not null default 'pending',
  error          text,
  byte_size      bigint,
  chunk_count    int not null default 0,
  row_count      int not null default 0,
  -- A Google Sheet is a living document; a PDF is not. Only linked sources can
  -- be re-synced, and this is when we last did.
  last_synced_at timestamptz,
  is_active      boolean not null default true,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint knowledge_sources_has_content check (
    storage_path is not null or source_url is not null or raw_text is not null
  )
);

create index on public.knowledge_sources (org_id, purpose, created_at desc);
create index on public.knowledge_sources (org_id, status) where status <> 'ready';

comment on column public.knowledge_sources.is_active is
  'A source can be switched off without deleting it — the retrieval query skips '
  'inactive sources, so last season''s rate sheet stops informing replies '
  'without anyone having to destroy the record of what was quoted from it.';

create trigger set_updated_at before update on public.knowledge_sources
  for each row execute function app.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Retrievable chunks
-- -----------------------------------------------------------------------------

create table public.knowledge_chunks (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  source_id  uuid not null references public.knowledge_sources(id) on delete cascade,
  ordinal    int not null,
  -- The nearest preceding heading, carried onto every chunk under it. A chunk
  -- reading "48 hours before arrival, 50% is retained" is useless without the
  -- "Cancellation policy" it sat beneath.
  heading    text,
  content    text not null check (length(content) between 1 and 8000),
  -- 'simple' rather than 'english': the corpus is trilingual (English, Arabic,
  -- Urdu) and the English stemmer mangles the other two into noise. No stemming
  -- costs us "cancel" not matching "cancellation", which the query side handles
  -- by prefix-matching instead.
  tsv        tsvector generated always as (
               to_tsvector('simple', coalesce(heading, '') || ' ' || content)
             ) stored,
  created_at timestamptz not null default now(),
  unique (source_id, ordinal)
);

create index knowledge_chunks_tsv_idx on public.knowledge_chunks using gin (tsv);
create index on public.knowledge_chunks (org_id, source_id);

-- -----------------------------------------------------------------------------
-- 4. Staged inventory rows
-- -----------------------------------------------------------------------------
-- A parsed rate sheet lands here first and NEVER goes straight into hotel_rates.
-- Supplier sheets have merged cells, footnote rows, "on request" in a price
-- column and dates in four formats; a human confirms the mapping once, and the
-- rows that could not be understood are shown rather than silently dropped.

create table public.inventory_import_rows (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  source_id       uuid not null references public.knowledge_sources(id) on delete cascade,
  row_no          int not null,
  raw             jsonb not null default '{}',

  hotel_name      text,
  city            public.city_name,
  star_rating     int,
  distance_to_haram_m int,
  has_shuttle     boolean,
  shuttle_minutes int,

  room_type       text,
  config          public.room_config,
  capacity        int,

  valid_from      date,
  valid_to        date,
  price_per_night numeric(12,2),
  currency        text not null default 'SAR',
  allotment       int not null default 0,
  season_label    text,

  -- 'ok' commits, 'warning' commits with a defaulted field, 'error' never does.
  status          text not null default 'ok' check (status in ('ok', 'warning', 'error')),
  issues          text[] not null default '{}',
  created_at      timestamptz not null default now(),
  unique (source_id, row_no)
);

create index on public.inventory_import_rows (source_id, status);

-- -----------------------------------------------------------------------------
-- 5. RLS
-- -----------------------------------------------------------------------------

alter table public.knowledge_sources     enable row level security;
alter table public.knowledge_chunks      enable row level security;
alter table public.inventory_import_rows enable row level security;

create policy sources_read on public.knowledge_sources for select to authenticated
  using (org_id = app.current_org_id());
create policy sources_write on public.knowledge_sources for all to authenticated
  using  (org_id = app.current_org_id() and app.is_supervisor())
  with check (org_id = app.current_org_id() and app.is_supervisor());

create policy chunks_read on public.knowledge_chunks for select to authenticated
  using (org_id = app.current_org_id());
create policy chunks_write on public.knowledge_chunks for all to authenticated
  using  (org_id = app.current_org_id() and app.is_supervisor())
  with check (org_id = app.current_org_id() and app.is_supervisor());

create policy import_rows_read on public.inventory_import_rows for select to authenticated
  using (org_id = app.current_org_id());
create policy import_rows_write on public.inventory_import_rows for all to authenticated
  using  (org_id = app.current_org_id() and app.is_supervisor())
  with check (org_id = app.current_org_id() and app.is_supervisor());

-- -----------------------------------------------------------------------------
-- 6. Retrieval
-- -----------------------------------------------------------------------------
-- Called on the reply path with the customer's message. Returns nothing when
-- nothing matches, which is the point: an empty result means the composer is
-- told it has no documented answer, rather than being handed the least-bad
-- paragraph in the corpus and inventing around it.

create or replace function public.search_knowledge(
  p_org_id uuid,
  p_query  text,
  p_limit  int default 4
)
returns table (
  chunk_id     uuid,
  source_title text,
  heading      text,
  content      text,
  rank         real
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with q as (
    -- Prefix matching compensates for the unstemmed 'simple' dictionary, so
    -- "cancellation" still finds a chunk that only says "cancel". websearch_
    -- to_tsquery is the forgiving parser — it never raises on punctuation,
    -- which matters when the input is an unfiltered WhatsApp message.
    select to_tsquery(
             'simple',
             array_to_string(
               array(
                 select word || ':*'
                   from unnest(
                     regexp_split_to_array(lower(regexp_replace(p_query, '[^\w\s]+', ' ', 'g')), '\s+')
                   ) as word
                  where length(word) >= 3
                  limit 12
               ),
               ' | '
             )
           ) as tsq
  )
  select k.id,
         s.title,
         k.heading,
         k.content,
         ts_rank(k.tsv, q.tsq) as rank
    from public.knowledge_chunks k
    join public.knowledge_sources s on s.id = k.source_id
   cross join q
   where k.org_id = p_org_id
     and s.is_active
     and s.status = 'ready'
     and s.purpose = 'knowledge'
     and q.tsq is not null
     and k.tsv @@ q.tsq
   order by rank desc, k.ordinal
   limit greatest(1, least(p_limit, 10));
$$;

revoke all on function public.search_knowledge(uuid, text, int) from public;
grant execute on function public.search_knowledge(uuid, text, int) to service_role, authenticated;

-- -----------------------------------------------------------------------------
-- 7. Commit a reviewed import
-- -----------------------------------------------------------------------------
-- One transaction, so a rate sheet either lands or does not. Doing this row by
-- row over HTTP would leave a half-imported hotel behind on the first overlap
-- rejection, and the operator would have no way to tell which half.
--
-- Upsert semantics throughout: re-importing next season's sheet updates the
-- hotels and room types it already knows and adds the new date ranges, rather
-- than creating "Swissotel (2)".

create or replace function public.commit_inventory_import(p_source_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id       uuid;
  v_hotels       int := 0;
  v_room_types   int := 0;
  v_rates        int := 0;
  v_skipped      int := 0;
  r              record;
  v_hotel_id     uuid;
  v_room_type_id uuid;
  v_inserted     boolean;
begin
  select org_id into v_org_id from public.knowledge_sources where id = p_source_id;
  if v_org_id is null then
    raise exception 'unknown import source';
  end if;

  for r in
    select * from public.inventory_import_rows
     where source_id = p_source_id
       and status <> 'error'
       and hotel_name is not null
       and city is not null
     order by row_no
  loop
    -- ---- hotel ----
    select id into v_hotel_id
      from public.hotels
     where org_id = v_org_id
       and lower(name) = lower(r.hotel_name)
       and city = r.city;

    if v_hotel_id is null then
      insert into public.hotels (
        org_id, name, city, star_rating, distance_to_haram_m, has_shuttle, shuttle_minutes
      )
      values (
        v_org_id, r.hotel_name, r.city, r.star_rating, r.distance_to_haram_m,
        coalesce(r.has_shuttle, false), r.shuttle_minutes
      )
      returning id into v_hotel_id;
      v_hotels := v_hotels + 1;
    else
      -- coalesce keeps a value the sheet omitted: a rate-only sheet must not
      -- blank out the star rating and distance someone entered by hand.
      update public.hotels
         set star_rating         = coalesce(r.star_rating, star_rating),
             distance_to_haram_m = coalesce(r.distance_to_haram_m, distance_to_haram_m),
             has_shuttle         = coalesce(r.has_shuttle, has_shuttle),
             shuttle_minutes     = coalesce(r.shuttle_minutes, shuttle_minutes)
       where id = v_hotel_id;
    end if;

    if r.room_type is null or r.config is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- ---- room type ----
    insert into public.hotel_room_types (hotel_id, name, config, capacity)
    values (
      v_hotel_id, r.room_type, r.config,
      coalesce(r.capacity, case r.config
        when 'single' then 1 when 'double' then 2
        when 'triple' then 3 when 'quad' then 4 else 1 end)
    )
    on conflict (hotel_id, name) do update
      set config = excluded.config, capacity = excluded.capacity
    -- xmax = 0 identifies a genuine INSERT; a conflicting row that took the DO
    -- UPDATE branch carries the updating transaction's id. Without it the count
    -- reported back is "rows processed" while the UI calls it "room types
    -- created", and re-importing an unchanged sheet claims to have created
    -- forty room types that already existed.
    returning id, (xmax = 0) into v_room_type_id, v_inserted;

    if v_inserted then
      v_room_types := v_room_types + 1;
    end if;

    -- ---- rate ----
    if r.valid_from is null or r.valid_to is null or r.price_per_night is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- hotel_rates_no_overlap is a GiST exclusion constraint, so ON CONFLICT
    -- cannot see it. Clear the overlap first: re-importing a corrected sheet
    -- means the new price for those dates WINS, which is the whole reason
    -- someone re-imports.
    delete from public.hotel_rates
     where room_type_id = v_room_type_id
       and daterange(valid_from, valid_to, '[]')
           && daterange(r.valid_from, r.valid_to, '[]');

    insert into public.hotel_rates (
      room_type_id, valid_from, valid_to, price_per_night, currency, allotment, season_label
    )
    values (
      v_room_type_id, r.valid_from, r.valid_to, r.price_per_night,
      coalesce(r.currency, 'SAR'), coalesce(r.allotment, 0), r.season_label
    );
    v_rates := v_rates + 1;
  end loop;

  update public.knowledge_sources
     set status = 'ready', last_synced_at = now(), error = null
   where id = p_source_id;

  return jsonb_build_object(
    'hotels', v_hotels, 'room_types', v_room_types,
    'rates', v_rates, 'skipped', v_skipped
  );
end;
$$;

revoke all on function public.commit_inventory_import(uuid) from public;
grant execute on function public.commit_inventory_import(uuid) to service_role, authenticated;
