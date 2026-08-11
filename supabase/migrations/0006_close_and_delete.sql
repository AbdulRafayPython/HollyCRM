-- =============================================================================
-- HollyCRM 0006 — conversation deletion is supervisor-only
--
-- "Close conversation" is NON-destructive (archive + close the lead) and needs
-- no schema change. Hard deletion exists for spam and test chats only, and RLS
-- is the enforcer: without this policy no authenticated user can delete a chat
-- at all (deny-by-default), so the API route cannot be talked into it either.
-- Deleting a chat cascades to messages, leads, stage events, quotes and
-- document rows by design — which is exactly why it is supervisor-gated.
-- =============================================================================

create policy chats_delete on public.chats for delete to authenticated
  using (org_id = app.current_org_id() and app.is_supervisor());
