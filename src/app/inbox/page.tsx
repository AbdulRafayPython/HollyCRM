import Icon from "@/components/ui/Icon";

export default function InboxEmpty() {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-[#F8FAFC] p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-slate-200/80 bg-white text-emerald-600 shadow-sm">
        <Icon name="chat" size={28} />
      </div>
      <h2 className="mt-4 text-base font-extrabold tracking-tight text-slate-900">
        Select a conversation
      </h2>
      <p className="mt-1 max-w-sm text-xs text-slate-400 leading-relaxed">
        Choose a direct chat or negotiation group from the sidebar to reply, review hotel quotes, or manage lead stage progression.
      </p>
    </div>
  );
}
