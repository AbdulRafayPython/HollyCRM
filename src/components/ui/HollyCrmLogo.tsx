import React from "react";

interface HollyCrmLogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
}

export default function HollyCrmLogo({
  size = 36,
  className = "",
  showText = true,
}: HollyCrmLogoProps) {
  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      {/* Stylized 'H' Icon Box */}
      <div
        className="relative flex items-center justify-center rounded-xl bg-gradient-to-tr from-purple-700 via-indigo-600 to-emerald-500 p-2 text-white shadow-md shadow-purple-600/25 transition-transform hover:scale-105"
        style={{ width: size, height: size }}
      >
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-full w-full"
        >
          {/* Stylized H Mark: Left Stem, Right Stem, Chat-Arc Crossbar */}
          <path
            d="M8 6V26M8 16H24M24 6V26"
            stroke="white"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Green Chat Pulse Dot on Right Stem */}
          <circle cx="24" cy="8" r="2.5" fill="#25D366" />
        </svg>
      </div>

      {showText && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold text-xl tracking-tight text-slate-900">
              Holly<span className="text-purple-600">CRM</span>
            </span>
            {/* Hidden on narrow screens: beside seven nav links and two
                buttons, this badge is what tips the header into wrapping. */}
            <span className="hidden lg:inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              WhatsApp Native
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
