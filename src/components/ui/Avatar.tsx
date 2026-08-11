import Icon from "./Icon";

/** Initials from a display name; falls back to the leading digits of a phone JID. */
export function initials(name: string | null | undefined, fallback = "?") {
  const clean = (name ?? "").trim();
  if (!clean) return fallback;
  const parts = clean.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || fallback;
}

/**
 * Direct chats get a round avatar, groups a squircle — the shape alone tells an
 * agent which kind of conversation a row is before any text is read.
 */
export default function Avatar({
  name,
  type = "direct",
  size = 40,
  online = false,
  src = null,
}: {
  name?: string | null;
  type?: "direct" | "group" | "agent";
  size?: number;
  online?: boolean;
  /** Profile photo. Falls back to initials when absent or when it fails to load. */
  src?: string | null;
}) {
  const isGroup = type === "group";
  const text = size >= 36 ? "text-body" : "text-caption";

  return (
    <span className="relative inline-flex shrink-0">
      <span
        style={{ width: size, height: size }}
        className={`relative inline-flex items-center justify-center overflow-hidden font-semibold ${text} ${
          isGroup
            ? "rounded-lg bg-group-soft text-group"
            : "rounded-full bg-brand-soft text-brand"
        }`}
      >
        {name ? initials(name) : <Icon name={isGroup ? "users" : "user"} size={size * 0.5} />}
        {src && (
          // Layered over the initials rather than swapped for them: a broken or
          // slow image then shows initials instead of an empty circle, with no
          // load-state bookkeeping. Plain <img> because these are public bucket
          // URLs that next/image would need remotePatterns for.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        )}
      </span>
      {online && (
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-wa" />
      )}
    </span>
  );
}
