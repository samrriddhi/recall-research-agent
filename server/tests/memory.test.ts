import { beforeEach, describe, expect, it } from "vitest";
import {
  addMessage,
  createConversation,
  getConversationMessages,
  listConversations,
  searchRelevantMessages
} from "../src/memory/memory.service.js";
import { db } from "../src/db/database.js";

describe("conversation memory", () => {
  beforeEach(() => {
    db.exec("DELETE FROM conversations");
  });

  it("persists messages and their source evidence", () => {
    const conversation = createConversation("Postgres hosting shortlist");
    addMessage(
      conversation.id,
      "user",
      "We compared Neon and Supabase for a Postgres project."
    );
    addMessage(
      conversation.id,
      "assistant",
      "The shortlist included Neon and Supabase.",
      [{
        title: "Neon pricing",
        url: "https://neon.com/pricing",
        snippet: "Plan and usage details.",
        content: "The Pro plan price changed on November 7, 2026.",
        publishedAt: "2026-11-05T12:00:00.000Z",
        modifiedAt: "2026-11-09T12:00:00.000Z",
        fetchStatus: "fetched"
      }]
    );

    const messages = getConversationMessages(conversation.id);
    expect(messages).toHaveLength(2);
    expect(messages[1]?.sources[0]?.url).toBe("https://neon.com/pricing");
    expect(messages[1]?.sources[0]?.content).toContain("price changed");
    expect(messages[1]?.sources[0]?.publishedAt).toBe("2026-11-05T12:00:00.000Z");
    expect(messages[1]?.sources[0]?.modifiedAt).toBe("2026-11-09T12:00:00.000Z");
    expect(messages[1]?.sources[0]?.fetchStatus).toBe("fetched");
  });

  it("finds relevant messages across conversations using FTS", () => {
    const first = createConversation("CRM research");
    const second = createConversation("Unrelated topic");

    addMessage(first.id, "user", "We shortlisted five CRM tools for the sales team.");
    addMessage(second.id, "user", "I asked about a PostgreSQL database.");

    const matches = searchRelevantMessages("CRM sales team");
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.some((message) => message.conversationId === first.id)).toBe(true);
    expect(matches.some((message) => message.conversationId === second.id)).toBe(false);
  });

  it("retrieves all messages within a date window when no lexical query is supplied", () => {
    const conversation = createConversation("Decision record");
    addMessage(conversation.id, "user", "We shortlisted Neon for the prototype.");
    addMessage(conversation.id, "assistant", "The shortlist and reasons are recorded.");

    const allMessages = getConversationMessages(conversation.id);
    const from = new Date(Date.parse(allMessages[0]!.createdAt) - 1000).toISOString();
    const to = new Date(Date.now() + 1000).toISOString();

    const matches = searchRelevantMessages("", { from, to, limit: 20 });
    expect(matches.map((message) => message.id)).toEqual(allMessages.map((message) => message.id));
  });

  it("updates conversation previews and ordering after messages are added", () => {
    const conversation = createConversation("My topic");
    addMessage(conversation.id, "user", "The last message is about database hosting.");
    const listed = listConversations() as Array<{ id: string; preview: string }>;
    expect(listed[0]?.id).toBe(conversation.id);
    expect(listed[0]?.preview).toContain("database hosting");
  });
});
