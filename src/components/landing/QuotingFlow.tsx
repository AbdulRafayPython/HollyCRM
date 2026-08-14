import Image from "next/image";
import Reveal from "./Reveal";

/**
 * The four-step spine of the product, rendered as the supplied diagram.
 *
 * The artwork carries its own heading, sub-head and step copy, so nothing is
 * repeated in markup here — an on-page `<h2>` would print the title twice.
 * The heading survives for screen readers and document outline via `sr-only`,
 * and the alt text carries the same content the picture shows.
 */
export default function QuotingFlow() {
  return (
    <section
      id="how-it-works"
      /* White, not the usual tinted band: the artwork carries its own near-white
         ground, and any section tint behind it shows up as a hard rectangle
         along the image edges. Padding is light for the same reason — the
         diagram already has generous margins baked in. */
      className="scroll-mt-24 border-y border-slate-900/5 bg-white py-10 sm:py-12"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <h2 className="sr-only">The AI quoting flow</h2>
        {/*
          The diagram is 2.19:1 with type baked in — scaled to a 390px phone it
          renders about 163px tall and the step copy becomes unreadable. Below
          `sm` it holds a legible minimum width and pans inside its own
          container, which keeps the page itself from scrolling sideways.
        */}
        <Reveal variant="zoom" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-x-visible sm:px-0">
          <Image
            src="/landing-assets/ai_quoting_flow_diagram.png"
            alt={
              "The AI quoting flow, in four steps. One: a WhatsApp lead — a family asks for " +
              "rooms in their own words, mid-negotiation in a group chat. Two: AI extraction — " +
              "DeepSeek turns the message into a validated parameter object, never into a price. " +
              "Three: the CRM pricing engine — Postgres answers search_hotels() with live " +
              "allotment, rate and Haram distance for those exact dates. Four: instant quote " +
              "and share — the reply is composed around real rows and sent back to the group " +
              "in seconds."
            }
            width={1855}
            height={848}
            unoptimized
            sizes="(min-width: 1200px) 1152px, 100vw"
            className="h-auto w-full min-w-[44rem] sm:min-w-0"
          />
        </Reveal>
      </div>
    </section>
  );
}
