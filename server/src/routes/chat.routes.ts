import { Router } from "express";
import { z } from "zod";
import { runChat } from "../agent/agent.service.js";

export const chatRouter = Router();

const chatBodySchema = z.object({
  conversationId: z.string().uuid().optional(),
  content: z.string().trim().min(1).max(10000),
  referenceTime: z.string().datetime().optional(),
  timeZone: z.string().min(1).max(64).optional()
});

chatRouter.post("/", async (request, response, next) => {
  const parsed = chatBodySchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: "Invalid chat request.",
      details: parsed.error.issues
    });
    return;
  }

  try {
    const result = await runChat(parsed.data);
    response.json(result);
  } catch (error) {
    next(error);
  }
});
