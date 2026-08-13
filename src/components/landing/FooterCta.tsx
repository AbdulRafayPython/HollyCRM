"use client";

import Link from "next/link";
import Icon from "@/components/ui/Icon";
import HollyCrmLogo from "@/components/ui/HollyCrmLogo";
import Reveal from "./Reveal";

export default function FooterCta({
  isConfigured = true,
}: {
  isConfigured?: boolean;
}) {
  const targetRoute = isConfigured ? "/inbox" : "/setup";

  return (
    <footer className="bg-slate-950 text-white pt-20 pb-12 relative overflow-hidden border-t border-slate-800">
      {/* Glow background */}
      <div className="pointer-events-none absolute left-1/2 bottom-0 -z-0 h-96 w-full -translate-x-1/2 bg-gradient-to-t from-purple-900/30 to-transparent blur-3xl" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
        {/* High-Impact CTA Banner Box */}
        <Reveal
          variant="zoom"
          className="rounded-3xl bg-gradient-to-r from-purple-900 via-slate-900 to-purple-950 p-8 sm:p-14 border border-purple-500/30 text-center shadow-2xl mb-16 relative overflow-hidden"
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-purple-500/20 blur-3xl" />
          <h2 className="text-3xl font-extrabold sm:text-5xl text-white tracking-tight leading-tight">
            Start Closing More Umrah Bookings Today. <br />
            <span className="text-purple-300">Launch HollyCRM in Minutes.</span>
          </h2>
          <p className="mt-4 max-w-xl mx-auto text-sm sm:text-base text-slate-300">
            Join leading hospitality brokers in Makkah & Madinah. Streamline WhatsApp group negotiations with zero AI hallucinations.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href={targetRoute}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-purple-500 px-8 py-4 text-base font-bold text-white shadow-xl shadow-purple-600/30 hover:bg-purple-600 active:scale-95 transition-all"
            >
              <span>Launch Workstation</span>
              <Icon name="chevronRight" className="h-5 w-5" />
            </Link>

            <Link
              href="/signup"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800 px-7 py-4 text-base font-semibold text-slate-200 hover:bg-slate-700 transition-colors"
            >
              <span>Create Free Account</span>
            </Link>
          </div>
        </Reveal>

        {/* Footer Navigation Columns */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 pb-12 border-b border-slate-800 text-xs">
          {/* Brand Col */}
          <div className="col-span-2 space-y-3">
            <HollyCrmLogo size={32} showText={true} />
            <p className="text-slate-400 leading-relaxed max-w-sm">
              The WhatsApp-native CRM for Umrah & Hajj hospitality agencies. Built with DeepSeek AI extraction, exact SQL pricing, and Green API gateway integration.
            </p>
          </div>

          {/* Col 1: Product */}
          <div className="space-y-3">
            <div className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">
              Product
            </div>
            <ul className="space-y-2 text-slate-400">
              <li><a href="#features" className="hover:text-white transition-colors">Shared Inbox</a></li>
              <li><a href="#groups" className="hover:text-white transition-colors">Group Negotiation</a></li>
              <li><a href="#ai-grounding" className="hover:text-white transition-colors">SQL AI Quoting</a></li>
              <li><a href="#workflow" className="hover:text-white transition-colors">Workflow Canvas</a></li>
              <li><a href="#pricing" className="hover:text-white transition-colors">Pricing Plans</a></li>
            </ul>
          </div>

          {/* Col 2: Security & Arch */}
          <div className="space-y-3">
            <div className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">
              Security & Arch
            </div>
            <ul className="space-y-2 text-slate-400">
              <li><span className="text-slate-400">Saudi PDPL Compliant</span></li>
              <li><span className="text-slate-400">Supabase RLS Enforced</span></li>
              <li><span className="text-slate-400">Green API Gateway</span></li>
              <li><span className="text-slate-400">DeepSeek JSON Engine</span></li>
            </ul>
          </div>

          {/* Col 3: Quick Links */}
          <div className="space-y-3">
            <div className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">
              Quick Access
            </div>
            <ul className="space-y-2 text-slate-400">
              <li><Link href="/login" className="hover:text-white transition-colors">Log In</Link></li>
              <li><Link href="/signup" className="hover:text-white transition-colors">Sign Up</Link></li>
              <li><Link href="/setup" className="hover:text-white transition-colors">System Setup Checklist</Link></li>
              <li><Link href={targetRoute} className="hover:text-white transition-colors">Workstation</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom copyright line */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <div>
            &copy; {new Date().getFullYear()} HollyCRM. All rights reserved. Umrah & Hajj Hospitality CRM.
          </div>
          <div className="flex items-center gap-6">
            <span>Privacy Policy</span>
            <span>Terms of Service</span>
            <span>System Status</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
