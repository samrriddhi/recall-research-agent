import { Router } from "express";
import { z } from "zod";
import {
  createConversation,
  getConversationMessages,
  listConversations,
  conversationExists
} from "../memory/memory.service.js";

export const conversationRouter = Router();

conversationRouter.get("/", (_request, response) => {
  response.json({ conversations: listConversations() });
});

conversationRouter.post("/", (request, response) => {
  const schema = z.object({ title: z.string().trim().min(1).max(80).optional() });
  const parsed = schema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid conversation title." });
    return;
  }
  response.status(201).json({ conversation: createConversation(parsed.data.title) });
});

conversationRouter.get("/:id/messages", (request, response) => {
  const id = z.string().uuid().safeParse(request.params.id);
  if (!id.success || !conversationExists(id.data)) {
    response.status(404).json({ error: "Conversation not found." });
    return;
  }
  response.json({ messages: getConversationMessages(id.data) });
});
