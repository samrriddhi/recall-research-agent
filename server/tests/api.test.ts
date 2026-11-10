import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { app } from "../src/app.js";
import { db } from "../src/db/database.js";

describe("HTTP API", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as AddressInfo;
    baseUrl = "http://127.0.0.1:" + address.port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  beforeEach(() => {
    db.exec("DELETE FROM conversations");
  });

  it("returns an empty conversation list on a fresh database", async () => {
    const response = await fetch(baseUrl + "/api/conversations");
    const payload = await response.json() as { conversations: unknown[] };

    expect(response.status).toBe(200);
    expect(payload.conversations).toEqual([]);
  });

  it("creates a conversation and returns its empty message history", async () => {
    const createResponse = await fetch(baseUrl + "/api/conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Postgres hosting research" })
    });
    const created = await createResponse.json() as {
      conversation: { id: string; title: string };
    };

    expect(createResponse.status).toBe(201);
    expect(created.conversation.title).toBe("Postgres hosting research");

    const historyResponse = await fetch(
      baseUrl + "/api/conversations/" + created.conversation.id + "/messages"
    );
    const history = await historyResponse.json() as { messages: unknown[] };

    expect(historyResponse.status).toBe(200);
    expect(history.messages).toEqual([]);
  });

  it("rejects invalid chat input before calling the local model", async () => {
    const response = await fetch(baseUrl + "/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "" })
    });
    const payload = await response.json() as { error: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Invalid chat request.");
  });

  it("rejects chat requests for a conversation that does not exist", async () => {
    const response = await fetch(baseUrl + "/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: "00000000-0000-4000-8000-000000000000",
        content: "Hello"
      })
    });
    const payload = await response.json() as { error: string };

    expect(response.status).toBe(404);
    expect(payload.error).toBe("Conversation not found.");
  });

  it("returns 404 for unknown conversation history", async () => {
    const response = await fetch(
      baseUrl + "/api/conversations/00000000-0000-4000-8000-000000000000/messages"
    );
    const payload = await response.json() as { error: string };

    expect(response.status).toBe(404);
    expect(payload.error).toBe("Conversation not found.");
  });
});
