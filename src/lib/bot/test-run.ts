import { supabaseAdmin } from "@/lib/supabase/admin";
import { extractRequirements, isSocial } from "@/lib/deepseek/extract";
import {
  composeKnowledgeReply, composeReply, composeSocialReply, greetBackReply,
  holdingReply, introReply, noKnowledgeReply, noMatchReply, thanksReply,
} from "@/lib/deepseek/compose";
import { searchKnowledge } from "@/lib/knowledge/retrieve";
import { ACTION_LABEL, buildContext, evaluate, loadRules } from "./rules";
import { getBotSettings } from "./settings";
import { resolveLlm } from "@/lib/llm/resolve";
import type { HotelResult } from "@/lib/types";

/**
 * Runs a message through the real pipeline with delivery switched off.
 *
 * Every step here is the SAME function the live bot calls — the extractor, the
 * knowledge search, search_hotels(), the composers. A test harness that
 * reimplements the flow tests the harness, and would keep passing after the
 * real path broke, which is worse than having no test at all.
 *
 * What is deliberately NOT done: nothing is sent to WhatsApp, no lead is
 * created or advanced, no chat is assigned, no memory is written. A test must
 * be safe to run against a live workspace during a demo.
 */

export interface TraceStep {
  node: string;
  status: "ok" | "skipped" | "failed";
  summary: string;
  detail?: Record<string, unknown>;
  ms: number;
}

export interface TestResult {
  reply: string | null;
  intent: string;
  trace: TraceStep[];
  latencyMs: number;
  succeeded: boolean;
}

export async function runWorkflowTest(
  orgId: string,
  message: string,
  opts: { history?: string[]; speaker?: string | null } = {}
): Promise<TestResult> {
  const started = Date.now();
  const trace: TraceStep[] = [];
  const step = async <T,>(
    node: string,
    fn: () => Promise<{ status: TraceStep["status"]; summary: string; detail?: Record<string, unknown>; value: T }>
  ): Promise<T> => {
    const t0 = Date.now();
    try {
      const r = await fn();
      trace.push({ node, status: r.status, summary: r.summary, detail: r.detail, ms: Date.now() - t0 });
      return r.value;
    } catch (err) {
      trace.push({
        node, status: "failed",
        summary: err instanceof Error ? err.message : String(err),
        ms: Date.now() - t0,
      });
      throw err;
    }
  };

  const db = supabaseAdmin();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
  const settings = await getBotSettings(orgId);

  try {
    // ---- trigger ----
    await step("trigger", async () => ({
      status: "ok" as const,
      summary: `Simulated inbound message (${message.length} chars). Nothing is sent to WhatsApp.`,
      value: null,
    }));

    // ---- model ----
    const llm = await step("understand_model", async () => {
      const resolved = await resolveLlm(orgId);
      if (!resolved) {
        return {
          status: "failed" as const,
          summary: "No model configured — the agent cannot reply to anything.",
          value: null,
        };
      }
      return {
        status: "ok" as const,
        summary: `${resolved.provider} · ${resolved.model}${resolved.isFallback ? " (deployment key)" : ""}`,
        value: resolved,
      };
    });
    if (!llm) throw new Error("No model configured");

    // ---- understand ----
    const req = await step("understand", async () => {
      const r = await extractRequirements(message, {
        orgId,
        recent: opts.history,
        today,
        speaker: opts.speaker,
      });
      return {
        status: "ok" as const,
        summary: `Intent: ${r.intent}${r.wants_human ? " · wants a human" : ""} · language ${r.language}`,
        detail: {
          city: r.city, check_in: r.check_in, check_out: r.check_out,
          pax: r.pax, rooms: r.rooms, min_stars: r.min_stars,
          memory_facts: r.memory_facts,
        },
        value: r,
      };
    });

    // ---- the workspace's own rules ----
    // Reported, never carried out: a test that assigns a real chat or sends a
    // real reply is not a test. The operator sees which rule would have won.
    const ruleHit = await step("rules", async () => {
      const rules = await loadRules(orgId);
      if (rules.length === 0) {
        return { status: "skipped" as const, summary: "No rules — the built-in flow decides.", value: null };
      }
      const ctx = buildContext(req, {
        message,
        countryCode: null,
        isGroup: false,
      });
      const hits = evaluate(rules, ctx);
      if (hits.length === 0) {
        return {
          status: "skipped" as const,
          summary: `Checked ${rules.length} rule${rules.length === 1 ? "" : "s"} — none matched.`,
          value: null,
        };
      }
      const first = hits[hits.length - 1];
      return {
        status: "ok" as const,
        summary: `"${first.rule.name}" matched — ${ACTION_LABEL[first.action.type] ?? first.action.type}.`,
        detail: { matched: hits.map((h) => h.rule.name) },
        value: first,
      };
    });

    if (ruleHit && ruleHit.action.type !== "tag") {
      return finish(
        ruleHit.action.message?.trim() || holdingReply(req.language),
        `rule:${ruleHit.rule.name}`,
        trace,
        started
      );
    }

    // ---- human request ----
    if (req.intent === "human_request" || req.wants_human) {
      const routed = await previewRouting(orgId, step);
      return finish(
        holdingReply(req.language),
        req.intent, trace, started,
        routed
      );
    }

    // ---- social ----
    if (isSocial(req.intent)) {
      const reply = await step("greet", async () => {
        if (!settings.smalltalk_enabled) {
          return {
            status: "skipped" as const,
            summary: "Social replies are switched off — the agent would stay silent.",
            value: null,
          };
        }
        const composed = await composeSocialReply(req, {
          customerMessage: message, isGroup: false, settings, orgId,
          history: opts.history,
        });
        const text = composed ?? (req.intent === "thanks"
          ? thanksReply(req.language)
          : greetBackReply(req.language, opts.speaker));
        return {
          status: "ok" as const,
          summary: composed ? "Composed a social reply." : "Model unavailable — used the built-in wording.",
          value: text,
        };
      });
      return finish(reply ?? introReply(req.language, settings), req.intent, trace, started);
    }

    // ---- knowledge ----
    if (req.intent === "other_question") {
      const hits = await step("knowledge", async () => {
        if (!settings.knowledge_enabled) {
          return { status: "skipped" as const, summary: "Knowledge base is switched off.", value: [] };
        }
        const found = await searchKnowledge(orgId, message);
        return {
          status: found.length ? ("ok" as const) : ("skipped" as const),
          summary: found.length
            ? `${found.length} passage${found.length === 1 ? "" : "s"} matched.`
            : "Nothing in your documents matches — this goes to a human.",
          detail: { sources: found.map((h) => h.source_title) },
          value: found,
        };
      });

      if (hits.length === 0) {
        const routed = await previewRouting(orgId, step);
        return finish(noKnowledgeReply(req.language), req.intent, trace, started, routed);
      }

      const reply = await step("answer", async () => {
        const composed = await composeKnowledgeReply(req, {
          customerMessage: message, isGroup: false, settings, orgId, knowledge: hits,
        });
        return {
          status: composed ? ("ok" as const) : ("failed" as const),
          summary: composed ? "Answered from your documents." : "Composer returned nothing.",
          value: composed,
        };
      });
      return finish(reply ?? holdingReply(req.language), req.intent, trace, started);
    }

    // ---- inventory ----
    const hasSlots = Boolean(req.city && req.check_in && req.check_out);
    const hotels = await step("inventory", async () => {
      if (!settings.inventory_enabled) {
        return { status: "skipped" as const, summary: "Quoting is switched off.", value: [] as HotelResult[] };
      }
      if (!hasSlots) {
        const missing = [
          !req.city && "city", !req.check_in && "check-in", !req.check_out && "check-out",
        ].filter(Boolean);
        return {
          status: "skipped" as const,
          summary: `Can't search yet — still needs ${missing.join(", ")}. The agent asks instead.`,
          value: [] as HotelResult[],
        };
      }
      const { data, error } = await db.rpc("search_hotels", {
        p_city: req.city, p_check_in: req.check_in, p_check_out: req.check_out,
        p_pax: req.pax ?? 2, p_rooms: req.rooms,
        p_max_price_per_night: req.max_price_per_night,
        p_max_distance_m: req.max_distance_m, p_min_stars: req.min_stars,
        p_shuttle_ok: true, p_limit: 5,
      });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as HotelResult[];
      return {
        status: rows.length ? ("ok" as const) : ("skipped" as const),
        summary: rows.length
          ? `${rows.length} option${rows.length === 1 ? "" : "s"} available.`
          : "No inventory matches — this goes to a human.",
        detail: { options: rows.map((h) => `${h.hotel_name} · ${h.currency} ${h.total_price}`) },
        value: rows,
      };
    });

    if (!hasSlots) {
      // The clarify path is deterministic, so it is reported rather than run.
      return finish(
        `Happy to check availability — could you confirm ${
          [!req.city && "the city", !req.check_in && "your check-in date", !req.check_out && "your check-out date"]
            .filter(Boolean).join(" and ")
        }?`,
        req.intent, trace, started
      );
    }

    if (hotels.length === 0) {
      const routed = await previewRouting(orgId, step);
      return finish(noMatchReply(req.language, req), req.intent, trace, started, routed);
    }

    const reply = await step("quote", async () => {
      const composed = await composeReply(req, hotels, {
        customerMessage: message, isGroup: false, settings, orgId, history: opts.history,
      });
      return {
        status: composed ? ("ok" as const) : ("failed" as const),
        summary: composed ? "Quote written from the SQL results." : "Composer returned nothing.",
        value: composed,
      };
    });

    return finish(reply ?? holdingReply(req.language), req.intent, trace, started);
  } catch (err) {
    return {
      reply: null,
      intent: "error",
      trace,
      latencyMs: Date.now() - started,
      succeeded: false,
    };
  }
}

/**
 * Reports who WOULD take this chat, without assigning anything.
 *
 * assign_conversation() writes, so it cannot be called here — a test that
 * assigns a real chat to a real agent is not a test. This mirrors its selection
 * rules against the same available_agents view instead.
 */
async function previewRouting(
  orgId: string,
  step: <T>(
    node: string,
    fn: () => Promise<{ status: TraceStep["status"]; summary: string; detail?: Record<string, unknown>; value: T }>
  ) => Promise<T>
) {
  return step("route", async () => {
    const db = supabaseAdmin();
    const settings = await getBotSettings(orgId);
    if (!settings.auto_assign_enabled) {
      return {
        status: "skipped" as const,
        summary: "Auto-assign is off — the chat would wait in the unassigned queue.",
        value: null,
      };
    }

    const { data: agents } = await db
      .from("available_agents")
      .select("id, full_name, is_online, open_chats, max_open_chats")
      .eq("org_id", orgId);

    const free = (agents ?? []).filter(
      (a) => a.is_online && a.open_chats < a.max_open_chats
    );

    return {
      status: free.length ? ("ok" as const) : ("skipped" as const),
      summary: free.length
        ? `Would assign to ${free.sort((a, b) => a.open_chats - b.open_chats)[0].full_name ?? "an agent"}.`
        : "Nobody available — the customer would get your fallback message.",
      detail: { online: free.length, total: (agents ?? []).length },
      value: free.length > 0,
    };
  });
}

function finish(
  reply: string | null,
  intent: string,
  trace: TraceStep[],
  started: number,
  _routed?: unknown
): TestResult {
  return {
    reply,
    intent,
    trace,
    latencyMs: Date.now() - started,
    succeeded: !trace.some((t) => t.status === "failed"),
  };
}
