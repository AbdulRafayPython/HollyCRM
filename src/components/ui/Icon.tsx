/**
 * Line icons, 1.5px stroke, 24px grid — drawn inline so the app carries no icon
 * dependency and no font request. Add a path here rather than importing a set.
 */

const PATHS = {
  inbox: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  chat: "M21 11.5a8.4 8.4 0 0 1-9 8.4 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.1A8.4 8.4 0 0 1 21 11.5z",
  kanban: "M4 4h4v12H4zM10 4h4v16h-4zM16 4h4v8h-4z",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  contacts: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.6 7a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H7a1.7 1.7 0 0 0 1-1.5V1a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V7a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  help: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3",
  compose: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  bot: "M12 8V4H8M4 8h16v12H4zM2 14h2M20 14h2M9 13v2M15 13v2",
  paperclip:
    "M21.4 11.1 12.3 20a5 5 0 0 1-7.1-7.1l9.2-9.2a3.3 3.3 0 1 1 4.7 4.7l-9.2 9.2a1.7 1.7 0 0 1-2.4-2.4l8.5-8.4",
  smile: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4z",
  more: "M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2M12 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2M12 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2",
  chevronDown: "m6 9 6 6 6-6",
  chevronRight: "m9 18 6-6-6-6",
  close: "M18 6 6 18M6 6l12 12",
  calendar: "M8 2v4M16 2v4M3 10h18M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  pin: "M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5",
  star: "m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.3-6.2 3.3L7 14.2l-5-4.9 6.9-1z",
  plus: "M12 5v14M5 12h14",
  check: "m20 6-11 11-5-5",
  checkDouble: "m1 13 4 4L15 7M9 15l2 2L23 5",
  alert: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 16v-4M12 8h.01",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 15h6",
  receipt: "M4 2v20l3-2 3 2 3-2 3 2 3-2V2l-3 2-3-2-3 2-3-2zM8 9h8M8 13h6",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6v6l4 2",
  trophy: "M6 3h12v6a6 6 0 0 1-12 0zM6 5H3v2a3 3 0 0 0 3 3M18 5h3v2a3 3 0 0 1-3 3M9 21h6M12 15v6",
  mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm18 2-10 7L2 6",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  archive: "M3 4h18v4H3zM5 8v12h14V8M10 12h4",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  collapse: "M3 4h18v16H3zM15 4v16M11 9l-3 3 3 3",
  wifiOff: "m1 1 22 22M16.7 12.6a6 6 0 0 1 3.3 1.7M5 12.6a10 10 0 0 1 4-2.3M2 8.8a15 15 0 0 1 4.2-2.6M20.9 12.7a15 15 0 0 0-3-2.3M8.5 16.4a5 5 0 0 1 3-1M12 20h.01",
  arrowUp: "M12 19V5M5 12l7-7 7 7",
  arrowDown: "M12 5v14M19 12l-7 7-7-7",
  mic: "M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3M19 10v2a7 7 0 0 1-14 0v-2M12 19v4",
  bolt: "M13 2 3 14h9l-1 8 10-12h-9z",
  filter: "M22 3H2l8 9.5V19l4 2v-8.5z",
  play: "M7 4.5v15l13-7.5z",
  pause: "M9 4.5v15M15 4.5v15",
  stop: "M6.5 6.5h11v11h-11z",
  download: "M12 3v13M7.5 11.5 12 16l4.5-4.5M4 20h16",
  trash: "M4 6.5h16M9.5 6.5V4h5v2.5M6.5 6.5 7.5 21h9l1-14.5M10.5 11v5.5M13.5 11v5.5",
  image: "M3 3h18v18H3zM8.5 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M21 15.5 16 10 5 21",
  video: "m16 9 5.5-3.5v13L16 15zM3 6h13v12H3z",
  menu: "M3.5 6.5h17M3.5 12h17M3.5 17.5h17",
  sparkle: "M12 3.2 13.9 9 20 11l-6.1 2L12 20.8 10.1 13 4 11l6.1-2z",
  shield: "M12 2.5 4.5 5.5v6c0 4.6 3.2 8.6 7.5 10 4.3-1.4 7.5-5.4 7.5-10v-6z",
  globe: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M2.5 9h19M2.5 15h19M12 2.2a15 15 0 0 1 0 19.6M12 2.2a15 15 0 0 0 0 19.6",
  database: "M12 7.5c4.4 0 8-1.2 8-2.7S16.4 2 12 2 4 3.2 4 4.8 7.6 7.5 12 7.5M4 4.8v14.4C4 20.8 7.6 22 12 22s8-1.2 8-2.8V4.8M4 12c0 1.6 3.6 2.8 8 2.8s8-1.2 8-2.8",
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({
  name,
  size = 18,
  className = "",
  fill = false,
}: {
  name: IconName;
  size?: number;
  className?: string;
  fill?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
