import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const databasePath = resolve(process.cwd(), "./data/recall.sqlite");
mkdirSync(dirname(databasePath), { recursive: true });

const db = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS message_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    snippet TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    published_at TEXT,
    modified_at TEXT,
    fetch_status TEXT NOT NULL DEFAULT 'snippet-only',
    source_provider TEXT,
    search_query TEXT,
    retrieved_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conversation_date
    ON messages(conversation_id, created_at);

  CREATE INDEX IF NOT EXISTS idx_conversations_updated
    ON conversations(updated_at DESC);

  CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts
    USING fts5(content, content='messages', content_rowid='rowid');

  CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
    INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
  END;

  CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, content)
    VALUES ('delete', old.rowid, old.content);
  END;
`);

const insertConversation = db.prepare(`
  INSERT INTO conversations (id, title, created_at, updated_at)
  VALUES (@id, @title, @createdAt, @updatedAt)
  ON CONFLICT(id) DO UPDATE SET
    title = excluded.title,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at
`);

const insertMessage = db.prepare(`
  INSERT INTO messages (id, conversation_id, role, content, created_at)
  VALUES (@id, @conversationId, @role, @content, @createdAt)
`);

const insertSource = db.prepare(`
  INSERT INTO message_sources (
    message_id, title, url, snippet, content, published_at, modified_at,
    fetch_status, source_provider, search_query, retrieved_at
  ) VALUES (
    @messageId, @title, @url, @snippet, @content, @publishedAt, @modifiedAt,
    @fetchStatus, @sourceProvider, @searchQuery, @retrievedAt
  )
`);

const deleteConversationMessages = db.prepare("DELETE FROM messages WHERE conversation_id = ?");

interface SeedSource {
  title: string;
  url: string;
  snippet: string;
  content: string;
  publishedAt?: string;
  modifiedAt?: string;
  fetchStatus: "fetched" | "snippet-only";
  sourceProvider: string;
  searchQuery: string;
  retrievedAt: string;
}

interface SeedMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  sources: SeedSource[];
}

interface SeedConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: SeedMessage[];
}

const conversations: SeedConversation[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    title: "Redis vs DragonflyDB memory benchmarks",
    createdAt: "2026-11-03T10:30:00+05:30",
    updatedAt: "2026-11-03T10:32:00+05:30",
    messages: [
      {
        id: "10000000-0000-4000-8000-000000000001",
        role: "user",
        content: "Compare Redis and DragonflyDB memory overhead for session caching. Which one is more memory-efficient?",
        createdAt: "2026-11-03T10:30:00+05:30",
        sources: []
      },
      {
        id: "10000000-0000-4000-8000-000000000002",
        role: "assistant",
        content:
          "For session caching, DragonflyDB has lower memory overhead in the stored benchmark comparison: Redis used about 650 MB for 1 million 1 KB sessions, while DragonflyDB used about 480 MB. Redis is the safer choice when ecosystem compatibility and operational maturity matter most; DragonflyDB is preferable when the Redis API compatibility plus lower memory overhead can deliver a meaningful density improvement. These figures are stored benchmark snapshots, not universal production estimates.",
        createdAt: "2026-11-03T10:32:00+05:30",
        sources: [
          {
            title: "Redis benchmark notes — Session cache memory",
            url: "https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/memory-optimization/",
            snippet: "Redis memory optimization guidance for session and cache workloads.",
            content: "Redis memory usage depends on key count, session payload size, expiration overhead, allocator behavior and replication configuration. Benchmark the actual serialized session objects rather than relying on a generic memory-per-key estimate.",
            publishedAt: "2026-11-03T10:31:00+05:30",
            modifiedAt: "2026-11-03T10:31:00+05:30",
            fetchStatus: "fetched",
            sourceProvider: "Redis documentation",
            searchQuery: "Redis DragonflyDB session cache memory benchmark",
            retrievedAt: "2026-11-03T10:32:00+05:30"
          },
          {
            title: "DragonflyDB benchmark snapshot — 1M session objects",
            url: "https://www.dragonflydb.io/docs/",
            snippet: "Stored benchmark snapshot: 1 million 1 KB session objects.",
            content: "Benchmark setup: 1 million 1 KB serialized session values, equivalent TTL policies and identical hardware. Redis snapshot: approximately 650 MB resident memory. DragonflyDB snapshot: approximately 480 MB resident memory. Results are workload-specific and should be reproduced before sizing production capacity.",
            publishedAt: "2026-11-03T10:31:00+05:30",
            modifiedAt: "2026-11-03T10:31:00+05:30",
            fetchStatus: "fetched",
            sourceProvider: "DragonflyDB documentation",
            searchQuery: "DragonflyDB Redis session benchmark memory",
            retrievedAt: "2026-11-03T10:32:00+05:30"
          }
        ]
      }
    ]
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    title: "Postgres hosting pricing",
    createdAt: "2026-11-10T14:00:00+05:30",
    updatedAt: "2026-11-10T14:03:00+05:30",
    messages: [
      {
        id: "10000000-0000-4000-8000-000000000003",
        role: "user",
        content: "I am choosing Postgres hosting. Compare the free or starter pricing for Neon, Supabase, and Railway.",
        createdAt: "2026-11-10T14:00:00+05:30",
        sources: []
      },
      {
        id: "10000000-0000-4000-8000-000000000004",
        role: "assistant",
        content:
          "Stored pricing snapshot: Neon Launch is $19/mo, Supabase Pro is $25/mo, and Railway Hobby is $5/mo. These are list-price snapshots and should be checked against usage limits, region, included resources and billing cadence before making a decision.",
        createdAt: "2026-11-10T14:03:00+05:30",
        sources: [
          {
            title: "Neon pricing snapshot",
            url: "https://neon.com/pricing",
            snippet: "Neon Launch plan stored at $19/mo.",
            content: "Neon Launch plan: $19 per month in the stored 10 November 2026 snapshot. Verify project limits, compute allowances and add-on usage against the live pricing page.",
            publishedAt: "2026-11-10T14:01:00+05:30",
            modifiedAt: "2026-11-10T14:01:00+05:30",
            fetchStatus: "fetched",
            sourceProvider: "Neon",
            searchQuery: "Neon Launch pricing $19",
            retrievedAt: "2026-11-10T14:02:00+05:30"
          },
          {
            title: "Supabase pricing snapshot",
            url: "https://supabase.com/pricing",
            snippet: "Supabase Pro plan stored at $25/mo.",
            content: "Supabase Pro plan: $25 per month in the stored 10 November 2026 snapshot. Confirm usage quotas, spending controls and regional pricing before purchase.",
            publishedAt: "2026-11-10T14:01:00+05:30",
            modifiedAt: "2026-11-10T14:01:00+05:30",
            fetchStatus: "fetched",
            sourceProvider: "Supabase",
            searchQuery: "Supabase Pro pricing $25",
            retrievedAt: "2026-11-10T14:02:00+05:30"
          },
          {
            title: "Railway pricing snapshot",
            url: "https://railway.com/pricing",
            snippet: "Railway Hobby plan stored at $5/mo.",
            content: "Railway Hobby plan: $5 per month in the stored 10 November 2026 snapshot. Recheck included usage, usage-based charges and any workspace restrictions before deployment.",
            publishedAt: "2026-11-10T14:01:00+05:30",
            modifiedAt: "2026-11-10T14:01:00+05:30",
            fetchStatus: "fetched",
            sourceProvider: "Railway",
            searchQuery: "Railway Hobby pricing $5",
            retrievedAt: "2026-11-10T14:02:00+05:30"
          }
        ]
      }
    ]
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    title: "Five CRM tools for a 15-person team",
    createdAt: "2026-11-16T11:00:00+05:30",
    updatedAt: "2026-11-16T11:04:00+05:30",
    messages: [
      {
        id: "10000000-0000-4000-8000-000000000005",
        role: "user",
        content: "Let's shortlist five CRM tools for a 15-person B2B team: HubSpot, Salesforce, Pipedrive, Zoho CRM, and Freshsales",
        createdAt: "2026-11-16T11:00:00+05:30",
        sources: []
      },
      {
        id: "10000000-0000-4000-8000-000000000006",
        role: "assistant",
        content:
          "Starter-tier snapshot for the 15-person B2B shortlist: HubSpot has a lightweight starter CRM package; Salesforce has Starter Suite for small sales teams; Pipedrive has Essential for pipeline management; Zoho CRM has Standard for core sales automation; and Freshsales has Growth for CRM and sales engagement. The stored summary is suitable for a first comparison, but exact per-seat totals and feature gates vary, so confirm current regional pricing and the 15-seat bill before selecting.",
        createdAt: "2026-11-16T11:04:00+05:30",
        sources: [
          {
            title: "HubSpot CRM starter snapshot",
            url: "https://www.hubspot.com/pricing/crm",
            snippet: "HubSpot starter CRM package for the 15-person shortlist.",
            content: "Stored snapshot: HubSpot starter CRM coverage, with entry-level marketing, sales and service feature gates. Confirm current seat and package limits.",
            fetchStatus: "fetched",
            sourceProvider: "HubSpot",
            searchQuery: "HubSpot CRM starter tier 15 person team",
            retrievedAt: "2026-11-16T11:03:00+05:30"
          },
          {
            title: "Salesforce Starter Suite snapshot",
            url: "https://www.salesforce.com/sales/small-business-crm/pricing/",
            snippet: "Salesforce Starter Suite for a 15-person team comparison.",
            content: "Stored snapshot: Salesforce Starter Suite was considered for a small B2B sales team. Verify current editions, seat minimums and add-ons.",
            fetchStatus: "fetched",
            sourceProvider: "Salesforce",
            searchQuery: "Salesforce Starter Suite pricing",
            retrievedAt: "2026-11-16T11:03:00+05:30"
          },
          {
            title: "Pipedrive Essential snapshot",
            url: "https://www.pipedrive.com/en/pricing",
            snippet: "Pipedrive Essential pipeline starter tier.",
            content: "Stored snapshot: Pipedrive Essential was shortlisted for pipeline-focused sales work. Confirm automation and integration limits for 15 users.",
            fetchStatus: "fetched",
            sourceProvider: "Pipedrive",
            searchQuery: "Pipedrive Essential pricing",
            retrievedAt: "2026-11-16T11:03:00+05:30"
          },
          {
            title: "Zoho CRM Standard snapshot",
            url: "https://www.zoho.com/crm/zohocrm-pricing.html",
            snippet: "Zoho CRM Standard tier for small B2B teams.",
            content: "Stored snapshot: Zoho CRM Standard was shortlisted for core CRM and sales automation. Recheck per-user billing and feature limits.",
            fetchStatus: "fetched",
            sourceProvider: "Zoho CRM",
            searchQuery: "Zoho CRM Standard pricing",
            retrievedAt: "2026-11-16T11:03:00+05:30"
          },
          {
            title: "Freshsales Growth snapshot",
            url: "https://www.freshworks.com/crm/sales/pricing/",
            snippet: "Freshsales Growth tier for a 15-person sales team.",
            content: "Stored snapshot: Freshsales Growth was shortlisted for CRM and sales engagement. Verify billing, feature gates and 15-seat totals.",
            fetchStatus: "fetched",
            sourceProvider: "Freshsales",
            searchQuery: "Freshsales Growth pricing",
            retrievedAt: "2026-11-16T11:03:00+05:30"
          }
        ]
      }
    ]
  }
];

const seed = db.transaction(() => {
  for (const conversation of conversations) {
    insertConversation.run({
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt
    });

    deleteConversationMessages.run(conversation.id);

    for (const message of conversation.messages) {
      insertMessage.run({
        id: message.id,
        conversationId: conversation.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt
      });

      for (const source of message.sources) {
        insertSource.run({
          messageId: message.id,
          title: source.title,
          url: source.url,
          snippet: source.snippet,
          content: source.content,
          publishedAt: source.publishedAt ?? null,
          modifiedAt: source.modifiedAt ?? null,
          fetchStatus: source.fetchStatus,
          sourceProvider: source.sourceProvider,
          searchQuery: source.searchQuery,
          retrievedAt: source.retrievedAt
        });
      }
    }
  }
});

seed();
db.exec("INSERT INTO messages_fts(messages_fts) VALUES ('rebuild')");

for (const conversation of conversations) {
  const messageCount = db.prepare("SELECT COUNT(*) AS count FROM messages WHERE conversation_id = ?")
    .get(conversation.id) as { count: number };
  const sourceCount = db.prepare(`
    SELECT COUNT(*) AS count
    FROM message_sources s
    JOIN messages m ON m.id = s.message_id
    WHERE m.conversation_id = ?
  `).get(conversation.id) as { count: number };
  console.log(`${conversation.title}: ${messageCount.count} messages, ${sourceCount.count} source snapshots`);
}

db.close();
