import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { MEDIA_BUCKET, MEDIA_URL_TTL_S } from "@/lib/media";

export const runtime = "nodejs";

/** One request per thread, not per attachment. */
const MAX_IDS = 200;

/**
 * Mints signed URLs for the attachments in a thread.
 *
 * C3: `wa-media` is private, so the thread cannot render a passport or play a
 * voice note from `media_path` directly — every URL is signed, short-lived and
 * never persisted. The client asks again for messages that arrive over Realtime
 * and re-asks before the previous batch expires.
 *
 * The message rows are read through the RLS-scoped client on purpose: the
 * policy on `messages` is what decides whether this agent may see this chat, so
 * an id from another org simply returns nothing to sign. Only the storage call
 * uses the service role, and only for paths that survived that filter.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;
  const { messageIds } = (await req.json().catch(() => ({}))) as { messageIds?: unknown };

  if (!Array.isArray(messageIds) || messageIds.length === 0) {
    return NextResponse.json({ urls: {} });
  }
  const ids = messageIds.filter((id): id is string => typeof id === "string").slice(0, MAX_IDS);
  if (ids.length === 0) return NextResponse.json({ urls: {} });

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: rows } = await sb
    .from("messages")
    .select("id, media_path")
    .eq("chat_id", chatId)
    .in("id", ids)
    .not("media_path", "is", null);

  const withMedia = (rows ?? []).filter((r) => r.media_path);
  if (withMedia.length === 0) return NextResponse.json({ urls: {} });

  const db = supabaseAdmin();
  const urls: Record<string, string> = {};
  await Promise.all(
    withMedia.map(async (row) => {
      const { data } = await db.storage
        .from(MEDIA_BUCKET)
        .createSignedUrl(row.media_path as string, MEDIA_URL_TTL_S);
      if (data?.signedUrl) urls[row.id] = data.signedUrl;
    })
  );

  return NextResponse.json({ urls, expires_in: MEDIA_URL_TTL_S });
}
