-- =============================================================================
-- HollyCRM 0014 — profile photos
--
-- The account menu and every message bubble fall back to initials because a
-- profile has nowhere to put a picture. Adding the column is the small half;
-- the important half is WHERE the bytes live.
--
-- A separate `avatars` bucket, public-read, rather than reusing `wa-media`:
--   * wa-media holds passports and payment slips. It is private, and every read
--     costs a signed URL that expires. An avatar renders in the rail on every
--     page, in every chat row, in the team list — re-signing all of that on a
--     timer to protect a photo someone chose as their public face is effort
--     spent on the wrong thing.
--   * Public read does mean an avatar URL is guessable-by-sharing. That is the
--     normal trade every product makes for profile pictures, and it keeps the
--     private bucket private for the documents that actually matter.
--
-- Writes stay locked down: a user may only touch objects under their own uid
-- prefix, so nobody can overwrite a colleague's photo.
-- =============================================================================

alter table public.profiles
  add column if not exists avatar_url text;

comment on column public.profiles.avatar_url is
  'Public URL of the profile photo in the avatars bucket. Null renders initials.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152,
        array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif'];

-- Path convention: avatars/<user-uuid>/<filename>. The first path segment is
-- the only thing standing between one user and another's photo.
drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists avatars_write_own on storage.objects;
create policy avatars_write_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
