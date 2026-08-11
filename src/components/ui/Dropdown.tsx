"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Icon from "./Icon";

export interface DropdownOption {
  value: string;
  label: string;
  /** Muted suffix after the label — "(me)", a count, a status word. */
  hint?: string;
  /** Rendered in the trigger when selected, and on the row in the list. */
  icon?: ReactNode;
}

/**
 * A native <select> draws its list with OS chrome — system font, system blue
 * highlight, no radius — so it never matches the surrounding UI no matter what
 * the closed control is styled with. This renders the list ourselves.
 *
 * Behaves like a listbox: click-away and Escape close it, Escape returns focus
 * to the trigger, ArrowUp/Down walk the options, and the selected row is focused
 * on open so the keyboard path starts where the eye does.
 */
export default function Dropdown({
  value,
  options,
  onChange,
  disabled = false,
  placeholder = "Select",
  align = "left",
  label,
  className = "",
}: {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  align?: "left" | "right";
  /** Accessible name for the trigger. */
  label?: string;
  /** Styles the closed control — the caller owns its shape. */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

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

  useEffect(() => {
    if (!open) return;
    itemRefs.current[Math.max(selectedIndex, 0)]?.focus();
  }, [open, selectedIndex]);

  function move(from: number, delta: number) {
    const next = (from + delta + options.length) % options.length;
    itemRefs.current[next]?.focus();
  }

  function pick(next: string) {
    setOpen(false);
    triggerRef.current?.focus();
    if (next !== value) onChange(next);
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`flex items-center gap-2 outline-none transition duration-150 ease-swift focus-visible:ring-2 focus-visible:ring-brand/30 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      >
        {selected?.icon}
        <span className="min-w-0 truncate">{selected?.label ?? placeholder}</span>
        <Icon
          name="chevronDown"
          size={12}
          className={`text-muted transition-transform duration-150 ease-swift ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={label}
          className={`scroll-thin absolute top-full z-50 mt-1 max-h-64 w-max min-w-full max-w-[16rem] animate-rise-in overflow-y-auto rounded-xl border border-edge bg-card p-1 shadow-pop ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {options.map((o, i) => {
            const active = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={active}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                onClick={() => pick(o.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    move(i, 1);
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    move(i, -1);
                  }
                }}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-meta outline-none transition-colors duration-150 ease-swift hover:bg-surface focus-visible:bg-surface ${
                  active ? "font-medium text-ink" : "text-ink"
                }`}
              >
                {o.icon}
                <span className="min-w-0 flex-1 truncate">
                  {o.label}
                  {o.hint && <span className="text-muted"> {o.hint}</span>}
                </span>
                {active && <Icon name="check" size={14} className="shrink-0 text-brand" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
