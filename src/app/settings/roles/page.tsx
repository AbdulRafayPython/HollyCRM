import SettingsNav from "@/components/settings/SettingsNav";
import RolesPanel from "@/components/settings/RolesPanel";
import BackButton from "@/components/ui/BackButton";

export const dynamic = "force-dynamic";

/**
 * Settings → Roles & permissions.
 *
 * The screen the matrix in 0034/0035 was built for. Until it existed a role
 * could only be composed by hand-written SQL, which in practice means it never
 * was and the whole mechanism stayed theoretical.
 */
export default function RolesSettingsPage() {
  return (
    <div className="flex h-full bg-surface">
      <SettingsNav />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white">
        <header className="z-10 flex h-16 shrink-0 items-center justify-between border-b border-edge/80 bg-white px-8">
          <div className="flex items-center gap-3">
            <BackButton />
            <div>
              <h1 className="text-xl font-bold text-ink">Roles &amp; Permissions</h1>
              <p className="text-xs text-subtle">
                Build a role out of what it may do, then give it to people
              </p>
            </div>
          </div>
        </header>

        <div className="scroll-thin flex-1 overflow-y-auto bg-surface p-6 md:p-8">
          <div className="mx-auto max-w-5xl">
            <RolesPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
