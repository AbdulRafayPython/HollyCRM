"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Chip from "@/components/ui/Chip";
import Icon, { type IconName } from "@/components/ui/Icon";
import BuildAgentWizard from "@/components/workflow/BuildAgentWizard";

interface Agent {
  enabled: boolean;
  bot_name: string;
  business_name: string | null;
  business_url: string | null;
  business_description: string | null;
  onboarded_at: string | null;
}

export default function AiHomePage() {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [wizard, setWizard] = useState(false);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState({ model: false, knowledge: 0, hotels: 0, online: 0, rules: 0 });

  const load = useCallback(async () => {
    const [a, llm, knowledge, hotels, routing, rules] = await Promise.all([
      fetch("/api/ai/agent").then(safe),
      fetch("/api/settings/llm").then(safe),
      fetch("/api/settings/knowledge").then(safe),
      fetch("/api/settings/hotels").then(safe),
      fetch("/api/settings/routing").then(safe),
      fetch("/api/settings/rules").then(safe),
    ]);
    setAgent(a?.agent ?? null);
    setHealth({
      model: Boolean(llm?.connected),
      knowledge: (knowledge?.sources ?? []).filter(
        (s: { purpose: string; status: string; is_active: boolean }) =>
          s.purpose === "knowledge" && s.status === "ready" && s.is_active
      ).length,
      hotels: (hotels?.hotels ?? []).length,
      online: (routing?.agents ?? []).filter((x: { is_online: boolean }) => x.is_online).length,
      rules: (rules?.rules ?? []).filter((r: { is_active: boolean }) => r.is_active).length,
    });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="flex h-full items-center justify-center bg-surface" />;
  }

  const configured = Boolean(agent?.onboarded_at);

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-edge/80 bg-white px-6 md:px-8 z-10">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-ink">AI Agent</h1>
          {configured && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset ${
                agent?.enabled
                  ? "bg-wa-soft text-wa-dark ring-wa-dark/20"
                  : "bg-danger-soft text-danger-dark ring-danger/20"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${agent?.enabled ? "bg-wa" : "bg-danger"}`} />
              {agent?.enabled ? "Live" : "Switched off"}
            </span>
          )}
        </div>

        {configured && (
          <Link
            href="/ai/workflow?from=/ai"
            className="flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-brand transition"
          >
            <Icon name="sparkle" size={14} />
            <span>Open Workflow Canvas</span>
          </Link>
        )}
      </header>

      {/* Main Content */}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-6 md:p-8">
        {!configured ? (
          <Onboarding onBuild={() => setWizard(true)} />
        ) : (
          <div className="mx-auto max-w-5xl space-y-6">
            {/* Agent Summary Banner Card */}
            <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-edge/80 bg-white p-6 shadow-xs">
              <div className="flex items-center gap-4 min-w-0 flex-1">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand ring-1 ring-brand/20">
                  <Icon name="bot" size={26} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-extrabold text-ink">
                      {agent?.bot_name} <span className="font-normal text-subtle">·</span> {agent?.business_name}
                    </h2>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted leading-relaxed">
                    {agent?.business_description || "No agency description configured."}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setWizard(true)}
                className="rounded-xl border border-edge bg-white px-4 py-2 text-xs font-bold text-ink-soft hover:bg-surface transition shadow-2xs"
              >
                Edit Persona
              </button>
            </section>

            {/* Sub-tools Configuration Grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Card
                href="/ai/workflow?from=/ai"
                icon="sparkle"
                title="Workflow Canvas"
                body="Visual pipeline of AI qualification steps, hotel quotation lookups, and branch logic."
                chip={{ tone: "brand", text: "Interactive" }}
              />
              <Card
                href="/ai/rules?from=/ai"
                icon="filter"
                title="Business Rules"
                body="Route high-budget VIP inquiries to closers, Arabic/Urdu speakers to designated agents."
                chip={
                  health.rules
                    ? { tone: "wa", text: `${health.rules} active` }
                    : { tone: "neutral", text: "None yet" }
                }
              />
              <Card
                href="/settings/llm?from=/ai"
                icon="lock"
                title="Model & API Keys"
                body="Gemini, GPT-4o, and Claude configurations with encrypted secret key storage."
                chip={health.model ? { tone: "wa", text: "Configured" } : { tone: "danger", text: "No key" }}
              />
              <Card
                href="/settings/knowledge?from=/ai"
                icon="file"
                title="Knowledge Sources"
                body="Visa policies, transport guidelines, and general Umrah FAQs for automated answers."
                chip={
                  health.knowledge
                    ? { tone: "wa", text: `${health.knowledge} live docs` }
                    : { tone: "bot", text: "Empty" }
                }
              />
              <Card
                href="/settings/inventory?from=/ai"
                icon="receipt"
                title="Hotel Inventory"
                body="Real-time Makkah & Madinah hotel rates, room allotments, and seasonal pricing."
                chip={
                  health.hotels
                    ? { tone: "wa", text: `${health.hotels} hotels live` }
                    : { tone: "bot", text: "Empty" }
                }
              />
              <Card
                href="/settings/routing?from=/ai"
                icon="users"
                title="Routing & Team"
                body="Dialing code region coverage, working hours, and automatic supervisor escalations."
                chip={
                  health.online
                    ? { tone: "wa", text: `${health.online} online` }
                    : { tone: "bot", text: "Nobody online" }
                }
              />
            </div>
          </div>
        )}
      </div>

      {wizard && (
        <BuildAgentWizard
          initial={agent ?? undefined}
          onClose={() => setWizard(false)}
          onDone={() => { setWizard(false); load(); }}
        />
      )}
    </div>
  );
}

function Onboarding({ onBuild }: { onBuild: () => void }) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-center space-y-6">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-soft text-brand ring-1 ring-brand/20 shadow-sm">
        <Icon name="bot" size={32} />
      </span>
      <div className="space-y-2">
        <h2 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
          Your AI Assistant is ready to be configured
        </h2>
        <p className="mx-auto max-w-xl text-xs text-muted leading-relaxed">
          It automatically handles WhatsApp inquiries, quotes verified hotel rates, and routes qualified leads directly to your agency desk.
        </p>
      </div>

      <button
        onClick={onBuild}
        className="inline-flex items-center gap-2 rounded-2xl bg-brand px-6 py-3 text-xs font-bold text-white shadow-md hover:bg-brand transition-all transform active:scale-95"
      >
        <Icon name="bolt" size={15} />
        <span>Build my AI Agent</span>
      </button>

      <div className="mt-10 grid gap-4 sm:grid-cols-3 pt-6 text-left">
        {[
          { icon: "chat" as IconName, title: "Instant WhatsApp Replies", body: "Understands customer intent and replies in Arabic, English, or Urdu." },
          { icon: "receipt" as IconName, title: "Exact Rate Sheet Quoting", body: "Every quotation pulls strictly from your verified hotel room inventory." },
          { icon: "users" as IconName, title: "Seamless Human Handoff", body: "Hands negotiation over to available agents when complex quotes arise." },
        ].map((f) => (
          <div
            key={f.title}
            className="rounded-2xl border border-edge/80 bg-white p-5 shadow-xs space-y-2"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface text-ink-soft ring-1 ring-edge">
              <Icon name={f.icon} size={16} />
            </span>
            <h3 className="text-xs font-bold text-ink">{f.title}</h3>
            <p className="text-[11px] text-subtle leading-relaxed">{f.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Card({ href, icon, title, body, chip }: {
  href: string; icon: IconName; title: string; body: string;
  chip: { tone: "wa" | "bot" | "danger" | "brand" | "neutral"; text: string };
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col justify-between rounded-3xl border border-edge/80 bg-white p-5 shadow-xs transition-all duration-200 hover:border-brand hover:shadow-lg hover:-translate-y-0.5"
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface text-muted ring-1 ring-edge group-hover:bg-brand-soft group-hover:text-brand transition-colors">
            <Icon name={icon} size={18} />
          </span>
          <Chip tone={chip.tone}>{chip.text}</Chip>
        </div>
        <div>
          <h3 className="text-xs font-bold text-ink group-hover:text-brand transition-colors">
            {title}
          </h3>
          <p className="mt-1 text-[11px] text-subtle leading-relaxed">{body}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end border-t border-edge pt-3 text-[11px] font-bold text-brand group-hover:translate-x-0.5 transition-transform">
        Configure →
      </div>
    </Link>
  );
}

async function safe(r: Response) {
  return r.ok ? r.json().catch(() => null) : null;
}
