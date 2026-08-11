# HollyCRM — Demo Day Runbook

**Reality check:** the project directory contained only a PRD. There is no application code. A 10-week roadmap cannot compress into one day, so this runbook defines a scope that is genuinely buildable and still shows the thing nobody else can show — **AI-assisted lead capture inside a WhatsApp group.**

---

## 1. Cut the scope to the differentiator

| Demo it | Skip it |
|---|---|
| One WhatsApp **group** + one direct chat | 500 groups, multi-instance |
| Inbound message → inbox in real time | Archived/filters/search |
| Bot answers a hotel-rates question **in the group** with real prices from Postgres | Vector/semantic search (pass `NULL` embedding) |
| Lead auto-created, requirements extracted, stage advances | Full Kanban drag-and-drop |
| Bot pause toggle | Auto-resume timer, pg_cron |
| Seeded Makkah/Madinah inventory with real date-based pricing | Live Hollyland sync, embeddings pipeline |
| Analytics: a static funnel count | FRT, automation rate, ROI charts |

The single highest-impact 60 seconds of the demo: **type a question into a real WhatsApp group on your phone, and have the bot reply with correctly-filtered hotel prices while the CRM inbox updates live on screen.** Build toward that and cut anything that doesn't serve it.

---

## 2. Setup order (do these in sequence — later steps depend on earlier ones)

### 2.1 Database — 10 minutes
Supabase Dashboard → SQL Editor → run in order:

1. `supabase/migrations/0001_hollycrm_init.sql`
2. `supabase/migrations/0002_demo_seed.sql` — note the demo `org id` it prints

Then verify retrieval works before writing any application code:

```bash
psql "$SUPABASE_DB_URL" -c "select hotel_name, room_type, price_per_night, total_price, rooms_available from search_hotels('Makkah','2026-09-10','2026-09-15',8,2,1300,500,4);"
```

If that returns rows, the hardest part of the backend is already done and correct.

### 2.2 Create the demo agent account
Create a user in Supabase Auth, then insert their profile (RLS depends on this row existing — **a user with no `profiles` row sees nothing at all**):

```sql
insert into public.profiles (id, org_id, role, full_name)
values ('<auth-user-uuid>', '<demo-org-uuid>', 'super_admin', 'Demo Agent');
```

### 2.3 Green API — 20 minutes, do this EARLY
1. Create an instance, scan the QR with the **dedicated demo SIM** (never a personal number).
2. Set the webhook URL and **set `webhookUrlToken`** — the app rejects any request without the matching `Authorization: Bearer` header.
3. Enable `incomingMessageReceived` and `stateInstanceChanged` notifications.
4. Add the demo number to a test WhatsApp group; put 2–3 people in it.
5. Record the instance's own JID into `green_api_instances.own_jid` — the group mention trigger depends on it.

### 2.4 Webhook reachability
Green API needs a **public HTTPS URL**. Either deploy the webhook route to Vercel (preferred — one less thing to break on stage), or run a tunnel:

```bash
cloudflared tunnel --url http://localhost:3000
```

A tunnel URL changes on every restart. If you use one, **do not restart it after configuring Green API.**

### 2.5 Environment
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server routes only, never shipped to the browser
GREEN_API_ID_INSTANCE=
GREEN_API_TOKEN=
GREEN_API_WEBHOOK_TOKEN=
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat      # NOT deepseek-reasoner — see PRD v2 §4.1
```

DeepSeek is OpenAI-SDK compatible, so the official `openai` package works with `baseURL` overridden — no separate client library needed.

---

## 3. Bot loop — the four calls that matter

```
webhook → verify Bearer → insert webhook_events (ON CONFLICT DO NOTHING)
        → upsert contact → upsert chat → insert message → 200 OK
        ↓ (after response)
should_reply?  direct chat, OR own_jid in mentionedJidList, OR intent keyword match
        ↓
DeepSeek #1  JSON mode → {city, check_in, check_out, pax, rooms, max_price, max_distance_m, min_stars}
        ↓                 validate with Zod · 1 repair retry · regex fallback
search_hotels(...)        exact SQL — this is what makes the prices correct
        ↓
DeepSeek #2  compose WhatsApp reply FROM THE ROWS ONLY
        ↓
Green API sendMessage → insert outbound message → update lead stage
```

**The one prompt rule that protects the demo.** In the composer system prompt: *"Use only the hotels, prices and distances in the provided JSON. If the list is empty, say no options match and that a colleague will follow up. Never invent a hotel, price, or distance."* A bot inventing a room rate in front of a client is the failure that ends the meeting.

---

## 3.5 Green API quota — read this before the demo

The free **Developer** tariff allows only **3 unique correspondents per calendar month**, and as of Aug 7 all three are used: `923312863640`, plus two fake test numbers. Consequences:

- **Direct-chat demo works ONLY with `923312863640`** (the allowlisted real phone).
- **The live group demo is blocked** — a group JID would be a 4th correspondent. No group can send or receive through this instance until the tariff changes.
- **Fix: upgrade to the Business tariff in the Green API console tonight.** It is the only path to a live group demo tomorrow; it also removes the correspondent cap entirely. If the upgrade doesn't happen, demo the group flow via `/api/dev/simulate` with `"isGroup": true` — the full DeepSeek + inventory pipeline runs identically, minus the phone.
- The app now handles this failure properly: agents see a clear quota message instead of gateway JSON, and the bot pauses itself (with an internal note) rather than burning DeepSeek credit on undeliverable replies.

## 4. Rehearse these five things

1. **Instance state.** Check it 30 minutes before. If it isn't `authorized`, re-scan the QR. This is the most common demo failure.
2. **Phone.** Charged, online, WhatsApp not force-closed, screen-mirroring already working.
3. **The exact question you'll type**, tested end-to-end at least twice. Something like: *"Any 5-star in Makkah under 1300 riyal, close to Haram, 10–15 September, 8 people?"*
4. **The empty-result case.** Ask for something with no match and show the bot escalating to a human. This turns a limitation into a feature.
5. **A screen recording of the working flow.** If the network or Green API fails on the day, you play the recording and keep talking. Record it tonight.

---

## 5. Say these things out loud

Buyers with technical advisors will ask. Answering before they ask reads as competence:

- **"Groups are why we exist."** WABA has no group support; that's the entire moat, and Kommo/Bitrix24 cannot follow without WhatsApp changing their API.
- **"Green API is unofficial, and here's how we manage that."** Dedicated number, warm-up, human-paced sending, no bulk blasts, instance-state monitoring, and a documented path to move 1-on-1 traffic to official WABA if needed. Never let them discover this on their own.
- **"Prices come from SQL, not from the model."** The AI reads the request and writes the reply; the numbers come from the rates table with date-based availability. This is the single most reassuring sentence you can say about an AI product to someone whose business is quoting prices.
- **"Passports never touch a public URL."** Private storage, 15-minute signed links. If they operate in Saudi or the EU, someone in that room cares about this.

---

## 6. Known gaps — disclose, don't hide

If asked what isn't built yet: OCR of passports and voucher parsing (DeepSeek has no vision model — needs a separate provider), voice-note transcription, live Hollyland inventory sync, and the full analytics suite. All are scoped in PRD v2 §8. A short honest list beats a vague claim that everything works.
