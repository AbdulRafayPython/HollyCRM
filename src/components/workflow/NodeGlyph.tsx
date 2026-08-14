/**
 * Node glyphs for the workflow canvas.
 *
 * The rest of the app draws icons from a single 1.5px stroke set, which is right
 * for dense UI chrome but leaves every node on the canvas looking like the same
 * grey outline. These are drawn per node instead: a soft filled body carrying
 * the node's own colour, plus a crisper stroked detail on top. Two tones read as
 * a mark rather than a pictogram, and at 14px it is the fill that survives.
 *
 * WhatsApp is the real brand mark in the real brand green. It is the one glyph
 * here a customer already knows by heart, and an approximation of it is the kind
 * of detail that quietly costs trust in a demo.
 */

export type GlyphName =
  | "whatsapp"
  | "understand"
  | "rules"
  | "greet"
  | "knowledge"
  | "inventory"
  | "quote"
  | "answer"
  | "route"
  | "assigned"
  | "fallback";

/** Official WhatsApp mark. Filled, brand green, never restyled. */
const WHATSAPP_PATH =
  "M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.13h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.36c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.7 8.21-8.24 8.21zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.39.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.84-.2-.49-.4-.42-.56-.43h-.47c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.14-1.18-.06-.11-.22-.17-.47-.29z";

/** Soft body + stroked detail. `fill` carries the tone, `stroke` the drawing. */
function Body({ d }: { d: string }) {
  return <path d={d} fill="currentColor" opacity="0.16" />;
}

function Line({ d, ...rest }: { d: string } & React.SVGProps<SVGPathElement>) {
  return (
    <path
      d={d}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    />
  );
}

const GLYPHS: Record<GlyphName, React.ReactNode> = {
  // Brand mark — deliberately not two-tone, and not currentColor.
  whatsapp: <path d={WHATSAPP_PATH} fill="#25D366" />,

  // Understand: a message being read into structured fields.
  understand: (
    <>
      <Body d="M3 5.5A2.5 2.5 0 0 1 5.5 3h13A2.5 2.5 0 0 1 21 5.5v8a2.5 2.5 0 0 1-2.5 2.5H9l-4.5 3.5v-3.5A2.5 2.5 0 0 1 3 13.5z" />
      <Line d="M7.5 7.5h9M7.5 11h5.5" />
      <Line d="M17.5 12.2l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z" />
    </>
  ),

  // Your rules: one path in, two out — an if/else fork.
  rules: (
    <>
      <Body d="M4 9a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM20 9a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM12 21a3 3 0 1 1 0-6 3 3 0 0 1 0 6z" />
      <Line d="M4 8.5v2A2.5 2.5 0 0 0 6.5 13h11A2.5 2.5 0 0 0 20 10.5v-2" />
      <Line d="M12 13v2.5" />
      <circle cx="4" cy="6" r="2.4" fill="none" stroke="currentColor" strokeWidth={1.6} />
      <circle cx="20" cy="6" r="2.4" fill="none" stroke="currentColor" strokeWidth={1.6} />
      <circle cx="12" cy="18" r="2.4" fill="none" stroke="currentColor" strokeWidth={1.6} />
    </>
  ),

  // Greeting: a bubble that smiles back. A waving hand was the first drawing
  // here and it collapsed into a smudge at 15px — the smile survives the size.
  greet: (
    <>
      <Body d="M3.5 5.5A2.5 2.5 0 0 1 6 3h12a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 18 15H9.5L5 18.5V15a1.5 1.5 0 0 1-1.5-1.5z" />
      <Line d="M3.5 5.5A2.5 2.5 0 0 1 6 3h12a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 18 15H9.5L5 18.5V15a1.5 1.5 0 0 1-1.5-1.5z" />
      <Line d="M9 7.8h.01M15 7.8h.01" strokeWidth={2.1} />
      <Line d="M9.1 10.6c.75.95 1.7 1.42 2.9 1.42s2.15-.47 2.9-1.42" />
    </>
  ),

  // Knowledge: stacked documents under a lens.
  knowledge: (
    <>
      <Body d="M6 2.5h7l5 5v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2z" />
      <Line d="M13 2.8V7a1 1 0 0 0 1 1h4.2" />
      <Line d="M6 2.5h7l5 5v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2z" />
      <circle cx="11.2" cy="13.4" r="2.9" fill="none" stroke="currentColor" strokeWidth={1.6} />
      <Line d="M13.4 15.6 15.8 18" />
    </>
  ),

  // Inventory: a database with a price tag — SQL is the only price source.
  inventory: (
    <>
      <Body d="M4 5.2c0-1.5 3.6-2.7 8-2.7s8 1.2 8 2.7v13.6c0 1.5-3.6 2.7-8 2.7s-8-1.2-8-2.7z" />
      <Line d="M20 5.2c0 1.5-3.6 2.7-8 2.7S4 6.7 4 5.2 7.6 2.5 12 2.5s8 1.2 8 2.7z" />
      <Line d="M4 5.2v13.6c0 1.5 3.6 2.7 8 2.7s8-1.2 8-2.7V5.2M4 12c0 1.5 3.6 2.7 8 2.7s8-1.2 8-2.7" />
    </>
  ),

  // Send quote: a paper plane with a receipt fold.
  quote: (
    <>
      <Body d="M21.5 3 2.8 9.9l6.6 2.6 2.6 6.6z" />
      <Line d="M21.5 3 2.8 9.9l6.6 2.6 2.6 6.6z" />
      <Line d="M21.5 3 9.4 12.5" />
      <Line d="M14.6 17.4 17 21l4.5-18" opacity="0.55" />
    </>
  ),

  // Answer from documents: a plane leaving a page.
  answer: (
    <>
      <Body d="M5 2.5h7l4.5 4.5V15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4.5a2 2 0 0 1 2-2z" />
      <Line d="M5 2.5h7l4.5 4.5V15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4.5a2 2 0 0 1 2-2z" />
      <Line d="M12 2.8v3.4a1 1 0 0 0 1 1h3.3" />
      <Line d="M21.5 12.5 13 16.2l2.9 1.2 1.2 2.9z" />
    </>
  ),

  // Route & assign: a hub fanning out to people.
  route: (
    <>
      <Body d="M9 12a3.2 3.2 0 1 1 0-6.4A3.2 3.2 0 0 1 9 12zM19 9.6a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2zM19 19.6a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2z" />
      <circle cx="6" cy="8.8" r="3.1" fill="none" stroke="currentColor" strokeWidth={1.6} />
      <Line d="M1.6 19.4a4.4 4.4 0 0 1 8.8 0" />
      <circle cx="18.4" cy="6.4" r="2.4" fill="none" stroke="currentColor" strokeWidth={1.6} />
      <circle cx="18.4" cy="16.4" r="2.4" fill="none" stroke="currentColor" strokeWidth={1.6} />
      <Line d="M11.4 9.6h2.6a2 2 0 0 0 2-2v-.4M11.4 14.4h2.6a2 2 0 0 1 2 2v.4" opacity="0.7" />
    </>
  ),

  // Assigned: a person with a confirmed badge.
  assigned: (
    <>
      <Body d="M10 12.4a4.2 4.2 0 1 1 0-8.4 4.2 4.2 0 0 1 0 8.4zM2.4 21a7.6 7.6 0 0 1 15.2 0z" />
      <circle cx="10" cy="8.2" r="3.9" fill="none" stroke="currentColor" strokeWidth={1.6} />
      <Line d="M2.6 20.6a7.4 7.4 0 0 1 11.5-6.2" />
      <circle cx="18" cy="17.6" r="4.1" fill="currentColor" opacity="0.16" />
      <circle cx="18" cy="17.6" r="4.1" fill="none" stroke="currentColor" strokeWidth={1.6} />
      <Line d="m16.2 17.7 1.3 1.3 2.4-2.6" />
    </>
  ),

  // Fallback: out of hours.
  fallback: (
    <>
      <Body d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z" />
      <circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" strokeWidth={1.6} />
      <Line d="M12 6.6V12l3.4 2" />
    </>
  ),
};

/**
 * Node id to glyph. Ids line up with glyph names except the trigger, which is
 * the WhatsApp mark — the flow starts with a real message on a real number, and
 * the canvas should say so at a glance.
 */
export function glyphFor(nodeId: string): GlyphName {
  if (nodeId === "trigger") return "whatsapp";
  return nodeId in GLYPHS ? (nodeId as GlyphName) : "understand";
}

export default function NodeGlyph({
  name,
  size = 16,
  className = "",
}: {
  name: GlyphName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      {GLYPHS[name]}
    </svg>
  );
}
