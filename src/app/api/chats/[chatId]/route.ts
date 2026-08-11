import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Permanently delete a conversation — for spam and test chats ONLY.
 *
 * The row delete runs on the USER'S client so the supervisor-only RLS policy
 * (0006) is the actual gate; this route cannot grant more than the database
 * allows. The cascade removes messages, leads, stage events, quotes and
 * document rows; media files under the chat's storage prefix are then removed
 * with the service role, so no orphaned passport scans linger in the bucket.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: chat } = await sb
    .from("chats").select("id, org_id").eq("id", chatId).maybeSingle();
  if (!chat) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { data: deleted, error } = await sb
    .from("chats")
    .delete()
    .eq("id", chatId)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!deleted) {
    return NextResponse.json(
      { error: "Only a supervisor can permanently delete a conversation." },
      { status: 403 }
    );
  }

  // Row is gone; sweep the media files. Best-effort — a failure here leaves
  // orphaned files, never a half-deleted conversation.
  try {
    const store = supabaseAdmin().storage.from("wa-media");
    const prefix = `${chat.org_id}/${chatId}`;
    const { data: files } = await store.list(prefix, { limit: 1000 });
    if (files?.length) {
      await store.remove(files.map((f) => `${prefix}/${f.name}`));
    }
  } catch (err) {
    console.error("[delete] storage sweep failed", err);
  }

  return NextResponse.json({ ok: true, deleted: chatId });
}
