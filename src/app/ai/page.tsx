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

/**
 * The AI agent's home.
 *
 * Two completely different screens depending on one fact — whether this
 * workspace has ever been set up. An unconfigured workspace does not need a
 * grid of settings cards; it needs one obvious thing to do next, because the
 * agent is already receiving messages and answering them as nobody in
 * particular.
 */
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
      // `connected` covers both a workspace key and the deployment's own — the
      // agent replying on an env key is configured, whatever the table says.
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
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-edge bg-card px-6">
        <h1 className="text-h1 text-ink">AI agent</h1>
        {configured && (
          <Chip tone={agent?.enabled ? "wa" : "danger"}>
            {agent?.enabled ? "Live" : "Switched off"}
          </Chip>
        )}
        {configured && (
          <Link href="/ai/workflow" className="btn-primary ml-auto flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-meta">
            <Icon name="kanban" size={14} />Open workflow
          </Link>
        )}
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {!configured ? <Onboarding onBuild={() => setWizard(true)} /> : (
          <div className="mx-auto max-w-4xl space-y-6 p-6">
            <section className="panel flex flex-wrap items-center gap-4 p-5">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <Icon name="bot" size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-h3 text-ink">
                  {agent?.bot_name} · {agent?.business_name}
                </h2>
                <p className="mt-0.5 line-clamp-2 text-caption text-muted">
                  {agent?.business_description || "No description set."}
                </p>
              </div>
              <button onClick={() => setWizard(true)} className="btn-ghost rounded-lg px-4 py-2 text-meta">
                Edit
              </button>
            </section>

            <div className="grid gap-3 sm:grid-cols-2">
              <Card
                href="/ai/workflow" icon="kanban" title="Workflow"
                body="Arrange the steps, switch branches on and off, and run a test message through the whole pipeline."
                chip={{ tone: "brand", text: "Test it" }}
              />
              <Card
                href="/ai/rules" icon="filter" title="Rules"
                body="Your own if/else — send big enquiries to your closer, Urdu speakers to the right desk, complaints straight to a human."
                chip={health.rules
                  ? { tone: "wa", text: `${health.rules} active` }
                  : { tone: "neutral", text: "None yet" }}
              />
              <Card
                href="/settings/llm" icon="lock" title="Model & API keys"
                body="Which model answers customers, and with whose key. Encrypted in Vault."
                chip={health.model ? { tone: "wa", text: "Configured" } : { tone: "danger", text: "No key" }}
              />
              <Card
                href="/settings/knowledge" icon="file" title="Knowledge & imports"
                body="Rate sheets, policies, visa rules, FAQs. Excel, PDF, or a Google Sheet."
                chip={health.knowledge
                  ? { tone: "wa", text: `${health.knowledge} live` }
                  : { tone: "bot", text: "Nothing uploaded" }}
              />
              <Card
                href="/settings/inventory" icon="receipt" title="Hotel inventory"
                body="Hotels, room types and seasonal rates — the only source of a quoted price."
                chip={health.hotels
                  ? { tone: "wa", text: `${health.hotels} hotels` }
                  : { tone: "bot", text: "Empty" }}
              />
              <Card
                href="/settings/routing" icon="users" title="Routing & team"
                body="Regions by dialling code, who covers them, and what happens when nobody is online."
                chip={health.online
                  ? { tone: "wa", text: `${health.online} online` }
                  : { tone: "bot", text: "Nobody online" }}
              />
              <Card
                href="/settings/ai" icon="compose" title="Tone & wording"
                body="Greetings, trigger keywords, handoff words and reply limits."
                chip={{ tone: "neutral", text: "Optional" }}
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

/** The pre-setup screen: one thing to do, and why it matters. */
function Onboarding({ onBuild }: { onBuild: () => void }) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="text-center">
        <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand">
          <Icon name="bot" size={26} />
        </span>
        <h2 className="text-h1 text-ink sm:text-[32px] sm:leading-[40px]">
          Your agent doesn&rsquo;t know who it works for yet
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-body text-muted">
          It&rsquo;s already receiving WhatsApp messages and replying with the defaults it
          shipped with. Tell it about your business and it starts answering as you.
        </p>
        <button
          onClick={onBuild}
          className="btn-primary mt-6 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-body font-medium shadow-pop transition-transform duration-200 ease-swift hover:-translate-y-0.5"
        >
          <Icon name="bolt" size={16} />
          Build my AI agent
        </button>
        <p className="mt-2 text-caption text-subtle">Takes about a minute. Everything is editable afterwards.</p>
      </div>

      <div className="mt-12 grid gap-3 sm:grid-cols-3">
        {[
          { icon: "chat" as IconName, title: "Answers instantly", body: "Greets, understands what's being asked, and replies in the customer's own language." },
          { icon: "receipt" as IconName, title: "Quotes from your rates", body: "Every price comes out of your inventory. It cannot invent a number." },
          { icon: "users" as IconName, title: "Knows when to stop", body: "Hands anything it can't answer to the right agent on the right desk." },
        ].map((f, i) => (
          <div
            key={f.title}
            className="panel animate-rise-in p-4"
            style={{ animationDelay: `${i * 80}ms`, animationFillMode: "both" }}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface text-muted">
              <Icon name={f.icon} size={15} />
            </span>
            <h3 className="mt-2.5 text-meta font-semibold text-ink">{f.title}</h3>
            <p className="mt-1 text-caption leading-relaxed text-muted">{f.body}</p>
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
    <Link href={href} className="panel group flex flex-col gap-2 p-4 transition-all duration-200 ease-swift hover:-translate-y-0.5 hover:shadow-pop">
      <span className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-muted transition-colors duration-200 group-hover:bg-brand-soft group-hover:text-brand">
          <Icon name={icon} size={15} />
        </span>
        <span className="flex-1 text-body font-semibold text-ink">{title}</span>
        <Chip tone={chip.tone}>{chip.text}</Chip>
      </span>
      <span className="text-caption leading-relaxed text-muted">{body}</span>
    </Link>
  );
}

async function safe(r: Response) {
  return r.ok ? r.json().catch(() => null) : null;
}
