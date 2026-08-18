// Hand-written slice of the schema in supabase/migrations/0001_hollycrm_init.sql.
// Regenerate properly later with: supabase gen types typescript --linked

/**
 * A workspace has one owner, any number of sales agents, and — since 0030 —
 * supervisors in between: desk leads who run a market without holding the
 * workspace's credentials.
 *
 * `super_admin`/`team_lead`/`agent` are the pre-0011 vocabulary, kept in the
 * union because the enum still carries them and an un-migrated row would
 * otherwise fail to type. Treat them as legacy aliases — never assign them.
 */
export type AppRole =
  | "owner"
  | "supervisor"
  | "sales_agent"
  | "super_admin"
  | "team_lead"
  | "agent";

export const ROLE_LABELS: Record<AppRole, string> = {
  owner: "Owner",
  supervisor: "Supervisor",
  sales_agent: "Sales agent",
  super_admin: "Owner",
  team_lead: "Supervisor",
  agent: "Sales agent",
};

/**
 * Owns the workspace: billing, the WhatsApp connection, the model key, and the
 * team. Mirrors app.is_owner().
 *
 * 0033 moved the credential-bearing tables (green_api_instances,
 * wasender_sessions, llm_providers, webhook_events, ai_runs) from is_supervisor
 * to is_owner, so a route guarding one of those must use THIS helper — a
 * supervisor who passes the route check only gets a raw RLS error instead.
 */
export function isOwner(role: string | null | undefined): boolean {
  return role === "owner" || role === "super_admin";
}

/**
 * May reassign chats, keep the rate sheet current and run a desk. Mirrors
 * app.is_supervisor() — keep the two in step, since the API layer deliberately
 * lets RLS answer the access question and a drift shows up as a 500, not a 403.
 */
export function isSupervisor(role: string | null | undefined): boolean {
  return isOwner(role) || role === "supervisor" || role === "team_lead";
}
export type ChatType = "direct" | "group";
export type SenderType = "client" | "agent" | "bot" | "system";
export type MsgDirection = "in" | "out";
export type MsgType =
  | "text" | "image" | "document" | "audio" | "video"
  | "location" | "contact" | "sticker" | "unsupported";
export type LeadStage =
  | "new_inquiry" | "requirements_gathered" | "quotation_sent"
  | "under_negotiation" | "closed_won" | "closed_lost";
/**
 * Was the `public.city_name` enum. 0031 made destinations org-owned rows and
 * 0033 dropped the matching CHECK off leads.city, so the value is now whatever
 * the operator named a market — "Dubai", "Istanbul". The two originals are kept
 * as a hint, not a ceiling: narrowing this back to a union is what made the
 * schema unable to sell anything outside the Haram.
 */
export type CityName = "Makkah" | "Madinah" | (string & {});
export type RoomConfig = "single" | "double" | "triple" | "quad" | "sharing";

export const LEAD_STAGES: LeadStage[] = [
  "new_inquiry", "requirements_gathered", "quotation_sent",
  "under_negotiation", "closed_won", "closed_lost",
];

export const STAGE_LABELS: Record<LeadStage, string> = {
  new_inquiry: "New Inquiry",
  requirements_gathered: "Requirements Gathered",
  quotation_sent: "Quotation Sent",
  under_negotiation: "Under Negotiation",
  closed_won: "Voucher Issued / Won",
  closed_lost: "Closed Lost",
};

export interface Chat {
  id: string;
  org_id: string;
  chat_jid: string;
  chat_type: ChatType;
  title: string | null;
  contact_id: string | null;
  participant_count: number;
  assigned_agent_id: string | null;
  is_bot_paused: boolean;
  bot_resume_at: string | null;
  bot_replies_today: number;
  last_bot_reply_at: string | null;
  last_message_at: string | null;
  first_agent_reply_at: string | null;
  unread_count: number;
  is_archived: boolean;
}

export interface Message {
  id: string;
  chat_id: string;
  lead_id: string | null;
  wa_message_id: string | null;
  direction: MsgDirection;
  sender_type: SenderType;
  /**
   * Which contact sent it. Written by ingest since 0001 and, until 0020, read
   * by nothing — which is why every inbound bubble in a group said "Client".
   * Null on outbound and on senders we could not resolve.
   */
  sender_contact_id?: string | null;
  message_type: MsgType;
  body: string | null;
  media_path: string | null;
  media_mime?: string | null;
  media_name?: string | null;
  /**
   * Short-lived signed URL for `media_path`, minted per request and never
   * stored — the bucket is private. Absent until signed; see /api/chats/[id]/media.
   */
  media_url?: string | null;
  reply_to_wa_message_id: string | null;
  wa_timestamp: string;
  delivery_status: string;
}

export interface Lead {
  id: string;
  org_id: string;
  chat_id: string;
  contact_id: string | null;
  assigned_agent_id: string | null;
  stage: LeadStage;
  /** Slot memory for the bot: what the customer has told us, carried across turns. */
  city: CityName | null;
  /** 0033: the authoritative market. `city` mirrors destinations.name off it. */
  destination_id: string | null;
  min_stars: number | null;
  makkah_hotel_pref: string | null;
  madinah_hotel_pref: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  nights: number | null;
  pax_count: number | null;
  rooms_count: number | null;
  room_configuration: RoomConfig | null;
  max_distance_m: number | null;
  shuttle_acceptable: boolean;
  budget_amount: number | null;
  budget_currency: string;
  drop_reason: string | null;
  /** Consecutive unanswered clarifying questions; 3 escalates to a human. */
  clarify_attempts: number;
  created_at?: string;
  updated_at?: string;
}

/** One row returned by the search_hotels() SQL function. */
export interface HotelResult {
  hotel_id: string;
  hotel_name: string;
  star_rating: number | null;
  distance_m: number | null;
  has_shuttle: boolean;
  room_type: string;
  capacity: number;
  /**
   * How many rooms of this type the party needs. Equals the customer's own room
   * count when they gave one, otherwise ceil(pax / capacity). total_price is for
   * this many rooms, not one.
   */
  rooms_needed: number;
  nights: number;
  price_per_night: number;
  total_price: number;
  currency: string;
  rooms_available: number;
  description: string | null;
}
