import type { Metadata } from "next";
import { Archivo, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import AppShell from "@/components/AppShell";
import "./globals.css";

/**
 * Marketing typefaces.
 *
 * These are scoped to the landing page via `font-display` / `font-plex` /
 * `font-plexmono` rather than replacing the body font, because the workstation
 * still runs on Inter and re-typesetting the whole app is a separate job.
 *
 * Archivo carries a real `wdth` axis, which is the point of choosing it: the
 * display headings ship expanded on desktop and narrow on small screens, so a
 * long headline holds its line count instead of wrapping to five lines.
 */
// No `weight` here on purpose: next/font only allows extra axes on a variable
// font when weight is left variable, and the whole point of Archivo is that
// both `wght` and `wdth` stay continuous.
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "HolyCRM",
  description: "Shared WhatsApp inbox, lead pipeline and AI assistant",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Anchor offset lives on the landing sections themselves (`scroll-mt-24`),
  // so the root only opts into smooth scrolling.
  return (
    <html
      lang="en"
      className={`h-full scroll-smooth ${archivo.variable} ${plexSans.variable} ${plexMono.variable}`}
    >
      <head>
        {/*
          Reveal-on-scroll ships its elements at opacity 0 and an observer
          brings them in. With scripting off nothing would ever run, so the
          page would be blank — this hands the content straight back.
        */}
        <noscript>
          <style>{`[data-reveal]{opacity:1 !important;transform:none !important}`}</style>
        </noscript>
      </head>
      {/*
        No `overflow-hidden` here: the marketing pages scroll the window. The
        workspace still locks to the viewport — AppShell clamps its own shell —
        so app pages behave exactly as before.
      */}
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
