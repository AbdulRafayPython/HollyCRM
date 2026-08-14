import Image from "next/image";
import HolyCrmLogo from "@/components/ui/HolyCrmLogo";
import Icon from "@/components/ui/Icon";

/**
 * The split screen both auth pages sit in: product proof on the left, form on
 * the right, one card floating on the brand field.
 *
 * Auth routes render through AppShell's BARE branch, which clamps them to
 * `h-screen overflow-hidden` — the window cannot scroll here. So the card is
 * height-constrained and the form column is the only thing that scrolls, which
 * keeps the left panel and the logo fixed no matter how tall the form gets.
 * That is why the scroll container lives in here rather than in the pages.
 */
export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center overflow-hidden bg-gradient-to-br from-brand via-[#5A4BE2] to-[#7C3AED] lg:p-8">
      <div
        className="flex h-full w-full overflow-hidden bg-card
                   lg:h-[min(46rem,calc(100vh-4rem))] lg:max-w-[70rem]
                   lg:rounded-3xl lg:shadow-2xl lg:shadow-indigo-950/30"
      >
        {/* ---- Left: product proof. Desktop only — below lg the form gets the
             whole card and carries its own cropped strip of the same shot. ---- */}
        <div className="hidden w-[55%] flex-col justify-center gap-8 border-r border-edge bg-surface p-10 lg:flex xl:p-12">
          <div className="relative">
            {/*
              The render carries a wide lilac margin around the actual UI — shown
              whole, the interface is a postage stamp. Scaling inside the
              overflow-hidden frame crops that margin away and lets the product
              fill the panel, the same trick the landing shots use.
            */}
            <div className="aspect-video overflow-hidden rounded-2xl shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/5">
              <Image
                src="/landing-assets/hero_mockup.jpg"
                alt="The HolyCRM shared WhatsApp inbox beside the lead pipeline board"
                width={1376}
                height={768}
                priority
                unoptimized
                sizes="(min-width: 1024px) 55vw, 100vw"
                style={{ transform: "scale(1.45)" }}
                className="h-full w-full object-cover"
              />
            </div>

            {/*
              The reference puts an interactive search widget here. A login page
              cannot honour that — dropdowns that do not open read as broken, and
              a visitor will try them. This is a frozen slice of real product
              behaviour instead: message in, stage advanced, no controls to click.
            */}
            <div className="absolute -bottom-6 left-6 w-[19rem] rounded-2xl border border-edge bg-card/95 p-4 shadow-pop backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <Icon name="whatsapp" size={15} className="text-wa" />
                <span className="text-caption font-semibold text-muted">
                  Al-Faisal family · group
                </span>
              </div>

              <p className="mt-2 text-meta leading-snug text-ink">
                “Can you do 4 rooms in Makkah, 12–18 Ramadan?”
              </p>

              <div className="mt-3 flex items-center gap-2 border-t border-edge pt-3">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-bot" />
                <span className="text-caption text-muted">Advanced automatically</span>
                <Icon name="chevronRight" size={13} className="text-subtle" />
                <span className="rounded-full bg-brand-soft px-2 py-0.5 text-caption font-semibold text-brand">
                  Quoted
                </span>
              </div>
            </div>
          </div>

          <div className="pt-4">
            <h2 className="text-[2rem] font-bold leading-[1.15] tracking-tight text-ink">
              Every pilgrim conversation,
              <br />
              in one workspace
            </h2>
            <p className="mt-3 max-w-[26rem] text-body leading-relaxed text-muted">
              Run family group negotiations, advance the pipeline automatically, and quote real
              Makkah &amp; Madinah inventory.
            </p>
          </div>

          {/* Carousel indicator from the reference. Nothing cycles, so it is
              decoration only — never a control that ignores a click. */}
          <div className="flex items-center gap-1.5" aria-hidden>
            <span className="h-1.5 w-6 rounded-full bg-brand" />
            <span className="h-1.5 w-1.5 rounded-full bg-edge-strong" />
            <span className="h-1.5 w-1.5 rounded-full bg-edge-strong" />
          </div>
        </div>

        {/* ---- Right: the form column ---- */}
        <div className="flex min-h-0 w-full flex-col lg:w-[45%]">
          <header className="shrink-0 px-6 pt-6 lg:px-10 lg:pt-8">
            <HolyCrmLogo size={34} />
          </header>

          <div className="scroll-thin flex min-h-0 flex-1 flex-col justify-center overflow-y-auto px-6 py-6 lg:px-10">
            <div className="mx-auto w-full max-w-[24rem]">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
