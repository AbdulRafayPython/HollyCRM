# HolyCRM — Workstation UI Redesign Prompt

Paste everything below the line into a fresh Claude Code session at the repo root.

---

You are the design engineer for **HolyCRM**, a WhatsApp-native CRM for Umrah & Hajj
hospitality agencies. There is a live client demo on **Saturday**. Your job is to make the
signed-in workstation look like a product that costs $400/seat/month — not like a template.

Read this whole brief before touching a file. Then work in the delivery order at the bottom.

## 0. What already exists (do not re-invent it)

- Next.js 15 App Router, React 19, Tailwind, Supabase. Deployed on Vercel.
- **Design tokens already live in `tailwind.config.ts`.** Colour is functional, not
  decorative: `brand` (indigo — primary action / active nav), `wa` (emerald — WhatsApp
  channel and successful automation), `group` (collaborative / `@g.us` threads), `bot`
  (amber — AI-authored content), `danger`. Surfaces are `surface` / `card` / `edge` /
  `ink` / `muted` / `subtle`. Type scale is `caption/meta/body/h3/h2/h1`. Shadows are
  `card` / `pop` / `drawer`. Easing is `ease-swift`.
- **Component primitives live in `src/app/globals.css` under `@layer components`:**
  `.panel`, `.field`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.eyebrow`,
  `.scroll-thin`. Existing keyframes: `rise-in`, `fade-in`, `dash-flow`, `node-in`,
  `pulse-ring`, `drawer-in`.
- Shell: `src/components/AppShell.tsx`, `src/components/NavRail.tsx`, icon set in
  `src/components/ui/Icon.tsx` (add new glyphs there — never inline a one-off SVG icon).
- The public landing page (`src/components/landing/`) is already good. **Match its level of
  craft, not its style.** The landing page is marketing; the workstation is a dense tool.
  Marketing gradients and 3rem hero type do not belong behind the login.

**Hard constraint: add no new npm dependencies.** No Recharts, no D3, no Framer Motion, no
shadcn. Every chart is hand-authored inline SVG. This is not a limitation — a bespoke chart
is precisely what separates this from a dashboard template, and it keeps the Vercel build
fast and unbreakable before a demo.

## 1. Route the demo correctly

Right now login lands on `/inbox`. The first screen after login must be the **dashboard at
`/home`**. Change all three entry points:

- `src/app/login/page.tsx:68` — `router.push("/inbox")` → `/home`
- `src/app/login/page.tsx:85` — OAuth `next=/inbox` → `next=/home`
- `src/app/auth/callback/route.ts:25-26` — default `next` fallback → `/home`

Add a **Dashboard** item as the first entry in `NAV` in `src/components/NavRail.tsx`
(`/home`), and make the logo click target `/home`. Keep the active-route matching correct —
`pathname.startsWith(item.href)` must not light up two items at once.

## 2. The anti-slop contract

The client will recognise generic AI output on sight. These are banned outright:

- Four identical rounded cards in a row with a huge gradient number and a coloured icon in
  a tinted square. This is the single most recognisable AI-dashboard tell.
- Purple/blue gradient backgrounds on cards, `shadow-2xl` on everything, glassmorphism,
  `backdrop-blur` used decoratively, glow effects.
- Emoji as UI icons (🚀 📊 ✨ 🔥). Use `Icon.tsx` glyphs only.
- Copy like "AI-Powered Insights", "Supercharge your workflow", "Unlock the power of".
  Write like an operations tool: "Unassigned for 40m", "3 quotes awaiting reply".
- Fake data, placeholder sparklines, or hardcoded percentages. Every number renders from
  Supabase or does not render.
- Decorative colour. A colour appears only when it carries the meaning defined in §0.
- Centred body text, `text-6xl` inside the app, oversized paddings that fit six numbers on
  a 1440px screen.

Positive direction — the reference points are **Linear, Stripe Dashboard, Height, and
Attio**: high information density, restrained type (14px body, tabular numerals — already
set on `body`), 1px borders instead of heavy shadows, generous *vertical* rhythm and tight
horizontal rhythm, colour reserved for state, motion under 200ms and only on transform and
opacity.

Density target: on a 1440×900 viewport the dashboard shows a real working picture — headline
numbers, two charts, the live queue — without scrolling. Anything below the fold is detail.

## 3. `/home` — the dashboard (highest priority)

`src/app/home/page.tsx` is a 489-line server component that already fetches the right data:
`analytics_summary` RPC (first-response minutes, automation rate, per-channel leads/won/lost),
recent chats, priority leads, lead and hotel counts, WhatsApp instance state. **Keep the data
layer; rebuild the presentation.** Add queries only where a panel below needs a series the
RPC does not return, and put any new aggregate in a Supabase RPC or a single grouped query —
never an N+1 loop over leads.

Layout, top to bottom:

1. **Header row.** Org name, "Good morning, {first name}", and a live WhatsApp connection
   pill (`wa` when `state === "authorized"`, `danger` otherwise) with the connected number.
   Right side: date-range control (7 / 30 / 90 days) that actually re-queries.
2. **Metric strip — not cards.** A single `.panel` divided by vertical 1px rules into four
   or five cells: Pipeline value (SAR, tabular), Active leads, Median first response,
   Automation rate, Win rate. Each cell = `.eyebrow` label, the number at `h1` weight in
   `ink`, and a delta versus the previous period in `wa`/`danger` with a small caret. A
   14px-tall sparkline sits inside the cell, drawn from real daily buckets. One panel, one
   border, internal rules — this is the shape that reads as a tool.
3. **Two charts side by side (2:1).**
   - *Left — Pipeline flow over time.* A stacked area or grouped column of leads entering
     vs. won vs. lost per day/week across the selected range. Hand-drawn SVG with a
     `viewBox` so it scales, a real y-axis with 4 gridlines in `edge`, x labels at `meta`
     size in `subtle`, and a hover crosshair with a `.panel`-styled tooltip showing the
     exact values for that bucket. Series colours: `brand` for entering, `wa` for won,
     `subtle` for lost. No 3D, no shadows on bars, no rounded-full bar caps.
   - *Right — Stage funnel.* Horizontal bars per `STAGE_LABELS` stage (import from
     `@/lib/types`), width proportional to count, with the drop-off percentage between
     consecutive stages in `muted` on the right edge. Clicking a stage navigates to
     `/pipeline` filtered to it.
4. **Live queue — the panel that wins the demo.** A dense table of leads needing action
   *now*: customer, party size, city, budget SAR, stage chip, last-message age with the
   cell turning `danger` past the SLA, assigned agent avatar, and whether the last message
   was authored by the bot (`bot` amber dot) or a human. Sorted by urgency. Row click opens
   the chat. This is the screen the client's ops manager will imagine living in — make it
   the densest, most confident thing on the page.
5. **AI activity rail** (right column or below): last stage moves made by the bot, each as
   "Advanced *Al-Faisal family* → Quoted · 4m ago", with the `bot` dot. Real rows from the
   data you already have. If the bot is disabled, show a genuine empty state with a link to
   `/settings/ai`, not a fake feed.

**Empty and loading states are part of the deliverable.** Every panel needs a real empty
state (one line of plain copy + the action that fixes it) and a skeleton that matches the
final layout's dimensions so nothing reflows. A demo database with three leads must still
look designed.

## 4. `/pipeline` — the Kanban board

`src/app/pipeline/page.tsx` is a thin 50-line shell; the board components carry the weight.

- Columns per `STAGE_LABELS`, each with a sticky header showing stage name, lead count, and
  summed SAR value. A 2px top rule per column in that stage's colour is the *only* colour on
  the header — no tinted column backgrounds.
- Cards: customer name at `h3`, one line of `meta` context (city · dates · party size),
  budget in tabular numerals, and a footer row of avatar + last-activity age + channel icon
  (direct vs. group) + a `bot` dot when the AI last advanced it. Card height must be uniform;
  truncate with `line-clamp`, never let one card grow.
- Drag and drop: HTML5 drag with a 2px `brand` drop indicator between cards, the dragged card
  at `opacity-50` with a slight lift, and columns showing a `brand`-dashed outline only while
  a valid drag is over them. Optimistic move, rollback with a toast on failure. Keyboard
  accessible.
- Horizontal scroll with `.scroll-thin`, columns at a fixed width so the board reads as a
  board. Overall board totals in a slim bar above the columns.

## 5. `/inbox` — the chat workstation

Three panes: conversation list, thread, lead context drawer.

- **List:** avatar, name, group badge for `@g.us`, last message preview truncated to one
  line, timestamp, unread pill in `brand`, and a `bot` dot when the AI sent the last message.
  Selected row uses a `brand-soft` background and a 2px `brand` left rule — not a full-bleed
  indigo block.
- **Thread:** this must look like WhatsApp to a WhatsApp-native audience without being a
  copy. Inbound bubbles `card` with `edge` border on the left; outbound `wa-soft` on the
  right; AI-authored messages carry a small "Holyland AI" label in `bot` above the bubble
  so the operator always knows who spoke. Group threads show the sender's name in a stable
  per-participant colour. Day separators as a centred `caption` chip. Tight vertical rhythm
  — 4px between same-sender messages, 12px between senders.
- **Composer:** multiline autogrow, send on Enter, an AI-suggest affordance that inserts a
  draft into the composer rather than sending it, and a clear "AI is drafting" state.
- **Context drawer:** the lead's stage, budget, party size, dates, hotel quote and documents,
  each editable inline. Use `.eyebrow` section labels and `.field` inputs.
- Keyboard: `j`/`k` to move through the list, `/` to focus search, `Esc` to close the drawer.
  Small thing, enormous demo credibility.

## 6. `/ai/workflow` — the canvas

The canvas is the product's centrepiece — the client must feel they can *see* the automation.

- Nodes: trigger / condition / AI action / CRM action / handoff, each with a distinct shape
  language (not just a different colour), a title, a one-line summary of its configuration,
  and typed connection ports. Selected node gets a 2px `brand` ring; the config panel opens
  in the right drawer using `drawer-in`.
- Connectors: bezier paths, not right angles. **Use the existing `dash-flow` animation** on
  active edges so data visibly travels along the path — it is already defined and it is the
  single most impressive two seconds of the demo.
- Canvas: pan with drag, zoom with wheel/pinch clamped to 0.5–2×, a dot grid at low contrast
  that scales with zoom, a minimap if time allows, and "fit to view" / zoom controls in a
  floating `.panel` at the bottom-left.
- A **Test run** control that walks a sample message through the graph, lighting each node in
  sequence with `pulse-ring` and showing what the AI decided at each step. If
  `src/lib/bot/test-run.ts` already does this, wire the visualisation to it.

## 7. Accessibility and polish (non-negotiable, quick)

- Every interactive element reachable by keyboard with a visible `brand` focus ring.
- Colour never the sole carrier of meaning — pair every dot with a label or `title`.
- All body text ≥ 4.5:1 against its background; `subtle` on `card` only for non-essential meta.
- Respect `prefers-reduced-motion` (the landing CSS already models this pattern).
- Real `<table>` semantics for tabular data, real `<button>` for actions.

## 8. Verification protocol — do not skip

The local server on `localhost:3000` runs a **production build** (`next start`), so a rebuild
is required before changes appear. After each page:

1. `NEXT_DIST_DIR=.next-verify npx next build` — must pass with no type errors.
2. Restart the server, then screenshot with Playwright at **1440×900 and 1920×1080**.
   Playwright works in this environment only with an explicit chromium `executablePath`.
3. Look at the screenshot and judge it against §2 honestly. If it looks like a template,
   redo it — do not report it as done.
4. Verify signed-out `/` still renders the landing page correctly and that no static asset
   under `public/` 307s to `/login` (the middleware matcher in `src/middleware.ts` excludes
   file extensions — keep it that way).

## 9. Delivery order

Ship in this sequence and confirm each before moving on, so that if time runs out the demo
still has its strongest screens:

1. Post-login routing to `/home` + Dashboard nav entry (10 minutes, unblocks everything).
2. `/home` dashboard — metric strip, both charts, live queue, AI rail.
3. `/pipeline` board.
4. `/inbox` thread and composer.
5. `/ai/workflow` canvas motion and test run.
6. A final pass across all five at 1440×900 for spacing, alignment, and empty states.

Work page by page. Do not refactor unrelated code, do not change the Supabase schema, and do
not touch the landing page. Report what you actually built and what you left undone.
