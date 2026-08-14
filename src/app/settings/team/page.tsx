import { redirect } from "next/navigation";
import { getAuthUser, supabaseServer } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import TeamPanel from "@/components/TeamPanel";
import SettingsNav from "@/components/settings/SettingsNav";

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
    <div className="flex h-full bg-surface">
      <SettingsNav />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-edge/80 px-8 bg-white z-10">
          <div>
            <h1 className="text-xl font-bold text-ink">Team Management</h1>
            <p className="text-xs text-subtle">Manage sales agents, agency roles, and invitation access</p>
          </div>
          <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-bold text-brand ring-1 ring-brand/20">
            {org?.name ?? "HolyLand Workspace"}
          </span>
        </header>

        <div className="scroll-thin flex-1 overflow-y-auto p-6 md:p-8 bg-surface">
          <div className="max-w-4xl mx-auto">
            <TeamPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
