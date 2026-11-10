import { env } from "../config/env.js";

export interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string;
  tool_name?: string;
  tool_calls?: Array<{
    function: {
      name: string;
      arguments: Record<string, unknown> | string;
    };
  }>;
}

export interface OllamaChatResponse {
  message: OllamaMessage;
  done?: boolean;
  done_reason?: string;
}

export async function ollamaChat(
  messages: OllamaMessage[],
  tools: Array<Record<string, unknown>> = []
): Promise<OllamaChatResponse> {
  let response: Response;
  try {
    response = await fetch(env.OLLAMA_BASE_URL.replace(/\\/$/, "") + "/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(env.OLLAMA_TIMEOUT_MS),
      body: JSON.stringify({
        model: env.OLLAMA_MODEL,
        messages,
        tools,
        stream: false,
        think: false,
        options: { temperature: 0.2, num_ctx: 8192 }
      })
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "connection failed";
    throw new Error(
      "Cannot reach Ollama at " + env.OLLAMA_BASE_URL +
      ". Start Ollama and make sure " + env.OLLAMA_MODEL +
      " is installed. Details: " + reason
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error("Ollama returned HTTP " + response.status + ": " + detail.slice(0, 500));
  }

  const payload = await response.json() as OllamaChatResponse;
  if (!payload.message) {
    throw new Error("Ollama returned an invalid chat response.");
  }
  return payload;
}
