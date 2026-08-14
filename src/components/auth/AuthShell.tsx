import Image from "next/image";
import HolyCrmLogo from "@/components/ui/HolyCrmLogo";
import AuthProof from "./AuthProof";

/**
 * The split screen both auth pages sit in: product proof on the left, form on
 * the right.
 *
 * Previously a white card floating on a violet gradient, over a generated
 * screenshot whose UI text was hallucinated. Now it is a full-bleed split —
 * graphite panel against paper — which reads as one surface rather than a card
 * on a backdrop, with the proof carried by `AuthProof`: a photograph for the
 * realism, real markup for every number in it.
 * on a backdrop, and the proof is the landing page's receipt, rendered as real
 * markup. Same component, same strings, no image to go stale.
 *
 * Auth routes render through AppShell's BARE branch, which clamps them to
 * `h-screen overflow-hidden` — the window cannot scroll here. So the form
 * column is the only thing that scrolls, which keeps the left panel and the
 * logo fixed no matter how tall the form gets.
 *
 * That scroller is a last resort, not the plan: the form itself is sized in
 * viewport-height units (see `.auth-form` in globals.css) so it fits the window
 * outright, and the legal strip — the one fixed row that was eating the bottom
 * of the column and cropping the submit button — now sits in the foot of the
 * graphite panel on desktop, where there is empty space anyway. Below `lg` the
 * panel is gone, so it rides along under the form instead.
 */
export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full overflow-hidden bg-surface">
      {/* ---- Left: product proof. Desktop only — below lg the form gets the
           whole width and carries its own compact strip instead. ---- */}
      <aside className="girih-ground girih-ground-invert relative isolate hidden w-[52%] items-center overflow-hidden bg-ink px-10 py-10 lg:flex xl:px-16">
        {/* The colonnade, held well down and covered by the wash on top of it.
            It is atmosphere, not a picture to look at — if a visitor notices it
            as a photograph it is too strong. */}
        <Image
          src="/landing/colonnade-plate.webp"
          alt=""
          aria-hidden
          fill
          priority
          sizes="52vw"
          className="pointer-events-none -z-10 object-cover opacity-[0.2]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-ink via-ink/85 to-ink/60"
        />

        {/* `max-h-full` + scroll, not just `overflow-hidden` on the panel: with
            the panel centring its content, anything taller than the window was
            being cropped at BOTH ends — the headline lost its first line and
            the receipt lost its last row, silently, with no scrollbar to hint
            that anything was missing. Now it scrolls in the worst case. */}
        <div className="scroll-none relative mx-auto flex max-h-full w-full max-w-[33rem] flex-col gap-7 overflow-y-auto">
          <div>
            {/* Muted rather than brass: the headline accent and the rotating
                scene label are both brass already, and a third would stop any
                of them counting. */}
            <span className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-surface/45">
              Sales · Support · Automation
            </span>
            {/* Sized against viewport height, not width: the constraint here is
                a short laptop window, not a narrow one. The floor and ceiling
                are set from measured headroom — the panel had ~240px spare at
                the old size, which made the brand line read as a caption
                rather than a headline. */}
            <h2 className="mkt-display mt-3 text-[clamp(2rem,4.9vh,3.4rem)] font-extrabold text-surface">
              Every conversation,
              <br />
              <span className="text-brass">in one workspace</span>
            </h2>
          </div>

          <AuthProof />
        </div>

        {/* The legal strip lives here on desktop. It sits inside the panel's
            own bottom padding, clear of the centred stack above it, so it costs
            the form column nothing. */}
        <p className="pointer-events-none absolute bottom-6 left-10 text-[0.7rem] text-surface/40 xl:left-16">
          PDPL &amp; GDPR encrypted · Row-level security
        </p>
      </aside>

      {/* ---- Right: the form column ---- */}
      <div className="flex min-h-0 w-full flex-col lg:w-[48%]">
        {/* Header padding tracks window height too — on a short laptop window
            those 40px were being paid for out of the form's budget. */}
        <header className="shrink-0 px-6 pt-[clamp(1.25rem,3.2vh,2.5rem)] lg:px-12">
          <HolyCrmLogo size={34} showText tone="light" />
        </header>

        {/* `m-auto` on the child, NOT `justify-center` on the scroller.
            `justify-content: center` centres by pushing overflow out of BOTH
            ends of a scroll container, and the overflow at the start edge is
            unreachable — on the signup form, which is taller than the column,
            that clipped "Create your" off the top with no way to scroll to it.
            Auto margins centre the same way but yield when space runs out, so
            the form simply scrolls from its true top. */}
        <div className="scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-[clamp(1rem,3vh,2rem)] lg:px-12">
          <div className="auth-form m-auto w-full max-w-[24rem]">
            {children}

            {/* Mobile only: no graphite panel down here to hold it. In the
                flow rather than pinned, so it can never sit over the button. */}
            <p className="mt-6 text-center text-[0.7rem] text-subtle lg:hidden">
              PDPL &amp; GDPR encrypted · Row-level security
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
