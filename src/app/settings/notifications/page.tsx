"use client";

import React from "react";
import SettingsNav from "@/components/settings/SettingsNav";
import Icon from "@/components/ui/Icon";
import { useNotifications } from "@/components/notifications/NotificationContext";

export default function NotificationSettingsPage() {
  const {
    soundEnabled,
    soundVolume,
    inAppToastEnabled,
    browserPushEnabled,
    browserPermission,
    notifyScope,
    toastDuration,
    assignmentAlertsEnabled,
    playTestChime,
    sendTestNotification,
    sendTestAssignment,
    requestBrowserPermission,
    updateSettings,
  } = useNotifications();

  return (
    <div className="flex h-full bg-surface">
      <SettingsNav />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white">
        {/* Top Header */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-edge/80 px-8 bg-white z-10">
          <div>
            <h1 className="text-xl font-bold text-ink">Notification Settings</h1>
            <p className="text-xs text-subtle">Configure WhatsApp Web message sounds, in-app banners, and browser push alerts</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={sendTestNotification}
              className="flex items-center gap-1.5 rounded-xl border border-edge bg-white px-3.5 py-1.5 text-xs font-semibold text-ink-soft hover:bg-surface transition shadow-2xs"
            >
              <Icon name="bell" size={14} />
              <span>Preview Toast Alert</span>
            </button>
            <button
              onClick={playTestChime}
              className="flex items-center gap-1.5 rounded-xl bg-brand px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-brand transition"
            >
              <Icon name="volume" size={14} />
              <span>Test Audio Chime</span>
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className="scroll-thin flex-1 overflow-y-auto p-6 md:p-8 bg-surface">
          <div className="max-w-4xl mx-auto space-y-6">

            {/* CARD 1: Desktop Browser Notifications */}
            <section className="rounded-3xl border border-edge/80 bg-white p-6 shadow-xs space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-ink">Desktop Browser Push Notifications</h2>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        browserPermission === "granted"
                          ? "bg-wa-soft text-wa-dark ring-1 ring-wa-dark/20"
                          : browserPermission === "denied"
                          ? "bg-danger-soft text-danger-dark ring-1 ring-danger/20"
                          : "bg-bot-soft text-bot-dark ring-1 ring-bot/20"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          browserPermission === "granted"
                            ? "bg-wa"
                            : browserPermission === "denied"
                            ? "bg-danger"
                            : "bg-bot"
                        }`}
                      />
                      {browserPermission === "granted"
                        ? "Permission Granted ✓"
                        : browserPermission === "denied"
                        ? "Blocked in Browser"
                        : "Permission Required"}
                    </span>
                  </div>
                  <p className="text-xs text-muted leading-relaxed max-w-2xl">
                    Delivers OS-level notification popups when WhatsApp inquiries arrive, even when HolyCRM is in a background tab or minimized.
                  </p>
                </div>

                {browserPermission !== "granted" ? (
                  <button
                    onClick={() => void requestBrowserPermission()}
                    className="rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-brand transition shrink-0"
                  >
                    Enable Browser Push
                  </button>
                ) : (
                  <label className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none bg-wa">
                    <input
                      type="checkbox"
                      checked={browserPushEnabled}
                      onChange={(e) => updateSettings({ browserPushEnabled: e.target.checked })}
                      className="sr-only"
                    />
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        browserPushEnabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </label>
                )}
              </div>
            </section>

            {/* CARD 1b: Assignment alerts. Deliberately its own switch rather
                than folded into message alerts — muting chatter should not mute
                "this conversation is now yours", which is the one notification
                an agent cannot afford to miss. */}
            <section className="rounded-3xl border border-edge/80 bg-white p-6 shadow-xs space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="text-sm font-bold text-ink">Assigned to me</h2>
                  <p className="text-xs text-muted leading-relaxed max-w-2xl">
                    Alerts you the moment a conversation is handed to you — by the AI agent
                    during a handoff, by one of your rules, or by a colleague. The chat leaves
                    the unassigned queue and the bot pauses on it, so nobody else is coming.
                    Every alert is also kept in the bell in the sidebar.
                  </p>
                </div>

                <label
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    assignmentAlertsEnabled ? "bg-wa" : "bg-edge-strong"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={assignmentAlertsEnabled}
                    onChange={(e) => updateSettings({ assignmentAlertsEnabled: e.target.checked })}
                    className="sr-only"
                  />
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      assignmentAlertsEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </label>
              </div>

              <div className="border-t border-edge pt-4">
                <button
                  type="button"
                  onClick={sendTestAssignment}
                  className="rounded-xl border border-edge bg-white px-3 py-1.5 text-xs font-semibold text-muted transition hover:bg-surface"
                >
                  Preview an assignment alert
                </button>
              </div>
            </section>

            {/* CARD 2: In-App WhatsApp Web Banners */}
            <section className="rounded-3xl border border-edge/80 bg-white p-6 shadow-xs space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="text-sm font-bold text-ink">In-App WhatsApp Web Banners</h2>
                  <p className="text-xs text-muted leading-relaxed max-w-2xl">
                    Displays sleek WhatsApp Web style floating notification cards on the bottom-right corner when you are navigating other sections (Home, Insights, Pipeline, AI, Settings).
                  </p>
                </div>

                <label
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    inAppToastEnabled ? "bg-wa" : "bg-edge-strong"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={inAppToastEnabled}
                    onChange={(e) => updateSettings({ inAppToastEnabled: e.target.checked })}
                    className="sr-only"
                  />
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      inAppToastEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </label>
              </div>

              {inAppToastEnabled && (
                <div className="border-t border-edge pt-4 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-bold text-ink">Banner Auto-Dismiss Time</span>
                    <p className="text-[11px] text-subtle">How long the notification stays visible before closing</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {[
                      { label: "3 Seconds", value: 3000 },
                      { label: "6 Seconds (Default)", value: 6000 },
                      { label: "10 Seconds", value: 10000 },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => updateSettings({ toastDuration: opt.value })}
                        className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                          toastDuration === opt.value
                            ? "bg-brand-soft text-brand ring-1 ring-brand/30"
                            : "border border-edge bg-white text-muted hover:bg-surface"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* CARD 3: Audio Notification Chimes */}
            <section className="rounded-3xl border border-edge/80 bg-white p-6 shadow-xs space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="text-sm font-bold text-ink">Message Audio Chimes</h2>
                  <p className="text-xs text-muted leading-relaxed max-w-2xl">
                    Plays the signature WhatsApp double-tone harmonic chime whenever a new incoming message or quotation inquiry arrives.
                  </p>
                </div>

                <label
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    soundEnabled ? "bg-wa" : "bg-edge-strong"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={soundEnabled}
                    onChange={(e) => updateSettings({ soundEnabled: e.target.checked })}
                    className="sr-only"
                  />
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      soundEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </label>
              </div>

              {soundEnabled && (
                <div className="border-t border-edge pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-ink">Chime Volume</span>
                    <span className="text-xs font-mono font-bold text-brand bg-brand-soft px-2 py-0.5 rounded-md">
                      {soundVolume}%
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Icon name={soundVolume === 0 ? "volumeOff" : "volume"} size={16} className="text-subtle" />
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={soundVolume}
                      onChange={(e) => updateSettings({ soundVolume: Number(e.target.value) })}
                      className="w-full accent-brand cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={playTestChime}
                      className="shrink-0 rounded-xl border border-edge bg-white px-3 py-1 text-xs font-semibold text-ink-soft hover:bg-surface transition"
                    >
                      Play Test
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* CARD 4: Notification Scope & Routing Filter */}
            <section className="rounded-3xl border border-edge/80 bg-white p-6 shadow-xs space-y-4">
              <div>
                <h2 className="text-sm font-bold text-ink">Notification Triggers</h2>
                <p className="text-xs text-muted leading-relaxed">
                  Choose which incoming conversations trigger notification alerts
                </p>
              </div>

              <div className="space-y-3 pt-1">
                {[
                  {
                    key: "all",
                    title: "All Incoming Messages (Direct & Groups)",
                    desc: "Notify for every direct message and group customer interaction across the agency.",
                  },
                  {
                    key: "direct",
                    title: "Direct Customer Inquiries Only",
                    desc: "Mute busy agency group chats and only notify on 1-on-1 private WhatsApp messages.",
                  },
                  {
                    key: "mine",
                    title: "My Assigned Chats & Unassigned Inquiries",
                    desc: "Only trigger alerts for chats assigned to you or waiting in the unassigned triage pool.",
                  },
                ].map((opt) => (
                  <label
                    key={opt.key}
                    className={`flex cursor-pointer items-start gap-3.5 rounded-2xl border p-4 transition-all duration-150 ${
                      notifyScope === opt.key
                        ? "border-brand bg-brand-soft/70 ring-1 ring-brand/20"
                        : "border-edge bg-white hover:border-edge-strong hover:bg-surface/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="notifyScope"
                      className="mt-1 accent-brand"
                      checked={notifyScope === opt.key}
                      onChange={() => updateSettings({ notifyScope: opt.key as any })}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-ink">{opt.title}</p>
                      <p className="mt-0.5 text-[11px] text-muted leading-relaxed">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}
