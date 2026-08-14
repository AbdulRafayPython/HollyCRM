import { SectionHeading } from "./primitives";
import Reveal from "./Reveal";

/**
 * Testimonials — diagonal marquee, borrowed from the reference showreel.
 *
 * ===========================================================================
 *  PLACEHOLDER CONTENT. REPLACE BEFORE THIS PAGE GOES LIVE.
 * ===========================================================================
 *  None of the quotes below came from a customer. They are written to the
 *  shape a real quote takes so the layout can be judged, and they are
 *  attributed to roles rather than to invented people at invented companies —
 *  a fabricated name and logo is a good deal harder to walk back than a
 *  fabricated sentence.
 *
 *  Two AI-generated portraits exist at /landing/portrait-a.webp and
 *  portrait-b.webp. They are deliberately not wired up: a made-up quote next
 *  to a photorealistic face is a manufactured customer, which is a different
 *  thing from placeholder copy. `avatar` below takes an image path whenever
 *  there are real quotes from real people who have agreed to be shown.
 * ===========================================================================
 */

type Quote = {
  body: string;
  role: string;
  where: string;
  initials: string;
  tone: "plate" | "dome" | "brass" | "chalk" | "graphite";
};

const QUOTES: Quote[] = [
  {
    body: "The agents stopped quoting rooms we had already sold. That alone paid for it in the first month.",
    role: "Operations lead",
    where: "Umrah agency · Jeddah",
    initials: "OL",
    tone: "plate",
  },
  {
    body: "Family groups used to take four days and six phone calls. Now the thread does most of it and I confirm.",
    role: "Owner",
    where: "Family travel agency · Karachi",
    initials: "OW",
    tone: "dome",
  },
  {
    body: "I can see what every agent promised, in the customer's own words, months later.",
    role: "Sales manager",
    where: "Hajj operator · Kuala Lumpur",
    initials: "SM",
    tone: "chalk",
  },
  {
    body: "We wired our own escalation rule on the canvas in an afternoon. Nobody had to write a prompt.",
    role: "Technical lead",
    where: "Multi-branch agency · Riyadh",
    initials: "TL",
    tone: "brass",
  },
  {
    body: "Ramadan is the test. Eight hundred conversations in three weeks and the board stayed accurate.",
    role: "Founder",
    where: "Umrah agency · Dubai",
    initials: "FO",
    tone: "graphite",
  },
  {
    body: "Passports live in one encrypted place now, not in twelve agents' phone galleries.",
    role: "Compliance officer",
    where: "Hajj operator · Lahore",
    initials: "CO",
    tone: "plate",
  },
];

const TONES: Record<Quote["tone"], string> = {
  plate: "bg-plate text-graphite ring-1 ring-rule",
  dome: "bg-dome-tint text-graphite ring-1 ring-dome-line",
  brass: "bg-brass-tint text-graphite ring-1 ring-brass/40",
  chalk: "bg-chalk text-graphite ring-1 ring-rule",
  graphite: "bg-graphite text-paper ring-1 ring-graphite",
};

function Card({ quote }: { quote: Quote }) {
  const dark = quote.tone === "graphite";
  return (
    <figure
      className={`flex w-[17rem] shrink-0 flex-col gap-3 rounded-2xl p-4 shadow-lift sm:w-[20rem] sm:p-5 ${
        TONES[quote.tone]
      }`}
    >
      <blockquote className="font-plex text-[0.88rem] leading-relaxed">
        &ldquo;{quote.body}&rdquo;
      </blockquote>
      <figcaption className="mt-auto flex items-center gap-2.5">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-plex text-[0.62rem] font-semibold ${
            dark ? "bg-paper/15 text-paper" : "bg-graphite/8 text-stone"
          }`}
        >
          {quote.initials}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-plex text-[0.76rem] font-semibold">
            {quote.role}
          </span>
          <span
            className={`block truncate font-plex text-[0.7rem] ${
              dark ? "text-paper/65" : "text-haze"
            }`}
          >
            {quote.where}
          </span>
        </span>
      </figcaption>
    </figure>
  );
}

function Row({
  quotes,
  reverse,
  duration,
}: {
  quotes: Quote[];
  reverse?: boolean;
  duration: string;
}) {
  return (
    <div className="marquee-host">
      <div
        className={`marquee-track ${reverse ? "animate-marquee-reverse" : "animate-marquee"}`}
        style={{ ["--marquee-dur" as string]: duration }}
      >
        <div className="flex shrink-0 gap-4 pr-4">
          {quotes.map((q) => (
            <Card key={q.body} quote={q} />
          ))}
        </div>
        <div aria-hidden className="flex shrink-0 gap-4 pr-4">
          {quotes.map((q) => (
            <Card key={q.body} quote={q} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Testimonials() {
  return (
    // `ribbon-clip` contains the rotated rows locally. Without it the tilted
    // corners widen the document and the root's horizontal clip is defeated.
    // Padding is deliberately heavy: the -8deg rotation on a 116%-wide block
    // adds roughly 230px of vertical extent, and without room for it the outer
    // cards collide with the sections either side.
    <section className="ribbon-clip bg-chalk/50 py-20 sm:py-28 lg:pb-40 lg:pt-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading
            eyebrow="Testimonials"
            title="What agencies say"
            highlight="after one season"
            description="Placeholder quotes — replace with real ones before launch."
          />
        </Reveal>
      </div>

      {/* Two rows travelling in opposite directions on a tilted parent. The
          overhang and scale stop the rotation leaving bare corners. */}
      <div className="-ml-[8%] mt-14 flex w-[116%] -rotate-[8deg] flex-col gap-4">
        <Row quotes={QUOTES} duration="64s" />
        <Row quotes={[...QUOTES].reverse()} reverse duration="72s" />
      </div>
    </section>
  );
}
