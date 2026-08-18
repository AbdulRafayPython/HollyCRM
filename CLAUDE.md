# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev            # dev server on :3000
npm run typecheck      # tsc --noEmit
npm run lint           # next lint
npm run build          # production build
npm start              # serve the production build
```

**There is no test framework in this repo** — no Jest/Vitest/Playwright config, no `*.test.*` files. Verification is `npm run typecheck` plus `npm run build`, and then exercising the real path:

```bash
# Runs the whole bot brain (extract → search → compose) with no WhatsApp attached.
# Returns extracted requirements, matched inventory rows, the composed reply, and per-stage timings.
curl -X POST localhost:3000/api/dev/simulate \
  -H "Content-Type: application/json" \
  -d '{"text":"5 star Makkah hotel under 1300 riyal near Haram, 10-15 September 2026, 8 people"}'
```

`/api/ai/test` is the in-app equivalent behind the settings UI.

**Building while `next dev` is running:** both default to `.next` and sharing that directory corrupts whichever finishes second. Set `NEXT_DIST_DIR` (`.next-build`, `.next-verify`, …) for any verification build — `next.config.ts` reads it, and `tsconfig.json` already includes the alternate `types` paths. Never set `NEXT_DIST_DIR` on Vercel.

Inbound WhatsApp traffic needs a public HTTPS URL (`ngrok http 3000` or a Cloudflare tunnel) pointed at `/api/webhook/green/<GREEN_API_WEBHOOK_SECRET>`.

A Supabase MCP server is configured in `.mcp.json` against a fixed project ref; it needs `SUPABASE_ACCESS_TOKEN` in the environment.

## What this is

A WhatsApp-native CRM for Umrah/Hajj hospitality. The **conversation** is the first-class entity — a group chat can hold several leads, and message history outlives lead deletion. Next.js 15 App Router (RSC) + Supabase (Postgres, Auth, RLS, Realtime, Storage) + an unofficial WhatsApp gateway + an OpenAI-compatible LLM.

Spec: [HollyCRM_PRD_v2.md](HollyCRM_PRD_v2.md). The defects that forced the v1.1 rewrite are catalogued in [ARCHITECTURE_REVIEW.md](ARCHITECTURE_REVIEW.md), and code comments cite its ids (`A3`, `C6`, `D3`, `E2`, …) — grep the review when you hit one. [HollyCRM_Supabase_PRD.md](HollyCRM_Supabase_PRD.md) is v1.1 and historical; do not build from it.

**[README.md](README.md) has drifted.** It documents migrations through `0017` (the tree is at `0029`) and predates the second WhatsApp gateway, per-workspace LLM providers, the knowledge base, the workflow editor, routing/presence, and notifications. Trust the code and the migration headers over it, and fix the README when you touch what it describes.

## The message path

```
Green API / WasenderAPI webhook
  → verify secret path + Bearer, BEFORE parsing the body
  → insert into webhook_events (unique index = idempotency)
  → ingestInbound(): contact → chat → lead → message
  → return 200 in <100ms
  → after(): mirror media → shouldReply() → runBot()
```

`src/app/api/webhook/green/[secret]/route.ts` and `.../wasender/[secret]/route.ts` are near-parallel implementations of this. Rules that hold in both:

- **The response must be fast and it must be 2xx.** Gateways retry anything non-2xx, and retrying will not fix an unparseable payload or an unknown instance — those return `200 {ok:true, ignored:...}` with a server log, not a 5xx.
- **Idempotency lives at the front door.** The unique index on `(instance_id, wa_message_id)` makes a retry's insert fail with `23505`, and that error is the signal to stop before unread counts, triggers, or the bot can double-fire.
- **All model and gateway work happens inside `after()`**, never on the response path.
- **Tenancy comes from the instance row, not from env.** The gateway instance that delivered the message identifies the workspace; `DEMO_ORG_ID` survives only as a single-developer fallback.

`shouldReply()` in [src/lib/bot/orchestrator.ts](src/lib/bot/orchestrator.ts) is the gate before any paid model call. Its stateful half — kill switch, pause with auto-resume, per-group cooldown, daily cap — is **one atomic SQL call to `public.bot_gate()`**, so the limits hold under concurrent webhooks. Only the stateless half (group trigger keywords) runs in Node. Don't move gate state into JavaScript.

## The bot loop

`runBot()` (`orchestrator.ts`, ~1000 lines, and the file to read first for any bot change):

```
load person profile/memory → extract (LLM, JSON mode + Zod) → merge slots from the lead row
  → operator rules (deterministic, no model)
  → intent routing → search_hotels() SQL  |  search_knowledge() SQL  |  handoff
  → compose (LLM) → send → advance lead stage → record quote
```

**The single most important invariant: every price, distance, and availability figure comes from SQL, not from the model.** The model never sees the inventory table and cannot query it — it only receives rows `search_hotels()` returned. Similarity search cannot enforce a price ceiling or a date range, which is why the v1.1 embedding pipeline was deleted (`ARCHITECTURE_REVIEW.md §A3`). pgvector remains in the schema as an optional re-ranker for descriptive nuance, never as the filter. `search_knowledge()` returning zero rows is likewise a feature: the composer is told it has no documented answer and hands off rather than confabulating from the least-irrelevant paragraph.

Other load-bearing decisions in that file, each with a comment explaining the bug it fixed:

- Slots are merged from the lead row, so a value survives however far back it was said; `resolveIntent()` overrides the model where conversation state proves it wrong (a bare `"Makkah"` is an answer, not chatter).
- Clarify attempts are budgeted (`MAX_CLARIFY_ATTEMPTS = 2`), reset by progress, and end in a human handoff rather than a third repeat of the same question.
- Operator rules ([src/lib/bot/rules.ts](src/lib/bot/rules.ts)) run *after* extraction so conditions can read intent/city/pax/budget, and *before* built-in routing so a workspace rule beats the bot's opinion. They are strictly deterministic — no model call.
- Paths that hand off still persist what was extracted first; returning without writing is how a customer got re-interrogated for a city they had already given.
- Every model invocation is logged to `ai_runs` (latency, tokens, outcome), including orchestrator-level failures.

## Multi-tenancy, auth, and the three Supabase clients

| Client | Use | Notes |
|---|---|---|
| [src/lib/supabase/server.ts](src/lib/supabase/server.ts) | RSC + route handlers, subject to RLS | `supabaseServer()` and `getAuthUser()` are both `cache()`-wrapped — `auth.getUser()` is a network round trip, not a cookie read |
| [src/lib/supabase/client.ts](src/lib/supabase/client.ts) | browser | anon key, ships in the bundle |
| [src/lib/supabase/admin.ts](src/lib/supabase/admin.ts) | server-only | **bypasses RLS.** Reaching a `"use client"` module leaks full database access to the browser. There is no import guard |

**Enforcement lives in Postgres, not in the API layer.** The anon key is public and PostgREST is a public endpoint, so "the UI does not offer it" is not a control. Consequences for how routes are written:

- Let RLS answer the access question — a route reads the row with the cookie-bound client and treats "no row" as 403 rather than re-implementing the policy. See [src/app/api/chats/[chatId]/send/route.ts](src/app/api/chats/[chatId]/send/route.ts) for the canonical shape: parallel auth + row read via `supabaseServer()`, then writes via `supabaseAdmin()`.
- Every business table carries `org_id`; policies key on `app.current_org_id()` / `app.current_role()` / `app.is_supervisor()` (defined in `0001`).
- Never write a `USING` clause without a matching `WITH CHECK`.
- Role helpers in [src/lib/types.ts](src/lib/types.ts) (`isOwner`, `isSupervisor`) must mirror `app.is_supervisor()`. The `app_role` enum still carries the original `super_admin`/`team_lead`/`agent` values alongside the `owner`/`sales_agent` pair added in `0010` — handle both.
- Rollup columns (`unread_count`, `last_message_at`, `first_agent_reply_at`) are maintained by the `apply_message_rollups` trigger from `0004`. Insert the message; don't hand-maintain them.

[src/middleware.ts](src/middleware.ts) refreshes the auth cookie and redirects unauthenticated users off workstation routes. Two things there are easy to break: the matcher must keep excluding `api/webhook` (so gateways are never redirected to a login page) *and* static file extensions (files in `public/` don't live under `_next/static`, and signed-in developers never see the resulting broken landing page). It also forwards an auth callback that lands on `/?code=…` to `/auth/callback`.

## Runtime configuration is in the database

Almost nothing about behaviour comes from `.env` in production — instances, LLM provider/key, bot personality, guardrails, inventory, routing, and workflow toggles are all rows, editable in `/settings/*`, applied within ~30 seconds without a redeploy. Env vars are a **fallback for local development**, deliberately kept so an existing workspace that never opens a new settings page keeps working (a migration that requires configuration before the product functions again is an outage).

Three hot-path caches follow the same pattern — [src/lib/bot/settings.ts](src/lib/bot/settings.ts), [src/lib/llm/resolve.ts](src/lib/llm/resolve.ts), [src/lib/green/client.ts](src/lib/green/client.ts) (and the wasender equivalent):

- A **`Map` keyed by `orgId`**, never a single slot. The earlier one-entry version meant two active workspaces evicted each other on every message; it looked fine on a single-tenant demo.
- 30s TTL — short enough that a rotated key takes effect while the operator is still looking at the screen.
- Bounded (`MAX_ENTRIES = 200`), cleared wholesale rather than LRU-tracked.
- Every settings route that writes must call the matching `invalidate*Cache()`.

`resolveLlm()` reads the workspace's provider via `get_active_llm` (key from Vault) and falls back to `DEEPSEEK_*` env on any RPC/Vault failure — a secrets problem must not take the bot down when a working env key exists.

## The two WhatsApp gateways

[src/lib/wa/send.ts](src/lib/wa/send.ts) is the single outbound door. The gateway is chosen **per chat** (`chats.provider`, via `asProvider()` which defaults to `green_api` for null), because a reply has to leave from the number the customer messaged. `explainSendError()` translates the two non-retryable, non-bug failures (Green API tariff quota, WasenderAPI rate limit) into something an agent can act on; ordinary failures fall through to a generic 502.

Migration `0029` restricts a workspace to **one** gateway at a time, enforced by trigger rather than route check, because supervisor RLS policies allow direct PostgREST inserts that would walk past a route. Sends are serialized per instance with a delay — human-like pacing is a ban-avoidance measure, not a nicety.

**The gateways are unofficial** (they drive WhatsApp Web). A banned number takes the client's live customer groups with it; that's the largest risk in the design. Watch `stateInstanceChanged` — `notAuthorized`, `blocked`, and `sleepMode` mean the session is dead, and the UI shows a banner rather than failing silently.

## Realtime and the inbox

[src/lib/realtime/useLiveRefresh.ts](src/lib/realtime/useLiveRefresh.ts) drives the inbox from `postgres_changes` plus `router.refresh()`. Keep all three of its defences: the 120ms coalescing window (a burst of messages must not become a burst of server-component re-runs), the fallback timer (Realtime fails *quietly* — 5s polling until `SUBSCRIBED`, then a 20s sweep), and refresh-on-visibility. Row visibility is still RLS, so an agent is only woken by their own workspace's traffic. Realtime Broadcast is *not* RLS-protected by default — private channels are authorized by a policy on `realtime.messages` (`0027`).

Server components fetch in **parallel phases** (`Promise.all` over auth + every query keyed by the route param) rather than sequential awaits; see [src/app/inbox/[chatId]/page.tsx](src/app/inbox/[chatId]/page.tsx). Messages are ordered by `wa_timestamp`, not `created_at`, so delayed webhooks render in the order the customer sent them.

## Migrations

`supabase/migrations/0001` → `0029`, applied **in filename order** (note `0005` appears twice — `_auth_onboarding` and `_security_hardening`). Order matters: later files depend on enums and functions added earlier.

- Migrations are **append-only**. Never edit an applied file; add the next number.
- Each file opens with a long comment explaining the defect or pressure that motivated it. These headers are the real design record for the schema — read the relevant one before changing behaviour it owns (`0023` for hot-path performance, `0029` for the gateway constraint, `0015` for privilege locking, and so on). Write them in the same style.
- Business logic that must be atomic or must hold against direct PostgREST access belongs in SQL: `bot_gate()`, `advance_lead_stage()`, `search_hotels()`, `search_knowledge()`, `assert_single_gateway()`. `EXECUTE` is revoked from `PUBLIC` on `SECURITY DEFINER` functions and `search_path` is pinned (`0005_security_hardening`).
- `0002_demo_seed.sql` is **fictional** inventory written to exercise `search_hotels()`; it prints the org id for `DEMO_ORG_ID`.

## Conventions

- Path alias `@/*` → `src/*`. TypeScript `strict`. Tailwind tokens (`bg-surface`, `text-ink`, `text-subtle`, `border-edge`, `text-wa-dark`) come from [tailwind.config.ts](tailwind.config.ts) — use them rather than raw palette values.
- Identity documents and inbound media go to a **private** Storage bucket; gateways receive short-lived signed URLs, never public object URLs (passport scans are PDPL/GDPR data).
- **Comment style is distinctive and worth matching**: comments explain *why*, usually by naming the failure the code prevents, and cite the migration or review id responsible. Match that density and register; a change with no rationale comment will look out of place here.
- Not built, deliberately: passport/voucher OCR and inbound voice-note transcription (no vision/audio model on the current provider — media is stored and flagged for agent review), live inventory sync, and the embeddings pipeline. Outbound voice notes do work.
