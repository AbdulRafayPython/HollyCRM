import Image from "next/image";
import Icon, { type IconName } from "@/components/ui/Icon";
import { cropStyle, SectionHeading } from "./primitives";
import Reveal from "./Reveal";

const PANELS: {
  icon: IconName;
  eyebrow: string;
  title: string;
  description: string;
  points: string[];
  image: string;
  alt: string;
}[] = [
  {
    icon: "kanban",
    eyebrow: "Sales pipeline",
    title: "Every deal on one board",
    description:
      "Stages are enum-backed, so a deal cannot drift into a state your reporting does not know about.",
    points: [
      "Auto-advance from New Lead to Quoted on a sent quote",
      "Mandatory drop reason on Closed-Lost",
      "Value, pax count and hotel visible without opening the card",
    ],
    image: "/landing-assets/kanban_pipeline_board.jpg",
    alt: "The HollyCRM sales pipeline board with New Lead, Qualified, Quoted and Closed columns",
  },
  {
    icon: "lock",
    eyebrow: "Document vault",
    title: "Passports handled properly",
    description:
      "Identity documents never sit in a chat backup. They mirror into private storage the moment they arrive.",
    points: [
      "Short-lived signed URLs, 5–15 minute TTL",
      "Saudi PDPL and GDPR encrypted at rest",
      "Full audit of who a document was shared with",
    ],
    image: "/landing-assets/encrypted_document_vault.jpg",
    alt: "The encrypted document vault listing passport scans and expiring shared links",
  },
];

export default function PipelineVaultShowcase() {
  return (
    <section id="pipeline" className="scroll-mt-24 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading
            eyebrow="Pipeline & compliance"
            eyebrowIcon="shield"
            title="The unglamorous half agencies actually get audited on"
            description="Stage hygiene and document handling decide whether a season closes cleanly. Both are built in, not bolted on."
          />
        </Reveal>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          {PANELS.map((panel, i) => (
            <Reveal key={panel.title} variant="zoom" delay={i * 140} className="h-full">
              <article className="flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-900/5 transition-shadow duration-300 hover:shadow-xl hover:shadow-violet-950/10">
                <div className="overflow-hidden border-b border-slate-900/5 bg-slate-50/60">
                  <Image
                    src={panel.image}
                    alt={panel.alt}
                    width={1376}
                    height={768}
                    sizes="(min-width: 1024px) 50vw, 100vw"
                    style={cropStyle(1.14)}
                    className="h-auto w-full"
                  />
                </div>

                <div className="flex flex-1 flex-col p-6">
                  <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-violet-600">
                    <Icon name={panel.icon} className="h-4 w-4" />
                    {panel.eyebrow}
                  </span>
                  <h3 className="mt-3 text-xl font-extrabold tracking-tight text-slate-900">
                    {panel.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    {panel.description}
                  </p>

                  <ul className="mt-5 space-y-2.5">
                    {panel.points.map((point) => (
                      <li
                        key={point}
                        className="flex items-start gap-2.5 text-sm text-slate-600"
                      >
                        <Icon
                          name="check"
                          className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500"
                        />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
