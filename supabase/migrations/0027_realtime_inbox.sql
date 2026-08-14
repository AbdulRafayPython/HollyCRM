-- ---------------------------------------------------------------------------
-- Realtime for the inbox
--
-- The inbox had exactly one refresh mechanism: a 30-second setInterval calling
-- router.refresh(). An inbound WhatsApp message could therefore sit for half a
-- minute before an agent saw it, while the notification poll — running every
-- 3.5s — had already popped a toast about it. Toast first, message thirty
-- seconds later is worse than either on its own: it reads as a broken app.
--
-- No table was in the supabase_realtime publication, so the websocket path was
-- never actually available. Adding the two the inbox renders from lets the
-- client subscribe and refresh on the event instead of on a timer.
--
-- postgres_changes evaluates each subscriber's RLS SELECT policy before
-- delivering a row, and messages_read / chats_read are already scoped to the
-- caller's workspace — so this widens delivery, not visibility.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'chats'
  ) then
    alter publication supabase_realtime add table public.chats;
  end if;
end $$;
