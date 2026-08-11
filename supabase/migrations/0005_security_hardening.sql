-- =============================================================================
-- HollyCRM 0005 — advisor-driven security hardening
-- Findings from Supabase security advisors after 0001–0004 were applied.
--
-- 1. Functions in public get EXECUTE for PUBLIC by default, which silently
--    includes `anon`. assign_chat is SECURITY DEFINER and every guard inside it
--    compares against auth.uid(); with a null uid those checks evaluate to
--    null -> false and fall through to the UPDATE — an unauthenticated caller
--    could reassign chats via /rest/v1/rpc/assign_chat. Revoke the default and
--    keep only the explicit `authenticated` grants from 0003.
-- 2. app.set_updated_at / app.topic_chat_id had a role-mutable search_path.
--    Both only use pg_catalog builtins, so pin search_path to ''.
-- =============================================================================

revoke execute on function public.assign_chat(uuid, uuid)  from public, anon;
revoke execute on function public.mark_chat_read(uuid)     from public, anon;
-- Platform helper (event trigger, not directly callable) — revoked to silence
-- the advisor and keep the API surface clean.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

alter function app.set_updated_at()      set search_path = '';
alter function app.topic_chat_id(text)   set search_path = '';
