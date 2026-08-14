"use client";

import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";

interface BackButtonProps {
  fallbackHref?: string;
  title?: string;
  className?: string;
}

/**
 * Context-aware back button.
 *
 * Checks `?from=` parameter first (e.g., when navigated from `/ai` or `/ai/workflow`),
 * then falls back to browser history if same-origin, or otherwise redirects to `fallbackHref`.
 */
export default function BackButton({
  fallbackHref = "/settings",
  title = "Back",
  className = "btn-ghost rounded-full p-1.5",
}: BackButtonProps) {
  const router = useRouter();

  const handleBack = () => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const from = params.get("from");
      if (from && from.startsWith("/") && !from.startsWith("//")) {
        router.push(from);
        return;
      }

      if (
        window.history.length > 1 &&
        document.referrer &&
        document.referrer.includes(window.location.host)
      ) {
        router.back();
        return;
      }
    }

    router.push(fallbackHref);
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      className={className}
      title={title}
      aria-label={title}
    >
      <Icon name="chevronRight" size={16} className="rotate-180" />
    </button>
  );
}
