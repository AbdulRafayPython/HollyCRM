import { envStatus } from "@/lib/env";
import Icon from "@/components/ui/Icon";
import Chip from "@/components/ui/Chip";

export const dynamic = "force-dynamic";

const GROUPS: { key: string; title: string; blurb: string }[] = [
  { key: "supabase", title: "Supabase", blurb: "Required for the app to start at all." },
  { key: "demo", title: "Demo data", blurb: "Printed by 0002_demo_seed.sql when you run it." },
  { key: "deepseek", title: "DeepSeek", blurb: "Required for the AI bot. Not needed to browse the inbox." },
  { key: "green", title: "Green API", blurb: "Required to send and receive WhatsApp messages." },
];

export default function SetupPage() {
  const status = envStatus();
  const missingCore = status.filter((s) => s.required === "supabase" && !s.ok);

  return (
    <div className="flex h-full flex-col bg-surface">
      <header className="flex h-16 shrink-0 items-center gap-4 border-b border-edge bg-card px-6">
        <h1 className="text-h1 text-ink">Setup</h1>
        {missingCore.length > 0 ? (
          <Chip tone="danger" icon="alert">Supabase not connected</Chip>
        ) : (
          <Chip tone="wa" icon="check">Core configuration OK</Chip>
        )}
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-4">
          <section className="panel p-5">
            <h2 className="flex items-center gap-2 text-h3 text-ink">
              <Icon name="file" size={16} className="text-brand" />
              1 · Fill in .env.local
            </h2>
            <p className="mt-1.5 text-body text-muted">
              The file already exists in the project root. Add the values below, then{" "}
              <strong className="font-medium text-ink">restart npm run dev</strong> — Next.js
              only reads env files at startup.
            </p>
          </section>

          {GROUPS.map((g) => {
            const rows = status.filter((s) => s.required === g.key);
            return (
              <section key={g.key} className="panel p-5">
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <h2 className="text-h3 text-ink">{g.title}</h2>
                  <span className="text-caption text-muted">{g.blurb}</span>
                </div>

                <ul className="divide-y divide-edge">
                  {rows.map((r) => (
                    <li key={r.key} className="flex items-start gap-2.5 py-2.5">
                      <span className={r.ok ? "text-wa" : "text-bot"}>
                        <Icon name={r.ok ? "check" : "info"} size={15} />
                      </span>
                      <div className="min-w-0">
                        <code className="font-mono text-meta text-ink">{r.key}</code>
                        <p className="mt-0.5 text-caption text-muted">{r.note}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          <section className="panel p-5">
            <h2 className="flex items-center gap-2 text-h3 text-ink">
              <Icon name="kanban" size={16} className="text-brand" />
              2 · Run the migrations
            </h2>
            <p className="mt-1.5 text-body text-muted">
              Supabase SQL Editor, in order:{" "}
              <code className="font-mono text-meta">0001_hollycrm_init.sql</code>,{" "}
              <code className="font-mono text-meta">0002_demo_seed.sql</code>,{" "}
              <code className="font-mono text-meta">0003_storage_and_ops.sql</code>.
            </p>

            <h2 className="mt-5 flex items-center gap-2 text-h3 text-ink">
              <Icon name="contacts" size={16} className="text-brand" />
              3 · Create an agent profile
            </h2>
            <p className="mt-1.5 text-body text-muted">
              RLS returns nothing to a user with no row in{" "}
              <code className="font-mono text-meta">profiles</code> — see DEMO_RUNBOOK §2.2.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
