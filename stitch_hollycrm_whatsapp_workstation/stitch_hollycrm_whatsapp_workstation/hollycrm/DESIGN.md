---
name: HollyCRM
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#464555'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#777587'
  outline-variant: '#c7c4d8'
  surface-tint: '#4d44e3'
  primary: '#3525cd'
  on-primary: '#ffffff'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#c3c0ff'
  secondary: '#006c49'
  on-secondary: '#ffffff'
  secondary-container: '#6cf8bb'
  on-secondary-container: '#00714d'
  tertiary: '#3130c0'
  on-tertiary: '#ffffff'
  tertiary-container: '#4b4dd8'
  on-tertiary-container: '#d9d8ff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#e1e0ff'
  tertiary-fixed-dim: '#c0c1ff'
  on-tertiary-fixed: '#07006c'
  on-tertiary-fixed-variant: '#2f2ebe'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  h1:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  h2:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  h3:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-base:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-medium:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  metadata:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  metadata-bold:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
  caption:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.02em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 24px
---

## Brand & Style
The design system is engineered for high-stakes hospitality environments where speed of response and information density are paramount. The aesthetic is **Corporate / Modern**, prioritizing clarity, utility, and a sense of "quiet premium" through precise alignment and rigorous information hierarchy.

The system avoids decorative trends like glassmorphism or neomorphism in favor of a structural, border-driven interface. It balances the urgency of instant messaging with the robustness of enterprise CRM, ensuring that complex multi-channel data remains legible and actionable. The target emotional response is one of organized control, reliability, and technical sophistication.

## Colors
The palette uses a professional Foundation of **Deep Slate Charcoal** for structural navigation and **Cool Off-White** for the application canvas to reduce eye strain during long shifts.

Functional color coding is strictly enforced:
- **Emerald (#10B981):** Represents the WhatsApp ecosystem and successful automation states.
- **Indigo (#6366F1):** Reserved for collaborative features and group-based interactions.
- **Warm Amber (#F59E0B):** Specifically identifies AI-generated content or bot-intervention states.
- **Deep Violet (#4F46E5):** The primary action color, used for active navigation, primary buttons, and focus states.
- **Red (#EF4444):** Reserved for destructive actions and critical error states.

## Typography
This design system utilizes **Inter** exclusively to leverage its exceptional legibility at small sizes. The typographic scale is compressed to support high information density.

The "body-base" size is set at 14px for standard CRM inputs and message content. "Metadata" (12px) and "Caption" (11px) levels are used extensively for timestamps, status labels, and secondary UI hints. Medium and Semibold weights are used to create visual hierarchy within data-heavy rows rather than relying on size increases.

## Layout & Spacing
The system follows a strict **4px baseline grid**. Layouts are structured using a **Fixed-Fluid hybrid model**: sidebars and utility panels occupy fixed widths (e.g., 280px for navigation, 320px for chat lists) while the central workspace expands.

For high-density data grids, use a "compact" vertical rhythm with 8px internal padding for rows. In the Kanban view, cards use 12px internal padding to maintain a clean appearance despite small font sizes. Slide-out drawers should always emerge from the right, occupying 40% of the viewport width on desktop.

## Elevation & Depth
Depth is communicated through **Tonal Layers** and **Low-contrast Outlines**. 
- **Level 0 (Base):** The App BG (#F8FAFC).
- **Level 1 (Cards/Panels):** Pure White (#FFFFFF) with a 1px border of #E2E8F0.
- **Level 2 (Popovers/Drawers):** Pure White with a subtle, diffused shadow (0px 4px 6px -1px rgba(15, 23, 42, 0.1)).

Shadows must be "cold" (tinted with the neutral slate) and used sparingly. Avoid heavy blurs; prioritize 1px borders to define boundaries between adjacent UI elements.

## Shapes
The design system employs a **Soft** shape language to balance the clinical nature of enterprise software with the friendliness of a hospitality tool. 

- **Standard Elements:** 6px (buttons, inputs, small cards).
- **Large Containers:** 10px (main content areas, slide-out drawers).
- **Messenger Bubbles:** 8px, with "tail" logic for the start of a message chain.
- **Status Chips:** Fully rounded (pill) for immediate distinction from interactive buttons.

## Components
- **Messenger Bubbles:** 
  - *Incoming:* Background #FFFFFF, 1px border #E2E8F0, text #0F172A.
  - *Outgoing:* Background #4F46E5, text #FFFFFF.
  - *AI Outgoing:* Background #F59E0B (10% opacity), 1px border #F59E0B, text #92400E.
- **Buttons:** 
  - *Primary:* Solid #4F46E5 with white text. 
  - *Secondary:* White background with 1px border #E2E8F0, text #0F172A.
- **Data Grids:** Use 1px horizontal dividers only. Header cells should have a subtle background tint (#F1F5F9) and use "Caption" typography.
- **Kanban Cards:** White background, 1px border, with a 4px vertical accent bar on the left indicating the source (Emerald for WhatsApp).
- **Status Chips:** Small (11px text), semi-transparent background (10% of the status color), and high-contrast text of the same hue.
- **Input Fields:** 1px border #D1D5DB, transitioning to 1px #4F46E5 with a 2px light violet glow on focus.