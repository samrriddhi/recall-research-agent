import { Router } from "express";
import { env } from "../config/env.js";

export const healthRouter = Router();

healthRouter.get("/", async (_request, response) => {
  let ollama = false;
  let modelInstalled = false;
  const baseUrl = env.OLLAMA_BASE_URL.endsWith("/")
    ? env.OLLAMA_BASE_URL.slice(0, -1)
    : env.OLLAMA_BASE_URL;

  try {
    const result = await fetch(baseUrl + "/api/tags", {
      signal: AbortSignal.timeout(2500)
    });
    if (result.ok) {
      ollama = true;
      const payload = await result.json() as {
        models?: Array<{ name?: string; model?: string }>;
      };
      modelInstalled = (payload.models ?? []).some((model) =>
        (model.name ?? model.model ?? "").startsWith(env.OLLAMA_MODEL)
      );
    }
  } catch {
    ollama = false;
  }

  response.json({
    status: "ok",
    application: "Recall",
    ollama: ollama ? "connected" : "not_connected",
    modelInstalled,
    model: env.OLLAMA_MODEL,
    timestamp: new Date().toISOString()
  });
});
