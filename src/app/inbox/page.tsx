import Icon from "@/components/ui/Icon";

export default function InboxEmpty() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-surface">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-edge bg-card text-muted shadow-card">
        <Icon name="chat" size={22} />
      </span>
      <p className="text-h3 text-ink">Select a conversation</p>
      <p className="text-body text-muted">Pick a chat or group from the list to start working.</p>
    </div>
  );
}
