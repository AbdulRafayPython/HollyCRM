import { notFound, redirect } from "next/navigation";
import { getAuthUser, supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { MEDIA_BUCKET, MEDIA_URL_TTL_S } from "@/lib/media";
import MessageThread from "@/components/MessageThread";
import RightPanel, { type Participant } from "@/components/RightPanel";
import BotToggle from "@/components/BotToggle";
import AssignMenu, { type AgentOption } from "@/components/AssignMenu";
import ArchiveButton from "@/components/ArchiveButton";
import CloseConversation from "@/components/CloseConversation";
import Avatar from "@/components/ui/Avatar";
import Chip, { Dot } from "@/components/ui/Chip";
import type { NoteRow } from "@/components/NotesPanel";
import type { QuoteRow } from "@/components/QuotesPanel";
import { isSupervisor, type Chat, type Lead, type Message } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  const { chatId } = await params;
  const sb = await supabaseServer();

  // One parallel phase for everything keyed by chatId — auth included, since
  // RLS (not this component) is what actually guards each query. This used to
  // be four sequential round-trip phases; it is now two.
  const [
    user,
    { data: chat },
    { data: messages },
    { data: lead },
    { data: agents },
    { data: notes },
    { data: rawParticipants },
  ] = await Promise.all([
    getAuthUser(),
    sb.from("chats").select("*").eq("id", chatId).maybeSingle(),
    // B7: ordered by the WhatsApp timestamp, so delayed webhooks still render
    // in the order the customer actually sent them.
    sb.from("messages")
      .select("id, chat_id, lead_id, wa_message_id, direction, sender_type, message_type, body, media_path, media_mime, media_name, reply_to_wa_message_id, wa_timestamp, delivery_status")
      .eq("chat_id", chatId)
      .order("wa_timestamp", { ascending: true })
      .limit(200),
    sb.from("leads")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb.from("profiles").select("id, full_name, role").eq("is_active", true).order("full_name"),
    sb.from("internal_notes")
      .select("id, body, created_at, author:profiles!internal_notes_author_id_fkey(full_name)")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: false })
      .limit(50),
    sb.from("chat_participants")
      .select("contact_id, is_admin, contacts(display_name, phone_e164)")
      .eq("chat_id", chatId)
      .limit(200),
  ]);
  if (!user) redirect("/login");
  if (!chat) notFound();

  // Second phase: the two queries that depend on phase-one results.
  const [{ data: me }, { data: quotes }] = await Promise.all([
    sb.from("profiles").select("id, role").eq("id", user.id).maybeSingle(),
    sb.from("quotes")
      .select("id, by_bot, total_amount, currency, sent_at, created_at, payload")
      .eq("lead_id", lead?.id ?? "00000000-0000-0000-0000-000000000000")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const participants: Participant[] = (rawParticipants ?? []).map((p) => {
    const c = p.contacts as unknown as { display_name: string | null; phone_e164: string | null } | null;
    return {
      contact_id: p.contact_id,
      is_admin: p.is_admin,
      display_name: c?.display_name ?? null,
      phone: c?.phone_e164 ?? null,
    };
  });

  const supervisor = isSupervisor(me?.role);
  const isGroup = chat.chat_type === "group";
  const phone = chat.chat_jid.split("@")[0];

  // Sign attachments server-side so a thread of voice notes and passports paints
  // complete on first render. The client re-signs what arrives afterwards and
  // before these expire — see MessageThread. RLS already scoped the rows above,
  // and the service role touches storage only.
  const rows = (messages ?? []) as Message[];
  const storagePaths = rows
    .map((m) => m.media_path)
    .filter((p): p is string => Boolean(p) && !p!.startsWith("http"));

  let signedByPath: Record<string, string> = {};
  if (storagePaths.length > 0) {
    const admin = supabaseAdmin();
    const signed = await Promise.all(
      Array.from(new Set(storagePaths)).map(async (path) => {
        const { data } = await admin.storage
          .from(MEDIA_BUCKET)
          .createSignedUrl(path, MEDIA_URL_TTL_S);
        return [path, data?.signedUrl ?? null] as const;
      })
    );
    signedByPath = Object.fromEntries(signed.filter(([, url]) => url)) as Record<string, string>;
  }

  const withMediaUrls: Message[] = rows.map((m) =>
    m.media_path && signedByPath[m.media_path]
      ? { ...m, media_url: signedByPath[m.media_path] }
      : m
  );

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-edge bg-card px-6">
          <Avatar name={chat.title} type={isGroup ? "group" : "direct"} />

          <div className="min-w-0">
            <h1 className="truncate text-h3 text-ink">{chat.title ?? `+${phone}`}</h1>
            <p className="flex items-center gap-1.5 text-caption text-muted">
              <Dot tone={isGroup ? "group" : "wa"} />
              {isGroup
                ? `WhatsApp group · ${chat.participant_count} participants`
                : `+${phone} · WhatsApp`}
            </p>
          </div>

          {chat.is_archived && <Chip tone="neutral">Archived</Chip>}

          <div className="ml-auto flex items-center gap-2">
            <AssignMenu
              chatId={chat.id}
              assignedTo={chat.assigned_agent_id}
              currentUserId={user.id}
              agents={(agents ?? []) as AgentOption[]}
              isSupervisor={supervisor}
            />
            <BotToggle chatId={chat.id} initialPaused={chat.is_bot_paused} />
            <CloseConversation
              chatId={chat.id}
              chatTitle={chat.title ?? `+${phone}`}
              isSupervisor={supervisor}
            />
            <ArchiveButton chatId={chat.id} archived={chat.is_archived} />
          </div>
        </header>

        <MessageThread
          chatId={chat.id}
          leadId={lead?.id ?? null}
          initialMessages={withMediaUrls}
        />
      </div>

      {/* RightPanel renders its own <aside> and owns its width, so collapsing
          it actually gives the space back to the thread. */}
      <RightPanel
        chat={chat as Chat}
        lead={(lead as Lead) ?? null}
        notes={(notes ?? []) as unknown as NoteRow[]}
        quotes={(quotes ?? []) as unknown as QuoteRow[]}
        participants={participants}
      />
    </div>
  );
}
