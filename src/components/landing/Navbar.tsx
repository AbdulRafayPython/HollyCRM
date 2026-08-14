import Link from "next/link";
import Icon from "@/components/ui/Icon";
import HolyCrmLogo from "@/components/ui/HolyCrmLogo";

/**
 * Marketing header.
 *
 * Four links, not seven. The old nav carried every section id and had to hide
 * four of them below 1280px to stop the row wrapping into the logo — which
 * meant the links a visitor could see changed with their window width. These
 * four match the page's actual structure and fit at every size.
 */
const LINKS = [
  { href: "#features", label: "Product" },
  { href: "#quoting", label: "Grounding" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export default function Navbar({ isConfigured = true }: { isConfigured?: boolean }) {
  const targetRoute = isConfigured ? "/home" : "/setup";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-rule/70 bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/landing" className="shrink-0">
          <HolyCrmLogo size={34} showText tone="light" />
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="font-plex text-sm font-medium text-stone transition-colors hover:text-graphite"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/login"
            className="hidden rounded-full px-4 py-2 font-plex text-sm font-medium text-stone transition-colors hover:bg-chalk hover:text-graphite sm:inline-flex"
          >
            Log in
          </Link>
          <Link
            href={targetRoute}
            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-graphite px-4 py-2 font-plex text-sm font-semibold text-paper shadow-chip transition-all duration-200 hover:-translate-y-px hover:bg-dome"
          >
            Launch
            <Icon name="chevronRight" className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}
