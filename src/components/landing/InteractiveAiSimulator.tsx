"use client";

import { useState } from "react";
import Icon from "@/components/ui/Icon";
import { SectionHeading } from "./primitives";
import Reveal from "./Reveal";

const PRESET_QUERIES = [
  {
    label: "Makkah 5-star group",
    text: "5 star Makkah hotel under 1300 SAR near Haram for 8 people, 10-15 Sept 2026",
    extracted: {
      city: "Makkah",
      stars: 5,
      max_price: 1300,
      currency: "SAR",
      haram_dist: "<200m",
      guests: 8,
      check_in: "2026-09-10",
      check_out: "2026-09-15",
    },
    match: {
      hotel: "Pullman Zamzam Makkah",
      category: "5 star luxury",
      rate: "1,200 SAR / night",
      rooms: "4 quad rooms available",
      distance: "100m from Haram",
      status: "Verified SQL match",
    },
  },
  {
    label: "Madinah family package",
    text: "Madinah hotel under 900 SAR for 6 guests with breakfast, 15-20 Ramadan",
    extracted: {
      city: "Madinah",
      stars: 4,
      max_price: 900,
      currency: "SAR",
      haram_dist: "<400m",
      guests: 6,
      check_in: "Ramadan 15",
      check_out: "Ramadan 20",
    },
    match: {
      hotel: "Dar Al Taqwa Madinah",
      category: "4 star premium",
      rate: "850 SAR / night",
      rooms: "3 triple rooms, breakfast included",
      distance: "250m from the Prophet's Mosque",
      status: "Verified SQL match",
    },
  },
  {
    label: "Budget family quad",
    text: "Clean 3 or 4 star Makkah hotel under 750 SAR for 4 people with shuttle service",
    extracted: {
      city: "Makkah",
      stars: 4,
      max_price: 750,
      currency: "SAR",
      haram_dist: "<1000m (shuttle)",
      guests: 4,
      check_in: "2026-10-01",
      check_out: "2026-10-06",
    },
    match: {
      hotel: "Voco Makkah",
      category: "4 star hotel",
      rate: "680 SAR / night",
      rooms: "1 quad room, free 24/7 shuttle",
      distance: "800m, shuttle every 15 min",
      status: "Verified SQL match",
    },
  },
];

export default function InteractiveAiSimulator() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [customText, setCustomText] = useState(PRESET_QUERIES[0].text);
  const [isSimulating, setIsSimulating] = useState(false);

  const activeData = PRESET_QUERIES[selectedIndex];

  const triggerSimulation = () => {
    setIsSimulating(true);
    setTimeout(() => setIsSimulating(false), 400);
  };

  const handleSelectPreset = (idx: number) => {
    setSelectedIndex(idx);
    setCustomText(PRESET_QUERIES[idx].text);
    triggerSimulation();
  };

  return (
    <section
      id="simulator"
      className="scroll-mt-24 border-y border-slate-900/5 bg-gradient-to-b from-white via-violet-50/60 to-white py-16 sm:py-20"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading
            eyebrow="Interactive playground"
            eyebrowTone="emerald"
            eyebrowIcon="play"
            title="Test the quoting engine"
            highlight="on a real inquiry."
            description="Pick a sample message or write your own, then watch the parameter extraction and the exact inventory match it produces."
          />
        </Reveal>

        <Reveal
          variant="zoom"
          delay={120}
          className="mx-auto mt-12 max-w-4xl rounded-2xl bg-white p-6 shadow-xl shadow-violet-950/5 ring-1 ring-slate-900/5 sm:p-8"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-bold text-slate-500">Try a sample:</span>
            {PRESET_QUERIES.map((preset, idx) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => handleSelectPreset(idx)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  selectedIndex === idx
                    ? "bg-violet-600 text-white shadow-md shadow-violet-600/20"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <label
            htmlFor="simulator-input"
            className="mt-6 block text-xs font-bold text-slate-700"
          >
            Inbound WhatsApp message
          </label>
          <div className="relative mt-2">
            <input
              id="simulator-input"
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/60 py-3.5 pl-4 pr-32 text-sm font-medium text-slate-900 transition-all focus:border-violet-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
            <button
              type="button"
              onClick={triggerSimulation}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-violet-600 px-3.5 py-2 text-xs font-bold text-white shadow transition-colors hover:bg-violet-700"
            >
              Run AI match
            </button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {/* Extraction */}
            <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900 p-5">
              <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-2 text-[11px] font-bold">
                <span className="text-violet-300">Zod parameter extraction</span>
                <span className="text-emerald-400">DeepSeek JSON</span>
              </div>
              {isSimulating ? (
                <div className="flex items-center justify-center gap-2 py-10 text-xs text-slate-400">
                  <span className="h-2 w-2 animate-ping rounded-full bg-violet-500" />
                  Extracting parameters…
                </div>
              ) : (
                <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed text-emerald-400">
                  {JSON.stringify(activeData.extracted, null, 2)}
                </pre>
              )}
            </div>

            {/* Match */}
            <div className="flex flex-col justify-between rounded-xl bg-violet-50/70 p-5 ring-1 ring-violet-200/70">
              <div>
                <div className="mb-3 flex items-center justify-between border-b border-violet-200/70 pb-2 text-xs font-bold text-violet-900">
                  <span>SQL match result</span>
                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                    {activeData.match.status}
                  </span>
                </div>

                {isSimulating ? (
                  <div className="flex items-center justify-center py-10 text-xs font-semibold text-violet-700">
                    Executing search_hotels()…
                  </div>
                ) : (
                  <div className="space-y-3">
                    <h3 className="text-base font-extrabold text-slate-900">
                      {activeData.match.hotel}
                    </h3>
                    <div className="inline-block rounded-md bg-violet-200/70 px-2.5 py-1 text-xs font-bold text-violet-900">
                      {activeData.match.rate}
                    </div>
                    <dl className="space-y-1.5 text-xs text-slate-700">
                      {[
                        ["Category", activeData.match.category],
                        ["Rooms", activeData.match.rooms],
                        ["Location", activeData.match.distance],
                      ].map(([label, value]) => (
                        <div key={label} className="flex gap-1.5">
                          <dt className="font-semibold text-slate-900">{label}:</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-violet-200/60 pt-3 text-[11px] font-medium text-violet-800">
                <span className="font-mono">public.hotels</span>
                <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                  <Icon name="checkDouble" className="h-3.5 w-3.5" />
                  100% rate accuracy
                </span>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
