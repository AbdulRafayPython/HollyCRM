-- =============================================================================
-- HollyCRM 0010 — owner / sales_agent roles
--
-- The role vocabulary was built for a single deployment run by one company:
-- super_admin, team_lead, agent. The product is now one workspace per customer,
-- where a single owner signs up and adds the people who sell for them, so the
-- two roles that actually exist are `owner` and `sales_agent`.
--
-- Separate migration on purpose: Postgres will not let a value added to an enum
-- be USED in the same transaction that added it. 0011 does the remapping.
-- The old values stay in the type — dropping enum values requires rewriting the
-- type, and they cost nothing once nothing references them.
-- =============================================================================

alter type public.app_role add value if not exists 'owner';
alter type public.app_role add value if not exists 'sales_agent';
