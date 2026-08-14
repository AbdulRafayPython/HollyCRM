"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "./ui/Icon";

export default function ArchiveButton({
  chatId,
  archived,
}: {
  chatId: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const res = await fetch(`/api/chats/${chatId}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: !archived }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      type="button"
      title={archived ? "Move back to inbox" : "Archive conversation"}
      className="rounded-xl border border-edge bg-white p-1.5 text-muted hover:bg-surface hover:text-ink transition shadow-2xs shrink-0 disabled:opacity-50"
    >
      <Icon name="archive" size={15} />
    </button>
  );
}
