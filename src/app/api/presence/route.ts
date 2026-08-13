import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Agent presence: the heartbeat, and the Available/Away switch.
 *
 * Called on the shell's existing 60-second poll rather than on a timer of its
 * own — the presence timeout is 120s by default, so one missed tick is
 * tolerated and two mark the agent offline. A second interval would double the
 * request rate to say the same thing.
 *
 * The heartbeat is what makes availability honest. A manual switch alone cannot
 * tell that someone closed their laptop and went home, and that is the case
 * that hurts: the router assigns them a chat and the customer waits on a person
 * who is not there.
 */
export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // An empty body is a plain heartbeat. Only an explicit value flips the switch,
  // so a poll can never silently bring someone back from Away.
  const body = await req.json().catch(() => ({}));
  const requested = (body as { presence?: string }).presence;
  const presence =
    requested === "available" || requested === "away" ? requested : undefined;

  const { data, error } = await sb
    .from("profiles")
    .update({
      last_seen_at: new Date().toISOString(),
      ...(presence ? { presence } : {}),
    })
    .eq("id", user.id)
    .select("presence, last_seen_at")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "not found" }, { status: 400 });
  }

  return NextResponse.json({
    presence: data.presence,
    last_seen_at: data.last_seen_at,
  });
}

/** Who is available right now — powers the routing settings preview. */
export async function GET() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // available_agents is the single definition of "can take a chat" — the router
  // reads the same view, so this preview cannot drift from what actually happens.
  const { data: agents } = await sb
    .from("available_agents")
    .select("id, full_name, role, presence, is_online, open_chats, max_open_chats")
    .order("full_name");

  const { data: me } = await sb
    .from("profiles")
    .select("presence")
    .eq("id", user.id)
    .maybeSingle();

  return NextResponse.json({
    presence: me?.presence ?? "available",
    agents: agents ?? [],
    online: (agents ?? []).filter((a) => a.is_online).length,
  });
}
