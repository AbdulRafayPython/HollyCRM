# Product Requirements Document (PRD)

**Project Title:** HollyCRM — Supabase-Powered WhatsApp CRM for Group & Direct Lead Management with Hollyland AI Bot  
**Document Version:** 1.1  
**Status:** Approved for Technical Architecture & Implementation  
**Core Stack:** Supabase (PostgreSQL, Auth, RLS, Realtime, pgvector), Green API Gateway, Upstash Redis Queue, Next.js / Node.js  
**Target Domain:** Umrah & Hajj Hospitality / Makkah & Madinah Hotel Renting & Booking  

---

## 1. Executive Summary & Problem Statement

### 1.1 Project Vision
HollyCRM is a high-performance, WhatsApp-native Customer Relationship Management (CRM) platform built specifically for Umrah/Hajj hospitality providers managing Makkah and Madinah hotel bookings via the **Hollyland** inventory system.

### 1.2 The Core Industry Problem
Standard CRM platforms (e.g., Kommo CRM, Bitrix24) integrate with the **Official WhatsApp Business API (WABA)**. WABA explicitly lacks native support for **WhatsApp Groups** (`@g.us` JIDs). In the Umrah and Hajj hospitality market, a significant volume of leads and negotiations originate in multi-participant WhatsApp Groups (family groups, sub-agencies, group leaders).

By utilizing **Green API** (WhatsApp Web Protocol Gateway), HollyCRM bypasses WABA limitations, supporting both direct 1-on-1 chats and WhatsApp Groups natively.

### 1.3 Supabase Scalability Architecture
To ensure enterprise-grade scalability under high-volume WhatsApp traffic:
- **Webhook Ingestion Bottleneck Prevention:** Green API webhooks are received by a serverless queue (Upstash Redis / QStash) to decouple incoming HTTP traffic spikes from database writes.
- **Realtime Scalability:** Live inbox updates utilize **Supabase Realtime Broadcast** channels per active chat session, avoiding heavy Write-Ahead Log (WAL) parsing overhead across global tables.
- **Native Vector Search:** Integrated `pgvector` inside Supabase handles semantic search over Hollyland hotel properties without needing external vector database infrastructure.

---

## 2. User Roles, Access Control & RLS Rules

| Role | Description | Primary Capabilities |
| :--- | :--- | :--- |
| **Super Admin** | System administrator | Manages Green API instances, configures pipelines, manages agency staff, manages RAG knowledge base embeddings, views global analytics. |
| **Team Lead / Supervisor** | Sales manager | Reassigns leads, monitors agent chats, overrides bot responses, views performance reports. |
| **Sales Agent** | Front-line agent | Handles assigned direct & group chats, moves leads through stages, generates custom quotes, toggles bot pause state, adds internal notes. |
| **Hollyland AI Bot** | Automated assistant | Responds 24/7 to direct queries & group tags/keywords, performs RAG searches on Hollyland hotel inventory, updates lead stages. |

---

## 3. High-Level Technical Architecture

```
                          ┌──────────────────────────┐
                          │   Green API WhatsApp     │
                          │   (Direct & Groups)      │
                          └─────────────┬────────────┘
                                        │ Incoming Webhooks
                                        ▼
                          ┌──────────────────────────┐
                          │  Upstash Redis Webhook   │
                          │  Buffer & Queue Worker   │
                          └─────────────┬────────────┘
                                        │ Batched Ingestion
                                        ▼
                          ┌──────────────────────────┐
                          │    CRM Backend Engine    │
                          │  (Next.js / Node.js)     │
                          └──────┬────────────┬──────┘
                                 │            │
            ┌────────────────────┘            └────────────────────┐
            ▼                                                      ▼
┌───────────────────────────┐                              ┌───────────────────────────┐
│     Supabase Realtime     │                              │   Supabase Postgres DB    │
│  (Broadcast to UI Inboxes)│                              │   • Relational CRM Tables │
└───────────────────────────┘                              │   • pgvector (Hollyland)  │
                                                           │   • RLS Security Policies │
                                                           └───────────────────────────┘
```

---

## 4. Functional Module Specifications

### Module 1: Green API WhatsApp Integration Engine

#### 1.1 Webhook Queue & Rate Limiting
- **Ingestion Pipeline:** Inbound webhooks from Green API (`incomingMessageReceived`, `stateInstanceChanged`) hit an API route that immediately pushes payload into an Upstash Redis Queue.
- **Queue Worker:** Asynchronously processes jobs in micro-batches (up to 50 events/batch), writing to Supabase via service-role client.

#### 1.2 Direct vs. Group Chat Handling
- **Direct Messages (`@c.us`):** Auto-creates or updates `contacts` and `leads` tables. Triggers AI Bot immediately unless disabled.
- **Group Messages (`@g.us`):** Synchronizes group metadata (`whatsapp_groups`), participant list, and group admins. Tracks group leads individually.

#### 1.3 Outbound Messaging & Group Management
- **API Wrapper:** Supports sending text, image, PDF (vouchers, passports), audio, and location pins via Green API endpoint `/sendMessage`, `/sendFileByUrl`.
- **Group Actions:** Create group, add/remove members, update group title, and generate invite links directly inside CRM interface.

---

### Module 2: Unified Multi-Agent Shared Inbox

#### 2.1 Consolidated Inbox UI
- Real-time chat list filtered by: *My Chats*, *Unassigned*, *Group Chats*, *Archived*.
- Visual indicators for chat type (Direct icon vs. Group icon), unread count, agent presence, and AI Bot active status.

#### 2.2 Routing & Human-AI Collaboration
- **Claim/Assign:** Agents can claim unassigned group/direct chats or reassign them to team members.
- **Bot Pause Toggle:** A dedicated toggle button per conversation allows human agents to pause the AI Bot during negotiations.
- **Auto-Resume Timer:** Option to auto-reactivate the AI Bot after $N$ hours of inactivity.
- **Internal Notes:** `@mention` internal notes system stored in `internal_notes` table, visible only to team members, not sent to WhatsApp.

---

### Module 3: Lead Maturation & Pipeline Engine

#### 3.1 Custom Hospitality Pipeline Stages
1. **New Inquiry:** Automated creation upon first message or group addition.
2. **Requirements Gathered:** Auto-moved when AI/Agent parses dates, pax count, and city (Makkah/Madinah).
3. **Quotation Sent:** Auto-moved when hotel options card or price estimate is delivered.
4. **Under Negotiation:** Moved when agent toggles off AI Bot or custom rates are proposed.
5. **Voucher Issued / Closed-Won:** Final stage triggered upon uploading payment confirmation/hotel voucher.
6. **Closed-Lost:** Lead archived with mandatory drop reason (e.g., "Price High", "Dates Unavailable").

#### 3.2 Lead Attributes & Metadata
- Makkah Hotel preference, Madinah Hotel preference.
- Check-in / Check-out dates, Number of nights.
- Room configuration (Double, Triple, Quad, Sharing).
- Max distance to Haram (e.g., `< 500m`, `Shuttle Required`).
- Budget allocation, uploaded passport copies, visa files, and payment receipts.

---

### Module 4: Hollyland AI Knowledge Bot (Supabase `pgvector` RAG)

#### 4.1 Knowledge Ingestion & Hybrid Search
- Hollyland hotel database embedded into 1536-dimension vectors (OpenAI `text-embedding-3-small`) and stored in Supabase `hollyland_hotels` table with `pgvector` `hnsw` index.
- Hybrid Search executes semantic similarity + strict SQL filter (e.g., price range, distance to Haram, availability).

#### 4.2 Group Interaction Protocol
- **Direct Chats:** Bot replies to every user message.
- **Group Chats:** Passive monitoring mode. Replies ONLY if:
  1. Mentioned explicitly via `@bot` or name.
  2. Message matches regex intent patterns (e.g., `"Makkah hotel rates"`, `"distance from Haram"`).

#### 4.3 Fallback & Handoff
- Auto-escalates to human agent if:
  - Client requests custom discounts or speaks with aggressive/dissatisfied sentiment.
  - Zero matching properties exist in Hollyland inventory for requested dates.

---

### Module 5: Analytics & Operations Dashboard

- **Sales Pipeline Funnel:** Conversion rates between stages.
- **Agent KPI Tracking:** First response time (FRT), resolution rate, deals closed.
- **AI Automation Rate:** Percentage of inquiries resolved without human intervention.
- **Group Chat ROI:** Conversion rate of group-originated leads vs. 1-on-1 direct leads.

---

## 5. Complete Supabase Database Schema & RLS Setup

```sql
-- Enable Vector Extension
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Contacts Table
CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    whatsapp_jid VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255),
    phone VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. WhatsApp Groups Table
CREATE TABLE whatsapp_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_jid VARCHAR(100) UNIQUE NOT NULL,
    group_name VARCHAR(255) NOT NULL,
    participant_count INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Leads Table
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    group_id UUID REFERENCES whatsapp_groups(id) ON DELETE SET NULL,
    assigned_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    pipeline_stage VARCHAR(50) DEFAULT 'NEW_INQUIRY',
    makkah_hotel_pref VARCHAR(255),
    madinah_hotel_pref VARCHAR(255),
    check_in_date DATE,
    check_out_date DATE,
    pax_count INT,
    budget_usd DECIMAL(10, 2),
    is_bot_paused BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Messages Table
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    green_api_message_id VARCHAR(255) UNIQUE,
    sender_jid VARCHAR(100) NOT NULL,
    recipient_jid VARCHAR(100) NOT NULL,
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    is_group BOOLEAN DEFAULT FALSE,
    message_type VARCHAR(30) DEFAULT 'text',
    content TEXT,
    media_url TEXT,
    sender_type VARCHAR(20) CHECK (sender_type IN ('client', 'agent', 'bot')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Hollyland Hotel Knowledge Base (pgvector)
CREATE TABLE hollyland_hotels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_name VARCHAR(255) NOT NULL,
    city VARCHAR(50) CHECK (city IN ('Makkah', 'Madinah')),
    star_rating INT CHECK (star_rating BETWEEN 1 AND 5),
    walking_distance_meters INT,
    has_shuttle BOOLEAN DEFAULT FALSE,
    description TEXT,
    price_per_night_usd DECIMAL(10,2),
    is_available BOOLEAN DEFAULT TRUE,
    embedding VECTOR(1536)
);

-- Create HNSW Index for ultra-fast vector search
CREATE INDEX idx_hollyland_hotels_embedding 
ON hollyland_hotels 
USING hnsw (embedding vector_cosine_ops);

-- 6. Row Level Security (RLS) Policies
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Agents can view assigned leads or unassigned leads
CREATE POLICY "Agents view assigned or unassigned leads" 
ON leads FOR SELECT 
USING (
    assigned_agent_id = auth.uid() 
    OR assigned_agent_id IS NULL 
    OR EXISTS (
        SELECT 1 FROM auth.users 
        WHERE id = auth.uid() AND raw_app_meta_data->>'role' IN ('admin', 'team_lead')
    )
);

-- Agents can update their assigned leads
CREATE POLICY "Agents update assigned leads" 
ON leads FOR UPDATE 
USING (
    assigned_agent_id = auth.uid() 
    OR EXISTS (
        SELECT 1 FROM auth.users 
        WHERE id = auth.uid() AND raw_app_meta_data->>'role' IN ('admin', 'team_lead')
    )
);
```

---

## 6. Non-Functional & Scale Requirements

- **Scalability Target:** 50,000 incoming messages per day, 500 active WhatsApp groups, 50 concurrent sales agents.
- **Database Optimization:** Supavisor connection pooler enabled; Upstash Redis webhook queue ensures DB connection protection.
- **Latency SLAs:**
  - Inbound WhatsApp message to CRM inbox display: < 1.2s.
  - Hollyland RAG AI Bot query execution & reply generation: < 3.0s.
- **Security:** RLS enabled across all client data tables, TLS 1.3 in transit, AES-256 for Green API token storage at rest.

---

## 7. Implementation Roadmap

```
Stage 1: Core Setup ──► Stage 2: Ingestion ──► Stage 3: Multi-Agent ──► Stage 4: Hollyland RAG ──► Stage 5: Analytics
(Supabase & DB DDL)    (Green API Queue)      (Inbox & Bot Pause)     (pgvector & Search)     (Funnel & KPIs)
```

1. **Stage 1 (Week 1-2):** Supabase project initialization, DDL schema execution, Auth & RLS configuration, Green API instance connection.
2. **Stage 2 (Week 3-4):** Webhook handler development with Upstash Redis queue, direct message and group metadata sync.
3. **Stage 3 (Week 5-6):** Multi-agent shared inbox UI, Supabase Realtime Broadcast integration, Bot Pause toggle, pipeline Kanban board.
4. **Stage 4 (Week 7-8):** Hollyland hotel data ingestion, `pgvector` embedding pipeline, OpenAI intent parsing & group trigger rules.
5. **Stage 5 (Week 9-10):** Analytics dashboard, user testing, performance load testing, and production deployment.
