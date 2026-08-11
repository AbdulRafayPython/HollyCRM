import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Bot pause toggle (Module 2.2). `resumeInHours` sets chats.bot_resume_at;
 * expiry is applied lazily by bot_gate() (0004) the next time a message arrives
 * — no scheduler involved, so there is no cron job to forget to enable.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;
  const { paused, resumeInHours } = (await req.json()) as {
    paused: boolean;
    resumeInHours?: number;
  };

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const resumeAt =
    paused && resumeInHours
      ? new Date(Date.now() + resumeInHours * 3_600_000).toISOString()
      : null;

  // The update policy's WITH CHECK is what stops an agent touching a chat
  // that isn't theirs — a 0-row result here means RLS refused it.
  const { data, error } = await sb
    .from("chats")
    .update({ is_bot_paused: paused, bot_resume_at: resumeAt })
    .eq("id", chatId)
    .select("id, is_bot_paused, bot_resume_at")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  return NextResponse.json({ ok: true, ...data });
}
