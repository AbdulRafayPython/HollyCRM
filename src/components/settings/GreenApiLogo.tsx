import React from "react";

export default function GreenApiLogo({
  size = 40,
  showLabel = false,
}: {
  size?: number;
  showLabel?: boolean;
}) {
  return (
    <div className="relative inline-flex items-center shrink-0" style={{ height: size }}>
      {/* Official Green API Logo Badge (Green squircle with bold white 'G') */}
      <div
        className="flex items-center justify-center rounded-2xl bg-[#39A900] text-white shadow-md shadow-emerald-700/25 overflow-hidden"
        style={{ width: size, height: size }}
      >
        <svg
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full p-1.5"
        >
          {/* Badge shape with slight bottom slant */}
          <path
            d="M20 10 H80 C85.5 10 90 14.5 90 20 V68 C90 71.5 88 74.5 85 76 L52 89.5 C50.5 90.2 49 90.2 47.5 89.5 L15 76 C12 74.5 10 71.5 10 68 V20 C10 14.5 14.5 10 20 10 Z"
            fill="#39A900"
          />
          {/* Bold White Letter G */}
          <path
            d="M52 24C65.5 24 73.5 32 73.5 43.5H61C61 37.5 57 34.5 52 34.5C43 34.5 37 41.5 37 50C37 58.5 43 65.5 52 65.5C57.5 65.5 61.5 62 62 56.5H50V46.5H74V72C68 76 60.5 77 52 77C35.5 77 23.5 65 23.5 50C23.5 35 35.5 24 52 24Z"
            fill="white"
          />
        </svg>
      </div>

      {/* Official WhatsApp Logo Badge (Overlapping Right) */}
      <div
        className="-ml-3.5 flex items-center justify-center rounded-2xl bg-[#25D366] text-white shadow-md shadow-emerald-500/30 ring-2 ring-white"
        style={{ width: size * 0.85, height: size * 0.85 }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-3/5 w-3/5"
        >
          <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm.01 1.67c4.54 0 8.24 3.7 8.24 8.24 0 2.2-.86 4.28-2.42 5.84a8.18 8.18 0 0 1-5.83 2.41c-1.42 0-2.82-.37-4.06-1.07l-.29-.17-3.12.82.83-3.04-.19-.3a8.16 8.16 0 0 1-1.25-4.49c0-4.54 3.7-8.24 8.24-8.24zm-3.6 3.12c-.2 0-.44.07-.67.33-.23.27-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.13.17 1.76 2.69 4.27 3.77.6.26 1.07.41 1.43.53.6.19 1.15.16 1.58.1.48-.07 1.48-.6 1.69-1.18.21-.58.21-1.08.15-1.18-.06-.1-.23-.17-.48-.3s-1.48-.73-1.71-.81c-.23-.09-.4-.13-.57.13-.17.26-.66.81-.81.98-.15.17-.3.19-.55.07-.25-.13-1.06-.39-2.02-1.25-.75-.67-1.25-1.5-1.4-1.75-.15-.26-.02-.4.11-.53.11-.11.25-.3.38-.45.13-.15.17-.26.25-.43.08-.17.04-.33-.02-.46-.06-.13-.57-1.37-.78-1.88-.2-.49-.41-.43-.57-.44l-.49-.01z" />
        </svg>
      </div>

      {showLabel && (
        <span className="ml-2.5 text-xs font-bold text-slate-800">
          Green API <span className="text-emerald-600 font-semibold">WhatsApp</span>
        </span>
      )}
    </div>
  );
}
