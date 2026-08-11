import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthUser, supabaseServer } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import TeamPanel from "@/components/TeamPanel";
import Icon from "@/components/ui/Icon";

export const dynamic = "force-dynamic";

export default async function TeamSettingsPage() {
  if (!isSupabaseConfigured()) redirect("/setup");

  const sb = await supabaseServer();
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const { data: org } = await sb
    .from("organizations")
    .select("name")
    .eq("id", (await sb.from("profiles").select("org_id").eq("id", user.id).maybeSingle()).data?.org_id ?? "")
    .maybeSingle();

  return (
    <div className="flex h-full flex-col bg-surface">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-edge bg-card px-6">
        <Link href="/settings" className="btn-ghost p-2" title="Back to settings">
          <Icon name="chevronRight" size={16} className="rotate-180" />
        </Link>
        <div>
          <h1 className="text-h2 text-ink">Team</h1>
          <p className="text-meta text-muted">{org?.name ?? "Your workspace"}</p>
        </div>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl">
          <TeamPanel />
        </div>
      </div>
    </div>
  );
}
