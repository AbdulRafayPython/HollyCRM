# Product Requirements Document (PRD)

**Project Title:** HollyCRM — Supabase-Powered WhatsApp CRM for Group & Direct Lead Management with Hollyland AI Bot
**Document Version:** 2.0 (supersedes v1.1)
**Status:** Technically validated — corrected for DeepSeek, RLS, and inventory modelling
**Core Stack:** Supabase (PostgreSQL, Auth, RLS, Realtime Broadcast, Storage, pgvector), Green API Gateway, **DeepSeek API**, Next.js
**Target Domain:** Umrah & Hajj Hospitality / Makkah & Madinah Hotel Renting & Booking

> **What changed from v1.1.** The product thesis is unchanged and correct. The technical spec was rewritten because v1.1 assumed OpenAI (embeddings, vision), specified RLS policies that cannot execute on Supabase, modelled hotel inventory in a way that made quoting impossible, and had no conversation entity. Every change is traced in `ARCHITECTURE_REVIEW.md`.

---

## 1. Executive Summary & Problem Statement

### 1.1 Project Vision
HollyCRM is a WhatsApp-native CRM for Umrah/Hajj hospitality providers managing Makkah and Madinah hotel bookings through the **Hollyland** inventory system.

### 1.2 The Core Industry Problem
Standard CRMs (Kommo, Bitrix24) integrate with the **Official WhatsApp Business API (WABA)**, which has no support for **WhatsApp Groups** (`@g.us` JIDs). In this market a large share of leads and negotiations happen inside multi-participant groups — family groups, sub-agencies, group leaders. HollyCRM uses **Green API** (a WhatsApp Web protocol gateway) to work natively with both direct chats and groups.

### 1.3 Platform Risk — stated explicitly *(new in v2.0)*
Green API drives WhatsApp Web rather than the official API. This is what makes group support possible, and it carries a real cost that must be designed around, not hidden:

- The WhatsApp number can be **banned**. Mitigation: a dedicated SIM (never the owner's personal number), a warm-up period before automation is switched on, human-paced sending, no unsolicited outbound, no bulk broadcast.
- Sessions drop. The instance can enter `notAuthorized`, `blocked`, or `sleepMode` and must be re-linked by QR. HollyCRM monitors instance state and alerts on any non-`authorized` value.
- **Migration path:** if WABA ever ships group support, 1-on-1 traffic moves to WABA and groups stay on Green API. The `chats` abstraction makes the channel swappable.

### 1.4 Scalability Position — right-sized *(revised)*
The stated target of 50,000 messages/day is **0.58 messages per second**. That is comfortably inside what a single Postgres connection handles, so v2.0 removes the Redis queue from the critical path:

- **Ingestion:** the webhook route validates, writes one row, and returns `200` in under 100 ms. Bot processing happens after the response is sent. Idempotency comes from a unique index on the WhatsApp message id, not from a queue.
- **When to add a queue:** sustained inbound above ~50 msg/s, or when outbound campaigns are introduced. At that point use **Upstash QStash** (HTTP push, built-in retry, dedup, dead-letter) — not a hand-rolled Redis list, which has no consumer on serverless.
- **Realtime:** Supabase Realtime **Broadcast** on private per-chat channels, avoiding WAL parsing. Channel subscription is authorized by an RLS policy on `realtime.messages`.
- **Retrieval:** exact SQL over structured inventory, with `pgvector` as an optional re-ranker (see §4).

---

## 2. User Roles & Access Control

| Role | Description | Primary Capabilities |
| :--- | :--- | :--- |
| **Super Admin** | System administrator | Manages Green API instances, pipelines, staff, Hollyland inventory and embeddings, global analytics |
| **Team Lead / Supervisor** | Sales manager | Reassigns chats and leads, monitors all org conversations, overrides bot, views reports |
| **Sales Agent** | Front-line agent | Handles assigned + unassigned chats, moves leads through stages, quotes, toggles bot pause, internal notes |
| **Hollyland AI Bot** | Automated assistant | Replies to direct queries and qualified group triggers, runs inventory search, updates lead stage |

**Enforcement.** Role lives in `public.profiles`, read through `SECURITY DEFINER` helpers. RLS policies **never query `auth.users`** — the `authenticated` role has no grant on it, which is why v1.1's policies would have failed with `permission denied for table users`. Agents see chats assigned to them plus the unassigned pool; supervisors see the whole organisation. Every table in `public` has RLS enabled, because the anon key ships inside the browser bundle.

---

## 3. High-Level Technical Architecture

```
                    ┌──────────────────────────────┐
                    │   Green API WhatsApp         │
                    │   (Direct @c.us & Group @g.us)│
                    └───────────────┬──────────────┘
                                    │ webhook + Bearer token (verified)
                                    ▼
                    ┌──────────────────────────────┐
                    │  /api/webhook/green/[secret] │
                    │  verify → dedup → insert     │
                    │  → 200 in <100ms             │
                    └───────────────┬──────────────┘
                                    │ after response (waitUntil)
                                    ▼
        ┌───────────────────────────────────────────────────┐
        │             Bot Orchestrator (Node)               │
        │  1. should_reply?  (paused / group trigger / cap) │
        │  2. DeepSeek: extract requirements → JSON         │
        │  3. search_hotels()  ← exact SQL, not similarity  │
        │  4. DeepSeek: compose reply from returned rows    │
        │  5. send via Green API · log to ai_runs           │
        └──────┬──────────────────────────────────┬─────────┘
               │                                  │
               ▼                                  ▼
  ┌─────────────────────────┐        ┌──────────────────────────────┐
  │  Supabase Realtime      │        │   Supabase Postgres          │
  │  Broadcast (private     │        │   • chats / leads / messages │
  │  channel per chat,      │        │   • hotels + rates + allotment│
  │  RLS-authorized)        │        │   • pgvector (re-rank only)  │
  └─────────────────────────┘        │   • RLS on every table       │
                                     │   • Storage (private, signed)│
                                     └──────────────────────────────┘
```

---

## 4. AI Architecture — DeepSeek *(fully rewritten)*

### 4.1 What DeepSeek can and cannot do
| Capability | Status | Consequence |
|---|---|---|
| Chat / instruction following (`deepseek-chat`) | ✅ Strong, inexpensive, OpenAI-compatible SDK | Primary reasoning + reply generation |
| Reasoning model (`deepseek-reasoner`) | ⚠️ Available | **Never on the reply path** — it emits a long reasoning trace first and blows the latency budget |
| **Embeddings** | ❌ **No endpoint exists** | v1.1's entire RAG pipeline was undeliverable. See §4.3 |
| **Vision (passports, vouchers)** | ❌ None | No OCR. Documents are stored and flagged for the agent, never auto-parsed |
| **Audio (voice notes)** | ❌ None | Stored and surfaced to the agent; not transcribed |
| Function calling | ⚠️ Present but less reliable than OpenAI | Use JSON output mode + schema validation instead |

### 4.2 Retrieval strategy — SQL first, vectors second
v1.1 planned to answer hotel queries by cosine similarity. That is the wrong tool: a real query is *"5-star, Makkah, under 900 SAR/night, within 500 m of the Haram, 12–19 Ramadan, 4 quad rooms."* Those are numeric and date predicates, and **similarity cannot enforce a constraint** — it returns near matches, so the bot would quote hotels that are too expensive, too far, or unavailable. Quoting wrong prices to a customer in a group chat is the worst possible failure mode for this product.

The corrected flow:

1. **Extract** — `deepseek-chat` in JSON mode converts the message + recent context into a typed parameter object (`city`, `check_in`, `check_out`, `pax`, `rooms`, `max_price`, `max_distance_m`, `min_stars`). Validated with Zod; one repair retry; then a deterministic regex/keyword fallback.
2. **Search** — `search_hotels()` (single SQL function) applies exact filters: city, star floor, distance-or-shuttle, party size vs room capacity, price ceiling, and **real availability** — the stay must be fully priced and allotment must cover the requested rooms.
3. **Compose** — `deepseek-chat` writes the WhatsApp reply *only* from the returned rows, with a system prompt forbidding any price, distance or hotel name not present in the rows.
4. **Log** — every call recorded in `ai_runs` (latency, tokens, outcome).

`pgvector` remains for descriptive nuance — "quiet", "near the Clock Tower", "good for elderly parents" — as an **ordering** term over the already-filtered set. `search_hotels()` accepts `p_query_embedding => NULL` and works correctly, so the bot is fully functional before a single embedding exists.

### 4.3 Embeddings without OpenAI
Where embeddings are wanted, generate them with **Supabase Edge Functions' built-in `gte-small` model** — 384 dimensions, runs inside the Edge Function, no third-party key, no per-token cost. The `hotels.embedding` column is `vector(384)` accordingly. *(Dimension cannot be changed after data is loaded without rebuilding the index — this is why v1.1's hardcoded `vector(1536)` mattered.)*

### 4.4 Group interaction protocol *(corrected)*
- **Direct chats:** bot replies to every client message unless paused.
- **Group chats:** passive monitoring. Replies only when:
  1. The instance's **own JID appears in `mentionedJidList`** — WhatsApp mentions are phone-number JIDs, so v1.1's `@bot` token does not exist in the payload and would never have matched; or
  2. The message matches a configured intent pattern (rates, availability, distance to Haram).
- **Throttle:** max 1 bot reply per group per 60 s, 10 per day, plus a global kill switch. An over-eager bot in a live customer group is a reputational incident.

### 4.5 Fallback & handoff
Escalate to a human, pause the bot, and assign the chat when: no inventory matches the requested dates; the client asks for a custom discount; sentiment turns negative; parameter extraction fails twice; or **DeepSeek times out or errors** (20 s timeout, 1 retry, then a canned holding reply). The bot never goes silent without a human being assigned.

### 4.6 Latency SLA *(revised to be honest)*
End-to-end message → bot reply: **p50 < 4 s, p95 < 9 s.** v1.1's flat "< 3.0 s" was not achievable with an embedding call plus two model round trips from the Gulf. Note that Green API exposes no typing-indicator endpoint on standard tariffs, so perceived latency cannot be masked — it is managed by keeping the reply path on `deepseek-chat`, capping `max_tokens`, and skipping the model entirely when the trigger gate says no.

---

## 5. Functional Modules

### Module 1 — Green API Integration
- **Inbound:** `/api/webhook/green/[secret]` verifies the Green API `Authorization: Bearer <webhookUrlToken>`, writes to `webhook_events` with `ON CONFLICT DO NOTHING` (retry-safe), upserts contact → chat → message, returns 200. **Nothing unverified is parsed.**
- **Ordering:** the WhatsApp-side timestamp is stored as `wa_timestamp` and drives display order — retried or delayed webhooks would otherwise render the conversation scrambled.
- **State:** `stateInstanceChanged` is persisted to `green_api_instances.state`; anything other than `authorized` raises a banner and an alert. This is the most likely cause of an outage.
- **Outbound:** text, image, PDF, audio, location via `sendMessage` / `sendFileByUrl`, serialized per instance with pacing. Group actions: create, add/remove participant, rename, invite link.
- **Documents:** passports, visas, vouchers and receipts live in a **private** Storage bucket. Where Green API needs a URL, a **signed URL with a 15-minute expiry** is minted per send. v1.1's plain `sendFileByUrl` would have published customer passport scans at a public URL — a PDPL/GDPR exposure, not just a bug.

### Module 2 — Unified Multi-Agent Shared Inbox
- Chat list filtered by *My Chats*, *Unassigned*, *Groups*, *Archived*; direct vs group icon, unread count, bot status.
- **Claim / assign / reassign.** Reassignment away from oneself is supervisor-only, enforced by the `WITH CHECK` clause on the `chats` update policy.
- **Bot pause toggle** per chat, with optional auto-resume after N hours — driven by `chats.bot_resume_at` and a `pg_cron` job (v1.1 specified the timer but no scheduler).
- **Internal notes** with `@mention`, stored in `internal_notes`, never sent to WhatsApp.

### Module 3 — Lead Maturation & Pipeline
Stages are a Postgres `enum`, not free text: `new_inquiry → requirements_gathered → quotation_sent → under_negotiation → closed_won | closed_lost`. `closed_lost` requires a `drop_reason` (enforced by a table constraint, not by UI convention). Every transition is written to `lead_stage_events` by trigger — without that history, none of Module 5 is computable.

Lead attributes: Makkah/Madinah hotel preference, check-in/out, **nights (generated column)**, pax, rooms, room configuration, max distance to Haram, shuttle acceptable, budget **amount + currency (SAR default)**, attached documents.

### Module 4 — Hollyland AI Knowledge Bot
See §4.

### Module 5 — Analytics
Funnel conversion (from `lead_stage_events`), agent KPIs including **first response time** (from `chats.first_agent_reply_at`), AI automation rate (from `ai_runs` + stage events), group-originated vs direct lead conversion. All timestamps rendered in **Asia/Riyadh**.

---

## 6. Database Schema

Replaced in full. See `supabase/migrations/0001_hollycrm_init.sql`, which is runnable as-is. Structural changes from v1.1:

- **`chats` introduced** as the conversation entity. v1.1 attached messages only to `lead_id`, so a group containing several distinct leads had no way to route a message — and a message arriving before any lead existed had nowhere to go.
- **Message history survives lead deletion** (`ON DELETE SET NULL`, not `CASCADE`).
- **Inventory split** into `hotels` / `hotel_room_types` / `hotel_rates`, with per-date pricing, allotment, and an exclusion constraint preventing overlapping rates. Makkah and Madinah rates move 5–10× between off-peak and Ramadan, so v1.1's single `price_per_night_usd` plus a boolean `is_available` made both quoting and the "Dates Unavailable" drop reason impossible.
- **Missing tables added:** `internal_notes`, `chat_participants`, `quotes`, `documents`, `lead_stage_events`, `profiles`, `green_api_instances`, `webhook_events`, `ai_runs`.
- **`org_id` everywhere**, `updated_at` triggers that actually fire, enums for all status columns, and full index coverage — `messages(chat_id, wa_timestamp desc)` in particular, since `messages` passes ~18 M rows in year one at the stated volume.

---

## 7. Non-Functional Requirements

- **Scale:** 50,000 messages/day, 500 active groups, 50 concurrent agents.
- **Latency:** inbound message → inbox display **< 1.2 s** (Realtime Broadcast); bot reply **p50 < 4 s / p95 < 9 s**.
- **Security:** RLS on every `public` table; Green API tokens in Supabase Vault, never a plaintext column; webhook Bearer verification; private Storage with short-lived signed URLs; TLS 1.3 in transit; service-role key confined to server routes.
- **Data protection:** passport and visa images are sensitive personal data under Saudi PDPL. Private bucket, signed access only, retention policy required before production.
- **Observability:** `ai_runs` for model latency/cost/failure, `webhook_events` for ingestion replay, instance-state alerting.

---

## 8. Roadmap

| Stage | Scope |
|---|---|
| **0 — Demo** *(1 day)* | Schema + seed inventory + webhook + inbox + DeepSeek bot on one group. See `DEMO_RUNBOOK.md` |
| **1** (Wk 1–2) | Supabase project, migration, Auth + RLS, Green API instance linked and monitored |
| **2** (Wk 3–4) | Webhook hardening, idempotency, group metadata sync, media pipeline |
| **3** (Wk 5–6) | Shared inbox, Realtime Broadcast, bot pause, Kanban pipeline |
| **4** (Wk 7–8) | Hollyland inventory ingestion, `search_hotels` tuning, DeepSeek extraction + guardrails, optional embeddings |
| **5** (Wk 9–10) | Analytics, load testing, ban-risk hardening, production deploy |

---

## 9. Open Decisions

1. **Single-agency or multi-tenant?** `org_id` is present everywhere (free now, a rewrite later), but RLS currently assumes one organisation per user.
2. **Currency of record** — SAR is the default; confirm whether client-facing quotes need USD conversion.
3. **Document retention** — how long passport scans are kept after a booking closes.
4. **WABA hybrid** — whether to run official WABA for 1-on-1 alongside Green API for groups, reducing ban exposure at the cost of a second integration.
