import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { LEAD_STAGES, type LeadStage } from "@/lib/types";

export const runtime = "nodejs";

/** Move a lead through the pipeline. The stage-change trigger logs it for analytics. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const { leadId } = await params;
  const body = (await req.json()) as { stage?: LeadStage; drop_reason?: string };

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (body.stage && !LEAD_STAGES.includes(body.stage)) {
    return NextResponse.json({ error: "invalid stage" }, { status: 400 });
  }
  // §3.1 makes this mandatory; the DB constraint enforces it too, but a clear
  // message beats a raw constraint violation in the UI.
  if (body.stage === "closed_lost" && !body.drop_reason?.trim()) {
    return NextResponse.json(
      { error: "drop_reason is required when closing a lead as lost" },
      { status: 400 }
    );
  }

  const { data, error } = await sb
    .from("leads")
    .update({
      ...(body.stage ? { stage: body.stage } : {}),
      ...(body.drop_reason !== undefined ? { drop_reason: body.drop_reason } : {}),
    })
    .eq("id", leadId)
    .select("id, stage, drop_reason")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ ok: true, ...data });
}
