import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import AcceptInvite from "@/components/AcceptInvite";
import Icon from "@/components/ui/Icon";

export const dynamic = "force-dynamic";

/**
 * Landing page for an invite link.
 *
 * invitation_preview() is a SECURITY DEFINER function that returns three fields
 * for one valid token — the invitations table itself stays closed to anon. An
 * expired, revoked or already-used token resolves to nothing, and every one of
 * those cases gets the same message: a link that does not work should not tell
 * a stranger which of those it was.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const sb = await supabaseServer();

  const { data } = await sb.rpc("invitation_preview", { invite_token: token });
  const invite = Array.isArray(data) ? data[0] : data;

  return (
    <div className="flex h-full items-center justify-center bg-surface px-6">
      <div className="w-full max-w-[440px]">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-body font-bold text-wa">
            H
          </span>
          <span className="text-h3 tracking-tight text-ink">HollyCRM</span>
        </div>

        {invite ? (
          <AcceptInvite
            token={token}
            workspace={invite.workspace ?? "the workspace"}
            email={invite.email ?? ""}
          />
        ) : (
          <div className="panel p-6 text-center">
            <Icon name="alert" size={24} className="mx-auto mb-3 text-muted" />
            <p className="text-h3 text-ink">This invite link is no longer valid</p>
            <p className="mt-1 text-body text-muted">
              It may have expired, been used already, or been revoked. Ask the workspace owner
              for a fresh link.
            </p>
            <Link href="/login" className="btn-secondary mt-4 inline-flex">
              Go to sign in
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
