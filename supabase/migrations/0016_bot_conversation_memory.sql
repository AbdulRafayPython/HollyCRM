-- =============================================================================
-- HollyCRM 0016 — the bot remembers what the customer already told it
--
-- Observed in a live conversation:
--
--   Customer: 5 star hotel 12 sep and 5 people
--   Bot:      could you confirm the city (Makkah or Madinah), check-out date?
--   Customer: Makkah
--   Bot:      could you confirm the check-out date?
--   Customer: Dont know
--   Bot:      could you confirm the check-out date?          <- verbatim repeat
--   Customer: I need to talk to the sales agent
--   Bot:      one of our team will get back to you shortly
--   Customer: okay check out date is 30 sep
--   Bot:      could you confirm the city (Makkah or Madinah), check-in date?
--                                                            ^^ both already given
--
-- Requirements were re-derived from a six-message sliding window on every turn
-- and never read back from the lead, so once "Makkah" and "12 sep" scrolled out
-- of the window the bot genuinely did not know them. The lead row is the only
-- durable memory in the loop, and it could not hold the single most important
-- slot: there was no city column. Everything else (dates, pax, rooms, budget)
-- already had one and was being written by advanceStage() — write-only, never
-- read.
--
-- Three columns:
--   city             the missing slot, so the merge in runBot() is complete
--   min_stars        the other slot with nowhere to live. "5 star hotel" in the
--                    opening message was dropped by the time the dates arrived and
--                    the search finally ran, so the customer got quoted 3-star
--                    rooms they had already ruled out.
--   clarify_attempts how many times in a row we have asked and not been answered.
--                    The bot asks twice — once plainly, once rephrased into an
--                    easier question — and hands off instead of asking a third time.
--
-- Deliberately NOT a jsonb blob: search_hotels() takes discrete typed params and
-- the pipeline board reads these columns directly. A second, parallel copy of the
-- same slots in JSON would immediately disagree with the typed ones.
-- =============================================================================

alter table public.leads
  add column if not exists city text
    check (city is null or city in ('Makkah', 'Madinah')),
  add column if not exists min_stars int
    check (min_stars is null or min_stars between 1 and 5),
  add column if not exists clarify_attempts int not null default 0
    check (clarify_attempts >= 0);

comment on column public.leads.city is
  'Which city the customer is asking about. Written by the bot extractor and '
  'merged forward across turns. Not editable from the lead panel — the leads '
  'PATCH route accepts only stage and drop_reason.';

comment on column public.leads.min_stars is
  'Minimum star rating the customer asked for, carried across turns so it still '
  'constrains search_hotels() when the dates arrive several messages later.';

comment on column public.leads.clarify_attempts is
  'Consecutive unanswered clarifying questions. Reset to 0 the moment a new '
  'requirement lands. The bot asks at most twice; a third would-be ask hands '
  'the chat to a human instead.';

-- Backfill from the quotes the bot already sent, so leads mid-conversation when
-- this ships keep what was extracted at quote time rather than starting the
-- interrogation over.
update public.leads l
   set city      = coalesce(l.city, q.city),
       min_stars = coalesce(l.min_stars, q.min_stars)
  from (
    select distinct on (lead_id)
           lead_id,
           nullif(payload -> 'requirements' ->> 'city', '')      as city,
           (payload -> 'requirements' ->> 'min_stars')::int      as min_stars
      from public.quotes
     where payload -> 'requirements' ->> 'city' in ('Makkah', 'Madinah')
     order by lead_id, sent_at desc nulls last
  ) q
 where q.lead_id = l.id
   and (l.city is null or l.min_stars is null);
