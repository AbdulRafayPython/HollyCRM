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
    <div className="flex h-full bg-[#F8FAFC]">
      <SettingsNav />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200/80 px-8 bg-white z-10">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Team Management</h1>
            <p className="text-xs text-slate-400">Manage sales agents, agency roles, and invitation access</p>
          </div>
          <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-bold text-purple-700 ring-1 ring-purple-600/20">
            {org?.name ?? "HolyLand Workspace"}
          </span>
        </header>

        <div className="scroll-thin flex-1 overflow-y-auto p-6 md:p-8 bg-[#F8FAFC]">
          <div className="max-w-4xl mx-auto">
            <TeamPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
