"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Keeps the inbox current from database events instead of a timer.
 *
 * The inbox used to refresh on a 30-second interval, so an inbound WhatsApp
 * message could sit for half a minute while the notification poll — every
 * 3.5s — had already toasted it. A websocket push closes that gap to the round
 * trip itself.
 *
 * Three things this deliberately keeps:
 *
 * - A coalescing window. A burst of messages arrives as a burst of events, and
 *   each router.refresh() re-runs the inbox's server components against the
 *   database. One refresh per burst is all anyone can perceive anyway.
 * - A fallback timer. Realtime can be unavailable (websocket blocked, project
 *   paused, publication misconfigured) and it fails quietly — no error, just no
 *   events. Polling runs at 5s until the channel confirms SUBSCRIBED, then
 *   drops back to a slow 20s sweep so a dropped event still cannot strand the
 *   view permanently.
 * - Refresh on tab focus, because nothing repaints while hidden.
 *
 * Row visibility is still RLS: postgres_changes evaluates each subscriber's
 * SELECT policy, so an agent is only woken by their own workspace's traffic.
 */
export function useLiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    const sb = supabaseBrowser();
    let disposed = false;
    let coalesce: ReturnType<typeof setTimeout> | undefined;
    let fallback: ReturnType<typeof setInterval> | undefined;

    const refresh = () => {
      if (disposed || coalesce) return;
      coalesce = setTimeout(() => {
        coalesce = undefined;
        // Refreshing a hidden tab spends a database round trip on pixels
        // nobody is looking at; the visibility handler catches up on return.
        if (!disposed && !document.hidden) router.refresh();
      }, 120);
    };

    const startFallback = (ms: number) => {
      if (fallback) clearInterval(fallback);
      fallback = setInterval(refresh, ms);
    };

    // Until the socket confirms, assume it will not arrive.
    startFallback(5_000);

    const channel = sb
      .channel("inbox-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, refresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chats" }, refresh)
      .subscribe((status) => {
        if (disposed) return;
        if (status === "SUBSCRIBED") {
          startFallback(20_000);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          startFallback(5_000);
        }
      });

    const onVisible = () => {
      if (!document.hidden) router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      disposed = true;
      if (coalesce) clearTimeout(coalesce);
      if (fallback) clearInterval(fallback);
      document.removeEventListener("visibilitychange", onVisible);
      void sb.removeChannel(channel);
    };
  }, [router]);
}
