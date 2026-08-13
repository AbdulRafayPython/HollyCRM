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
  { href: "/profile", icon: "user", label: "My profile" },
  { href: "/settings", icon: "settings", label: "Settings" },
];

/**
 * Account button pinned to the foot of the rail. The rail is icon-only at 64px,
 * so identity lives in the avatar and the name is deferred to the popover —
 * a truncated name in a 64px column reads as noise.
 *
 * Fed by the shell's identity poll, so the photo and name here are the ones the
 * person set in My profile. With no props it degrades to a generic button
 * rather than rendering an empty circle.
 */
export default function ProfileMenu({ user }: { user?: ProfileUser }) {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { presence, setPresence } = usePresence();

  const name = user?.name?.trim() || null;
  const email = user?.email?.trim() || null;
  const avatar = user?.avatar ?? null;

  /* Click-away and Escape. Escape returns focus to the trigger so keyboard
     users are not dropped at the top of the document. */
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

  /* Navigating away must not leave the popover hanging over the new page. */
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div ref={wrapRef} className="relative w-full px-2">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={name ?? "Account"}
        className={`flex w-full items-center justify-center rounded-lg py-2 transition-colors duration-150 ease-swift ${
          open ? "bg-white/10" : "hover:bg-white/5"
        }`}
      >
        <span
          className={`relative rounded-full transition-shadow duration-150 ease-swift ${
            open ? "ring-2 ring-wa ring-offset-2 ring-offset-ink" : ""
          }`}
        >
          <Avatar name={name} type="agent" size={32} src={avatar} />
          {/* Presence dot on the avatar. An agent has to be able to tell, from
              any screen, whether the router is currently sending them work —
              otherwise "why am I getting no chats?" has no visible answer. */}
          <span
            aria-hidden
            className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-ink transition-colors duration-200 ease-swift ${
              presence === "available" ? "bg-wa" : "bg-subtle"
            }`}
          />
        </span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute bottom-0 left-full z-50 ml-2 w-56 origin-bottom-left animate-rise-in overflow-hidden rounded-xl border border-edge bg-card shadow-pop"
        >
          <div className="flex items-center gap-2.5 border-b border-edge px-3 py-2.5">
            <Avatar name={name} type="agent" size={32} src={avatar} />
            <span className="min-w-0">
              <span className="block truncate text-body font-semibold text-ink">
                {name ?? "Account"}
              </span>
              {email && <span className="block truncate text-meta text-muted">{email}</span>}
            </span>
          </div>

          {/* Availability sits above navigation because it is the item with a
              live consequence: while Away, the router routes around you. */}
          <div className="border-b border-edge p-2">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-caption font-medium text-muted">Availability</span>
              <span className={`text-caption font-medium ${presence === "available" ? "text-wa-dark" : "text-subtle"}`}>
                {presence === "available" ? "Taking chats" : "Not taking chats"}
              </span>
            </div>
            <div className="flex gap-1 rounded-lg bg-surface p-1">
              {(["available", "away"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={presence === value}
                  onClick={() => setPresence(value)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-caption font-medium transition-all duration-200 ease-swift ${
                    presence === value
                      ? "bg-card text-ink shadow-card"
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

          <div className="p-1">
            {ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                className="flex items-center gap-2.5 rounded px-2.5 py-2 text-body text-ink transition-colors duration-150 ease-swift hover:bg-surface"
              >
                <Icon name={item.icon} size={16} className="text-muted" />
                {item.label}
              </Link>
            ))}
          </div>

          <div className="border-t border-edge p-1">
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                role="menuitem"
                className="flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-body text-danger transition-colors duration-150 ease-swift hover:bg-danger-soft"
              >
                <Icon name="logout" size={16} />
                Log out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
