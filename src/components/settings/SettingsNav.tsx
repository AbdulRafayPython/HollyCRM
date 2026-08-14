"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon, { type IconName } from "@/components/ui/Icon";

interface SettingsGroup {
  title: string;
  items: {
    href: string;
    label: string;
    icon?: IconName;
    badge?: string;
  }[];
}

export default function SettingsNav() {
  const pathname = usePathname() ?? "";

  const groups: SettingsGroup[] = [
    {
      title: "Profile",
      items: [
        { href: "/settings", label: "Profile settings", icon: "user" },
      ],
    },
    {
      title: "Integrations & channels",
      items: [
        { href: "/settings/whatsapp", label: "Integration marketplace", icon: "hub" },
      ],
    },
    {
      title: "Workspace & Alerts",
      items: [
        { href: "/settings/notifications", label: "Notification settings", icon: "bell" },
        { href: "/settings/team", label: "User management", icon: "users" },
        { href: "/settings/data", label: "Data cleanup", icon: "archive" },
      ],
    },
    {
      title: "AI & Concierge",
      items: [
        { href: "/settings/ai", label: "AI settings", icon: "bot" },
        { href: "/settings/knowledge", label: "AI knowledge sources", icon: "file" },
        { href: "/settings/inventory", label: "Hotel inventory", icon: "receipt" },
        { href: "/settings/llm", label: "Model & API keys", icon: "lock" },
        { href: "/settings/routing", label: "Routing & coverage", icon: "users" },
      ],
    },
  ];

  const isActive = (href: string) => {
    if (href === "/settings") return pathname === "/settings" || pathname === "/profile";
    return pathname === href;
  };

  return (
    <aside className="w-60 shrink-0 border-r border-edge/80 bg-surface flex flex-col justify-between p-4 overflow-y-auto scroll-thin">
      <div className="space-y-6">
        <div>
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-subtle px-2">
            Settings
          </h2>
        </div>

        <nav className="space-y-5">
          {groups.map((group) => (
            <div key={group.title} className="space-y-1">
              <span className="block px-2 text-[11px] font-semibold text-subtle">
                {group.title}
              </span>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-xs font-semibold transition-all ${
                        active
                          ? "bg-brand-soft/80 text-brand shadow-2xs"
                          : "text-muted hover:bg-edge/60 hover:text-ink"
                      }`}
                    >
                      <span className="truncate">{item.label}</span>
                      {item.badge && (
                        <span className="rounded-md bg-wa-soft px-1.5 py-0.5 text-[9px] font-bold text-wa-dark ring-1 ring-wa-dark/20">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      <div className="pt-4 border-t border-edge/60 px-2">
        <Link
          href="/home"
          className="flex items-center gap-2 text-xs font-semibold text-muted hover:text-brand transition"
        >
          <Icon name="home" size={14} />
          <span>Back to Home</span>
        </Link>
      </div>
    </aside>
  );
}
