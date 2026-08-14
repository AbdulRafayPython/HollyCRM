import Icon from "@/components/ui/Icon";

export default function InboxEmpty() {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-surface p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-edge/80 bg-white text-wa-dark shadow-sm">
        <Icon name="chat" size={28} />
      </div>
      <h2 className="mt-4 text-base font-extrabold tracking-tight text-ink">
        Select a conversation
      </h2>
      <p className="mt-1 max-w-sm text-xs text-subtle leading-relaxed">
        Choose a direct chat or negotiation group from the sidebar to reply, review hotel quotes, or manage lead stage progression.
      </p>
    </div>
  );
}
