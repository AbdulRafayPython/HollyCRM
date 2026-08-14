import { isSupabaseConfigured } from "@/lib/env";
import Navbar from "./Navbar";
import LandingHero from "./LandingHero";
import MetricsBar from "./MetricsBar";
import TrustRibbon from "./TrustRibbon";
import StickyFeatures from "./StickyFeatures";
import FeatureMarquee from "./FeatureMarquee";
import InteractiveAiSimulator from "./InteractiveAiSimulator";
import Testimonials from "./Testimonials";
import ProductZoom from "./ProductZoom";
import RoiCalculatorWidget from "./RoiCalculatorWidget";
import PricingSection from "./PricingSection";
import FaqAccordion from "./FaqAccordion";
import FooterCta from "./FooterCta";

/**
 * The marketing site, composed once and rendered by both `/` and `/landing`.
 *
 * `isConfigured` decides where every primary CTA points: an unconfigured
 * install sends visitors to the setup checklist rather than to an inbox that
 * cannot load.
 *
 * Six alternating showcases — GreenApi, AiAgent, GroupChat, WorkflowCanvas,
 * PipelineVault and QuotingFlow — have collapsed into `StickyFeatures`. Six
 * copies of the same left-copy/right-image row was the previous page's biggest
 * structural weakness, and none of them survive as standalone sections.
 */
export default function LandingPage() {
  const configured = isSupabaseConfigured();

  return (
    /* `overflow-x: clip` rather than `hidden`: the tilted ribbons and the hero
       collage both reach past the viewport, and clip contains them without
       creating a scroll container — which would break the sticky header and
       the feature rail. Both tilted sections also carry their own local
       `.ribbon-clip`, because a rotated child would otherwise widen the
       document before this ever sees it.

       `font-plex` is set once here so every section inherits the marketing
       body face; the workstation keeps Inter and is untouched. */
    <div className="min-h-screen overflow-x-clip bg-paper font-plex text-graphite antialiased selection:bg-brass selection:text-graphite">
      <Navbar isConfigured={configured} />
      <main>
        <LandingHero isConfigured={configured} />
        <MetricsBar />
        <TrustRibbon />
        <StickyFeatures isConfigured={configured} />
        <FeatureMarquee />
        <InteractiveAiSimulator />
        <Testimonials />
        <ProductZoom isConfigured={configured} />
        <RoiCalculatorWidget />
        <PricingSection isConfigured={configured} />
        <FaqAccordion />
      </main>
      <FooterCta isConfigured={configured} />
    </div>
  );
}
