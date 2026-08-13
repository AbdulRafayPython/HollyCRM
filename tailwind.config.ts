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
        ink: "#0F172A",
        "ink-soft": "#1E293B",
        surface: "#F8FAFC",
        card: "#FFFFFF",
        edge: "#E2E8F0",
        "edge-strong": "#CBD5E1",
        muted: "#64748B",
        subtle: "#94A3B8",

        brand: "#4F46E5",
        "brand-dark": "#4338CA",
        "brand-soft": "#EEF2FF",

        wa: "#10B981",
        "wa-dark": "#047857",
        "wa-soft": "#ECFDF5",

        group: "#6366F1",
        "group-soft": "#EEF2FF",

        bot: "#F59E0B",
        "bot-dark": "#92400E",
        "bot-soft": "#FFFBEB",

        danger: "#EF4444",
        "danger-dark": "#991B1B",
        "danger-soft": "#FEF2F2",
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
      },
      animation: {
        "rise-in": "rise-in 180ms cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-in": "fade-in 140ms ease-out",
        "dash-flow": "dash-flow 900ms linear infinite",
        "node-in": "node-in 320ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "pulse-ring": "pulse-ring 2s cubic-bezier(0.16, 1, 0.3, 1) infinite",
        "drawer-in": "drawer-in 220ms cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
} satisfies Config;
