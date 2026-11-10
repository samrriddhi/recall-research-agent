import { randomUUID } from "node:crypto";
import { db } from "../db/database.js";

export interface SourceRecord {
  title: string;
  url: string;
  snippet: string;
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
  INSERT INTO message_sources (message_id, title, url, snippet, retrieved_at)
  VALUES (@messageId, @title, @url, @snippet, @retrievedAt)
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
    SELECT title, url, snippet FROM message_sources
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

export function getConversationMessages(conversationId: string): MessageRecord[] {
  const rows = db.prepare(`
    SELECT id, conversation_id, role, content, created_at
    FROM messages WHERE conversation_id = ?
    ORDER BY created_at ASC LIMIT 500
  `).all(conversationId) as DbMessage[];
  return rows.map(mapMessage);
}

export function getRecentMessages(conversationId: string, limit = 12): MessageRecord[] {
  const rows = db.prepare(`
    SELECT id, conversation_id, role, content, created_at
    FROM messages WHERE conversation_id = ?
    ORDER BY created_at DESC LIMIT ?
  `).all(conversationId, limit) as DbMessage[];
  return rows.reverse().map(mapMessage);
}

function buildFtsExpression(query: string): string {
  const stopWords = new Set([
    "what", "when", "where", "which", "about", "have", "that", "this",
    "with", "from", "were", "there", "them", "they", "then", "than",
    "does", "did", "has", "had", "would", "could", "should", "your",
    "you", "our", "last", "asked", "tell", "today", "since", "still"
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
  if (!expression) return [];

  const clauses = ["messages_fts MATCH ?"];
  const params: Array<string | number> = [expression];
  if (options.from) {
    clauses.push("m.created_at >= ?");
    params.push(options.from);
  }
  if (options.to) {
    clauses.push("m.created_at < ?");
    params.push(options.to);
  }
  params.push(options.limit ?? 8);

  const rows = db.prepare(`
    SELECT m.id, m.conversation_id, m.role, m.content, m.created_at
    FROM messages_fts
    JOIN messages m ON m.rowid = messages_fts.rowid
    WHERE ${clauses.join(" AND ")}
    ORDER BY bm25(messages_fts), m.created_at DESC
    LIMIT ?
  `).all(...params) as DbMessage[];

  return rows.map(mapMessage);
}
