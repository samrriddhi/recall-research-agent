import { randomUUID } from "node:crypto";
import { db } from "../db/database.js";

export interface SourceRecord {
  title: string;
  url: string;
  snippet: string;
  content?: string;
  publishedAt?: string;
  modifiedAt?: string;
  fetchStatus?: "fetched" | "snippet-only";
  provider?: string;
  searchQuery?: string;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  sources: SourceRecord[];
}

interface DbMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

const insertConversation = db.prepare(`
  INSERT INTO conversations (id, title, created_at, updated_at)
  VALUES (@id, @title, @createdAt, @updatedAt)
`);
const insertMessage = db.prepare(`
  INSERT INTO messages (id, conversation_id, role, content, created_at)
  VALUES (@id, @conversationId, @role, @content, @createdAt)
`);
const insertSource = db.prepare(`
  INSERT INTO message_sources (
    message_id, title, url, snippet, content, published_at, modified_at,
    fetch_status, source_provider, search_query, retrieved_at
  )
  VALUES (
    @messageId, @title, @url, @snippet, @content, @publishedAt, @modifiedAt,
    @fetchStatus, @provider, @searchQuery, @retrievedAt
  )
`);

export function createConversation(title = "New conversation") {
  const id = randomUUID();
  const now = new Date().toISOString();
  insertConversation.run({ id, title, createdAt: now, updatedAt: now });
  return { id, title };
}

export function listConversations() {
  return db.prepare(`
    SELECT c.id, c.title, c.created_at AS createdAt, c.updated_at AS updatedAt,
      (SELECT content FROM messages m WHERE m.conversation_id = c.id
       ORDER BY m.created_at DESC LIMIT 1) AS preview
    FROM conversations c
    ORDER BY c.updated_at DESC
    LIMIT 100
  `).all();
}

export function conversationExists(id: string): boolean {
  return Boolean(db.prepare("SELECT 1 FROM conversations WHERE id = ?").get(id));
}

export function addMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  sources: SourceRecord[] = []
): MessageRecord {
  if (!conversationExists(conversationId)) throw new Error("Conversation was not found.");

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  db.transaction(() => {
    insertMessage.run({ id, conversationId, role, content, createdAt });
    for (const source of sources) {
      insertSource.run({
        messageId: id,
        title: source.title,
        url: source.url,
        snippet: source.snippet,
        content: source.content ?? "",
        publishedAt: source.publishedAt ?? null,
        modifiedAt: source.modifiedAt ?? null,
        fetchStatus: source.fetchStatus ?? "snippet-only",
        provider: source.provider ?? null,
        searchQuery: source.searchQuery ?? null,
        retrievedAt: createdAt
      });
    }
    db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?")
      .run(createdAt, conversationId);
  })();

  return { id, conversationId, role, content, createdAt, sources };
}

function mapMessage(row: DbMessage): MessageRecord {
  const sources = db.prepare(`
    SELECT
      title, url, snippet, content,
      published_at AS publishedAt,
      modified_at AS modifiedAt,
      fetch_status AS fetchStatus,
      source_provider AS provider,
      search_query AS searchQuery
    FROM message_sources
    WHERE message_id = ? ORDER BY id
  `).all(row.id) as SourceRecord[];

  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
    sources
  };
}

const MESSAGE_SELECT = "SELECT id, conversation_id, role, content, created_at FROM messages";

export function getConversationMessages(conversationId: string): MessageRecord[] {
  const rows = db.prepare(MESSAGE_SELECT + `
    WHERE conversation_id = ?
    ORDER BY created_at ASC LIMIT 500
  `).all(conversationId) as DbMessage[];
  return rows.map(mapMessage);
}

export function getRecentMessages(conversationId: string, limit = 12): MessageRecord[] {
  const rows = db.prepare(MESSAGE_SELECT + `
    WHERE conversation_id = ?
    ORDER BY created_at DESC LIMIT ?
  `).all(conversationId, limit) as DbMessage[];
  return rows.reverse().map(mapMessage);
}

export function getRecentHistory(limit = 12): MessageRecord[] {
  const rows = db.prepare(MESSAGE_SELECT + `
    ORDER BY created_at DESC LIMIT ?
  `).all(limit) as DbMessage[];
  return rows.reverse().map(mapMessage);
}

function buildFtsExpression(query: string): string {
  const stopWords = new Set([
    "what", "when", "where", "which", "about", "have", "that", "this",
    "with", "from", "were", "there", "them", "they", "then", "than",
    "does", "did", "has", "had", "would", "could", "should", "your",
    "you", "our", "last", "ask", "asked", "tell", "today", "since", "still",
    "on", "the", "and", "for"
  ]);
  const terms = [...new Set(
    (query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])
      .filter((term) => !stopWords.has(term))
  )].slice(0, 10);

  return terms.map((term) => '"' + term.replaceAll('"', '""') + '"').join(" OR ");
}

export function searchRelevantMessages(
  query: string,
  options: { from?: string; to?: string; limit?: number } = {}
): MessageRecord[] {
  const expression = buildFtsExpression(query);
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (expression) {
    clauses.push("messages_fts MATCH ?");
    params.push(expression);
  }
  if (options.from) {
    clauses.push("m.created_at >= ?");
    params.push(options.from);
  }
  if (options.to) {
    clauses.push("m.created_at < ?");
    params.push(options.to);
  }

  if (clauses.length === 0) return [];

  const querySql = expression
    ? `
      SELECT m.id, m.conversation_id, m.role, m.content, m.created_at
      FROM messages_fts
      JOIN messages m ON m.rowid = messages_fts.rowid
      WHERE ${clauses.join(" AND ")}
      ORDER BY bm25(messages_fts), m.created_at DESC
      LIMIT ?
    `
    : `
      SELECT m.id, m.conversation_id, m.role, m.content, m.created_at
      FROM messages m
      WHERE ${clauses.join(" AND ")}
      ORDER BY m.created_at DESC
      LIMIT ?
    `;

  params.push(options.limit ?? 12);
  const rows = db.prepare(querySql).all(...params) as DbMessage[];
  return rows.map(mapMessage);
}
