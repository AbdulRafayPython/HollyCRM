import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthUser, supabaseServer } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import ChatList, { type ChatRow } from "@/components/ChatList";
import { ChatRowSkeleton, Skeleton } from "@/components/ui/Skeleton";
import type { Chat } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function InboxLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) redirect("/setup");

  // Top-level auth check ensures clean HTTP redirect before Suspense streaming
  const user = await getAuthUser();
  if (!user) redirect("/login");

  return (
    <div className="flex h-full">
      <aside className="z-30 w-[280px] xl:w-[300px] shrink-0 border-r border-edge/80 bg-white">
        <Suspense fallback={<ChatListFallback />}>
          <ChatListPanel currentUserId={user.id} />
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

async function ChatListPanel({ currentUserId }: { currentUserId: string }) {
  const sb = await supabaseServer();

  const [{ data: chats }, { data: recent }] = await Promise.all([
    sb
      .from("chats")
      .select("id, chat_jid, chat_type, title, participant_count, assigned_agent_id, is_bot_paused, last_message_at, unread_count, is_archived")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(200),
    sb
      .from("messages")
      .select("chat_id, body, sender_type, message_type, wa_timestamp")
      .order("wa_timestamp", { ascending: false })
      .limit(400),
  ]);

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

  return <ChatList chats={rows} currentUserId={currentUserId} />;
}
