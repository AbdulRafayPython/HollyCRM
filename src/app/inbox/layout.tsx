import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthUser, supabaseServer } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import ChatList, { type ChatRow } from "@/components/ChatList";
import { ChatRowSkeleton, Skeleton } from "@/components/ui/Skeleton";
import type { Chat } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * The layout itself is SYNCHRONOUS — that is what makes tab switching instant.
 * It paints the sidebar frame immediately; the chat list (the only part that
 * needs the database) streams into the Suspense boundary, and the page slot
 * streams independently behind its own loading.tsx.
 */
export default function InboxLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) redirect("/setup");

  return (
    <div className="flex h-full">
      <aside className="z-30 w-[280px] xl:w-[300px] shrink-0 border-r border-slate-200/80 bg-white">
        <Suspense fallback={<ChatListFallback />}>
          <ChatListPanel />
        </Suspense>
      </aside>
      <section className="min-w-0 flex-1">{children}</section>
    </div>
  );
}

function ChatListFallback() {
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-edge p-4">
        <Skeleton className="h-9 w-full rounded-lg" />
        <div className="flex gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-6 w-16 rounded-full" />
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {Array.from({ length: 8 }, (_, i) => (
          <ChatRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

/** The old layout body, unchanged in behavior — just moved behind Suspense. */
async function ChatListPanel() {
  const sb = await supabaseServer();

  // RLS decides what comes back: own chats + the unassigned pool for agents,
  // everything in the org for supervisors. Archived rows are fetched too so the
  // Archived tab works without a second round trip. Auth runs concurrently with
  // the queries — RLS already guards them, so there is nothing to wait for.
  const [user, { data: chats }, { data: recent }] = await Promise.all([
    getAuthUser(),
    sb
      .from("chats")
      .select("id, chat_jid, chat_type, title, participant_count, assigned_agent_id, is_bot_paused, last_message_at, unread_count, is_archived")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(200),
    // Snippets: chats carries no preview column, so take the newest messages the
    // viewer is allowed to see and keep the first one per chat.
    sb
      .from("messages")
      .select("chat_id, body, sender_type, message_type, wa_timestamp")
      .order("wa_timestamp", { ascending: false })
      .limit(400),
  ]);
  if (!user) redirect("/login");

  const snippets = new Map<string, { body: string | null; sender_type: string; message_type: string }>();
  for (const m of recent ?? []) {
    if (!snippets.has(m.chat_id)) {
      snippets.set(m.chat_id, {
        body: m.body,
        sender_type: m.sender_type,
        message_type: m.message_type,
      });
    }
  }

  const rows: ChatRow[] = ((chats ?? []) as Chat[]).map((c) => ({
    ...c,
    snippet: snippets.get(c.id) ?? null,
  }));

  return <ChatList chats={rows} currentUserId={user.id} />;
}
