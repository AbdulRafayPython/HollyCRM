-- =============================================================================
-- HollyCRM 0036 — let the UI ask what the signed-in person may do
--
-- 0035 made every policy consult app.has_permission(), which answers one key at
-- a time and lives in the `app` schema — not reachable over PostgREST, and not
-- the shape a screen needs. A page has to decide whether to render a control
-- *before* the user touches it, and asking twelve separate questions over the
-- wire to draw one sidebar is not that.
--
-- So: one round trip, the whole set. This is the same list the policies enforce,
-- read from the same tables, which is what stops the interface and the database
-- drifting into disagreement — the exact bug the gating pass was written to fix,
-- where the UI offered a door that RLS then slammed.
--
-- It is a convenience, not a control. Nothing is authorised by what this
-- returns; a caller who lies to themselves about the result still meets the
-- policy. That is why it is safe to expose to `authenticated` at all.
-- =============================================================================

create or replace function public.my_permissions()
returns text[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    array(
      select p.key
        from public.permissions p
       where app.has_permission(p.key)
       order by p.sort_order
    ),
    '{}'::text[]
  )
$$;

comment on function public.my_permissions is
  '0036: every permission the caller holds, for drawing the UI. Never an '
  'authorisation decision — the policies from 0035 are. Iterates the catalogue '
  'through has_permission() so a sealed owner and the enum fallback are both '
  'handled in exactly one place.';

-- Signed-in users only, and it takes no argument, so it can only ever describe
-- the caller. anon is excluded because an unauthenticated session has no
-- permissions to describe and the function would just be a way to probe the
-- catalogue.
revoke all on function public.my_permissions() from public, anon;
grant execute on function public.my_permissions() to authenticated;
