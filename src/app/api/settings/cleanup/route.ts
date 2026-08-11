import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const SCOPES = ["archived", "no_value", "all"] as const;

/** Counts for the confirmation screen. */
export async function GET() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await sb.rpc("conversation_cleanup_preview");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ preview: data });
}

/**
 * Scoped bulk delete. The supervisor check lives inside cleanup_conversations(),
 * so this route cannot widen it. `confirm` must be the literal string DELETE —
 * the same typed confirmation the single-chat delete requires, because this one
 * removes many conversations at once.
 */
export async function POST(req: Request) {
  const { scope, confirm } = (await req.json()) as { scope?: string; confirm?: string };

  if (!scope || !(SCOPES as readonly string[]).includes(scope)) {
    return NextResponse.json({ error: "scope must be archived, no_value or all" }, { status: 400 });
  }
  if (confirm !== "DELETE") {
    return NextResponse.json({ error: "Type DELETE to confirm." }, { status: 400 });
  }

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await sb.rpc("cleanup_conversations", { p_scope: scope });
  if (error) {
    const supervisorOnly = /supervisor/i.test(error.message);
    return NextResponse.json(
      { error: supervisorOnly ? "Only a supervisor can bulk-delete conversations." : error.message },
      { status: supervisorOnly ? 403 : 400 }
    );
  }

  const result = data as { deleted: number; org_id: string; chat_ids: string[] };

  // Rows are gone; sweep their media so passport scans don't linger in storage.
  // Best-effort: orphaned files are a tidiness problem, a half-delete is not.
  let filesRemoved = 0;
  try {
    const store = supabaseAdmin().storage.from("wa-media");
    for (const chatId of result.chat_ids ?? []) {
      const prefix = `${result.org_id}/${chatId}`;
      const { data: files } = await store.list(prefix, { limit: 1000 });
      if (files?.length) {
        await store.remove(files.map((f) => `${prefix}/${f.name}`));
        filesRemoved += files.length;
      }
    }
  } catch (err) {
    console.error("[cleanup] storage sweep failed", err);
  }

  return NextResponse.json({ ok: true, deleted: result.deleted, filesRemoved });
}
