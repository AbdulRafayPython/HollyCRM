import Image from "next/image";
import Icon, { type IconName } from "@/components/ui/Icon";
import { SectionHeading } from "./primitives";
import Reveal from "./Reveal";

/**
 * The lifestyle marquee.
 *
 * The reference showreel alternates photography with flat icon tiles, which is
 * what stops a photo rail from reading as a stock-image carousel. Same idea
 * here: five photographs of the world this product is sold into, interleaved
 * with tiles that name what the software actually does.
 *
 * These are the only generated images on the page. They work because they
 * contain no text, no UI and no brand marks — nothing an image model gets
 * wrong. Everything that had to carry a real string is rendered as markup.
 */

type Card =
  | {
      kind: "photo";
      src: string;
      alt: string;
      label: string;
      /**
       * The still life is composed square, with its negative space carrying
       * most of the picture. Cropping it to the portrait ratio would throw
       * that away, so the rail takes mixed widths instead — which is what the
       * reference does too, alternating wide photographs with square tiles.
       */
      shape?: "portrait" | "square";
    }
  | { kind: "tile"; icon: IconName; label: string; tone: "dome" | "brass" | "quiet" };

const CARDS: Card[] = [
  {
    kind: "photo",
    src: "/landing/makkah-haram-view.webp",
    alt: "Hotel room in Makkah at dusk, the Haram visible through a full-height window",
    label: "Makkah",
  },
  { kind: "tile", icon: "database", label: "Your own rates", tone: "dome" },
  {
    kind: "photo",
    src: "/landing/madinah-room-morning.webp",
    alt: "A quiet hotel room in Madinah in soft morning light",
    label: "Madinah",
  },
  { kind: "tile", icon: "users", label: "Family groups", tone: "brass" },
  {
    kind: "photo",
    src: "/landing/agency-desk.webp",
    alt: "An Umrah booking agent working at a desk in a small travel agency",
    label: "Your desk",
  },
  {
    kind: "photo",
    src: "/landing/dates-zamzam.webp",
    alt: "Dates on a brass tray beside a glass of water, on warm limestone",
    label: "Ramadan",
    shape: "square",
  },
  { kind: "tile", icon: "lock", label: "Passport vault", tone: "quiet" },
  {
    kind: "photo",
    src: "/landing/group-arrival-luggage.webp",
    alt: "Luggage gathered in a hotel lobby as a pilgrim group arrives",
    label: "Arrivals",
  },
  { kind: "tile", icon: "bolt", label: "Stages that move", tone: "dome" },
  {
    kind: "photo",
    src: "/landing/colonnade-card.webp",
    alt: "Sunlight through a marble colonnade of pointed arches",
    label: "Every season",
  },
];

function CardView({ card }: { card: Card }) {
  if (card.kind === "photo") {
    const square = card.shape === "square";
    return (
      <figure
        className={`relative h-52 overflow-hidden rounded-2xl shadow-lift sm:h-64 ${
          square ? "w-52 sm:w-64" : "w-[10.4rem] sm:w-[12.8rem]"
        }`}
      >
        <Image
          src={card.src}
          alt={card.alt}
          fill
          sizes={square ? "(min-width: 640px) 256px, 208px" : "(min-width: 640px) 205px, 167px"}
          className="object-cover"
        />
        {/* Scrim only under the label, so the photograph stays a photograph. */}
        <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-graphite/75 to-transparent px-3 pb-2.5 pt-8">
          <span className="font-plex text-[0.7rem] font-semibold uppercase tracking-wider text-paper">
            {card.label}
          </span>
        </figcaption>
      </figure>
    );
  }

  const tones = {
    dome: "bg-dome text-white",
    brass: "bg-brass text-graphite",
    quiet: "bg-chalk text-stone ring-1 ring-rule",
  };
  return (
    <div
      className={`flex h-52 w-[10.4rem] flex-col justify-between rounded-2xl p-4 shadow-lift sm:h-64 sm:w-[12.8rem] ${
        tones[card.tone]
      }`}
    >
      <Icon name={card.icon} className="h-6 w-6" />
      <span className="mkt-display text-[1.05rem] font-bold leading-none sm:text-[1.2rem]">
        {card.label}
      </span>
    </div>
  );
}

function Run({ ariaHidden }: { ariaHidden?: boolean }) {
  return (
    <div aria-hidden={ariaHidden} className="flex shrink-0 gap-4 pr-4">
      {CARDS.map((card, i) => (
        <CardView key={`${card.label}-${i}`} card={card} />
      ))}
    </div>
  );
}

export default function FeatureMarquee() {
  return (
    <section className="overflow-hidden py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading
            eyebrow="Built for the season"
            title="Made for the desk"
            highlight="not for software people"
            description="Umrah and Hajj agencies sell in WhatsApp, at night, in three languages, against a room block that changes hourly. This is built for that, and nothing else."
          />
        </Reveal>
      </div>

      {/* Full-bleed: the rail should run off both edges rather than stop at the
          gutter, or it reads as a carousel that has simply run out. */}
      <div className="marquee-host mt-12">
        <div
          className="marquee-track animate-marquee-reverse"
          style={{ ["--marquee-dur" as string]: "58s" }}
        >
          <Run />
          <Run ariaHidden />
        </div>
      </div>
    </section>
  );
}
