# HollyCRM — Login & Sign-up Redesign Prompt

Paste everything below the line into a Claude Code session at the repo root.

---

Redesign the HollyCRM authentication screens as a split-screen layout, closely inspired by
the attached reference: a single centered card with a soft shadow and ~24px radius, floating
on a solid brand-coloured background, product imagery on the left, form on the right.

The files are [src/app/login/page.tsx](../src/app/login/page.tsx) and
[src/app/signup/page.tsx](../src/app/signup/page.tsx). **This is a visual redesign only — every
piece of auth logic already in those files must survive it.** Read both files fully before
starting.

## What this product actually is

HollyCRM is a **WhatsApp-native CRM for Umrah & Hajj hospitality agencies**. Agencies run
multi-party family negotiations in WhatsApp groups, auto-advance a sales pipeline, and quote
real Makkah & Madinah hotel inventory. The auth screens should look like the front door to
*that*, not to a generic sales CRM. Copy that names the actual job beats copy that could sit
on any SaaS login page.

## Design system — use what exists, invent nothing

All tokens are already defined in [tailwind.config.ts](../tailwind.config.ts). Use the token
names, never raw hex:

- `brand` `#4F46E5` indigo — primary buttons, links, focus rings, the outer background
- `ink` `#0F172A` headings · `muted` `#64748B` body · `subtle` `#94A3B8` meta
- `surface` `#F8FAFC` field fills · `card` `#FFFFFF` · `edge` `#E2E8F0` borders
- `wa` `#10B981` emerald — WhatsApp/connected state only, never decoration
- `danger` for errors, `bot` amber for the credentials warning banner

Component primitives already exist in [globals.css](../src/app/globals.css): `.field`,
`.btn-primary`, `.btn-secondary`, `.panel`, `.scroll-thin`. Radii come from the config
(`rounded-lg` = 8px, `rounded-xl` = 10px); for the outer card use `rounded-3xl`. Motion uses
`ease-swift` at 150ms.

Typography is Inter, already loaded in [layout.tsx](../src/app/layout.tsx) — do not add a font.

**Add no npm dependencies.** No UI kit, no icon package. Icons come from
[src/components/ui/Icon.tsx](../src/components/ui/Icon.tsx); if you need a glyph that isn't
there (an eye for the password toggle), add it to that file rather than inlining a one-off SVG.

## Shell constraint — read this before you lay anything out

Auth routes render through the `BARE` branch of
[AppShell.tsx](../src/components/AppShell.tsx), which wraps them in
`h-screen overflow-hidden`. The page cannot scroll the window. Your layout must fit the
viewport, with the form column itself scrolling via `.scroll-thin overflow-y-auto` if content
overflows on short screens. Do not change AppShell to work around this.

## Layout — desktop (≥1024px)

Outer background: solid `brand`, with a subtle indigo→violet gradient. Centered card,
`max-w-[1100px]`, white, `rounded-3xl`, soft shadow, roughly 640px tall.

**Left panel (~55%)** — the product proof:

- A large rounded product screenshot. **Use the real asset already in the repo:**
  `/landing-assets/hero_mockup.jpg` (the shared WhatsApp inbox beside the Kanban pipeline).
  Alternatives if you want variety: `/landing-assets/kanban_pipeline_board.jpg`,
  `/landing-assets/workflow_canvas.jpg`. Do not mock up a fake dashboard — real screenshots
  of the actual product are the whole point on a login screen.
- One floating card overlapping the image, in the position the reference puts its search
  widget. **Make it a static proof card, not a fake control.** The reference's widget is
  interactive because it sits on a property-search site; a login page with dropdowns that
  don't open reads as broken, and a client *will* try to click it. Instead show a small
  frozen slice of real product truth — e.g. an inbound WhatsApp message line, an arrow, and
  a stage chip reading "Quoted", with a `bot` amber dot and the caption "Advanced
  automatically". Give it a white background at ~92% opacity with a soft shadow and a hairline
  `edge` border. Skip heavy glassmorphism — it fights the screenshot behind it and ages badly.
- Headline below the image, `ink`, bold, ~32px, tight tracking:
  **"Every pilgrim conversation, in one workspace"**
- Subtext, `muted`, ~15px: "Run family group negotiations, advance the pipeline
  automatically, and quote real Makkah & Madinah inventory."
- Three pagination dots bottom-left — active dot `brand` and wider, inactive `edge`. If they
  don't actually cycle through anything, render them static and non-interactive rather than
  wiring a carousel nobody asked for.

**Right panel (~45%)** — white, generous padding (~48px), vertically centered:

1. Logo + wordmark top-left. Use the existing `<HollyCrmLogo />` component from
   [src/components/ui/HollyCrmLogo.tsx](../src/components/ui/HollyCrmLogo.tsx) — the current
   login page hand-rolls a square "H" tile instead, which is now inconsistent with the rest of
   the app. Fix that as part of this work.
2. Heading `ink` ~30px semibold: **"Welcome back to HollyCRM"**
3. Subtext `muted`: "Sign in to your workspace"
4. **"Continue with Google", full-width, outlined, `h-14`, `rounded-lg`**, with the existing
   inline multi-colour `GoogleG` SVG already in the login file. Keep it above the divider —
   it is the primary path for team members and the current page already orders it this way.
5. Divider: hairline `edge` rules either side of a lowercase "or" in `subtle`.
6. Email field — `.field h-14 rounded-lg pl-12`, `mail` icon at left in `subtle`.
7. Password field — same, `lock` icon left, reveal toggle right. Keep the toggle; you may
   swap the current "Show"/"Hide" text for an eye icon if you add the glyph to `Icon.tsx`.
8. Right-aligned "Forgot password?" link in `brand`.
9. Error and hint blocks — **keep both exactly as they behave now**: the `danger` bordered
   error box with the `alert` icon, and the `bot`-toned stale-credentials banner. They are
   the only feedback a user gets when Supabase is misconfigured or Google isn't enabled.
10. Primary button, full-width `h-14 rounded-lg`, `.btn-primary`, label "Log in" / "Signing
    in…" while busy. Keep the disabled state.
11. Footer, centered `meta`: "No workspace yet? **Create one**" linking to `/signup`.

### Three things in the source brief that are wrong for this app — do these instead

- **Google only. No Microsoft or Apple buttons.** Only Google OAuth is configured in Supabase.
  Rendering three social buttons where two fail is worse than rendering one that works, and it
  would be discovered live in a demo. One full-width Google button, not an icon-only row.
- **No "Remember me" checkbox.** Supabase already persists the session; a checkbox wired to
  nothing is a promise the app doesn't keep. Leave it out and let the "Forgot password?" link
  sit alone on that row.
- **Remove the "Connecting to {SUPABASE_URL}" debug line** at the bottom of the login form.
  It prints the project's Supabase URL on screen — fine while developing, not something to
  project in front of a client. Delete it, or render it only when
  `process.env.NODE_ENV !== "production"`.

## Sign-up variant — same shell, right panel swapped

Match the fields the page **actually submits** — the source brief's "Full name / Work email /
Password / Confirm password" does not match this app:

- Heading: "Create your HollyCRM workspace"
- **Workspace name** (placeholder "Hollyland Hospitality")
- **Full name**
- **Work email** (placeholder "you@company.com")
- **Password** (placeholder "At least 8 characters")
- No confirm-password field unless you also add the matching validation and its error state.
- Same "Continue with Google" button, divider, and error blocks.
- Primary button: "Create workspace"
- Footer: "Already have an account? **Log in**"

Keep the left panel identical to login so the two screens read as one system — swap only the
form column.

## Mobile (390px)

Single column, no card chrome, white full-bleed on the `brand` background:

- Logo + wordmark top-centre, ~32px above the heading.
- Heading and subtext left-aligned, sized down (~24px heading).
- Hero screenshot: keep a short, cropped band of it (~160px tall, `rounded-2xl`) above the
  form so mobile still shows the product — do not drop it entirely.
- Fields full-width, `h-14`, same radii and icon insets as desktop.
- Google button, divider, primary button all full-width with 12px vertical rhythm.
- Footer link centered with safe-area bottom padding.
- The floating proof card and pagination dots are desktop-only — hide below `lg`.

## Accessibility

- Every field keeps a real `<label>` (visually hidden is fine) — placeholders are not labels.
- Preserve `autoComplete="username"` / `"current-password"` and the `type="email"` inputs.
- Visible `brand` focus ring on every input, button, and link.
- The reveal toggle needs an `aria-label` that changes with state.
- Error text must be reachable by screen readers — put `role="alert"` on the error block.
- Contrast: `muted` on white passes; never put `subtle` on `brand`.

## Verification

`localhost:3000` serves a **production build**, so rebuild before checking:

1. `NEXT_DIST_DIR=.next-verify npx next build` — must pass with no type errors.
2. Restart, then screenshot `/login` and `/signup` at **1440×900 and 390×844**.
   Playwright on this machine needs an explicit chromium `executablePath`.
3. Confirm the page does not scroll the window at 1440×900 and that nothing overflows
   horizontally at 390px (`document.documentElement.scrollWidth - clientWidth` must be 0).
4. Submit the login form with a wrong password and confirm the error block still renders.
5. Click "Continue with Google" and confirm it still reaches the Google consent screen.

Report what you changed and anything you chose not to.
