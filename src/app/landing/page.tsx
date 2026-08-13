import LandingPage from "@/components/landing/LandingPage";

export const metadata = {
  title: "HollyCRM — WhatsApp-Native CRM for Umrah & Hajj Hospitality",
  description:
    "The first WhatsApp-native CRM for Umrah & Hajj hospitality agencies. Manage group negotiations, automate stage progression, configure AI agents on a visual workflow canvas, and quote real hotel inventory with zero AI hallucinations.",
  // Both routes serve the same page; point crawlers at one of them.
  alternates: { canonical: "/" },
};

export default function Landing() {
  return <LandingPage />;
}
