import Icon, { type IconName } from "@/components/ui/Icon";
import { SectionHeading } from "./primitives";
import Reveal from "./Reveal";

const FEATURES: {
  icon: IconName;
  title: string;
  description: string;
  tone: "emerald" | "violet" | "indigo" | "amber";
}[] = [
  {
    icon: "chat",
    title: "Native WhatsApp integration",
    description:
      "One shared inbox over Green API. Direct chats, family groups, media and delivery receipts, all in real time.",
    tone: "emerald",
  },
  {
    icon: "bolt",
    title: "AI-powered quoting",
    description:
      "Inbound messages become structured parameters, then an exact inventory query. Instant quotes, zero invented rates.",
    tone: "violet",
  },
  {
    icon: "kanban",
    title: "Hajj & Umrah workflow",
    description:
      "Group leads, passport collection, visa milestones and stage advancement modelled the way agencies actually sell.",
    tone: "indigo",
  },
  {
    icon: "chart",
    title: "Real-time insights",
    description:
      "Response SLAs, agent workload and stage conversion tracked per line, per agent and per season.",
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
    <section id="features" className="scroll-mt-24 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading
            title="Operate your WhatsApp sales in one place"
            description="Everything an Umrah agency does between the first message and the signed booking — without a single copy-paste into a spreadsheet."
          />
        </Reveal>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature, i) => (
            /* 90ms apart: enough to read as a cascade left to right, short
               enough that the last card is not still arriving after the eye
               has moved on. */
            <Reveal key={feature.title} delay={i * 90}>
              <div className="group h-full rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-900/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-violet-950/10 hover:ring-violet-200">
                <span
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ring-1 transition-transform duration-300 group-hover:scale-110 ${
                    TONES[feature.tone]
                  }`}
                >
                  <Icon name={feature.icon} className="h-5 w-5" />
                </span>
                <h3 className="mt-5 text-base font-bold text-slate-900">
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
