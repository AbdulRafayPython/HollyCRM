# HollyCRM — UI Prototype Prompt (v2, grounded in the real data model)

## 1. PRODUCT CONTEXT

Design a modern, high-density **B2B Enterprise SaaS web app** for **"HollyCRM"** — a WhatsApp-first CRM for Umrah & Hajj hospitality agencies selling Makkah & Madinah hotel bookings. Unlike normal CRMs it handles **WhatsApp Groups** as first-class conversations (family groups, sub-agency groups), and an AI assistant ("Hollyland AI") that quotes hotels from real inventory.

Visual reference: hybrid of **Kommo CRM** (clean messenger-first layout, smooth Kanban cards) and **Bitrix24** (functional multi-pane workstation, dense lead drawer). Desktop-first at **1440px**, high information density, built for agents who live in this screen 8 hours a day.

## 2. DESIGN LANGUAGE (STRICT)

- **Style:** Premium, clean, standard enterprise SaaS. Flat surfaces, crisp 1px borders, soft shadows.
- **Anti-patterns (forbidden):** glassmorphism, neon glows, dark sci-fi gradients, 3D/floating buttons, oversized hero typography.
- **Palette:**
  - Nav rail / dark surfaces: Deep Slate Charcoal `#0F172A`
  - App background: Cool off-white `#F8FAFC`
  - Cards & panels: White `#FFFFFF`, 1px border `#E2E8F0`, subtle shadow
  - WhatsApp / Direct-chat accent + success: Emerald `#10B981`
  - Group-chat accent: Indigo `#6366F1`
  - Hollyland AI Bot accent: Warm Amber `#F59E0B`
  - Primary actions / links / active states: Deep Violet `#4F46E5`
  - Danger / disconnected: Red `#EF4444`
  - Text: `#0F172A` primary, `#64748B` secondary/metadata
- **Typography:** Inter. Body 14px, metadata/labels 11–13px, uppercase 10–11px tracking-wide for tags. Numbers tabular.
- **Radii:** 6–10px. **Icons:** Lucide-style 1.5px stroke line icons (no emoji as UI icons).
- **Content rules:** all prices in **SAR** (e.g. "SAR 680/night"), all times in **Asia/Riyadh** (24h). Client messages are often **Arabic — bubbles must render RTL text correctly**, mixed with English agent replies.

## 3. SCREEN 1 — SHARED INBOX (the main workspace, 4 panes)

### Pane 1 · Left Navigation Rail (64px, `#0F172A`)
- Top: minimalist "H" HollyCRM logo mark.
- Vertical icons with tooltips: **Inbox** (active, small emerald dot = WhatsApp connected), **Pipeline**, **Contacts**, **Analytics**, **Settings**.
- Bottom: agent avatar with green presence ring.
- Active item: violet left indicator bar + lighter icon.

### Pane 2 · Conversation List (320px, white, right border)
- Top: search input ("Search chats, groups, phone…") + filter pills: **[All] [Mine] [Unassigned] [Groups] [Archived]** — active pill filled violet.
- Chat rows (72px, dense):
  - **Direct chat row:** circular avatar with initials, contact name, phone (+9665…), one-line snippet, time (e.g. "14:32"), **emerald unread count badge**.
  - **Group chat row:** squared avatar with group glyph, title (e.g. **"Al-Rajhi Umrah Group Nov 2026"**), tiny **indigo "GROUP" pill**, snippet prefixed with last sender name ("Abu Khalid: …"), participant count.
  - Row-level status chips where relevant: amber **"BOT PAUSED"** chip, grey "Unassigned" chip.
  - Selected row: `#EEF2FF` background + violet left bar. Hover: `#F1F5F9`.
- Empty state (Unassigned tab): illustration-free, quiet text + "Waiting for new WhatsApp messages".

### Pane 3 · Active Conversation (flex-grow, `#F8FAFC`)
- **Header bar (white, bottom border):**
  - Group/contact title + JID/phone subtitle; participant count for groups ("24 participants").
  - **Pipeline stage badge-dropdown** showing current stage (see stage list in Screen 2), colored per stage.
  - **Assigned agent pill** ("Rafay A." with avatar) with dropdown: Claim / Assign to… / Release (reassign is supervisor-only).
  - **Bot toggle — the hero control:** pill switch "Hollyland AI: **Active**" (amber dot, spring-slide knob) ↔ "Paused". When paused, show subtle "auto-resumes in 2h" microtext.
  - Overflow menu: Archive, Mark unread.
- **Message thread:**
  - Client messages **left**, white card bubbles with sender name (groups show per-participant names in rotating muted colors).
  - Agent replies **right**, soft slate-blue bubbles; **bot replies right with an amber "HOLLYLAND AI" micro-badge** and a slightly amber-tinted bubble border.
  - Outbound bubbles show delivery state (sent ✓ / delivered ✓✓ / read ✓✓ colored) + time.
  - Non-text messages render as **attachment chips** (PDF voucher, passport image thumbnail, voice note with duration).
  - **System events centered as pills:** "Lead stage → Quotation Sent · by Hollyland AI", "Chat assigned to Rafay".
  - Date separators ("Today", "Yesterday").
  - Include one realistic exchange: Arabic client inquiry → bot quote listing 2 hotels with SAR prices → agent follow-up.
- **Composer (white, top border):**
  - Two-mode segmented tabs: **[WhatsApp Reply]** (default) vs **[Internal Note]** — Internal Note mode tints the composer pale amber `#FFFBEB` with a "visible to team only, supports @mention" hint.
  - Row: template/canned-replies dropdown ("⚡ Templates"), attachment paperclip, emoji, mic; large violet **Send** button.

### Pane 4 · Lead Intelligence Drawer (340px, white, left border, collapsible)
Tab strip on top: **Lead · Notes · Files · Quotes · People** (People only for groups). Show the **Lead** tab active:
1. **Lead snapshot:** contact name + phone, stage progress bar (segments per pipeline stage, filled up to "Quotation Sent"), lead age ("Created 2d ago").
2. **Requirements card** (editable field grid, dense 2-col):
   - City chips: **Makkah** / **Madinah** (hotel preference per city)
   - Check-in / Check-out dates + auto-computed **"7 nights"**
   - Pax & rooms: "8 pax · 2 Quad rooms" (room config: single/double/triple/quad/sharing)
   - Haram distance: "≤ 400m" or "Shuttle OK" toggle
   - Budget: "≤ SAR 900 /night"
3. **AI matches:** compact hotel result cards from inventory — hotel name, star icons, **"150m from Haram"** or shuttle icon, room type, **"SAR 680/night · SAR 4,760 total"**, availability count, small "Send as quote" ghost button. Example: *"Pullman ZamZam Makkah ★5 · 150m · Quad · SAR 680/night"*.
4. **Documents:** thumbnail grid of passport scans / vouchers with file-type badges and upload button.

## 4. SCREEN 2 — PIPELINE (Kanban)

- Full-width board on `#F8FAFC`, columns = stages:
  **New Inquiry → Requirements Gathered → Quotation Sent → Under Negotiation → Voucher Issued / Won → Closed Lost**
- Column header: stage name, count badge, total value ("SAR 142,300").
- Lead cards (white, subtle shadow, drag affordance): contact/group name with direct/group glyph, dates + nights ("12–19 Ramadan · 7n"), pax/rooms, budget, assigned-agent mini avatar, amber bot dot if bot is active on the chat. Won column cards get an emerald left border; Lost cards greyed with drop-reason tag ("Dates unavailable").
- Top bar: title, agent filter dropdown, city filter, search.

## 5. SCREEN 3 — ANALYTICS

- Grid of white stat cards + charts on `#F8FAFC`, timezone note "Asia/Riyadh":
  - KPI row: Conversations today, **First response time (median)**, **AI automation rate %**, Leads won this month.
  - **Funnel chart** across the 6 stages (violet).
  - **Group vs Direct conversion** comparison bars (indigo vs emerald).
  - **Bot latency & failures** small line/stat card (amber).
  - Agent leaderboard table: agent, chats handled, FRT, won.

## 6. GLOBAL ELEMENTS

- **Connection banner:** when the WhatsApp session drops, a full-width red-tinted banner under the top edge: "WhatsApp instance disconnected — scan QR to re-link · [Reconnect]". (Design its visible state.)
- Toasts bottom-right (white card, colored left border). Skeleton loaders for lists — **zero layout shift**.
- Simple login screen: centered white card on `#F8FAFC`, logo, email + password, violet button.

## 7. MOTION

- Everything <180ms, ease-out `cubic-bezier(0.16, 1, 0.3, 1)`.
- List hover: background shift to `#F1F5F9`. Drawer collapse: horizontal slide. Bot toggle: spring-slide. New message: gentle 8px slide-up fade-in. Kanban drag: card lifts with slightly larger shadow, target column tint.
