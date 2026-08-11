"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon, { type IconName } from "./Icon";

export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" for destructive actions — red button, cancel focused by default. */
  tone?: "danger" | "brand";
  icon?: IconName;
}

/**
 * Themed replacement for window.confirm().
 *
 * The native dialog is rendered by the browser chrome, so it ignores the app's
 * fonts, colors and dark surface entirely — it looked like a system error in
 * the middle of the product. This keeps the same one-line async ergonomics:
 *
 *   const { confirm, dialog } = useConfirm();
 *   if (!(await confirm({ title: "Delete?", tone: "danger" }))) return;
 *   ...
 *   return <>{dialog}</>;
 */
export function useConfirm() {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    setOpts(options);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOpts(null);
  }, []);

  // A pending promise must never dangle if the page navigates away mid-question.
  useEffect(() => () => resolver.current?.(false), []);

  const dialog = opts ? (
    <ConfirmDialog {...opts} onConfirm={() => settle(true)} onCancel={() => settle(false)} />
  ) : null;

  return { confirm, dialog };
}

function ConfirmDialog({
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "brand",
  icon,
  onConfirm,
  onCancel,
}: ConfirmOptions & { onConfirm: () => void; onCancel: () => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const danger = tone === "danger";

  useEffect(() => {
    // Destructive actions focus Cancel, so a stray Enter cannot delete anything.
    (danger ? cancelRef : confirmRef).current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter" && !danger) onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [danger, onCancel, onConfirm]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-edge bg-card p-5 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="flex items-center gap-2 text-h3 text-ink">
          {(icon || danger) && (
            <Icon
              name={icon ?? "alert"}
              size={16}
              className={danger ? "text-danger" : "text-brand"}
            />
          )}
          {title}
        </h2>

        {body && <p className="mt-2 text-meta text-muted">{body}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="btn-ghost rounded-lg px-4 py-2 text-meta"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={
              danger
                ? "rounded-lg bg-danger px-4 py-2 text-meta font-medium text-white transition duration-150 ease-swift hover:opacity-90"
                : "btn-primary rounded-lg px-4 py-2 text-meta"
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
