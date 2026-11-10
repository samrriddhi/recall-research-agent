import { Router } from "express";
import { env } from "../config/env.js";

export const healthRouter = Router();

healthRouter.get("/", async (_request, response) => {
  let ollama = false;
  try {
    const result = await fetch(env.OLLAMA_BASE_URL.replace(/\/$/, "") + "/api/tags", {
      signal: AbortSignal.timeout(2500)
    });
    ollama = result.ok;
  } catch {
    ollama = false;
  }

  response.json({
    status: "ok",
    application: "Recall",
    ollama: ollama ? "connected" : "not_connected",
    model: env.OLLAMA_MODEL,
    timestamp: new Date().toISOString()
  });
});
