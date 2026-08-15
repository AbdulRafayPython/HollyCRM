import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { asProvider, explainSendError, sendFileByUrl } from "@/lib/wa/send";
import { MEDIA_BUCKET, MEDIA_URL_TTL_S, extensionForMime } from "@/lib/media";
import { RemuxError, webmToOgg } from "@/lib/audio/webmToOgg";

export const runtime = "nodejs";

/** Five minutes of Opus sits far under this; the cap is a guard, not a budget. */
const MAX_BYTES = 16 * 1024 * 1024;

/**
 * Agent records a voice message in the CRM and it goes out over WhatsApp.
 *
 * Same shape as the documents route: the recording lands in the PRIVATE bucket
 * and Green API is handed a short-lived signed URL, so the audio is never
 * published at a permanent public address. The message row is written only
 * after the gateway accepts it — a bubble in the thread means it actually left.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;

  const sb = await supabaseServer();
  const [{ data: { user } }, { data: chat }] = await Promise.all([
    sb.auth.getUser(),
    sb.from("chats").select("id, org_id, chat_jid, provider").eq("id", chatId).maybeSingle(),
  ]);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!chat) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const form = await req.formData();
  const audio = form.get("audio");
  const leadId = (form.get("leadId") as string) || null;
  const seconds = Number(form.get("seconds") ?? 0);

  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: "no recording received" }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json({ error: "recording too large" }, { status: 413 });
  }

  const recordedMime = audio.type || "audio/webm";
  if (!recordedMime.startsWith("audio/")) {
    return NextResponse.json({ error: "not an audio recording" }, { status: 415 });
  }

  /*
   * The gateway resolves a file's type from the fileName extension first and the
   * URL's Content-Type header second, and rejects what it does not like before
   * the message ever reaches WhatsApp ("mime type <x> is not supported"). Ogg is
   * the one audio container it takes consistently, and it happens to be what
   * WhatsApp uses for its own voice notes — so everything is normalised to Ogg.
   *
   * Chromium and Firefox produce Opus in a WebM container, which is the same
   * Opus payload Ogg carries; rewrapping is a byte-for-byte copy with no
   * re-encode. Safari produces AAC in MP4, which is a different codec and cannot
   * be rewrapped — see below.
   */
  let bytes = new Uint8Array(await audio.arrayBuffer());
  let mime = recordedMime;

  if (recordedMime.startsWith("audio/webm")) {
    try {
      bytes = webmToOgg(bytes);
      mime = "audio/ogg";
    } catch (err) {
      const detail = err instanceof RemuxError ? err.message : "unrecognised recording format";
      return NextResponse.json(
        { error: `Could not prepare the recording for WhatsApp: ${detail}` },
        { status: 422 }
      );
    }
  } else if (/^audio\/(mp4|m4a|x-m4a|aac)/.test(recordedMime)) {
    /*
     * Only Safari lands here, and only because its MediaRecorder offers nothing
     * else. The gateway rejects this recording ("mime type audio/mp4 is not
     * supported") no matter what extension we put on it, and turning AAC into
     * Opus needs a real decode-and-re-encode, not a remux. Fail here with
     * something an agent can act on rather than letting the send die at the
     * gateway with a MIME string in it.
     */
    return NextResponse.json(
      {
        error:
          "Safari records voice notes in a format WhatsApp's gateway rejects " +
          "(audio/mp4). Record this message in Chrome, Edge or Firefox instead.",
      },
      { status: 415 }
    );
  } else if (!/^audio\/(ogg|mpeg|mp3)/.test(recordedMime)) {
    return NextResponse.json(
      { error: `WhatsApp does not accept ${recordedMime} recordings.` },
      { status: 415 }
    );
  }

  const db = supabaseAdmin();
  // Both gateways resolve the file type from the fileName extension first
  // (WasenderAPI picks its audioUrl/documentUrl field from it), so the extension
  // has to match what we actually built, not what was recorded.
  const ext = extensionForMime(mime);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `voice-message-${stamp}.${ext}`;
  const path = `${chat.org_id}/${chatId}/${fileName}`;

  const { error: upErr } = await db.storage
    .from(MEDIA_BUCKET)
    .upload(path, bytes, { contentType: mime });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  const { data: signed } = await db.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(path, 900);
  if (!signed?.signedUrl) {
    return NextResponse.json({ error: "could not sign the recording" }, { status: 500 });
  }

  let waId: string | null = null;
  try {
    const res = await sendFileByUrl(
      asProvider(chat.provider), chat.org_id, chat.chat_jid, signed.signedUrl, fileName
    );
    waId = res?.idMessage ?? null;
  } catch (err) {
    const explained = explainSendError(err);
    if (explained) {
      const { message, status, ...rest } = explained;
      return NextResponse.json({ error: message, ...rest }, { status });
    }
    // The object is already in the bucket; drop it so a failed send doesn't
    // leave an orphan no row will ever point at.
    await db.storage.from(MEDIA_BUCKET).remove([path]).catch(() => {});
    return NextResponse.json({ error: `send failed: ${err}` }, { status: 502 });
  }

  const { data: message } = await db
    .from("messages")
    .insert({
      org_id: chat.org_id,
      chat_id: chat.id,
      lead_id: leadId,
      wa_message_id: waId,
      direction: "out",
      sender_type: "agent",
      sender_agent_id: user.id,
      message_type: "audio",
      body: null,
      media_path: path,
      media_mime: mime,
      media_name: fileName,
      wa_timestamp: new Date().toISOString(),
    })
    .select("id, chat_id, lead_id, wa_message_id, direction, sender_type, message_type, body, media_path, media_mime, media_name, reply_to_wa_message_id, wa_timestamp, delivery_status")
    .single();

  // The recorder needs a URL to play the bubble back immediately; this one is
  // the viewing link, separate from the 15-minute one handed to Green API.
  const { data: playback } = await db.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(path, MEDIA_URL_TTL_S);

  return NextResponse.json({
    ok: true,
    wa_message_id: waId,
    seconds: Number.isFinite(seconds) ? seconds : 0,
    message: message ? { ...message, media_url: playback?.signedUrl ?? null } : null,
  });
}
