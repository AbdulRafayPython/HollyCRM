import Icon, { type IconName } from "@/components/ui/Icon";
import { Screenshot, SectionHeading } from "./primitives";
import Reveal from "./Reveal";

const FEATURES: {
  icon: IconName;
  title: string;
  badge: string;
  description: string;
  tone: "emerald" | "violet" | "indigo" | "amber";
}[] = [
  {
    icon: "chat",
    title: "Native WhatsApp integration",
    badge: "Green API Gateway",
    description:
      "One shared inbox for direct chats, family groups, voice notes, and passport media in real time.",
    tone: "emerald",
  },
  {
    icon: "kanban",
    title: "Hajj & Umrah pipeline",
    badge: "Visual Kanban",
    description:
      "Group leads, passport collection, visa milestones, and booking confirmations modeled for agency sales.",
    tone: "indigo",
  },
  {
    icon: "bolt",
    title: "AI-powered quoting",
    badge: "Deterministic SQL",
    description:
      "Inbound messages extract structured hotel, flight, and pax parameters for exact live inventory pricing.",
    tone: "violet",
  },
  {
    icon: "chart",
    title: "Real-time insights",
    badge: "Live SLAs",
    description:
      "Response times, agent workload distribution, and stage conversion rates tracked automatically.",
    tone: "amber",
  },
];

const TONES = {
  emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  violet: "bg-violet-50 text-violet-600 ring-violet-100",
  indigo: "bg-indigo-50 text-indigo-600 ring-indigo-100",
  amber: "bg-amber-50 text-amber-600 ring-amber-100",
};

export default function FeatureGrid() {
  return (
    <section id="features" className="scroll-mt-24 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading
            eyebrow="Unified Operations Platform"
            eyebrowIcon="bolt"
            title="Operate your WhatsApp sales"
            highlight="in one unified workspace."
            description="Everything an Umrah agency does between the first message and the signed booking — without a single copy-paste into a spreadsheet."
          />
        </Reveal>

        {/* High-Fidelity UI Screenshot Showcase */}
        <Reveal variant="zoom" delay={100} className="mt-12">
          <Screenshot
            src="/landing-assets/features_overview.jpg"
            alt="HollyCRM unified operations dashboard showing WhatsApp shared inbox, Umrah deal pipeline, AI quoting engine, and real-time analytics"
            priority
            sizes="(min-width: 1024px) 90vw, 100vw"
          />
        </Reveal>

        {/* 4 Feature Deep-Dive Cards below the showcase */}
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature, i) => (
            <Reveal key={feature.title} delay={120 + i * 80}>
              <div className="group h-full rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-900/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-violet-950/10 hover:ring-violet-200">
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ring-1 transition-transform duration-300 group-hover:scale-110 ${
                      TONES[feature.tone]
                    }`}
                  >
                    <Icon name={feature.icon} className="h-5 w-5" />
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {feature.badge}
                  </span>
                </div>
                <h3 className="mt-4 text-base font-bold text-slate-900">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {feature.description}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

