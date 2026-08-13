-- =============================================================================
-- HollyCRM 0022 — each workspace brings its own model and its own key
--
-- The model client reads DEEPSEEK_API_KEY from the environment, which makes the
-- provider a property of the DEPLOYMENT rather than of the workspace. Every
-- tenant on a shared deployment shares one key, one rate limit and one bill,
-- and a workspace that wants a different model has to ask for a redeploy.
--
-- Keys go into Supabase Vault, not into a text column.
--
-- The threat is specific and ordinary: a service-role key leaks, or a database
-- backup is copied somewhere it should not be. A plaintext column hands over
-- every customer's model credit in one SELECT. Vault encrypts at rest with a
-- key held outside the table, so the same SELECT returns ciphertext.
--
-- The application NEVER reads a key back to the browser. The settings UI shows
-- a masked hint ("sk-...4f2a") stored alongside, which is enough for a human to
-- confirm which key is installed and useless to anybody who steals it.
-- =============================================================================

create extension if not exists supabase_vault with schema vault;

create table if not exists public.llm_providers (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  provider     text not null check (provider in ('deepseek', 'openai', 'anthropic', 'custom')),
  label        text,
  model        text not null,
  -- Where a 'custom' (OpenAI-compatible) provider lives. Null uses the
  -- provider's documented default.
  base_url     text,
  -- The Vault secret holding the key. The key itself is never in this table.
  secret_id    uuid,
  -- Last 4 characters, so an admin can tell two keys apart without either of
  -- them being recoverable from this row.
  key_hint     text,
  is_active    boolean not null default false,
  -- Guardrails an operator can actually reason about, per workspace.
  max_tokens   int not null default 700 check (max_tokens between 64 and 8000),
  temperature  numeric(3,2) not null default 0.30 check (temperature between 0 and 2),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists llm_providers_by_org on public.llm_providers (org_id);

-- One active provider per workspace: "which model answers customers" must have
-- exactly one answer, and a tie broken by insertion order is a coin flip nobody
-- can debug.
create unique index if not exists llm_providers_one_active
  on public.llm_providers (org_id) where is_active;

create trigger set_updated_at before update on public.llm_providers
  for each row execute function app.set_updated_at();

alter table public.llm_providers enable row level security;

-- Note there is no read policy that exposes secret_id usefully — the column is
-- a pointer, and vault.decrypted_secrets is not readable by `authenticated`.
drop policy if exists llm_providers_read on public.llm_providers;
create policy llm_providers_read on public.llm_providers for select to authenticated
  using (org_id = app.current_org_id() and app.is_supervisor());

drop policy if exists llm_providers_write on public.llm_providers;
create policy llm_providers_write on public.llm_providers for all to authenticated
  using  (org_id = app.current_org_id() and app.is_supervisor())
  with check (org_id = app.current_org_id() and app.is_supervisor());

-- -----------------------------------------------------------------------------
-- Storing a key
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER so the caller never touches vault directly. Rotating a key
-- replaces the secret in place, so the provider row keeps its id and nothing
-- that references it has to be updated.

create or replace function public.set_llm_key(
  p_provider_id uuid,
  p_key         text
)
returns jsonb
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_org_id    uuid;
  v_secret_id uuid;
  v_hint      text;
begin
  select org_id, secret_id into v_org_id, v_secret_id
    from public.llm_providers where id = p_provider_id;

  if v_org_id is null then
    raise exception 'Unknown provider.';
  end if;

  -- The function runs as its owner, so the caller's RLS does not apply inside
  -- it. Re-check authorisation explicitly, or any authenticated user could
  -- write a key into any workspace by guessing a uuid.
  if v_org_id is distinct from app.current_org_id() or not app.is_supervisor() then
    raise exception 'Only a supervisor can set this workspace''s model key.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_key is null or length(trim(p_key)) < 8 then
    raise exception 'That does not look like an API key.';
  end if;

  v_hint := '...' || right(trim(p_key), 4);

  if v_secret_id is null then
    v_secret_id := vault.create_secret(
      trim(p_key),
      'llm_key_' || p_provider_id::text,
      'LLM API key for provider ' || p_provider_id::text
    );
    update public.llm_providers
       set secret_id = v_secret_id, key_hint = v_hint
     where id = p_provider_id;
  else
    perform vault.update_secret(v_secret_id, trim(p_key));
    update public.llm_providers set key_hint = v_hint where id = p_provider_id;
  end if;

  -- Returns the hint, never the key. A function that can echo a secret back is
  -- one refactor away from a route that does.
  return jsonb_build_object('ok', true, 'key_hint', v_hint);
end;
$$;

revoke all on function public.set_llm_key(uuid, text) from public;
grant execute on function public.set_llm_key(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Reading a key
-- -----------------------------------------------------------------------------
-- service_role ONLY. This is the one path that returns plaintext, and it is
-- reachable exclusively from server-side code on the reply path. It is
-- deliberately not granted to `authenticated`: no browser session, however
-- privileged, should be able to read a key back out.

create or replace function public.get_active_llm(p_org_id uuid)
returns table (
  provider    text,
  model       text,
  base_url    text,
  api_key     text,
  max_tokens  int,
  temperature numeric
)
language sql
security definer
set search_path = public, vault, pg_temp
as $$
  select p.provider, p.model, p.base_url, s.decrypted_secret,
         p.max_tokens, p.temperature
    from public.llm_providers p
    left join vault.decrypted_secrets s on s.id = p.secret_id
   where p.org_id = p_org_id
     and p.is_active
   limit 1;
$$;

revoke all on function public.get_active_llm(uuid) from public;
revoke all on function public.get_active_llm(uuid) from authenticated;
grant execute on function public.get_active_llm(uuid) to service_role;
