import Link from "next/link";
import Icon from "@/components/ui/Icon";

/**
 * What a sales agent used to get instead of this: a blank page, or the raw
 * PostgREST string "new row violates row-level security policy for table ...".
 * RLS was doing exactly the right thing; the product had no way to say so.
 *
 * It names the PERMISSION rather than a role, because since 0034 a role is
 * whatever this workspace decided it is — "ask an owner" would be wrong advice
 * in a workspace that put the permission on a custom role instead.
 */
export default function AccessDenied({
  what,
  permissionLabel,
}: {
  what: string;
  permissionLabel?: string | null;
}) {
  return (
    <div className="flex h-full flex-1 items-center justify-center bg-white p-8">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-edge/40">
          <Icon name="lock" className="h-5 w-5 text-subtle" />
        </div>

        <h1 className="text-lg font-bold text-ink">{what} is restricted</h1>

        <p className="mt-2 text-meta text-subtle">
          {permissionLabel ? (
            <>
              This page needs the <strong className="text-ink-soft">{permissionLabel}</strong>{" "}
              permission, which your role does not have.
            </>
          ) : (
            <>Your role does not have permission to open this.</>
          )}{" "}
          Ask whoever manages your team to add it, or to move you to a role that
          has it.
        </p>

        <div className="mt-6 flex items-center justify-center gap-2">
          <Link href="/inbox" className="btn-primary rounded-lg px-4 py-2 text-meta">
            Back to inbox
          </Link>
          <Link
            href="/settings"
            className="rounded-lg border border-edge px-4 py-2 text-meta text-ink hover:bg-edge/20"
          >
            Your settings
          </Link>
        </div>
      </div>
    </div>
  );
}
