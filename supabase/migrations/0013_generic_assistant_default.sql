-- =============================================================================
-- HollyCRM 0013 — the assistant's default name is not a customer's brand
--
-- bot_name defaulted to 'Hollyland AI', so every workspace created by anyone
-- started out branded as one particular travel agency. The product is a CRM
-- that a business configures for itself; hotels were only ever the first
-- vertical it was demonstrated with.
--
-- Existing rows are untouched — a workspace that deliberately named its
-- assistant keeps that name.
-- =============================================================================

alter table public.bot_settings alter column bot_name set default 'AI Assistant';
