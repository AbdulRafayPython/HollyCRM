"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import SettingsNav from "@/components/settings/SettingsNav";
import GreenApiLogo from "@/components/settings/GreenApiLogo";
import Chip from "@/components/ui/Chip";
import Icon, { type IconName } from "@/components/ui/Icon";
import { useConfirm } from "@/components/ui/ConfirmDialog";

interface InstanceRow {
  id: string;
  instance_id: string;
  api_url: string | null;
  phone: string | null;
  own_jid: string | null;
  state: string;
  is_active: boolean;
}

interface WasenderRow {
  id: string;
  session_id: string | null;
  session_name: string | null;
  phone: string | null;
  status: string;
  is_active: boolean;
}

type CategoryTab = "all" | "messengers" | "ai" | "automations" | "leads" | "installed";

interface BannerSlide {
  id: string;
  badge: string;
  tag: string;
  title: string;
  subtitle: string;
  image: string;
  actionText: string;
  href?: string;
  isModalTrigger?: boolean;
  theme: "dome" | "ink" | "stone";
}

const BANNER_SLIDES: BannerSlide[] = [
  {
    id: "greenapi_whatsapp",
    badge: "Official Green API Gateway",
    tag: "Instant 2-Way Sync",
    title: "You can connect WhatsApp here with Green API.",
    subtitle: "Seamlessly bridge your Umrah and Hajj agency numbers. Capture direct customer chats, automate multi-agent group negotiations, and quote hotel rates with zero downtime.",
    image: "/banners/greenapi_whatsapp.jpg",
    actionText: "Connect WhatsApp",
    isModalTrigger: true,
    theme: "dome",
  },
  {
    id: "ai_concierge",
    badge: "AI Concierge & Automation",
    tag: "24/7 Availability",
    title: "Automate Umrah & Hajj Hotel Inquiries with AI.",
    subtitle: "Instantly check Makkah & Madinah hotel rates, room configurations, and calculate package pricing in Arabic and English around the clock.",
    image: "/banners/ai_concierge.jpg",
    actionText: "Configure AI Agent",
    href: "/ai",
    theme: "ink",
  },
  {
    id: "multiagent_pipeline",
    badge: "Hospitality CRM Workstation",
    tag: "Team Routing",
    title: "Multi-Agent Routing & Real-time Pipeline Velocity.",
    subtitle: "Empower your team with unified conversation claiming, deal progression Kanban boards, and hospitality conversion analytics.",
    image: "/banners/multiagent_pipeline.jpg",
    actionText: "Explore Pipeline",
    href: "/pipeline",
    theme: "stone",
  },
];

/**
 * Shown in place of a connect form when the workspace is already on the other
 * gateway. It explains the reason rather than just greying the button out — a
 * disabled control with no cause is the thing people file support tickets about.
 */
function GatewayBlocked({
  other,
  onSwitch,
}: {
  other: string;
  onSwitch: () => void;
}) {
  return (
    <div className="rounded-2xl border border-bot/30 bg-bot-soft/40 p-5 space-y-3">
      <div className="flex items-start gap-2.5">
        <Icon name="lock" size={16} className="mt-0.5 text-bot-dark shrink-0" />
        <div className="space-y-1">
          <h4 className="text-sm font-bold text-ink">
            Already connected to {other}
          </h4>
          <p className="text-[11px] leading-relaxed text-muted">
            A workspace uses one WhatsApp gateway at a time. With two connected, whichever
            one receives a message first owns that conversation — so replies come from an
            unpredictable gateway, and two unofficial clients holding sessions on one number
            raises the risk of WhatsApp restricting it.
          </p>
          <p className="text-[11px] leading-relaxed text-muted">
            Disconnect {other} first. Your conversations, leads and message history are all kept.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onSwitch}
        className="w-full rounded-xl bg-ink px-4 py-2 text-xs font-bold text-white hover:bg-wa-dark transition"
      >
        Manage {other} connection
      </button>
    </div>
  );
}

export default function IntegrationMarketplacePage() {
  const [instances, setInstances] = useState<InstanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<CategoryTab>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Carousel state
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Form State
  const [apiUrl, setApiUrl] = useState("");
  const [idInstance, setIdInstance] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [webhookBase, setWebhookBase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  // WasenderAPI — the second gateway. Kept in its own state rather than merged
  // with instances: the two have different credentials, different status
  // vocabularies, and a workspace can run both at once while it migrates.
  const [sessions, setSessions] = useState<WasenderRow[]>([]);
  const [showWasender, setShowWasender] = useState(false);
  const [waApiKey, setWaApiKey] = useState("");
  const [waSecret, setWaSecret] = useState("");
  const [waName, setWaName] = useState("");
  const [waPhone, setWaPhone] = useState("");
  const [waWebhookUrl, setWaWebhookUrl] = useState<string | null>(null);

  async function load() {
    const [inst, wa] = await Promise.all([
      fetch("/api/settings/instances"),
      fetch("/api/settings/wasender"),
    ]);
    if (inst.ok) setInstances((await inst.json()).instances ?? []);
    if (wa.ok) setSessions((await wa.json()).sessions ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    setWebhookBase(window.location.origin.startsWith("https") ? window.location.origin : "");
  }, []);

  // Auto-swipe carousel every 5.5 seconds unless hovered
  useEffect(() => {
    if (isHovered) return;
    timerRef.current = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % BANNER_SLIDES.length);
    }, 5500);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isHovered]);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % BANNER_SLIDES.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + BANNER_SLIDES.length) % BANNER_SLIDES.length);
  };

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fetch("/api/settings/instances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiUrl, idInstance, apiToken, webhookBaseUrl: webhookBase }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Connection failed. Please verify your credentials.");
      return;
    }
    setNotice(json.hint ?? "Green API WhatsApp connection successful!");
    setApiToken("");
    setIdInstance("");
    load();
  }

  async function activate(id: string) {
    setError(null);
    const res = await fetch(`/api/settings/instances/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activate: true }),
    });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Failed to activate");
    load();
  }

  async function remove(id: string, label: string) {
    const ok = await confirm({
      title: "Remove this WhatsApp connection?",
      body: `${label} will be disconnected from the CRM. Conversations, leads and message history are all kept — only the connection is removed.`,
      confirmLabel: "Remove connection",
      tone: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/settings/instances/${id}`, { method: "DELETE" });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Failed to remove");
    load();
  }

  async function connectWasender(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fetch("/api/settings/wasender", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: waApiKey,
        webhookSecret: waSecret,
        sessionName: waName,
        phone: waPhone,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Connection failed. Please verify the API key.");
      return;
    }
    setNotice(json.hint ?? "WasenderAPI session connected.");
    // The URL is shown, not hidden behind a success toast: WasenderAPI has no
    // API for setting it, so pasting this into their dashboard is a step the
    // user still has to perform by hand.
    setWaWebhookUrl(json.webhookUrl ?? null);
    setWaApiKey("");
    setWaSecret("");
    load();
  }

  async function activateWasender(id: string) {
    setError(null);
    const res = await fetch(`/api/settings/wasender/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activate: true }),
    });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Failed to activate");
    load();
  }

  async function removeWasender(id: string, label: string) {
    const ok = await confirm({
      title: "Remove this WasenderAPI session?",
      body: `${label} will be disconnected from the CRM. Conversations, leads and message history are all kept — but chats that arrived on this number will not be able to send until a session is reconnected.`,
      confirmLabel: "Remove session",
      tone: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/settings/wasender/${id}`, { method: "DELETE" });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Failed to remove");
    load();
  }

  const activeInstance = instances.find((i) => i.is_active) ?? instances[0];
  const isConnected = Boolean(activeInstance && activeInstance.state === "authorized");

  const activeSession = sessions.find((s) => s.is_active) ?? sessions[0];
  const waConnected = Boolean(activeSession && activeSession.status === "connected");

  /*
   * One gateway per workspace (0029). "Linked" means any row exists at all, not
   * that it is authorised — a half-connected Green instance still blocks
   * WasenderAPI, because the point is that only one gateway ever holds a socket
   * on the number.
   */
  const greenLinked = instances.length > 0;
  const wasenderLinked = sessions.length > 0;

  return (
    <div className="flex h-full bg-surface">
      {dialog}

      {/* Kommo-style Settings Nav Sidebar */}
      <SettingsNav />

      {/* Main Integration Marketplace Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white">
        {/* Header Bar */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-edge/80 px-8 bg-white z-10">
          <div>
            <h1 className="text-xl font-bold text-ink">Integration Marketplace</h1>
            <p className="text-xs text-subtle">Connect communication channels and third-party tools</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-brand transition"
            >
              <Icon name="plus" size={14} />
              <span>Connect Integration</span>
            </button>
          </div>
        </header>

        {/* Body Scroll Area */}
        <div className="scroll-thin flex-1 overflow-y-auto p-6 md:p-8 space-y-7">
          <div className="max-w-5xl mx-auto space-y-7">

            {/* KOMMO-STYLE ANIMATED HERO CAROUSEL BANNER */}
            <div
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              className="relative overflow-hidden rounded-3xl border border-edge/80 bg-ink shadow-md group"
            >
              {/* Slides Track */}
              <div
                className="flex transition-transform duration-700 ease-out"
                style={{ transform: `translateX(-${currentSlide * 100}%)` }}
              >
                {BANNER_SLIDES.map((slide) => (
                  <div
                    key={slide.id}
                    className={`relative w-full shrink-0 min-h-[250px] md:min-h-[280px] flex items-center justify-between p-7 md:p-9 overflow-hidden ${
                      slide.theme === "dome"
                        ? "bg-[#0E4A35] text-white"
                        : slide.theme === "ink"
                        ? "bg-[#141A17] text-white"
                        : "bg-[#222B25] text-white"
                    }`}
                  >
                    {/* Slide Text Content */}
                    <div className="relative z-10 max-w-lg space-y-3.5">
                      <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold tracking-wide uppercase text-white backdrop-blur-md ring-1 ring-white/20">
                        <span className="h-2 w-2 rounded-full bg-wa animate-pulse" />
                        {slide.badge}
                      </div>

                      <h2 className="text-xl md:text-2xl font-extrabold tracking-tight text-white leading-snug">
                        {slide.title}
                      </h2>

                      <p className="text-xs md:text-sm leading-relaxed text-edge-strong/90 font-normal">
                        {slide.subtitle}
                      </p>

                      <div className="pt-2">
                        {slide.isModalTrigger ? (
                          <button
                            onClick={() => setShowModal(true)}
                            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-ink shadow-md hover:bg-chalk hover:shadow-lg transition-all transform active:scale-95"
                          >
                            <span>{slide.actionText}</span>
                            <Icon name="chevronRight" size={14} />
                          </button>
                        ) : (
                          <Link
                            href={slide.href || "#"}
                            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-ink shadow-md hover:bg-chalk hover:shadow-lg transition-all transform active:scale-95"
                          >
                            <span>{slide.actionText}</span>
                            <Icon name="chevronRight" size={14} />
                          </Link>
                        )}
                      </div>
                    </div>

                    {/* Right Hero Image Card Thumbnail */}
                    <div className="relative z-10 hidden sm:block w-64 md:w-80 h-44 md:h-52 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/15 shrink-0 ml-4">
                      <Image
                        src={slide.image}
                        alt={slide.title}
                        fill
                        className="object-cover"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Prev / Next Arrows */}
              <button
                onClick={prevSlide}
                className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md hover:bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Previous slide"
              >
                <Icon name="chevronRight" size={16} className="rotate-180" />
              </button>
              <button
                onClick={nextSlide}
                className="absolute right-3 top-1/2 -translate-y-1/2 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md hover:bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Next slide"
              >
                <Icon name="chevronRight" size={16} />
              </button>

              {/* Carousel Pagination Dots */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 bg-black/30 backdrop-blur-md px-3 py-1 rounded-full">
                {BANNER_SLIDES.map((slide, idx) => (
                  <button
                    key={slide.id}
                    onClick={() => setCurrentSlide(idx)}
                    className={`h-2 rounded-full transition-all duration-300 ${
                      currentSlide === idx ? "w-6 bg-white" : "w-2 bg-white/40 hover:bg-white/70"
                    }`}
                    aria-label={`Slide ${idx + 1}`}
                  />
                ))}
              </div>
            </div>

            {/* KOMMO-STYLE CATEGORY FILTER BAR */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-edge pb-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { key: "all", label: "All" },
                  { key: "messengers", label: "Messengers" },
                  { key: "ai", label: "AI Solutions" },
                  { key: "automations", label: "Automations" },
                  { key: "leads", label: "Lead Sources" },
                  { key: "installed", label: "✓ Installed" },
                ].map((tab) => {
                  const active = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key as CategoryTab)}
                      className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
                        active
                          ? "bg-brand text-white shadow-xs"
                          : "text-muted hover:bg-chalk hover:text-ink"
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Search Bar */}
              <div className="relative w-full sm:w-60">
                <Icon
                  name="search"
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle"
                />
                <input
                  type="text"
                  placeholder="Search integrations…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-edge bg-surface/70 py-1.5 pl-8 pr-3 text-xs text-ink focus:border-brand focus:bg-white focus:outline-none transition"
                />
              </div>
            </div>

            {/* MESSENGERS SECTION */}
            {(activeTab === "all" || activeTab === "messengers" || (activeTab === "installed" && isConnected)) && (
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-subtle">
                    Messengers & Gateways
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {/* CARD 1: WhatsApp Business (Green API) - LIVE & FUNCTIONAL */}
                  <div
                    onClick={() => setShowModal(true)}
                    className="group cursor-pointer flex flex-col justify-between rounded-2xl border-2 border-edge bg-white p-4 shadow-xs transition-all duration-200 hover:border-wa hover:shadow-lg hover:-translate-y-0.5"
                  >
                    <div>
                      {/* Top App Header Banner with Official Green API + WhatsApp Logo */}
                      <div className="flex h-20 w-full items-center justify-center rounded-xl bg-wa-soft/80 border border-wa-soft mb-3 group-hover:bg-wa-soft/70 transition">
                        <GreenApiLogo size={40} />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-extrabold text-ink group-hover:text-wa-dark transition-colors">
                            WhatsApp (Green API)
                          </h4>
                        </div>
                        <p className="text-[11px] text-muted leading-snug">
                          Live 2-way messaging, group negotiation bots, and multi-agent routing.
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between pt-3 border-t border-edge">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                          isConnected
                            ? "bg-wa-soft text-wa-dark ring-1 ring-wa-dark/20"
                            : activeInstance
                            ? "bg-bot-soft text-bot-dark ring-1 ring-bot/20"
                            : "bg-chalk text-muted"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            isConnected ? "bg-wa" : activeInstance ? "bg-bot" : "bg-subtle"
                          }`}
                        />
                        {isConnected ? "✓ Installed" : wasenderLinked ? "Blocked" : "Ready"}
                      </span>

                      <button
                        type="button"
                        className="rounded-lg bg-ink px-2.5 py-1 text-[11px] font-bold text-white group-hover:bg-wa-dark transition"
                      >
                        {greenLinked ? "Settings" : wasenderLinked ? "Unavailable" : "+ Install"}
                      </button>
                    </div>
                  </div>

                  {/* CARD 2: WhatsApp (WasenderAPI) — the second live gateway */}
                  <div
                    onClick={() => setShowWasender(true)}
                    className="group cursor-pointer flex flex-col justify-between rounded-2xl border-2 border-edge bg-white p-4 shadow-xs transition-all duration-200 hover:border-wa hover:shadow-lg hover:-translate-y-0.5"
                  >
                    <div>
                      <div className="flex h-20 w-full items-center justify-center rounded-xl bg-wa-soft/80 border border-wa-soft mb-3 group-hover:bg-wa-soft/70 transition">
                        <Icon name="whatsapp" size={38} className="text-wa-dark" />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-extrabold text-ink group-hover:text-wa-dark transition-colors">
                            WhatsApp (WasenderAPI)
                          </h4>
                        </div>
                        <p className="text-[11px] text-muted leading-snug">
                          QR-linked sessions with the same 2-way sync, bot replies and routing.
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between pt-3 border-t border-edge">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                          waConnected
                            ? "bg-wa-soft text-wa-dark ring-1 ring-wa-dark/20"
                            : activeSession
                            ? "bg-bot-soft text-bot-dark ring-1 ring-bot/20"
                            : "bg-chalk text-muted"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            waConnected ? "bg-wa" : activeSession ? "bg-bot" : "bg-subtle"
                          }`}
                        />
                        {waConnected ? "✓ Installed" : greenLinked ? "Blocked" : "Ready"}
                      </span>

                      <button
                        type="button"
                        className="rounded-lg bg-ink px-2.5 py-1 text-[11px] font-bold text-white group-hover:bg-wa-dark transition"
                      >
                        {wasenderLinked ? "Settings" : greenLinked ? "Unavailable" : "+ Install"}
                      </button>
                    </div>
                  </div>

                  {/* CARD 3: Telegram Gateway */}
                  {(activeTab !== "installed") && (
                    <div className="flex flex-col justify-between rounded-2xl border border-edge/80 bg-white p-4 shadow-2xs opacity-85">
                      <div>
                        <div className="flex h-20 w-full items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand text-white mb-3">
                          <Icon name="send" size={32} />
                        </div>
                        <h4 className="text-xs font-bold text-ink">Telegram Gateway</h4>
                        <p className="text-[11px] text-subtle mt-1">
                          Connect corporate Telegram groups and pilgrim customer channels.
                        </p>
                      </div>
                      <div className="mt-4 flex items-center justify-between pt-3 border-t border-edge">
                        <span className="rounded bg-chalk px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                          Coming soon
                        </span>
                        <span className="text-[11px] font-semibold text-subtle">+ Install</span>
                      </div>
                    </div>
                  )}

                  {/* CARD 3: Instagram Direct */}
                  {(activeTab !== "installed") && (
                    <div className="flex flex-col justify-between rounded-2xl border border-edge/80 bg-white p-4 shadow-2xs opacity-85">
                      <div>
                        <div className="flex h-20 w-full items-center justify-center rounded-xl bg-gradient-to-br from-brand via-group to-bot text-white mb-3">
                          <Icon name="image" size={32} />
                        </div>
                        <h4 className="text-xs font-bold text-ink">Instagram DM</h4>
                        <p className="text-[11px] text-subtle mt-1">
                          Capture agency leads from Instagram stories and direct message inquiries.
                        </p>
                      </div>
                      <div className="mt-4 flex items-center justify-between pt-3 border-t border-edge">
                        <span className="rounded bg-chalk px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                          Coming soon
                        </span>
                        <span className="text-[11px] font-semibold text-subtle">+ Install</span>
                      </div>
                    </div>
                  )}

                  {/* CARD 4: Email & Gmail */}
                  {(activeTab !== "installed") && (
                    <div className="flex flex-col justify-between rounded-2xl border border-edge/80 bg-white p-4 shadow-2xs opacity-85">
                      <div>
                        <div className="flex h-20 w-full items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand text-white mb-3">
                          <Icon name="mail" size={32} />
                        </div>
                        <h4 className="text-xs font-bold text-ink">Email & Gmail Gateway</h4>
                        <p className="text-[11px] text-subtle mt-1">
                          Forward inbound agency emails directly into the unified HolyLand inbox.
                        </p>
                      </div>
                      <div className="mt-4 flex items-center justify-between pt-3 border-t border-edge">
                        <span className="rounded bg-chalk px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                          Coming soon
                        </span>
                        <span className="text-[11px] font-semibold text-subtle">+ Install</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* AI & AUTOMATION SOLUTIONS */}
            {(activeTab === "all" || activeTab === "ai" || activeTab === "automations" || activeTab === "installed") && (
              <div className="space-y-3.5 pt-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-subtle">
                    AI Solutions & Workflow Automations
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {/* CARD: OpenAI / Claude LLM Hub */}
                  <Link
                    href="/settings/llm"
                    className="group flex flex-col justify-between rounded-2xl border border-edge bg-white p-4 shadow-xs hover:border-brand hover:shadow-lg transition"
                  >
                    <div>
                      <div className="flex h-16 w-full items-center justify-center rounded-xl bg-gradient-to-r from-ink to-ink text-white mb-3">
                        <Icon name="bot" size={28} className="text-brand" />
                      </div>
                      <h4 className="text-xs font-bold text-ink group-hover:text-brand transition">
                        OpenAI & Claude LLM Hub
                      </h4>
                      <p className="text-[11px] text-muted mt-1">
                        Connect Gemini, GPT-4o, or Claude for hotel rate extraction and multi-turn chat.
                      </p>
                    </div>
                    <div className="mt-4 flex items-center justify-between pt-3 border-t border-edge">
                      <span className="text-[10px] font-bold text-wa-dark bg-wa-soft px-2 py-0.5 rounded ring-1 ring-wa-dark/20">
                        ✓ Installed
                      </span>
                      <span className="text-[11px] font-bold text-brand">Configure →</span>
                    </div>
                  </Link>

                  {/* CARD: Rate Sheets & Inventory Sync */}
                  <Link
                    href="/settings/inventory"
                    className="group flex flex-col justify-between rounded-2xl border border-edge bg-white p-4 shadow-xs hover:border-brand hover:shadow-lg transition"
                  >
                    <div>
                      <div className="flex h-16 w-full items-center justify-center rounded-xl bg-gradient-to-r from-bot to-bot-dark text-white mb-3">
                        <Icon name="receipt" size={28} />
                      </div>
                      <h4 className="text-xs font-bold text-ink group-hover:text-brand transition">
                        Hotel Rate Sheets & Inventory
                      </h4>
                      <p className="text-[11px] text-muted mt-1">
                        Upload CSV / Excel hotel rate sheets with automatic Makkah & Madinah price mapping.
                      </p>
                    </div>
                    <div className="mt-4 flex items-center justify-between pt-3 border-t border-edge">
                      <span className="text-[10px] font-bold text-wa-dark bg-wa-soft px-2 py-0.5 rounded ring-1 ring-wa-dark/20">
                        ✓ Installed
                      </span>
                      <span className="text-[11px] font-bold text-brand">View Sheets →</span>
                    </div>
                  </Link>

                  {/* CARD: Zapier & Custom Webhooks */}
                  <div className="flex flex-col justify-between rounded-2xl border border-edge bg-white p-4 shadow-xs opacity-85">
                    <div>
                      <div className="flex h-16 w-full items-center justify-center rounded-xl bg-gradient-to-r from-danger to-bot text-white mb-3">
                        <Icon name="share" size={28} />
                      </div>
                      <h4 className="text-xs font-bold text-ink">
                        Zapier & Custom Webhooks
                      </h4>
                      <p className="text-[11px] text-muted mt-1">
                        Sync closed-won leads and customer vouchers into external Google Sheets or billing systems.
                      </p>
                    </div>
                    <div className="mt-4 flex items-center justify-between pt-3 border-t border-edge">
                      <span className="text-[10px] font-semibold text-muted bg-chalk px-2 py-0.5 rounded">
                        Available
                      </span>
                      <span className="text-[11px] font-semibold text-muted">+ Connect</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* WHATSAPP / GREEN API CONNECTION POP-UP MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl border border-edge bg-white shadow-2xl overflow-hidden">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-edge px-6 py-4">
              <div className="flex items-center gap-3">
                <GreenApiLogo size={36} />
                <div>
                  <h3 className="text-base font-extrabold text-ink">
                    Connect WhatsApp via Green API
                  </h3>
                  <p className="text-xs text-subtle">
                    Enter your Green API instance credentials to activate live messaging
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowModal(false)}
                className="rounded-xl p-2 text-subtle hover:bg-chalk hover:text-ink-soft transition"
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            {/* Modal Scroll Content */}
            <div className="scroll-thin flex-1 overflow-y-auto p-6 space-y-6">
              {notice && (
                <div className="flex items-start gap-2.5 rounded-2xl border border-wa-soft bg-wa-soft p-4 text-xs font-medium text-wa-dark">
                  <Icon name="check" size={16} className="mt-0.5 text-wa-dark shrink-0" />
                  <span>{notice}</span>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2.5 rounded-2xl border border-danger-soft bg-danger-soft p-4 text-xs font-medium text-danger-dark">
                  <Icon name="alert" size={16} className="mt-0.5 text-danger shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Active Instances List */}
              {instances.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-subtle">
                    Registered Instances
                  </h4>
                  <div className="space-y-2">
                    {instances.map((i) => {
                      const isAuth = i.state === "authorized";
                      return (
                        <div
                          key={i.id}
                          className={`flex items-center justify-between rounded-2xl border p-4 transition-colors ${
                            i.is_active
                              ? "border-wa bg-wa-soft/40"
                              : "border-edge bg-surface/50"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="radio"
                              name="active-instance"
                              checked={i.is_active}
                              onChange={() => activate(i.id)}
                              className="h-4 w-4 text-wa-dark focus:ring-wa"
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-ink">
                                  {i.phone ? `+${i.phone}` : i.instance_id}
                                </span>
                                <Chip tone={isAuth ? "wa" : "danger"}>
                                  {isAuth ? "Authorized" : i.state || "Not paired"}
                                </Chip>
                                {i.is_active && (
                                  <span className="rounded-md bg-wa-soft px-2 py-0.5 text-[10px] font-bold text-wa-dark">
                                    Primary sender
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 text-[11px] font-mono text-subtle">
                                Instance: {i.instance_id} {i.api_url ? `· ${i.api_url}` : ""}
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => remove(i.id, i.phone ? `+${i.phone}` : i.instance_id)}
                            className="rounded-xl p-2 text-subtle hover:bg-danger-soft hover:text-danger transition"
                            title="Remove instance"
                          >
                            <Icon name="trash" size={15} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Connection Form — blocked while WasenderAPI owns this workspace */}
              {wasenderLinked && (
                <GatewayBlocked
                  other="WasenderAPI"
                  onSwitch={() => {
                    setShowModal(false);
                    setError(null);
                    setNotice(null);
                    setShowWasender(true);
                  }}
                />
              )}

              <form
                onSubmit={connect}
                className={`rounded-2xl border border-edge bg-surface/50 p-5 space-y-4 ${
                  wasenderLinked ? "hidden" : ""
                }`}
              >
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-ink">
                    {instances.length > 0 ? "Add Another Green API Instance" : "Instance Credentials"}
                  </h4>
                  <ol className="list-decimal space-y-1 pl-4 text-xs text-muted">
                    <li>Create an instance at <a href="https://console.green-api.com" target="_blank" rel="noreferrer" className="text-wa-dark font-semibold underline">console.green-api.com</a> and scan the QR code with WhatsApp.</li>
                    <li>Copy your <code className="bg-edge/80 px-1 py-0.5 rounded text-[11px]">apiUrl</code>, <code className="bg-edge/80 px-1 py-0.5 rounded text-[11px]">idInstance</code>, and <code className="bg-edge/80 px-1 py-0.5 rounded text-[11px]">apiTokenInstance</code> into the fields below.</li>
                  </ol>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-ink-soft">API URL (apiUrl)</label>
                    <input
                      type="text"
                      required
                      placeholder="https://7107.api.greenapi.com"
                      value={apiUrl}
                      onChange={(e) => setApiUrl(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-edge bg-white px-3.5 py-2 text-xs focus:border-wa focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink-soft">Instance ID (idInstance)</label>
                    <input
                      type="text"
                      required
                      placeholder="7107123456"
                      value={idInstance}
                      onChange={(e) => setIdInstance(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-edge bg-white px-3.5 py-2 text-xs focus:border-wa focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink-soft">API Token (apiTokenInstance)</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••••••••••••••••••••••••••"
                    value={apiToken}
                    onChange={(e) => setApiToken(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-edge bg-white px-3.5 py-2 text-xs focus:border-wa focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink-soft">Public App Webhook URL</label>
                  <input
                    type="text"
                    value={webhookBase}
                    onChange={(e) => setWebhookBase(e.target.value)}
                    placeholder="https://your-crm-domain.com or Cloudflare tunnel URL"
                    className="mt-1 w-full rounded-xl border border-edge bg-white px-3.5 py-2 text-xs focus:border-wa focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-subtle">
                    Webhook where WhatsApp messages will be delivered automatically.
                  </p>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="rounded-xl px-4 py-2 text-xs font-semibold text-muted hover:bg-edge/60"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-xl bg-wa-dark px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-wa-dark disabled:opacity-50 transition"
                  >
                    {busy ? "Validating & Connecting…" : "Connect Instance"}
                  </button>
                </div>
              </form>
            </div>

          </div>
        </div>
      )}

      {/* WASENDERAPI CONNECTION POP-UP MODAL */}
      {showWasender && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl border border-edge bg-white shadow-2xl overflow-hidden">

            <div className="flex items-center justify-between border-b border-edge px-6 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-wa-soft">
                  <Icon name="whatsapp" size={22} className="text-wa-dark" />
                </span>
                <div>
                  <h3 className="text-base font-extrabold text-ink">
                    Connect WhatsApp via WasenderAPI
                  </h3>
                  <p className="text-xs text-subtle">
                    Paste the session API key and webhook secret from your WasenderAPI dashboard
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowWasender(false)}
                className="rounded-xl p-2 text-subtle hover:bg-chalk hover:text-ink-soft transition"
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="scroll-thin flex-1 overflow-y-auto p-6 space-y-6">
              {notice && (
                <div className="flex items-start gap-2.5 rounded-2xl border border-wa-soft bg-wa-soft p-4 text-xs font-medium text-wa-dark">
                  <Icon name="check" size={16} className="mt-0.5 text-wa-dark shrink-0" />
                  <span>{notice}</span>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2.5 rounded-2xl border border-danger-soft bg-danger-soft p-4 text-xs font-medium text-danger-dark">
                  <Icon name="alert" size={16} className="mt-0.5 text-danger shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/*
                The one manual step. WasenderAPI exposes no endpoint for setting
                a session's webhook, so this URL has to be copied into their
                dashboard by hand — showing it plainly beats implying it was
                configured automatically.
              */}
              {waWebhookUrl && (
                <div className="rounded-2xl border border-bot/30 bg-bot-soft/40 p-4 space-y-2">
                  <h4 className="text-xs font-extrabold text-ink">
                    Last step — paste this into WasenderAPI
                  </h4>
                  <p className="text-[11px] text-muted leading-relaxed">
                    Open the session in WasenderAPI → enable <strong>Webhook Notifications</strong>,
                    set the Webhook URL to the address below, and tick at least the{" "}
                    <strong>Message Received</strong> and <strong>Session Status</strong> events.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate rounded-xl border border-edge bg-white px-3 py-2 text-[11px] font-mono text-ink">
                      {waWebhookUrl}
                    </code>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(waWebhookUrl)}
                      className="shrink-0 rounded-xl bg-ink px-3 py-2 text-[11px] font-bold text-white hover:bg-wa-dark transition"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}

              {sessions.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-subtle">
                    Registered Sessions
                  </h4>
                  <div className="space-y-2">
                    {sessions.map((s) => {
                      const live = s.status === "connected";
                      const label = s.phone ? `+${s.phone}` : s.session_name ?? s.id.slice(0, 8);
                      return (
                        <div
                          key={s.id}
                          className={`flex items-center justify-between rounded-2xl border p-4 transition-colors ${
                            s.is_active ? "border-wa bg-wa-soft/40" : "border-edge bg-surface/50"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="radio"
                              name="active-wasender"
                              checked={s.is_active}
                              onChange={() => activateWasender(s.id)}
                              className="h-4 w-4 text-wa-dark focus:ring-wa"
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-ink">{label}</span>
                                <Chip tone={live ? "wa" : "danger"}>
                                  {live ? "Connected" : s.status || "Not paired"}
                                </Chip>
                                {s.is_active && (
                                  <span className="rounded-md bg-wa-soft px-2 py-0.5 text-[10px] font-bold text-wa-dark">
                                    Primary sender
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 text-[11px] font-mono text-subtle">
                                {s.session_name ?? "Session"}
                                {s.session_id ? ` · #${s.session_id}` : ""}
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => removeWasender(s.id, label)}
                            className="rounded-xl p-2 text-subtle hover:bg-danger-soft hover:text-danger transition"
                            title="Remove session"
                          >
                            <Icon name="trash" size={15} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Connection Form — blocked while Green API owns this workspace */}
              {greenLinked && (
                <GatewayBlocked
                  other="Green API"
                  onSwitch={() => {
                    setShowWasender(false);
                    setError(null);
                    setNotice(null);
                    setShowModal(true);
                  }}
                />
              )}

              <form
                onSubmit={connectWasender}
                className={`rounded-2xl border border-edge bg-surface/50 p-5 space-y-4 ${
                  greenLinked ? "hidden" : ""
                }`}
              >
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-ink">
                    {sessions.length > 0 ? "Add Another WasenderAPI Session" : "Session Credentials"}
                  </h4>
                  <ol className="list-decimal space-y-1 pl-4 text-xs text-muted">
                    <li>
                      Create a session at{" "}
                      <a
                        href="https://wasenderapi.com/whatsapp/create"
                        target="_blank"
                        rel="noreferrer"
                        className="text-wa-dark font-semibold underline"
                      >
                        wasenderapi.com
                      </a>{" "}
                      and scan the QR code with WhatsApp.
                    </li>
                    <li>
                      Copy the session&apos;s <code className="bg-edge/80 px-1 py-0.5 rounded text-[11px]">API Key</code> and
                      generate a <code className="bg-edge/80 px-1 py-0.5 rounded text-[11px]">Webhook Secret</code> on the same page.
                    </li>
                    <li>Save here, then paste the webhook URL we give you back into that session.</li>
                  </ol>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink-soft">Session API Key</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••••••••••••••••••••••••••"
                    value={waApiKey}
                    onChange={(e) => setWaApiKey(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-edge bg-white px-3.5 py-2 text-xs focus:border-wa focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink-soft">Webhook Secret</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••••••••••••••••••••••••••"
                    value={waSecret}
                    onChange={(e) => setWaSecret(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-edge bg-white px-3.5 py-2 text-xs focus:border-wa focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-subtle">
                    Sent as <code className="bg-edge/80 px-1 py-0.5 rounded">X-Webhook-Signature</code> on every
                    inbound message. It is how we verify the message is really from WasenderAPI.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-ink-soft">Session Name (optional)</label>
                    <input
                      type="text"
                      placeholder="HolyCRM"
                      value={waName}
                      onChange={(e) => setWaName(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-edge bg-white px-3.5 py-2 text-xs focus:border-wa focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink-soft">Linked Phone Number</label>
                    <input
                      type="text"
                      placeholder="+92 313 0005968"
                      value={waPhone}
                      onChange={(e) => setWaPhone(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-edge bg-white px-3.5 py-2 text-xs focus:border-wa focus:outline-none"
                    />
                    <p className="mt-1 text-[11px] text-subtle">
                      Used to detect when the bot is @mentioned in a group.
                    </p>
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowWasender(false)}
                    className="rounded-xl px-4 py-2 text-xs font-semibold text-muted hover:bg-edge/60"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-xl bg-wa-dark px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-wa-dark disabled:opacity-50 transition"
                  >
                    {busy ? "Validating & Connecting…" : "Connect Session"}
                  </button>
                </div>
              </form>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
