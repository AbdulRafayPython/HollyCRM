import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "HollyCRM",
  description: "Shared WhatsApp inbox, lead pipeline and AI assistant",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Anchor offset lives on the landing sections themselves (`scroll-mt-24`),
  // so the root only opts into smooth scrolling.
  return (
    <html lang="en" className="h-full scroll-smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
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
