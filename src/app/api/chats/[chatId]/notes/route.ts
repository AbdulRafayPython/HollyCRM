import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Internal notes (Module 2.2). Team-only — never sent to WhatsApp.
 * @mentions are resolved to profile ids so they can drive notifications later.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;
  const { body, leadId } = (await req.json()) as { body?: string; leadId?: string | null };
  if (!body?.trim()) return NextResponse.json({ error: "empty" }, { status: 400 });

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: chat } = await sb
    .from("chats").select("id, org_id").eq("id", chatId).maybeSingle();
  if (!chat) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Resolve "@Full Name" fragments against org members visible under RLS.
  const handles = [...body.matchAll(/@([\w.\-]+)/g)].map((m) => m[1].toLowerCase());
  let mentioned: string[] = [];
  if (handles.length) {
    const { data: people } = await sb
      .from("profiles").select("id, full_name").eq("org_id", chat.org_id);
    mentioned = (people ?? [])
      .filter((p) =>
        handles.some((h) => (p.full_name ?? "").toLowerCase().replace(/\s+/g, "").includes(h))
      )
      .map((p) => p.id);
  }

  const { data, error } = await sb
    .from("internal_notes")
    .insert({
      org_id: chat.org_id,
      chat_id: chatId,
      lead_id: leadId ?? null,
      author_id: user.id,
      body,
      mentioned_ids: mentioned,
    })
    .select("id, body, created_at, mentioned_ids")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, note: data });
}
