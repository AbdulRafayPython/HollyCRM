import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const BUCKET = "avatars";

/**
 * Upload a profile photo.
 *
 * Uploaded through the CALLER'S session, not the service role: the storage
 * policy only allows writes under `<uid>/`, so the database — not this handler —
 * is what guarantees nobody overwrites a colleague's picture. A bug here cannot
 * widen that.
 *
 * The filename carries a timestamp because the bucket is public and therefore
 * CDN-cached; reusing one path would leave the old photo showing for everyone
 * until the cache expired.
 */
export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose an image to upload." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Images must be 2 MB or smaller." }, { status: 413 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json(
      { error: "Use a PNG, JPEG, WebP or GIF image." },
      { status: 415 }
    );
  }

  const ext = file.type.split("/")[1].replace("jpeg", "jpg");
  const path = `${user.id}/${Date.now()}.${ext}`;

  const { error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(path, new Uint8Array(await file.arrayBuffer()), {
      contentType: file.type,
      cacheControl: "3600",
    });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);

  const { data: profile, error } = await sb
    .from("profiles")
    .update({ avatar_url: pub.publicUrl })
    .eq("id", user.id)
    .select("avatar_url")
    .maybeSingle();

  if (error || !profile) {
    // Don't leave an orphan object behind when the row didn't take.
    await sb.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ error: error?.message ?? "Could not save the photo." }, { status: 400 });
  }

  // Best effort tidy-up of previous photos: this user's folder should hold one.
  const { data: existing } = await sb.storage.from(BUCKET).list(user.id);
  const stale = (existing ?? [])
    .filter((o) => `${user.id}/${o.name}` !== path)
    .map((o) => `${user.id}/${o.name}`);
  if (stale.length > 0) await sb.storage.from(BUCKET).remove(stale);

  return NextResponse.json({ ok: true, avatar_url: profile.avatar_url });
}

/** Remove the photo and fall back to initials. */
export async function DELETE() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: existing } = await sb.storage.from(BUCKET).list(user.id);
  const paths = (existing ?? []).map((o) => `${user.id}/${o.name}`);
  if (paths.length > 0) await sb.storage.from(BUCKET).remove(paths);

  const { error } = await sb
    .from("profiles")
    .update({ avatar_url: null })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, avatar_url: null });
}
