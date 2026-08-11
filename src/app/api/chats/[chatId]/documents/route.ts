import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendFileByUrl } from "@/lib/green/client";

export const runtime = "nodejs";

const KINDS = ["passport", "visa", "voucher", "receipt", "other"] as const;

/**
 * Upload a customer document, and optionally deliver it over WhatsApp.
 *
 * C3: the object lands in the PRIVATE `wa-media` bucket. When it has to be sent,
 * Green API is handed a 15-minute signed URL — a passport scan is never exposed
 * at a public object URL, which is what PRD v1.1's plain sendFileByUrl implied.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: chat } = await sb
    .from("chats").select("id, org_id, chat_jid").eq("id", chatId).maybeSingle();
  if (!chat) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  const kindRaw = String(form.get("kind") ?? "other");
  const send = String(form.get("send") ?? "false") === "true";
  const leadId = (form.get("leadId") as string) || null;
  const caption = (form.get("caption") as string) || undefined;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  const kind = (KINDS as readonly string[]).includes(kindRaw) ? kindRaw : "other";

  const db = supabaseAdmin();
  const safeName = file.name.replace(/[^\w.\-]/g, "_");
  const path = `${chat.org_id}/${chatId}/${Date.now()}_${safeName}`;

  const { error: upErr } = await db.storage
    .from("wa-media")
    .upload(path, new Uint8Array(await file.arrayBuffer()), {
      contentType: file.type || "application/octet-stream",
    });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  const { data: doc } = await db
    .from("documents")
    .insert({
      org_id: chat.org_id,
      lead_id: leadId,
      chat_id: chatId,
      kind,
      storage_path: path,
      uploaded_by: user.id,
    })
    .select("id, kind, storage_path, created_at")
    .single();

  if (!send) return NextResponse.json({ ok: true, document: doc, sent: false });

  // Short-lived signed URL, minted per send and never persisted.
  const { data: signed, error: signErr } = await db.storage
    .from("wa-media")
    .createSignedUrl(path, 900);
  if (signErr || !signed) {
    return NextResponse.json(
      { ok: true, document: doc, sent: false, error: "could not sign url" },
      { status: 207 }
    );
  }

  try {
    const res = await sendFileByUrl(chat.org_id, chat.chat_jid, signed.signedUrl, safeName, caption);
    await db.from("messages").insert({
      org_id: chat.org_id,
      chat_id: chatId,
      lead_id: leadId,
      wa_message_id: res?.idMessage ?? null,
      direction: "out",
      sender_type: "agent",
      sender_agent_id: user.id,
      message_type: file.type.startsWith("image/") ? "image" : "document",
      body: caption ?? null,
      media_path: path,
      media_mime: file.type || null,
      media_name: file.name,
      wa_timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: true, document: doc, sent: false, error: String(err) },
      { status: 207 }
    );
  }

  return NextResponse.json({ ok: true, document: doc, sent: true });
}

/** Signed URLs for viewing documents inside the CRM. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: docs } = await sb
    .from("documents")
    .select("id, kind, storage_path, created_at")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false });

  const db = supabaseAdmin();
  const withUrls = await Promise.all(
    (docs ?? []).map(async (d) => {
      const { data } = await db.storage.from("wa-media").createSignedUrl(d.storage_path, 900);
      return { ...d, url: data?.signedUrl ?? null };
    })
  );

  return NextResponse.json({ documents: withUrls });
}
