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
      title={archived ? "Move back to the inbox" : "Archive this conversation"}
      className="btn-ghost rounded-full p-2"
    >
      <Icon name="archive" size={18} />
    </button>
  );
}
