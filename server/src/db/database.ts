import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { env } from "../config/env.js";

const inMemory = env.DATABASE_PATH === ":memory:";
const databasePath = inMemory ? ":memory:" : resolve(process.cwd(), env.DATABASE_PATH);
if (!inMemory) mkdirSync(dirname(databasePath), { recursive: true });

export const db = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

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

// Additive source-evidence migrations preserve existing local databases.

const sourceColumns = new Set(
  (db.prepare("PRAGMA table_info(message_sources)").all() as Array<{ name: string }>)
    .map((column) => column.name)
);
if (!sourceColumns.has("content")) {
  db.exec("ALTER TABLE message_sources ADD COLUMN content TEXT NOT NULL DEFAULT ''");
}
if (!sourceColumns.has("published_at")) {
  db.exec("ALTER TABLE message_sources ADD COLUMN published_at TEXT");
}
if (!sourceColumns.has("modified_at")) {
  db.exec("ALTER TABLE message_sources ADD COLUMN modified_at TEXT");
}
if (!sourceColumns.has("fetch_status")) {
  db.exec("ALTER TABLE message_sources ADD COLUMN fetch_status TEXT NOT NULL DEFAULT 'snippet-only'");
}
if (!sourceColumns.has("source_provider")) {
  db.exec("ALTER TABLE message_sources ADD COLUMN source_provider TEXT");
}
if (!sourceColumns.has("search_query")) {
  db.exec("ALTER TABLE message_sources ADD COLUMN search_query TEXT");
}

// Rebuild at startup to recover an FTS index if the database was upgraded
// from an earlier schema version or the index was interrupted by a crash.
db.exec("INSERT INTO messages_fts(messages_fts) VALUES ('rebuild')");
