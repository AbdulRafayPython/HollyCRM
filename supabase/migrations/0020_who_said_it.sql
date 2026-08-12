-- =============================================================================
-- HollyCRM 0020 — the inbox shows WHO said it
--
-- 0018 taught the bot to tell participants apart. The inbox still could not:
-- every inbound bubble in a group was labelled "Client", so an agent reading a
-- five-person coordination group saw five people's requirements as one anonymous
-- voice — exactly the problem 0018 fixed for the bot, still fully present for
-- the human who has to take the chat over.
--
-- The data was already there. `messages.sender_contact_id` has been written by
-- ingest since 0001; nothing ever read it back.
--
-- Two gaps to close:
--
--   1. The realtime broadcast payload omits sender_contact_id, so a message that
--      arrives live has no way to be attributed even once the page knows how.
--      It would render as "Client" until the next full page load — which is the
--      worst version of the bug, because it is intermittent.
--
--   2. chats.participant_count is read in three places in the UI and written in
--      none, so every group in the product reports "0 participants" no matter
--      how many people are in it. ingest upserts chat_participants rows happily;
--      nothing ever counted them.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Broadcast who sent it
-- -----------------------------------------------------------------------------
-- Only the id travels, never the name. Names change, the payload is a snapshot,
-- and a stale name baked into a broadcast would disagree with the same person's
-- name everywhere else on the page. The client resolves the id against contacts,
-- which RLS already scopes to the org.

create or replace function app.broadcast_message() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'id', new.id, 'chat_id', new.chat_id, 'body', new.body,
      'sender_type', new.sender_type, 'message_type', new.message_type,
      'sender_contact_id', new.sender_contact_id,
      'wa_timestamp', new.wa_timestamp),
    'new_message',
    'chat:' || new.chat_id::text,
    true                       -- private channel: subscription is authorized in 0001 §10
  );
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Keep participant_count true
-- -----------------------------------------------------------------------------
-- A trigger rather than a write in ingest: the count must stay correct no matter
-- which code path adds a participant, and ingest is not the only one that ever
-- will be. Recounting the table beats incrementing a counter — an upsert that
-- hits an existing row must not inflate anything, and ingest upserts on EVERY
-- inbound group message.

create or replace function app.sync_participant_count() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_chat_id uuid := coalesce(new.chat_id, old.chat_id);
begin
  update public.chats c
     set participant_count = (
       select count(*) from public.chat_participants p where p.chat_id = v_chat_id
     )
   where c.id = v_chat_id;
  return coalesce(new, old);
end $$;

drop trigger if exists sync_participant_count on public.chat_participants;
create trigger sync_participant_count
  after insert or delete on public.chat_participants
  for each row execute function app.sync_participant_count();

-- Backfill: every group in the product currently reads zero.
update public.chats c
   set participant_count = coalesce(p.n, 0)
  from (
    select chat_id, count(*) as n
      from public.chat_participants
     group by chat_id
  ) p
 where p.chat_id = c.id
   and c.participant_count is distinct from p.n;

-- -----------------------------------------------------------------------------
-- 3. Index for the name lookup
-- -----------------------------------------------------------------------------
-- The thread resolves the distinct senders of the last 200 messages. Without
-- this, that is a sequential scan of messages per chat open.

create index if not exists messages_sender_contact_idx
  on public.messages (chat_id, sender_contact_id)
  where sender_contact_id is not null;
