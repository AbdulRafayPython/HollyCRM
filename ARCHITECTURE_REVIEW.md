# HollyCRM — Architecture Review of PRD v1.1

**Reviewed:** `HollyCRM_Supabase_PRD.md` (v1.1)
**Verdict:** The product thesis is sound. The technical spec is **not implementable as written** — it depends on an AI provider you don't have, and the SQL section contains defects that would break the demo inbox on first load.

Severity key: **BLOCKER** = demo will not work · **HIGH** = will break under real use or is a security hole · **MEDIUM** = fix before production.

---

## A. AI stack — the PRD is written for OpenAI, you have DeepSeek

| # | Sev | Issue | Fix |
|---|-----|-------|-----|
| A1 | **BLOCKER** | §4.1 mandates OpenAI `text-embedding-3-small`. **DeepSeek does not expose an embeddings endpoint** — it serves chat completions only (`deepseek-chat`, `deepseek-reasoner`). The entire RAG ingestion pipeline is undeliverable. | Generate embeddings with Supabase Edge Functions' built-in `gte-small` model (384-dim, runs in the Edge Function, no third-party key, no cost). DeepSeek stays as the reasoning/generation model. |
| A2 | **BLOCKER** | `embedding VECTOR(1536)` and the HNSW index hardcode OpenAI's dimensionality. Any other embedding model fails the insert. | `VECTOR(384)` to match `gte-small`. Dimension is not changeable after data load without a rebuild — get it right now. |
| A3 | **HIGH** | **RAG is the wrong retrieval strategy for this dataset.** Real queries are `5-star, Makkah, <500m from Haram, under 900 SAR/night, 12–19 Ramadan, 4 quad rooms`. Those are numeric and date predicates. Cosine similarity cannot enforce a constraint — it returns "close" matches, so the bot will confidently quote hotels that are too expensive, too far, or unavailable. | Invert the design: DeepSeek extracts structured parameters → calls **one SQL function** (`search_hotels`) that does exact filtering → DeepSeek writes the reply from the returned rows. Vectors become an optional re-ranker for descriptive nuance ("quiet", "near Clock Tower"), never the filter. Implemented as `search_hotels()` in the migration. |
| A4 | **BLOCKER** | §1.3 / §3.2 require handling passports, vouchers, images and audio notes. **DeepSeek has no vision and no audio model.** There is no OCR or transcription path. | Store media, don't parse it. Passport/voucher = upload to private storage + attach to lead + flag for agent review. Remove all implied auto-extraction from the PRD, or budget a separate multimodal provider. |
| A5 | **HIGH** | §6 SLA "RAG query + reply < 3.0s". DeepSeek's time-to-first-token from the Gulf, plus an embedding call, plus a SQL round trip, will regularly exceed this. `deepseek-reasoner` is far worse — it emits a long reasoning trace before any answer. | Use `deepseek-chat` only (never `reasoner` on the reply path). Stream, cap `max_tokens`, send a WhatsApp typing indicator immediately. Restate the SLA honestly: **p50 < 4s, p95 < 9s**. |
| A6 | **HIGH** | No timeout, retry, or circuit breaker on the model call, and no record of AI invocations. A DeepSeek outage or rate-limit means the bot silently stops replying and nobody notices. | 20s hard timeout, 1 retry, then a canned "an agent will be with you shortly" + auto-assign to human. Log every call to `ai_runs` (latency, tokens, cost, outcome). |
| A7 | **MEDIUM** | Tool/function calling on `deepseek-chat` is less reliable than OpenAI's and has been intermittently degraded. Building the parameter extraction on it is fragile. | Use JSON output mode (`response_format: {type: "json_object"}`) with the schema in the system prompt, validate with Zod, one repair retry, then fall back to regex/keyword extraction. Deterministic path must always exist. |

**Net effect:** DeepSeek is fine for this product — it's a strong, cheap instruction-follower — but it is a *reasoning* engine only. Every place the PRD assumes OpenAI-shaped capabilities (embeddings, vision, audio, rock-solid tool calls) needs the substitution above.

---

## B. Database schema defects (§5)

| # | Sev | Issue | Fix |
|---|-----|-------|-----|
| B1 | **BLOCKER** | **There is no conversation entity.** The inbox (Module 2) is chat-centric; the schema is lead-centric. `messages` links only to `lead_id`. A group with three separate family leads has one message stream and no way to decide which lead a message belongs to — and a message that arrives before any lead exists has nowhere to go. | Introduce `chats` (keyed by `chat_jid`) as the first-class entity. Messages belong to a chat; leads belong to a chat. This is the single biggest structural fix. |
| B2 | **BLOCKER** | `messages.lead_id … ON DELETE CASCADE`. Deleting or merging a lead permanently destroys the WhatsApp conversation history — your audit trail and your analytics source. | Messages hang off `chats` (cascade there is safe); `lead_id` becomes a nullable `ON DELETE SET NULL` tag. |
| B3 | **BLOCKER** | `hollyland_hotels` has one `price_per_night_usd` and one boolean `is_available`. Makkah/Madinah rates swing 5–10× between off-peak and Ramadan/Hajj, and availability is per-date, per-room-type, with allotment. As modelled, quoting is impossible and the "Dates Unavailable" drop reason (§3.1) can never be produced. | Split into `hotels` / `hotel_room_types` / `hotel_rates` (date range + price + allotment, with an overlap-prevention constraint). |
| B4 | **HIGH** | Tables the PRD depends on but never defines: `internal_notes` (§2.2), group participant list (§1.2), quotes (§3.1 stage 3), passport/voucher documents (§3.2), stage history (§5 analytics), agent profiles/roles, Green API instances (§2), webhook dedup. | All added in the migration. |
| B5 | **HIGH** | §3.2 lists attributes with no columns: nights, room configuration (Double/Triple/Quad/Sharing), max distance to Haram, mandatory drop reason for Closed-Lost, currency. | Added. |
| B6 | **HIGH** | `updated_at` defaults to `NOW()` but **nothing ever updates it** — no trigger. Every "last activity" view and every SLA metric will be wrong and nobody will notice. | `set_updated_at()` trigger on all mutable tables. |
| B7 | **HIGH** | Only `created_at` (server insert time) is stored. Green API's own message timestamp is discarded, so a retried or delayed webhook inserts a message *out of order* and the chat renders scrambled. | Store `wa_timestamp` from the webhook; order the inbox by it. |
| B8 | **HIGH** | Zero indexes beyond PK/UNIQUE. At the stated 50k msg/day, `messages` passes ~18M rows in year one; every inbox open is a sequential scan. `leads.assigned_agent_id`, `leads.pipeline_stage`, `messages(chat_id, wa_timestamp)` are all unindexed. | Full index set in the migration. |
| B9 | **HIGH** | `pipeline_stage VARCHAR(50)` with no constraint. One typo (`'QUOTATION_SENT'` vs `'Quotation_Sent'`) silently corrupts the funnel report. | Postgres `enum` types for stage, chat type, sender type, message type, role. |
| B10 | **MEDIUM** | No tenant column anywhere, yet §2 has Super Admin managing Green API instances (plural) and "agency staff". If this ever serves more than one agency, retrofitting `org_id` across every table and every RLS policy is a rewrite. | `org_id` on every business table from day one. Costs nothing now. |
| B11 | **MEDIUM** | No reply/quote linkage. In a 40-person group, "yes that one, 3 rooms" is meaningless without knowing which message it replies to — both for agents and for the bot's context window. | `reply_to_wa_message_id` column. |
| B12 | **MEDIUM** | `uuid-ossp` + `uuid_generate_v4()` is legacy. Postgres 13+ (Supabase is 15+) has `gen_random_uuid()` built in. | Drop the extension. |
| B13 | **MEDIUM** | `budget_usd` / `price_per_night_usd` — this market prices in **SAR**. Hardcoding USD forces lossy conversion at the worst moment (quoting). | `amount` + `currency`, default SAR. |
| B14 | **MEDIUM** | Green API sends delivery/read status webhooks; there's no column to record them, so agents can't see whether a quote was delivered. | `delivery_status` on messages. |

---

## C. Security and RLS (§5, §6) — the most dangerous section

| # | Sev | Issue | Fix |
|---|-----|-------|-----|
| C1 | **BLOCKER** | Both RLS policies do `SELECT 1 FROM auth.users WHERE …`. The `authenticated` role **has no grant on `auth.users`** — Supabase deliberately locks that table down. The policy raises `permission denied for table users`. **Every lead query fails for every user.** | Read the role from a `profiles` table in `public` via a `SECURITY DEFINER` helper (or from `auth.jwt() -> 'app_metadata' ->> 'role'`). Never join `auth.users` in a policy. |
| C2 | **BLOCKER** | `ALTER TABLE messages ENABLE ROW LEVEL SECURITY` with **no policy defined**. RLS-enabled + no policy = deny all. The shared inbox renders zero messages. This alone kills the demo. | Explicit SELECT/INSERT policies on messages. |
| C3 | **BLOCKER** | §1.3 sends passports and vouchers via Green API `/sendFileByUrl`, which **requires a publicly reachable URL**. As specified, scans of customers' passports get served from a public URL. That is a Saudi PDPL and GDPR exposure, not just a bug. | Private Storage bucket + **short-lived signed URL** (5–15 min) handed to Green API, or use `sendFileByUpload` (multipart) and never mint a URL at all. Never a public bucket for identity documents. |
| C4 | **HIGH** | RLS is enabled on `leads` and `messages` only. `contacts`, `whatsapp_groups`, and `hollyland_hotels` sit in `public` with RLS **off** — meaning anyone holding the anon key (which ships in your frontend bundle) can read and write your entire customer list and your rate card. | RLS on every table in `public`, no exceptions. |
| C5 | **HIGH** | The UPDATE policy has a `USING` clause but **no `WITH CHECK`**. An agent can therefore edit their lead and, in the same statement, reassign `assigned_agent_id` to someone else — or to `NULL`. There are also no INSERT or DELETE policies at all. | `WITH CHECK` on every UPDATE; explicit INSERT/DELETE policies; reassignment restricted to supervisors. |
| C6 | **HIGH** | The webhook endpoint (§1.1) has no authentication. Anyone who finds the URL can POST a forged `incomingMessageReceived` and inject fake messages, fake leads, or prompt-injection payloads straight into your bot. | Green API supports `webhookUrlToken` → sends `Authorization: Bearer <token>`. Verify it, plus an unguessable path segment. Reject anything unverified before parsing. |
| C7 | **MEDIUM** | §6 promises "AES-256 for Green API token storage at rest" with no key custody story. Encryption whose key sits next to the ciphertext isn't encryption. | Supabase Vault (`vault.create_secret`) or platform env vars. Never a plaintext column. |
| C8 | **MEDIUM** | `auth.uid()` called bare inside policies re-evaluates per row. On an 18M-row `messages` table that is a measurable tax on every query. | Wrap as `(SELECT auth.uid())` so the planner caches it as an InitPlan. |
| C9 | **MEDIUM** | §1.3 chose Realtime **Broadcast** to avoid WAL overhead — correct call — but Broadcast channels are **not RLS-protected by default**. Any authenticated agent can subscribe to any chat topic and read negotiations they're not assigned to. | Private channels + an RLS policy on `realtime.messages` that authorizes the topic against chat access. Included in the migration. |

---

## D. Ingestion pipeline (§1.1, §3)

| # | Sev | Issue | Fix |
|---|-----|-------|-----|
| D1 | **HIGH** | **The queue is over-engineering that actively hurts you.** 50,000 messages/day is **0.58 messages per second** average. A single Postgres insert handles that with four orders of magnitude of headroom. Worse, "micro-batches of up to 50 events" directly contradicts the §6 SLA of <1.2s to inbox — a batch that waits for 50 events at 0.58/s waits ~85 seconds. | For the demo and for launch: webhook route → validate → single insert → return 200 in <100ms → process the bot reply asynchronously. Add a queue when sustained load actually exceeds ~50 msg/s, and make it QStash, not a hand-rolled Redis worker. |
| D2 | **HIGH** | No queue consumer is specified. A Redis list needs a long-running poller; Next.js on Vercel has no long-running process. As drawn, nothing ever drains the queue. | If a queue is kept: Upstash **QStash** (HTTP push with built-in retry, dedup and DLQ) or a Supabase Edge Function consumer. |
| D3 | **HIGH** | No idempotency. Green API **retries webhooks** when it doesn't get a fast 200. Without a dedup key you get duplicate messages, duplicate leads, and the bot replying twice to the same question in a customer group. | `webhook_events` table with a unique index on the WhatsApp message id; `ON CONFLICT DO NOTHING`. |
| D4 | **MEDIUM** | No dead-letter path, no replay. A malformed payload takes down the pipeline with no way to recover the lost messages. | `status`/`attempts`/`error` on `webhook_events`; raw payload retained for replay. |
| D5 | **MEDIUM** | §1.1 receives `stateInstanceChanged` but the PRD never says what to do with it. `notAuthorized`, `blocked`, and `sleepMode` mean your WhatsApp session is dead — this is **the single most likely cause of your demo failing**, and as specified it fails silently. | Persist instance state, show a banner in the CRM, alert on any non-`authorized` state. Check it 30 minutes before the demo. |
| D6 | **MEDIUM** | No outbound send pacing. Green API throttles per tariff, and bursty sending from an unofficial gateway is the classic trigger for a WhatsApp number ban. | Serialize sends per instance with a small delay; cap per-group replies. |
| D7 | **MEDIUM** | Webhooks need a publicly reachable HTTPS URL. There's no plan for local development. | ngrok/cloudflared tunnel, or deploy the webhook route to Vercel and point Green API at it. |

---

## E. Product and operational gaps

| # | Sev | Issue | Fix |
|---|-----|-------|-----|
| E1 | **HIGH** | **The PRD nowhere acknowledges that Green API is an unofficial gateway.** It drives WhatsApp Web, which is against WhatsApp's ToS for automated commercial use. The number can be banned — taking the client's live customer groups with it. This is the largest business risk in the entire design and it isn't on the page. | Add a risk section: dedicated SIM (never the owner's personal number), warm-up period, human-like pacing, no unsolicited outbound, no bulk blasts, and a documented migration path to WABA for 1-on-1 while groups stay on Green API. State it openly in the demo — it reads as competence, and it will be the first question a technical buyer asks. |
| E2 | **HIGH** | §4.2 triggers the bot on `@bot`. **WhatsApp mentions are phone-number JIDs, not names** — there is no `@bot` token in the payload. The trigger will never fire. | Match the instance's own JID inside `mentionedJidList` on `extendedTextMessage`, or use an explicit keyword prefix the client is told about. |
| E3 | **MEDIUM** | An over-eager bot in a real customer group is a reputational incident, and there's no throttle or kill switch. | Per-group reply cap (e.g. 1 per 60s, 10/day), global bot kill switch, and reply-only-when-confident. |
| E4 | **MEDIUM** | §2.2 "auto-resume after N hours" needs a scheduler; none is specified. | `pg_cron` job on `chats.bot_resume_at` (enable pg_cron from the Supabase dashboard). |
| E5 | **MEDIUM** | Module 5 asks for first response time, funnel conversion, and AI automation rate. **None are computable** — there is no stage-change history and no first-agent-reply timestamp. | `lead_stage_events` table written by trigger; `first_agent_reply_at` on chats. |
| E6 | **LOW** | The business runs on Asia/Riyadh and on the Hijri calendar (Ramadan/Hajj drive both demand and price). Neither is modelled. | Store `timestamptz`, render in Asia/Riyadh; add a `season` label to rate rows. |
| E7 | **BLOCKER (schedule)** | §7 is a 10-week plan. The demo is tomorrow, and **the project directory contains only this PRD — there is no code**. Without a defined demo scope, the honest forecast is that nothing runs. | See `DEMO_RUNBOOK.md` for a cut-down scope that is genuinely achievable and still demonstrates the differentiator (groups + AI + pipeline). |

---

## What I changed vs. what I'd change

**Delivered in this pass:**
- `supabase/migrations/0001_hollycrm_init.sql` — corrected, runnable schema fixing every B and C item.
- `HollyCRM_PRD_v2.md` — the PRD rewritten around DeepSeek, with the retrieval strategy, security, and SLAs corrected. v1.1 is left untouched.
- `DEMO_RUNBOOK.md` — demo-day scope, setup order, and failure contingencies.

**Deliberately left as a decision for you** (flagged, not silently chosen):
- Whether HollyCRM is single-agency or multi-tenant. I added `org_id` everywhere because it's free now and expensive later, but the RLS assumes one org per user.
- Whether to keep pgvector at all for the demo. The migration includes it, but `search_hotels()` works correctly with the embedding argument set to `NULL` — so you can demo without ever generating an embedding.
