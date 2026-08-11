// Hand-written slice of the schema in supabase/migrations/0001_hollycrm_init.sql.
// Regenerate properly later with: supabase gen types typescript --linked

/**
 * A workspace has one owner and any number of sales agents.
 *
 * `super_admin`/`team_lead`/`agent` are the pre-0011 vocabulary, kept in the
 * union because the enum still carries them and an un-migrated row would
 * otherwise fail to type. Treat them as legacy aliases — never assign them.
 */
export type AppRole =
  | "owner"
  | "sales_agent"
  | "super_admin"
  | "team_lead"
  | "agent";

export const ROLE_LABELS: Record<AppRole, string> = {
  owner: "Owner",
  sales_agent: "Sales agent",
  super_admin: "Owner",
  team_lead: "Owner",
  agent: "Sales agent",
};

/** Owns the workspace: billing, the WhatsApp connection, and the team. */
export function isOwner(role: string | null | undefined): boolean {
  return role === "owner" || role === "super_admin";
}

/** May reassign chats and change workspace settings. Mirrors app.is_supervisor(). */
export function isSupervisor(role: string | null | undefined): boolean {
  return isOwner(role) || role === "team_lead";
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
export type CityName = "Makkah" | "Madinah";
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
  city: "Makkah" | "Madinah" | null;
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
