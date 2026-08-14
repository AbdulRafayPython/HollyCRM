"use client";

import Image from "next/image";
import { useState } from "react";
import Icon, { type IconName } from "@/components/ui/Icon";

/** Official multi-colour Google G. Inline — no external asset, CSP-safe. */
export function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/**
 * Google is the only OAuth provider configured in Supabase, so it gets one
 * full-width button rather than sitting in a row of icon buttons beside
 * providers that would fail the moment anyone pressed them.
 */
export function GoogleButton({
  onClick,
  busy,
  label,
}: {
  onClick: () => void;
  busy: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="auth-control flex w-full items-center justify-center gap-3 rounded-xl border border-edge bg-card
                 text-body font-medium text-ink shadow-card transition duration-150 ease-swift
                 hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40
                 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <GoogleG />
      {busy ? "Opening Google…" : label}
    </button>
  );
}

export function OrDivider() {
  return (
    <div className="my-[var(--auth-step,1.25rem)] flex items-center gap-3 text-caption text-subtle">
      <span className="h-px flex-1 bg-edge" />
      or
      <span className="h-px flex-1 bg-edge" />
    </div>
  );
}

/**
 * The branding panel is desktop-only, so small screens would otherwise never
 * see the product at all. This carries one of the same three renders on the
 * same graphite ground, so the phone version reads as the same brand rather
 * than a different page.
 */
export function MobileHero() {
  return (
    <div className="mb-[var(--auth-step,1.5rem)] flex items-center gap-4 overflow-hidden rounded-2xl bg-ink px-4 py-3 lg:hidden">
      <Image
        src="/landing/auth-scene-analytics.webp"
        alt=""
        aria-hidden
        width={200}
        height={200}
        className="-my-2 h-24 w-24 shrink-0 object-contain"
      />
      <span className="min-w-0">
        <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-brass">
          Sales · Support · Automation
        </span>
        <span className="mt-1 block text-meta leading-snug text-surface/75">
          Every conversation, every deal, in one workspace.
        </span>
      </span>
    </div>
  );
}

/** Labelled input with a leading glyph. The label is real but visually hidden —
    a placeholder is not a label to a screen reader. */
export function AuthInput({
  icon,
  label,
  trailing,
  className = "",
  ...props
}: {
  icon: IconName;
  label: string;
  trailing?: React.ReactNode;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <span className="relative block">
        <Icon
          name={icon}
          size={18}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-subtle"
        />
        <input
          {...props}
          className={`field auth-control rounded-xl bg-surface pl-12 text-body ${trailing ? "pr-12" : ""} ${className}`}
        />
        {trailing}
      </span>
    </label>
  );
}

/** Password field with the reveal toggle wired to a real aria-label. */
export function PasswordInput({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const [reveal, setReveal] = useState(false);

  return (
    <AuthInput
      {...props}
      icon="lock"
      label={label}
      type={reveal ? "text" : "password"}
      trailing={
        <button
          type="button"
          onClick={() => setReveal((v) => !v)}
          aria-label={reveal ? "Hide password" : "Show password"}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted
                     transition-colors duration-150 ease-swift hover:text-ink
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <Icon name={reveal ? "eyeOff" : "eye"} size={18} />
        </button>
      }
    />
  );
}

/** Error block. `role="alert"` so it is announced when it appears. */
export function AuthError({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="mb-4 flex items-start gap-2 rounded-xl border border-danger/25 bg-danger-soft p-3 text-meta text-danger-dark"
    >
      <Icon name="alert" size={15} className="mt-px shrink-0" />
      <span>{children}</span>
    </p>
  );
}
