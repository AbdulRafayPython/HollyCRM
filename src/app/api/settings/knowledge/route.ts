import { after, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { processSource, type SourceRow } from "@/lib/knowledge/ingest";
import { toSheetCsvUrl } from "@/lib/knowledge/parse";

export const runtime = "nodejs";

/**
 * Settings → Knowledge. What the agent is allowed to know.
 *
 * Two kinds of source land here and they are kept strictly apart:
 * `inventory` sources become STAGED rate rows a supervisor reviews and commits,
 * and `knowledge` sources become retrievable text the composer may quote for
 * non-price questions. Parsing runs in `after()` so a large PDF does not hold
 * the upload request open.
 *
 * Every write is supervisor-only, enforced by the RLS policies in 0019 rather
 * than by a role check here — the anon client carries the caller's identity, so
 * a non-supervisor's insert simply returns no row.
 */

const MAX_BYTES = 25 * 1024 * 1024;

const KIND_BY_MIME: Record<string, SourceRow["kind"]> = {
  "application/pdf": "pdf",
  "text/csv": "csv",
  "application/vnd.ms-excel": "csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/plain": "text",
  "text/markdown": "text",
};

export async function GET() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: sources } = await sb
    .from("knowledge_sources")
    .select(
      "id, purpose, kind, title, storage_path, source_url, status, error, byte_size, chunk_count, row_count, last_synced_at, is_active, created_at"
    )
    .order("created_at", { ascending: false });

  return NextResponse.json({ sources: sources ?? [] });
}

export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: me } = await sb.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
  if (!me) return NextResponse.json({ error: "no profile" }, { status: 403 });

  const contentType = req.headers.get("content-type") ?? "";
  const isUpload = contentType.includes("multipart/form-data");

  let insert: Record<string, unknown>;
  let uploadPath: string | null = null;
  let bytes: Uint8Array | null = null;
  let uploadMime = "";

  if (isUpload) {
    const form = await req.formData();
    const file = form.get("file");
    const purpose = String(form.get("purpose") ?? "knowledge");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file received." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `That file is ${(file.size / 1048576).toFixed(1)} MB. The limit is 25 MB.` },
        { status: 400 }
      );
    }

    uploadMime = file.type || "application/octet-stream";
    const kind = KIND_BY_MIME[uploadMime] ?? kindFromName(file.name);
    if (!kind) {
      return NextResponse.json(
        { error: "Unsupported file type. Upload a PDF, CSV, Excel file, or plain text." },
        { status: 400 }
      );
    }
    if (purpose === "inventory" && kind === "pdf") {
      // Deliberate. Extracting a table from a PDF's text layer produces rows
      // that look plausible and have columns shifted by one, and those rows
      // become live prices. A rate sheet must arrive as a sheet.
      return NextResponse.json(
        {
          error:
            "PDFs can't be imported as priced inventory — column alignment is not recoverable from a PDF reliably enough to quote from. Upload the rate sheet as CSV/Excel or link the Google Sheet. (A PDF is fine as a knowledge document.)",
        },
        { status: 400 }
      );
    }

    bytes = new Uint8Array(await file.arrayBuffer());
    uploadPath = `${me.org_id}/${crypto.randomUUID()}-${safeName(file.name)}`;

    insert = {
      org_id: me.org_id,
      purpose,
      kind,
      title: String(form.get("title") ?? "").trim() || file.name,
      storage_path: uploadPath,
      byte_size: file.size,
      created_by: user.id,
    };
  } else {
    const body = (await req.json()) as {
      purpose?: string; title?: string; url?: string; text?: string;
    };
    const purpose = body.purpose === "inventory" ? "inventory" : "knowledge";

    if (body.url?.trim()) {
      const url = body.url.trim();
      if (!/^https?:\/\//i.test(url)) {
        return NextResponse.json({ error: "Link must start with http:// or https://" }, { status: 400 });
      }
      insert = {
        org_id: me.org_id,
        purpose,
        kind: toSheetCsvUrl(url) ? "gsheet" : "csv",
        title: body.title?.trim() || titleFromUrl(url),
        source_url: url,
        created_by: user.id,
      };
    } else if (body.text?.trim()) {
      if (purpose === "inventory") {
        return NextResponse.json(
          { error: "Pasted notes are knowledge, not priced inventory. Use a sheet for rates." },
          { status: 400 }
        );
      }
      insert = {
        org_id: me.org_id,
        purpose: "knowledge",
        kind: "text",
        title: body.title?.trim() || "Note",
        raw_text: body.text.trim().slice(0, 200_000),
        byte_size: body.text.length,
        created_by: user.id,
      };
    } else {
      return NextResponse.json({ error: "Provide a file, a link, or some text." }, { status: 400 });
    }
  }

  // The row is created through the caller's client so RLS decides whether they
  // may. Everything after this point uses the admin client, because the
  // background parse has no session.
  const { data: source, error } = await sb
    .from("knowledge_sources")
    .insert(insert as never)
    .select("id, org_id, purpose, kind, title, storage_path, source_url, raw_text")
    .single();

  if (error || !source) {
    return NextResponse.json(
      {
        error: /row-level security/i.test(error?.message ?? "")
          ? "Only a supervisor can add sources."
          : error?.message ?? "Could not save the source.",
      },
      { status: 403 }
    );
  }

  if (bytes && uploadPath) {
    const { error: upErr } = await supabaseAdmin()
      .storage.from("knowledge")
      .upload(uploadPath, bytes, { contentType: uploadMime, upsert: false });
    if (upErr) {
      // Roll the row back rather than leaving a source that can never parse —
      // a permanently "failed" row with no file behind it is a support ticket.
      await supabaseAdmin().from("knowledge_sources").delete().eq("id", source.id);
      return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 400 });
    }
  }

  after(async () => {
    await processSource(source as SourceRow);
  });

  return NextResponse.json({ ok: true, id: source.id, status: "processing" });
}

/** Re-sync, toggle, or commit a staged inventory import. */
export async function PATCH(req: Request) {
  const body = (await req.json()) as {
    action?: "toggle" | "resync" | "commit";
    id?: string;
    is_active?: boolean;
  };

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  if (body.action === "toggle") {
    const { data, error } = await sb
      .from("knowledge_sources")
      .update({ is_active: Boolean(body.is_active) })
      .eq("id", body.id)
      .select("id")
      .maybeSingle();
    if (error || !data) {
      return NextResponse.json({ error: "Not found, or supervisors only." }, { status: 403 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "resync") {
    // Read through the caller's client: RLS is what confirms they may touch
    // this row before the admin client does the work.
    const { data: source } = await sb
      .from("knowledge_sources")
      .select("id, org_id, purpose, kind, title, storage_path, source_url, raw_text")
      .eq("id", body.id)
      .maybeSingle();
    if (!source) return NextResponse.json({ error: "Not found." }, { status: 404 });

    await supabaseAdmin()
      .from("knowledge_sources")
      .update({ status: "processing", error: null })
      .eq("id", body.id);

    after(async () => {
      await processSource(source as SourceRow);
    });
    return NextResponse.json({ ok: true, status: "processing" });
  }

  if (body.action === "commit") {
    const { data: allowed } = await sb
      .from("knowledge_sources")
      .select("id, purpose")
      .eq("id", body.id)
      .maybeSingle();
    if (!allowed) return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (allowed.purpose !== "inventory") {
      return NextResponse.json({ error: "Only inventory imports can be committed." }, { status: 400 });
    }

    // One transaction in SQL. Row-by-row over HTTP would leave a half-imported
    // hotel behind on the first rate overlap, with no way to tell which half.
    const { data, error } = await supabaseAdmin().rpc("commit_inventory_import", {
      p_source_id: body.id,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, result: data });
  }

  return NextResponse.json({ error: "action must be toggle | resync | commit" }, { status: 400 });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: source } = await sb
    .from("knowledge_sources")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();

  // Chunks and staged rows cascade from the FK; the stored object does not.
  const { data, error } = await sb
    .from("knowledge_sources")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "Not found, or supervisors only." }, { status: 403 });
  }

  if (source?.storage_path) {
    await supabaseAdmin().storage.from("knowledge").remove([source.storage_path]);
  }
  return NextResponse.json({ ok: true });
}

function kindFromName(name: string): SourceRow["kind"] | null {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "pdf";
  if (ext === "csv") return "csv";
  if (ext === "xlsx" || ext === "xls") return "xlsx";
  if (ext === "txt" || ext === "md") return "text";
  return null;
}

/** Storage keys must not carry a customer's original filename verbatim —
 *  spaces, quotes and non-ASCII all break signed URLs in different ways. */
function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-60);
}

function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.includes("docs.google.com") ? "Google Sheet" : u.hostname;
  } catch {
    return "Linked source";
  }
}
