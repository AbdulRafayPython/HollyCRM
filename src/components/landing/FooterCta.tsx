import Link from "next/link";
import Icon from "@/components/ui/Icon";
import HolyCrmLogo from "@/components/ui/HolyCrmLogo";
import Reveal from "./Reveal";

/**
 * Closing CTA and footer.
 *
 * The reference showreel ends by rotating the whole page back in 3D. That is
 * the video presenting itself as an object, not a page feature — frame 24 has
 * the navbar inside the tilted plane. So the gesture is kept and the dose cut:
 * `data-reveal="tilt"` lifts this one card from rotateX(9deg) to flat as it
 * enters, hinged at its bottom edge.
 */

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Shared inbox", href: "#inbox" },
      { label: "Grounded quoting", href: "#quoting" },
      { label: "Group handling", href: "#groups" },
      { label: "Workflow canvas", href: "#workflow" },
      { label: "Pricing", href: "#pricing" },
    ],
  },
  {
    title: "Security",
    links: [
      { label: "Saudi PDPL compliant", href: "#faq" },
      { label: "Row-level security", href: "#faq" },
      { label: "Green API gateway", href: "#faq" },
      { label: "Encrypted document vault", href: "#faq" },
    ],
  },
  {
    title: "Get started",
    links: [
      { label: "Log in", href: "/login" },
      { label: "Sign up", href: "/signup" },
      { label: "Setup checklist", href: "/setup" },
      { label: "Workstation", href: "/home" },
    ],
  },
];

export default function FooterCta({ isConfigured = true }: { isConfigured?: boolean }) {
  const targetRoute = isConfigured ? "/home" : "/setup";

  return (
    <footer className="px-4 pb-10 pt-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <Reveal variant="tilt">
          <div className="overflow-hidden rounded-3xl bg-graphite text-paper shadow-lift-lg">
            {/* CTA band */}
            <div className="border-b border-white/10 px-6 py-14 text-center sm:px-12 sm:py-20">
              <h2 className="mkt-display mx-auto max-w-3xl text-[2rem] font-extrabold sm:text-[2.9rem]">
                Start the season with
                <br />
                <span className="text-brass">your prices already right</span>
              </h2>
              <p className="mx-auto mt-4 max-w-lg font-plex text-sm leading-relaxed text-paper/70 sm:text-base">
                Connect your WhatsApp number, point it at your inventory, and let the
                thread do the rest.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  href={targetRoute}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brass px-7 py-3.5 font-plex text-sm font-semibold text-graphite transition-all duration-200 hover:-translate-y-px hover:brightness-[1.06] sm:w-auto"
                >
                  Launch workstation
                  <Icon name="chevronRight" className="h-4 w-4" />
                </Link>
                <Link
                  href="/signup"
                  className="inline-flex w-full items-center justify-center rounded-full px-7 py-3.5 font-plex text-sm font-semibold text-paper ring-1 ring-white/20 transition-colors hover:bg-white/10 sm:w-auto"
                >
                  Create an account
                </Link>
              </div>
            </div>

            {/* Directory */}
            <div className="grid gap-8 px-6 py-12 sm:grid-cols-2 sm:px-12 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
              <div className="flex flex-col gap-3">
                <HolyCrmLogo size={30} showText tone="dark" />
                <p className="max-w-xs font-plex text-xs leading-relaxed text-paper/60">
                  The WhatsApp-native CRM for Umrah and Hajj hospitality agencies.
                  Structured extraction, exact SQL pricing, Green API gateway.
                </p>
              </div>

              {COLUMNS.map((col) => (
                <nav key={col.title} className="flex flex-col gap-3">
                  <span className="font-plex text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-paper/45">
                    {col.title}
                  </span>
                  <ul className="flex flex-col gap-2">
                    {col.links.map((link) => (
                      <li key={link.label}>
                        <Link
                          href={link.href}
                          className="font-plex text-xs text-paper/70 transition-colors hover:text-brass"
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              ))}
            </div>

            <div className="flex flex-col items-center justify-between gap-3 border-t border-white/10 px-6 py-6 font-plex text-[0.7rem] text-paper/45 sm:flex-row sm:px-12">
              <span>
                &copy; {new Date().getFullYear()} HolyCRM. Umrah &amp; Hajj hospitality CRM.
              </span>
              <span className="flex items-center gap-5">
                <span>Privacy</span>
                <span>Terms</span>
                <span>Status</span>
              </span>
            </div>
          </div>
        </Reveal>
      </div>
    </footer>
  );
}
