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
      className="scroll-mt-24 border-y border-graphite/5 bg-gradient-to-b from-white via-dome-tint/60 to-white py-16 sm:py-20"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading
            eyebrow="Interactive playground"
            eyebrowTone="dome"
            eyebrowIcon="play"
            title="Test the quoting engine"
            highlight="on a real inquiry."
            description="Pick a sample message or write your own, then watch the parameter extraction and the exact inventory match it produces."
          />
        </Reveal>

        <Reveal
          variant="zoom"
          delay={120}
          className="mx-auto mt-12 max-w-4xl rounded-2xl bg-plate p-6 shadow-xl shadow-graphite/5 ring-1 ring-graphite/5 sm:p-8"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-bold text-haze">Try a sample:</span>
            {PRESET_QUERIES.map((preset, idx) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => handleSelectPreset(idx)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  selectedIndex === idx
                    ? "bg-dome text-white shadow-md shadow-dome/20"
                    : "bg-rule text-stone hover:bg-rule"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <label
            htmlFor="simulator-input"
            className="mt-6 block text-xs font-bold text-stone"
          >
            Inbound WhatsApp message
          </label>
          <div className="relative mt-2">
            <input
              id="simulator-input"
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              className="w-full rounded-xl border border-rule bg-chalk/60 py-3.5 pl-4 pr-32 text-sm font-medium text-graphite transition-all focus:border-dome focus:bg-plate focus:outline-none focus:ring-2 focus:ring-dome/20"
            />
            <button
              type="button"
              onClick={triggerSimulation}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-dome px-3.5 py-2 text-xs font-bold text-white shadow transition-all hover:brightness-95"
            >
              Run AI match
            </button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {/* Extraction */}
            <div className="overflow-hidden rounded-xl border border-graphite bg-graphite p-5">
              <div className="mb-3 flex items-center justify-between border-b border-graphite pb-2 text-[11px] font-bold">
                <span className="text-dome-line">Zod parameter extraction</span>
                <span className="text-[#5FD4A0]">DeepSeek JSON</span>
              </div>
              {isSimulating ? (
                <div className="flex items-center justify-center gap-2 py-10 text-xs text-haze">
                  <span className="h-2 w-2 animate-ping rounded-full bg-dome" />
                  Extracting parameters…
                </div>
              ) : (
                <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed text-[#5FD4A0]">
                  {JSON.stringify(activeData.extracted, null, 2)}
                </pre>
              )}
            </div>

            {/* Match */}
            <div className="flex flex-col justify-between rounded-xl bg-dome-tint/70 p-5 ring-1 ring-dome-line/70">
              <div>
                <div className="mb-3 flex items-center justify-between border-b border-dome-line/70 pb-2 text-xs font-bold text-graphite">
                  <span>SQL match result</span>
                  <span className="rounded bg-dome-tint px-2 py-0.5 text-[10px] font-bold text-dome">
                    {activeData.match.status}
                  </span>
                </div>

                {isSimulating ? (
                  <div className="flex items-center justify-center py-10 text-xs font-semibold text-dome">
                    Executing search_hotels()…
                  </div>
                ) : (
                  <div className="space-y-3">
                    <h3 className="text-base font-extrabold text-graphite">
                      {activeData.match.hotel}
                    </h3>
                    <div className="inline-block rounded-md bg-dome-line/70 px-2.5 py-1 text-xs font-bold text-graphite">
                      {activeData.match.rate}
                    </div>
                    <dl className="space-y-1.5 text-xs text-stone">
                      {[
                        ["Category", activeData.match.category],
                        ["Rooms", activeData.match.rooms],
                        ["Location", activeData.match.distance],
                      ].map(([label, value]) => (
                        <div key={label} className="flex gap-1.5">
                          <dt className="font-semibold text-graphite">{label}:</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-dome-line/60 pt-3 text-[11px] font-medium text-stone">
                <span className="font-mono">public.hotels</span>
                <span className="inline-flex items-center gap-1 font-bold text-dome">
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
