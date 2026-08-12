import { supabaseAdmin } from "@/lib/supabase/admin";

export interface KnowledgeHit {
  chunk_id: string;
  source_title: string;
  heading: string | null;
  content: string;
  rank: number;
}

/** Chunks are ~900 chars; four of them is a prompt supplement, not a document. */
const DEFAULT_LIMIT = 4;

/**
 * Pulls the passages that might answer a question, or nothing at all.
 *
 * On the reply path, so it is a single indexed SQL call — no embedding request,
 * no second model round trip. `search_knowledge` (0019) ranks with ts_rank over
 * a GIN index and, crucially, returns zero rows when the corpus has nothing to
 * say. That empty result is a feature: the composer is told it has no
 * documented answer and hands off, instead of being given the least-irrelevant
 * paragraph in the file and confabulating a policy from it.
 */
export async function searchKnowledge(
  orgId: string,
  query: string,
  limit = DEFAULT_LIMIT
): Promise<KnowledgeHit[]> {
  const q = query.trim();
  if (!q) return [];

  try {
    const { data, error } = await supabaseAdmin().rpc("search_knowledge", {
      p_org_id: orgId,
      p_query: q.slice(0, 500),
      p_limit: limit,
    });
    if (error || !data) return [];
    return data as KnowledgeHit[];
  } catch (err) {
    // A knowledge lookup must never take the reply down with it. Without the
    // passages the bot answers from inventory alone, which is exactly how it
    // behaved before this table existed.
    console.error("[knowledge] search failed", err);
    return [];
  }
}

/** The excerpt block for a prompt. Titles are kept so a reply can cite where
 *  a policy came from, and so a stale document is traceable afterwards. */
export function formatKnowledge(hits: KnowledgeHit[]): string {
  return hits
    .map((h, i) => {
      const where = h.heading ? `${h.source_title} — ${h.heading}` : h.source_title;
      return `[${i + 1}] ${where}\n${h.content}`;
    })
    .join("\n\n");
}
