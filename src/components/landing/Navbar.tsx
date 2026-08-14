"use client";

import Link from "next/link";
import Icon from "@/components/ui/Icon";
import HolyCrmLogo from "@/components/ui/HolyCrmLogo";

export default function Navbar({
  isConfigured = true,
}: {
  isConfigured?: boolean;
}) {
  const targetRoute = isConfigured ? "/home" : "/setup";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 bg-white/80 backdrop-blur-md transition-all">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
        {/* Brand Logo with Stylized 'H' */}
        <Link href="/landing" className="group shrink-0">
          <HolyCrmLogo size={36} showText={true} />
        </Link>

        {/*
          Navigation Links.

          Seven labels, the brand lockup and two buttons do not fit on one row
          below 1280px — they wrapped into the logo. The four longest links are
          held back until xl, and everything is nowrap so nothing can break
          mid-label.
        */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 whitespace-nowrap">
          <a href="#features" className="hover:text-purple-600 transition-colors">
            Features
          </a>
          <a href="#ai-grounding" className="hidden xl:inline hover:text-purple-600 transition-colors">
            Zero-Hallucination AI
          </a>
          <a href="#groups" className="hover:text-purple-600 transition-colors">
            Group CRM
          </a>
          <a href="#workflow" className="hidden xl:inline hover:text-purple-600 transition-colors">
            Workflow Canvas
          </a>
          <a href="#simulator" className="hidden xl:inline hover:text-purple-600 transition-colors">
            Live Simulator
          </a>
          <a href="#pricing" className="hover:text-purple-600 transition-colors">
            Pricing
          </a>
          <a href="#faq" className="hidden xl:inline hover:text-purple-600 transition-colors">
            FAQ
          </a>
        </nav>

        {/* Action Buttons */}
        <div className="flex shrink-0 items-center gap-3 whitespace-nowrap">
          <Link
            href="/login"
            className="hidden sm:inline-flex items-center justify-center rounded-lg px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Log In
          </Link>

          <Link
            href={targetRoute}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 hover:bg-purple-700 hover:shadow-purple-600/25 active:scale-95 transition-all"
          >
            <span>Launch Workstation</span>
            <Icon name="chevronRight" className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}
