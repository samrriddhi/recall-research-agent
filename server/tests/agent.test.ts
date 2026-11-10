import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ollamaChat: vi.fn(),
  searchWeb: vi.fn()
}));

vi.mock("../src/agent/ollama-client.js", () => ({
  ollamaChat: mocks.ollamaChat
}));
vi.mock("../src/research/web-search.js", () => ({
  searchWeb: mocks.searchWeb
}));

import { runChat } from "../src/agent/agent.service.js";
import { addMessage, createConversation } from "../src/memory/memory.service.js";
import { db } from "../src/db/database.js";

describe("agent memory-to-search orchestration", () => {
  afterEach(() => {
    db.exec("DELETE FROM conversations");
    mocks.ollamaChat.mockReset();
    mocks.searchWeb.mockReset();
  });

  it("recovers a shortlist from recent history when the follow-up uses pronouns", async () => {
    const conversation = createConversation("CRM shortlist");
    addMessage(
      conversation.id,
      "user",
      "We shortlisted HubSpot, Salesforce, and Pipedrive for a 20-person sales team."
    );

    mocks.ollamaChat.mockResolvedValue({
      message: { role: "assistant", content: "I will compare the current product updates." }
    });
    mocks.searchWeb.mockImplementation(async (query: string) => [{
      title: query + " official updates",
      url: "https://example.com/" + encodeURIComponent(query),
      snippet: "Current pricing and release information.",
      source: "DuckDuckGo HTML",
      content: "Product pricing and release information was reviewed.",
      fetchStatus: "fetched"
    }]);

    const result = await runChat({
      content: "Has any of them changed pricing or shipped something big since?",
      referenceTime: "2026-11-10T15:00:00.000Z",
      timeZone: "Asia/Kolkata"
    });

    expect(result.memoryMatches).toBeGreaterThan(0);
    expect(mocks.searchWeb).toHaveBeenCalledTimes(3);
    const queries = mocks.searchWeb.mock.calls.map((call) => String(call[0]));
    expect(queries.some((query) => query.includes("HubSpot"))).toBe(true);
    expect(queries.some((query) => query.includes("Salesforce"))).toBe(true);
    expect(queries.some((query) => query.includes("Pipedrive"))).toBe(true);
    expect(result.sources).toHaveLength(3);
    expect(mocks.ollamaChat).toHaveBeenCalledTimes(2);
  });

  it("loads recent history for a question about whether an earlier answer is still correct", async () => {
    const conversation = createConversation("Postgres hosting");
    addMessage(conversation.id, "assistant", "Earlier, I said Neon offered a free Postgres tier.");

    mocks.ollamaChat.mockResolvedValue({
      message: { role: "assistant", content: "I will verify the earlier answer." }
    });
    mocks.searchWeb.mockResolvedValue([{
      title: "Current pricing",
      url: "https://example.com/pricing",
      snippet: "Current public plan information.",
      source: "DuckDuckGo HTML",
      fetchStatus: "snippet-only"
    }]);

    const result = await runChat({
      content: "Is your previous answer still correct today?",
      referenceTime: "2026-11-10T15:00:00.000Z",
      timeZone: "Asia/Kolkata"
    });

    expect(result.memoryMatches).toBeGreaterThan(0);
    expect(mocks.searchWeb).toHaveBeenCalled();
  });
});
