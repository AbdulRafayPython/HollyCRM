import type { Config } from "tailwindcss";

/**
 * HollyCRM design tokens — see stitch_hollycrm_whatsapp_workstation/hollycrm/DESIGN.md
 *
 * Colour is functional, not decorative:
 *   wa    — the WhatsApp channel and successful automation
 *   group — anything collaborative / @g.us
 *   bot   — Hollyland AI authored content
 *   brand — primary actions, active navigation, focus
 */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /* ------------------------------------------------------------------
           App tokens — re-pointed onto the marketing palette.

           The names are unchanged, so the ~600 existing `bg-brand`,
           `text-ink`, `border-edge` usages across the workstation migrate
           without being touched. Only the values moved.

           Neutrals went from a cool blue-grey ramp (slate) to a warm
           green-grey one, so they sit under the green accent instead of
           fighting it. Colour is still functional, not decorative:

             brand — primary actions, active nav, focus     (was violet)
             wa    — the WhatsApp channel, successful automation
             bot   — Hollyland AI authored content          (was amber)
             group — anything collaborative / @g.us         (was indigo)

           `brand` and `wa` are both green on purpose: this is a WhatsApp
           product and green is its world. They stay legible apart by
           lightness — brand is the deep dome green, wa the bright channel
           green. `group` moved to clay so that three greens never compete.
           ------------------------------------------------------------------ */
        ink: "#14201A",
        "ink-soft": "#24332B",
        surface: "#F7F8F5",
        card: "#FFFFFF",
        edge: "#DCE1DA",
        "edge-strong": "#C3CBBF",
        muted: "#5A6B60",
        subtle: "#8C9A91",

        brand: "#0F7A5A",
        "brand-dark": "#0B5F46",
        "brand-soft": "#E6F2EC",

        wa: "#10B981",
        "wa-dark": "#047857",
        "wa-soft": "#E8F6EF",

        /* Clay, darkened from #A4593C so `text-group` on `group-soft` clears
           4.5:1 (it sat at 4.37) — this pairing is used for the group chips. */
        group: "#965136",
        "group-soft": "#F6EAE4",

        bot: "#C08A2E",
        "bot-dark": "#7A5510",
        "bot-soft": "#FBF2DA",

        danger: "#B3261E",
        "danger-dark": "#7F1D1D",
        "danger-soft": "#FBEAE8",

        /* ------------------------------------------------------------------
           Marketing palette.

           Deliberately a separate namespace from the app tokens above. The
           landing page is being re-skinned; the workstation is not. Mutating
           `ink` or `surface` would silently re-colour every screen in the
           product, so the marketing surface gets its own names and the two
           systems stay independent until the app is migrated on purpose.

           Two accents, each carrying a double meaning: `dome` is WhatsApp
           green and the Green Dome of Madinah; `brass` is mosque-lamp gold,
           standing in for the reference showreel's fintech yellow.
           ------------------------------------------------------------------ */
        paper: "#F7F8F5",
        chalk: "#ECEEE8",
        plate: "#FFFFFF",
        graphite: "#14201A",
        stone: "#5A6B60",
        haze: "#8C9A91",
        rule: "#DCE1DA",

        dome: "#0F7A5A",
        "dome-tint": "#E6F2EC",
        "dome-line": "#C9E0D5",

        /* Fills only — #E8B93D on paper is 1.7:1 and fails as text. Where the
           gold has to be a word on a pale ground, use `brass-deep` (5.0:1). */
        brass: "#E8B93D",
        "brass-deep": "#8A6414",
        "brass-tint": "#FBF2DA",
      },
      /* Tailwind's bare `ring` utility defaults to blue-500. Any element that
         sets `ring-2` without naming a colour would draw a stray blue halo in
         a product that has no blue in it. */
      ringColor: {
        DEFAULT: "#0F7A5A",
      },
      fontFamily: {
        display: ["var(--font-archivo)", "ui-sans-serif", "system-ui", "sans-serif"],
        plex: ["var(--font-plex)", "ui-sans-serif", "system-ui", "sans-serif"],
        plexmono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        caption: ["11px", { lineHeight: "14px", letterSpacing: "0.02em", fontWeight: "500" }],
        meta: ["12px", { lineHeight: "16px" }],
        body: ["14px", { lineHeight: "20px" }],
        h3: ["16px", { lineHeight: "24px", fontWeight: "600" }],
        h2: ["20px", { lineHeight: "28px", letterSpacing: "-0.01em", fontWeight: "600" }],
        h1: ["24px", { lineHeight: "32px", letterSpacing: "-0.02em", fontWeight: "600" }],
      },
      borderRadius: {
        DEFAULT: "6px",
        lg: "8px",
        xl: "10px",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(15, 23, 42, 0.04)",
        pop: "0 4px 6px -1px rgba(15, 23, 42, 0.10), 0 2px 4px -2px rgba(15, 23, 42, 0.06)",
        drawer: "-4px 0 6px -1px rgba(15, 23, 42, 0.05)",

        /* Marketing. Two-part shadows: a 1px contact edge so a white card
           still reads against the paper ground, plus a wide soft cast for
           the lift. Tinted green-black rather than neutral so it sits in
           the palette instead of greying it. */
        lift: "0 1px 2px rgba(20,32,26,0.05), 0 12px 32px -12px rgba(20,32,26,0.16)",
        "lift-lg": "0 1px 3px rgba(20,32,26,0.06), 0 28px 60px -20px rgba(20,32,26,0.22)",
        chip: "0 1px 2px rgba(20,32,26,0.06), 0 6px 16px -8px rgba(20,32,26,0.18)",
      },
      transitionTimingFunction: {
        swift: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        "rise-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        /* Workflow canvas. `dash-flow` animates stroke-dashoffset rather than
           moving the path, so the connector reads as data travelling along it
           without any layout work per frame — it stays on the compositor. */
        "dash-flow": {
          to: { strokeDashoffset: "-24" },
        },
        "node-in": {
          from: { opacity: "0", transform: "translateY(10px) scale(0.96)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "pulse-ring": {
          "0%": { opacity: "0.55", transform: "scale(1)" },
          "70%, 100%": { opacity: "0", transform: "scale(1.5)" },
        },
        "drawer-in": {
          from: { opacity: "0", transform: "translateX(16px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },

        /* Marketing motion.

           `marquee` translates a track that holds its content twice, so
           -50% lands exactly on the seam and the loop is invisible.
           `levitate` is the hero collage's idle float — each card is given
           its own duration and delay so the group never beats in sync,
           which is what separates "floating" from "pulsing". */
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
        "marquee-reverse": {
          from: { transform: "translateX(-50%)" },
          to: { transform: "translateX(0)" },
        },
        levitate: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-9px)" },
        },
        "trace-draw": {
          from: { strokeDashoffset: "var(--trace-len, 120)" },
          to: { strokeDashoffset: "0" },
        },

        /* Auth proof entrance. Same gesture as the landing hero's collage —
           scale up a few percent and settle — so crossing from the marketing
           site into the login screen feels like one product. */
        "proof-in": {
          from: { opacity: "0", transform: "translateY(14px) scale(0.97)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
      },
      animation: {
        "rise-in": "rise-in 180ms cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-in": "fade-in 140ms ease-out",
        "dash-flow": "dash-flow 900ms linear infinite",
        "node-in": "node-in 320ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "pulse-ring": "pulse-ring 2s cubic-bezier(0.16, 1, 0.3, 1) infinite",
        "drawer-in": "drawer-in 220ms cubic-bezier(0.16, 1, 0.3, 1)",

        /* Durations are read from a custom property so one utility can drive
           every marquee on the page at its own speed — the ribbon crawls, the
           photo rail moves at reading pace, the testimonials drift. */
        marquee: "marquee var(--marquee-dur, 40s) linear infinite",
        "marquee-reverse": "marquee-reverse var(--marquee-dur, 40s) linear infinite",
        levitate: "levitate var(--float-dur, 6s) ease-in-out var(--float-delay, 0s) infinite",
        "trace-draw": "trace-draw 620ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "proof-in": "proof-in 620ms cubic-bezier(0.16, 1, 0.3, 1) var(--proof-delay, 0ms) both",
      },
    },
  },
  plugins: [],
} satisfies Config;
