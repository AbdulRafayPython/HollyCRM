"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon, { type IconName } from "./ui/Icon";
import ProfileMenu, { type ProfileUser } from "./ProfileMenu";

/**
 * The rail carries what people use daily.
 *
 * "AI agent" was buried under Settings alongside data cleanup and the .env
 * checklist — a section you visit twice a year. It is the thing that answers
 * every customer, it needs configuring before the product does anything useful,
 * and it belongs where someone will actually find it.
 */
const NAV: { href: string; icon: IconName; label: string }[] = [
  { href: "/inbox", icon: "inbox", label: "Inbox" },
  { href: "/pipeline", icon: "kanban", label: "Pipeline" },
  { href: "/ai", icon: "bot", label: "AI agent" },
  { href: "/analytics", icon: "chart", label: "Analytics" },
  { href: "/settings", icon: "settings", label: "Settings" },
];

/**
 * 64px rail. Charcoal ground, mint active state — violet has too little contrast
 * against #0F172A to carry the active marker on its own.
 */
export default function NavRail({ connected, user }: { connected: boolean; user?: ProfileUser }) {
  const pathname = usePathname() ?? "";

  return (
    <nav className="z-40 flex w-16 shrink-0 flex-col items-center justify-between bg-ink py-4">
      <div className="flex w-full flex-col items-center gap-6">
        <Link
          href="/inbox"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-lg font-bold text-wa"
          title="HolyCRM"
        >
          H
        </Link>

        <div className="flex w-full flex-col gap-1">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={`relative flex flex-col items-center gap-1 py-2.5 transition-colors duration-150 ease-swift ${
                  active ? "text-wa" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                }`}
              >
                {active && <span className="absolute left-0 top-1 h-[calc(100%-8px)] w-0.5 rounded-r bg-wa" />}
                <span className="relative">
                  <Icon name={item.icon} size={20} />
                  {item.href === "/inbox" && connected && (
                    <span className="absolute -right-1 -top-0.5 h-1.5 w-1.5 rounded-full bg-wa ring-2 ring-ink" />
                  )}
                </span>
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="flex w-full flex-col items-center gap-2">
        <Link
          href="/setup"
          title="Environment setup (.env checklist)"
          className={`flex flex-col items-center gap-1 py-2.5 transition-colors duration-150 ease-swift ${
            pathname.startsWith("/setup")
              ? "text-wa"
              : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
          }`}
        >
          <Icon name="bolt" size={20} />
          <span className="text-[10px] font-medium">Env</span>
        </Link>
        <div className="w-full border-t border-white/10 pt-2">
          <ProfileMenu user={user} />
        </div>
      </div>
    </nav>
  );
}
