import type { ReactNode } from "react";
import Icon, { type IconName } from "./Icon";

export type Tone = "wa" | "group" | "bot" | "brand" | "danger" | "neutral";

const TONES: Record<Tone, string> = {
  wa: "bg-wa-soft text-wa-dark border-wa/25",
  group: "bg-group-soft text-brand-dark border-group/25",
  bot: "bg-bot-soft text-bot-dark border-bot/30",
  brand: "bg-brand-soft text-brand-dark border-brand/20",
  danger: "bg-danger-soft text-danger-dark border-danger/25",
  neutral: "bg-surface text-muted border-edge",
};

/** 11px status pill. Semi-transparent ground, high-contrast text of the same hue. */
export default function Chip({
  tone = "neutral",
  icon,
  children,
  className = "",
}: {
  tone?: Tone;
  icon?: IconName;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption ${TONES[tone]} ${className}`}
    >
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

const DOTS: Record<Tone, string> = {
  wa: "bg-wa",
  group: "bg-group",
  bot: "bg-bot",
  brand: "bg-brand",
  danger: "bg-danger",
  neutral: "bg-subtle",
};

export function Dot({ tone = "neutral", className = "" }: { tone?: Tone; className?: string }) {
  return <span className={`h-2 w-2 shrink-0 rounded-full ${DOTS[tone]} ${className}`} />;
}
