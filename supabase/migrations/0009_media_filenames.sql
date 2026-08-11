-- =============================================================================
-- HollyCRM 0009 — real filenames for media, and media fields on the live payload
--
-- Two gaps the thread's attachment rendering exposed:
--
-- 1. Inbound media is mirrored to `${org}/${chat}/${message_id}.${ext}` (see
--    mirrorInboundMedia), so the storage path carries no trace of what the
--    customer actually named the file. WhatsApp sends it as
--    fileMessageData.fileName and we were dropping it — a passport scan showed
--    in the UI as "3f9c1a…e21.pdf". The caption cannot double as the name:
--    body feeds the AI extractor, and most documents arrive with no caption.
--
-- 2. broadcast_message() omitted media_mime, so a document arriving live had no
--    type until a refresh — the UI could not tell a PDF from a voice note and
--    fell back to the generic file card.
-- =============================================================================

alter table public.messages
  add column if not exists media_name text;

comment on column public.messages.media_name is
  'Original filename as sent (WhatsApp fileMessageData.fileName) or as uploaded by the agent. Display only — never used to build a storage path.';

-- -----------------------------------------------------------------------------
-- Broadcast payload: carry the media fields the thread renders.
-- Unchanged from 0004 apart from the two added keys.
-- -----------------------------------------------------------------------------
create or replace function app.broadcast_message() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      'chat_id', new.chat_id,
      'lead_id', new.lead_id,
      'direction', new.direction,
      'sender_type', new.sender_type,
      'message_type', new.message_type,
      'body', new.body,
      'media_path', new.media_path,
      'media_mime', new.media_mime,
      'media_name', new.media_name,
      'delivery_status', new.delivery_status,
      'wa_timestamp', new.wa_timestamp),
    'new_message',
    'chat:' || new.chat_id::text,
    true
  );
  return new;
end $$;
