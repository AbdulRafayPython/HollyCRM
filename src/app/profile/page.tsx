import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import ProfileForm from "@/components/ProfileForm";

export const dynamic = "force-dynamic";

/**
 * My profile.
 *
 * The gate lives here rather than in middleware, matching every other page in
 * the app: middleware only refreshes the auth cookie, and each route decides
 * for itself who may see it.
 */
export default async function ProfilePage() {
  if (!isSupabaseConfigured()) redirect("/setup");

  const user = await getAuthUser();
  if (!user) redirect("/login");

  return (
    <div className="flex h-full flex-col bg-surface">
      <header className="flex h-16 shrink-0 items-center border-b border-edge bg-card px-6">
        <h1 className="text-h1 text-ink">My profile</h1>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl">
          <ProfileForm />
        </div>
      </div>
    </div>
  );
}
