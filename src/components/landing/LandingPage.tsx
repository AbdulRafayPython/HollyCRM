import { isSupabaseConfigured } from "@/lib/env";
import Navbar from "./Navbar";
import LandingHero from "./LandingHero";
import MetricsBar from "./MetricsBar";
import FeatureGrid from "./FeatureGrid";
import QuotingFlow from "./QuotingFlow";
import GreenApiShowcase from "./GreenApiShowcase";
import AiAgentShowcase from "./AiAgentShowcase";
import GroupChatShowcase from "./GroupChatShowcase";
import WorkflowCanvasShowcase from "./WorkflowCanvasShowcase";
import PipelineVaultShowcase from "./PipelineVaultShowcase";
import InteractiveAiSimulator from "./InteractiveAiSimulator";
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
 */
export default function LandingPage() {
  const configured = isSupabaseConfigured();

  return (
    /* `overflow-x: clip` rather than `hidden`: entrance transforms and the
       hero's deliberate right-hand bleed both reach past the viewport, and
       clip contains them without creating a scroll container — which would
       break the sticky header. */
    <div className="min-h-screen overflow-x-clip bg-white font-sans text-slate-900 antialiased selection:bg-violet-500 selection:text-white">
      <Navbar isConfigured={configured} />
      <main>
        <LandingHero isConfigured={configured} />
        <MetricsBar />
        <FeatureGrid />
        <QuotingFlow />
        <GreenApiShowcase />
        <AiAgentShowcase />
        <GroupChatShowcase />
        <WorkflowCanvasShowcase />
        <PipelineVaultShowcase />
        <InteractiveAiSimulator />
        <RoiCalculatorWidget />
        <PricingSection isConfigured={configured} />
        <FaqAccordion />
      </main>
      <FooterCta isConfigured={configured} />
    </div>
  );
}
