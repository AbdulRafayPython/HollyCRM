"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Avatar from "./ui/Avatar";
import Icon, { type IconName } from "./ui/Icon";
import { usePresence } from "./WorkspaceContext";

export interface ProfileUser {
  name?: string | null;
  email?: string | null;
  /** Profile photo; falls back to initials. */
  avatar?: string | null;
}

const ITEMS: { href: string; icon: IconName; label: string }[] = [
  { href: "/settings", icon: "user", label: "My profile" },
  { href: "/settings/whatsapp", icon: "hub", label: "Integration marketplace" },
];

export default function ProfileMenu({
  user,
  collapsed = false,
}: {
  user?: ProfileUser;
  collapsed?: boolean;
}) {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { presence, setPresence } = usePresence();

  const name = user?.name?.trim() || null;
  const email = user?.email?.trim() || null;
  const avatar = user?.avatar ?? null;

  /* Click-away and Escape */
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /* Navigating away closes popover */
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div ref={wrapRef} className="relative w-full z-40">
      {collapsed ? (
        /* Collapsed Mode: Icon-only Avatar button */
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          title={name ?? "Account"}
          className={`flex w-full items-center justify-center rounded-xl p-1.5 transition-colors duration-150 ${
            open ? "bg-chalk ring-2 ring-brand/30" : "hover:bg-chalk"
          }`}
        >
          <span className="relative rounded-full">
            <Avatar name={name} type="agent" size={32} src={avatar} />
            <span
              aria-hidden
              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white transition-colors duration-200 ${
                presence === "available" ? "bg-wa" : "bg-subtle"
              }`}
            />
          </span>
        </button>
      ) : (
        /* Expanded Mode: Full width card */
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className={`flex w-full items-center justify-between gap-2.5 rounded-xl p-2 text-left transition-colors duration-150 ${
            open ? "bg-brand-soft/80 ring-1 ring-brand/20" : "hover:bg-chalk/80"
          }`}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="relative shrink-0 rounded-full">
              <Avatar name={name} type="agent" size={32} src={avatar} />
              <span
                aria-hidden
                className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white transition-colors duration-200 ${
                  presence === "available" ? "bg-wa" : "bg-subtle"
                }`}
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-ink">
                {name ?? "Account"}
              </p>
              <p className="truncate text-[11px] font-medium text-subtle">
                {email ?? "user@workspace"}
              </p>
            </div>
          </div>
          <Icon
            name="chevronDown"
            size={14}
            className={`shrink-0 text-subtle transition-transform duration-200 ${
              open ? "rotate-180 text-brand" : ""
            }`}
          />
        </button>
      )}

      {/* Popover Menu */}
      {open && (
        <div
          role="menu"
          aria-label="Account"
          className={`absolute z-50 overflow-hidden rounded-2xl border border-edge/90 bg-white shadow-2xl ring-1 ring-ink/10 animate-rise-in ${
            collapsed
              ? "bottom-0 left-full ml-3 w-64 origin-bottom-left"
              : "bottom-full left-0 mb-2 w-full origin-bottom-left"
          }`}
        >
          <div className="flex items-center gap-2.5 border-b border-edge bg-surface/50 px-3.5 py-3">
            <Avatar name={name} type="agent" size={34} src={avatar} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-ink">
                {name ?? "Account"}
              </p>
              {email && <p className="truncate text-[11px] text-subtle">{email}</p>}
            </div>
          </div>

          {/* Availability Toggle */}
          <div className="border-b border-edge p-2.5">
            <div className="mb-1.5 flex items-center justify-between px-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-subtle">Availability</span>
              <span
                className={`text-[11px] font-bold ${
                  presence === "available" ? "text-wa-dark" : "text-subtle"
                }`}
              >
                {presence === "available" ? "Taking chats" : "Away / Paused"}
              </span>
            </div>
            <div className="flex gap-1 rounded-xl bg-chalk p-1">
              {(["available", "away"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={presence === value}
                  onClick={() => setPresence(value)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-all duration-150 ${
                    presence === value
                      ? "bg-white text-ink shadow-xs"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      value === "available" ? "bg-wa" : "bg-subtle"
                    }`}
                  />
                  {value === "available" ? "Available" : "Away"}
                </button>
              ))}
            </div>
          </div>

          {/* Links */}
          <div className="p-1.5">
            {ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-ink-soft transition hover:bg-brand-soft hover:text-brand"
              >
                <Icon name={item.icon} size={16} className="text-subtle" />
                {item.label}
              </Link>
            ))}
          </div>

          {/* Logout */}
          <div className="border-t border-edge p-1.5">
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                role="menuitem"
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-danger transition hover:bg-danger-soft"
              >
                <Icon name="logout" size={15} />
                Log out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
