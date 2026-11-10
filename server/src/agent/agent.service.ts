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
import { planSearchQueries, planSearchQuery } from "./search-planner.js";

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
  }).slice(0, 20);
}

function renderSearchContext(sources: WebSearchResult[]): string {
  if (sources.length === 0) return "The web search returned no usable sources.";
  return sources.slice(0, 8).map((source, index) =>
    "[" + (index + 1) + "] " + source.title +
    "\nURL: " + source.url +
    "\nSnippet: " + source.snippet +
    (source.publishedAt ? "\nPublished: " + source.publishedAt : "") +
    (source.modifiedAt ? "\nPage modified: " + source.modifiedAt : "") +
    (source.content ? "\nPage text:\n" + source.content.slice(0, 2500) : "")
  ).join("\n\n");
}

export async function runChat(input: ChatInput): Promise<ChatOutput> {
  const conversation = input.conversationId
    ? { id: input.conversationId, title: "" }
    : createConversation(input.content.slice(0, 64));

  const userMessage = addMessage(conversation.id, "user", input.content);
  const intent = classifyIntent(input.content);
  const requestedTimeZone = input.timeZone ?? env.APP_TIMEZONE;
  let timeZone = env.APP_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en", { timeZone: requestedTimeZone });
    timeZone = requestedTimeZone;
  } catch {
    // Ignore invalid client-supplied IANA names and use the configured default.
  }
  const referenceInstant = input.referenceTime
    ? new Date(input.referenceTime)
    : new Date();
  const currentLocalDateTime = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone
  }).format(referenceInstant);
  const dateWindow = resolveDateWindow(input.content, referenceInstant.toISOString(), timeZone);

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
    "CURRENT LOCAL DATE AND TIME: " + currentLocalDateTime + " (" + timeZone + ").",
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

  // Always cover a recovered shortlist entity-by-entity during a current comparison.
  // Otherwise use one deterministic fallback query if the model skipped the tool.
  const plannedQueries = planSearchQueries(input.content, memory);
  const shouldRunEntitySweep = intent.comparison && memory.length > 0 && plannedQueries.length > 1;
  const shouldRunFallback = intent.shouldSearch && sources.length === 0;
  const queriesToRun = shouldRunEntitySweep
    ? plannedQueries.slice(0, 5)
    : shouldRunFallback
      ? [planSearchQuery(input.content, memory)]
      : [];

  const searchFailures: string[] = [];
  for (let index = 0; index < queriesToRun.length; index += 2) {
    const batch = queriesToRun.slice(index, index + 2);
    type SearchOutcome =
      | { query: string; ok: true; results: WebSearchResult[] }
      | { query: string; ok: false; error: string };

    const outcomes: SearchOutcome[] = await Promise.all(batch.map(async (query): Promise<SearchOutcome> => {
      try {
        return { query, ok: true, results: await searchWeb(query, 4, 1) };
      } catch (error) {
        return {
          query,
          ok: false,
          error: error instanceof Error ? error.message : "Search failed."
        };
      }
    }));

    for (const outcome of outcomes) {
      if (outcome.ok) {
        sources.push(...outcome.results);
      } else {
        searchFailures.push(outcome.query + ": " + outcome.error);
      }
    }
  }

  if (queriesToRun.length > 0) {
    const uniqueSources = deduplicateSources(sources);
    const partialFailureNote = searchFailures.length > 0
      ? "\nSome search requests failed; do not treat missing entities as unchanged:\n" + searchFailures.join("\n")
      : "";
    const evidence = uniqueSources.length > 0
      ? "FINAL SEARCH EVIDENCE. Use this numbered source list for all citations; do not reuse numbering from earlier tool messages:\n\n" +
        renderSearchContext(uniqueSources) + partialFailureNote
      : "Web search was attempted but no usable source was returned. " +
        searchFailures.join("\n") +
        "\nDo not claim the answer is current or verified.";

    messages.push({ role: "system", content: evidence });
    response = await ollamaChat(messages, []);
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
