"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import HolyCrmLogo from "@/components/ui/HolyCrmLogo";
import Icon, { type IconName } from "@/components/ui/Icon";
import ProfileMenu, { type ProfileUser } from "./ProfileMenu";
import { useWorkspace } from "./WorkspaceContext";

interface NavItem {
  href: string;
  icon: IconName;
  label: string;
  badge?: number | string;
  badgeTone?: "danger" | "brand" | "wa";
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

export default function AppSidebar({
  connected,
  user,
  mobileOpen = false,
  onMobileClose,
}: {
  connected: boolean;
  user?: ProfileUser;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const pathname = usePathname() ?? "";
  const workspace = useWorkspace();
  const [collapsed, setCollapsed] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  // Read saved collapse state on desktop
  useEffect(() => {
    try {
      const saved = localStorage.getItem("holy_sidebar_collapsed");
      if (saved !== null) setCollapsed(saved === "true");
    } catch {}
  }, []);

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("holy_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  };

  // Close mobile drawer when route changes
  useEffect(() => {
    if (onMobileClose) onMobileClose();
  }, [pathname]);

  // Fetch unread count for badge
  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const res = await fetch("/api/chats?limit=20");
        if (res.ok) {
          const data = await res.json();
          const total = (data.chats ?? []).reduce(
            (acc: number, c: { unread_count?: number }) => acc + (c.unread_count || 0),
            0
          );
          setUnreadCount(total);
        }
      } catch {}
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30_000);
    return () => clearInterval(interval);
  }, []);

  const navGroups: NavGroup[] = [
    {
      title: "Overview",
      items: [
        { href: "/home", icon: "home", label: "Home" },
        { href: "/pipeline", icon: "kanban", label: "Pipeline" },
        {
          href: "/inbox",
          icon: "inbox",
          label: "Inbox",
          badge: unreadCount > 0 ? unreadCount : undefined,
          badgeTone: "danger",
        },
      ],
    },
    {
      title: "Tools",
      items: [
        { href: "/ai", icon: "bot", label: "AI Agent" },
        { href: "/ai/workflow", icon: "sparkle", label: "Workflow" },
        { href: "/ai/rules", icon: "filter", label: "Rules" },
        { href: "/settings/knowledge", icon: "file", label: "Knowledge" },
        { href: "/settings/inventory", icon: "receipt", label: "Inventory" },
      ],
    },
    {
      title: "Metrics",
      items: [
        { href: "/insights", icon: "chart", label: "Insights" },
      ],
    },
  ];

  const bottomItems: NavItem[] = [
    {
      href: "/settings/whatsapp",
      icon: "hub",
      label: "Integrations",
      badge: connected ? "Live" : "Offline",
      badgeTone: connected ? "wa" : "danger",
    },
    { href: "/settings", icon: "settings", label: "Settings" },
    { href: "/settings/team", icon: "users", label: "Team" },
  ];

  const isActive = (href: string) => {
    if (href === "/home") return pathname === "/home";
    if (href === "/insights") return pathname.startsWith("/insights") || pathname.startsWith("/analytics");
    if (href === "/settings") return pathname === "/settings";
    return pathname.startsWith(href);
  };

  const isCollapsed = collapsed && !mobileOpen;

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {mobileOpen && (
        <div
          onClick={onMobileClose}
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs md:hidden animate-fade-in"
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar Container */}
      <aside
        className={`h-full min-h-0 flex flex-col justify-between border-r border-slate-200/80 bg-white transition-all duration-300 ease-swift ${
          mobileOpen
            ? "fixed inset-y-0 left-0 z-50 w-72 shadow-2xl px-3.5 py-3.5"
            : `relative z-40 hidden md:flex shrink-0 ${isCollapsed ? "w-16 px-2 py-3" : "w-60 px-3.5 py-3.5"}`
        }`}
      >
        {/* Top Header & Brand (Fixed Height, Shrink 0) */}
        <div className="shrink-0 pb-3 border-b border-slate-100/80">
          {isCollapsed ? (
            /* Collapsed Mode: Logo Centered + Expand button below */
            <div className="flex flex-col items-center gap-2">
              <Link
                href="/home"
                className="flex items-center justify-center transition-opacity hover:opacity-90"
                title="HolyCRM Home"
              >
                <HolyCrmLogo size={30} showText={false} />
              </Link>
              <button
                onClick={toggleCollapse}
                className="flex h-5 w-5 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                title="Expand sidebar"
                aria-label="Expand sidebar"
              >
                <Icon name="chevronRight" size={13} />
              </button>
            </div>
          ) : (
            /* Expanded Mode: Full Logo, Title, and Collapse button */
            <div className="flex items-center justify-between px-1">
              <Link
                href="/home"
                onClick={onMobileClose}
                className="flex items-center gap-2.5 overflow-hidden transition-opacity hover:opacity-90"
                title="HolyCRM"
              >
                <HolyCrmLogo size={32} showText={false} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 leading-none">
                    <span className="text-base font-extrabold tracking-tight text-slate-900">
                      Holy<span className="text-purple-600">CRM</span>
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] font-medium text-slate-400">
                    {workspace.name || "workspace.holycrm.com"}
                  </p>
                </div>
              </Link>

              {mobileOpen ? (
                <button
                  onClick={onMobileClose}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors md:hidden"
                  title="Close menu"
                  aria-label="Close menu"
                >
                  <Icon name="close" size={16} />
                </button>
              ) : (
                <button
                  onClick={toggleCollapse}
                  className="hidden md:block rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                  title="Collapse sidebar"
                  aria-label="Collapse sidebar"
                >
                  <Icon name="chevronRight" size={15} className="rotate-180" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Middle Navigation Section (Scrollable, Flex 1) */}
        <nav className="scroll-thin min-h-0 flex-1 overflow-y-auto pr-1 pt-3 flex flex-col gap-3.5">
          {navGroups.map((group) => (
            <div key={group.title} className="flex flex-col gap-1">
              {!isCollapsed && (
                <span className="px-2.5 text-[10px] font-bold tracking-wider uppercase text-slate-400">
                  {group.title}
                </span>
              )}
              {group.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onMobileClose}
                    title={isCollapsed ? item.label : undefined}
                    className={`group relative flex items-center gap-3 rounded-xl px-2.5 py-2 text-xs font-semibold transition-all duration-150 ${
                      active
                        ? "bg-purple-50/80 text-purple-700 shadow-xs ring-1 ring-purple-600/15"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    } ${isCollapsed ? "justify-center px-0 py-2.5" : ""}`}
                  >
                    <span
                      className={`flex shrink-0 items-center justify-center transition-colors ${
                        active ? "text-purple-600" : "text-slate-400 group-hover:text-slate-600"
                      }`}
                    >
                      <Icon name={item.icon} size={17} />
                    </span>

                    {!isCollapsed && (
                      <>
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.badge !== undefined && (
                          <span
                            className={`flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                              item.badgeTone === "danger"
                                ? "bg-rose-500 text-white"
                                : item.badgeTone === "wa"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-purple-100 text-purple-700"
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}

                    {isCollapsed && item.badge !== undefined && (
                      <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Bottom Actions & User Profile Card (Fixed Height, Shrink 0) */}
        <div className="shrink-0 border-t border-slate-100 pt-2 pb-0.5 bg-white flex flex-col gap-0.5">
          {bottomItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onMobileClose}
                title={isCollapsed ? item.label : undefined}
                className={`group flex items-center gap-3 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-purple-50 text-purple-700 font-semibold"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                } ${isCollapsed ? "justify-center px-0" : ""}`}
              >
                <span className="text-slate-400 group-hover:text-slate-600">
                  <Icon name={item.icon} size={16} />
                </span>
                {!isCollapsed && <span className="flex-1 truncate">{item.label}</span>}
                {!isCollapsed && item.badge && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      item.badgeTone === "wa"
                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}

          {/* User Card */}
          <div className="mt-1 border-t border-slate-100 pt-1.5">
            <ProfileMenu user={user} collapsed={isCollapsed} />
          </div>
        </div>
      </aside>
    </>
  );
}
