import { z } from "zod";
import { env } from "../config/env.js";
import {
  addMessage,
  createConversation,
  getRecentHistory,
  getRecentMessages,
  searchRelevantMessages,
  type MessageRecord
} from "../memory/memory.service.js";
import { resolveDateWindow } from "../research/date-window.js";
import { searchWeb, type WebSearchResult } from "../research/web-search.js";
import { classifyIntent } from "./intent.js";
import { ollamaChat, type OllamaMessage } from "./ollama-client.js";
import { formatMemoryContext, SYSTEM_PROMPT } from "./prompts.js";

const searchArgumentsSchema = z.object({
  query: z.string().min(2).max(300)
});

const webSearchTool = {
  type: "function",
  function: {
    name: "web_search",
    description: "Search the public web for current information, pricing, releases, or verification.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "A focused web search query." }
      },
      required: ["query"],
      additionalProperties: false
    }
  }
};

export interface ChatInput {
  conversationId?: string;
  content: string;
  referenceTime?: string;
  timeZone?: string;
}

export interface ChatOutput {
  conversationId: string;
  userMessage: MessageRecord;
  message: MessageRecord;
  sources: WebSearchResult[];
  memoryMatches: number;
}

function parseToolArguments(value: Record<string, unknown> | string): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value) as unknown; }
  catch { return {}; }
}

function deduplicateSources(sources: WebSearchResult[]): WebSearchResult[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  }).slice(0, 8);
}

function renderSearchContext(sources: WebSearchResult[]): string {
  if (sources.length === 0) return "The web search returned no usable sources.";
  return sources.map((source, index) =>
    "[" + (index + 1) + "] " + source.title +
    "\nURL: " + source.url +
    "\nSnippet: " + source.snippet
  ).join("\n\n");
}

export async function runChat(input: ChatInput): Promise<ChatOutput> {
  const conversation = input.conversationId
    ? { id: input.conversationId, title: "" }
    : createConversation(input.content.slice(0, 64));

  const userMessage = addMessage(conversation.id, "user", input.content);
  const intent = classifyIntent(input.content);
  const timeZone = input.timeZone ?? env.APP_TIMEZONE;
  const dateWindow = resolveDateWindow(input.content, input.referenceTime, timeZone);

  const memoryQuery = dateWindow
    ? input.content.replace(dateWindow.matchedText, "")
    : input.content;

  let memory = searchRelevantMessages(memoryQuery, {
    from: dateWindow?.from,
    to: dateWindow?.to,
    limit: dateWindow ? 24 : 8
  }).filter((item) => item.id !== userMessage.id);

  // If the wording of the question does not lexically match the old message,
  // keep the date boundary but retrieve that day's conversation as a fallback.
  if (dateWindow && memory.length === 0) {
    memory = searchRelevantMessages("", {
      from: dateWindow.from,
      to: dateWindow.to,
      limit: 24
    }).filter((item) => item.id !== userMessage.id);
  }

  if (intent.historicalRecall && memory.length === 0 && !dateWindow) {
    memory = getRecentHistory(12).filter((item) => item.id !== userMessage.id);
  }

  const recent = getRecentMessages(conversation.id, 12);
  const historyMessages: OllamaMessage[] = recent.map((item) => ({
    role: item.role,
    content: item.content
  }));

  const systemContext = [
    SYSTEM_PROMPT,
    "",
    "RELEVANT LONG-TERM CONVERSATION MEMORY:",
    formatMemoryContext(memory),
    dateWindow
      ? "\nThe user's date reference \"" + dateWindow.matchedText +
        "\" resolved to " + dateWindow.from + " through (exclusive) " + dateWindow.to +
        " in timezone " + timeZone + "."
      : ""
  ].join("\n");

  const messages: OllamaMessage[] = [
    { role: "system", content: systemContext },
    ...historyMessages
  ];

  const sources: WebSearchResult[] = [];
  let response = await ollamaChat(messages, [webSearchTool]);
  let toolRounds = 0;

  while (response.message.tool_calls?.length && toolRounds < 2) {
    messages.push(response.message);
    for (const toolCall of response.message.tool_calls) {
      if (toolCall.function.name !== "web_search") {
        messages.push({
          role: "tool",
          tool_name: toolCall.function.name,
          content: "Unknown tool. Recall only provides web_search."
        });
        continue;
      }

      const parsed = searchArgumentsSchema.safeParse(
        parseToolArguments(toolCall.function.arguments)
      );
      if (!parsed.success) {
        messages.push({
          role: "tool",
          tool_name: "web_search",
          content: "Invalid search arguments. Provide a query string."
        });
        continue;
      }

      try {
        const results = await searchWeb(parsed.data.query);
        sources.push(...results);
        messages.push({
          role: "tool",
          tool_name: "web_search",
          content: renderSearchContext(deduplicateSources(sources))
        });
      } catch (error) {
        messages.push({
          role: "tool",
          tool_name: "web_search",
          content: error instanceof Error ? error.message : "Search failed."
        });
      }
    }

    toolRounds += 1;
    response = await ollamaChat(messages, toolRounds < 2 ? [webSearchTool] : []);
  }

  // Do not let a small local model silently skip search on current questions.
  if (intent.shouldSearch && sources.length === 0) {
    try {
      const fallbackResults = await searchWeb(input.content);
      sources.push(...fallbackResults);
      messages.push({
        role: "system",
        content: "The backend executed web_search because this request needs current information. " +
          "Use these results as evidence and cite them by number:\n\n" +
          renderSearchContext(deduplicateSources(sources))
      });
      response = await ollamaChat(messages, []);
    } catch (error) {
      messages.push({
        role: "system",
        content: "Web search was attempted but is currently unavailable: " +
          (error instanceof Error ? error.message : "unknown error") +
          ". Do not claim the answer is current or verified."
      });
      response = await ollamaChat(messages, []);
    }
  }

  const answer = response.message.content?.trim()
    || "I couldn't produce a response. Please try rephrasing your question.";
  const finalSources = deduplicateSources(sources);
  const assistantMessage = addMessage(conversation.id, "assistant", answer, finalSources);

  return {
    conversationId: conversation.id,
    userMessage,
    message: assistantMessage,
    sources: finalSources,
    memoryMatches: memory.length
  };
}
