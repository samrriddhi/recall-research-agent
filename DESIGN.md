# Recall — Design

## Problem

The challenge is not ordinary text generation. The agent must retrieve what was actually discussed, resolve temporal references, verify current information, and compare old and new evidence without inventing a change.

## Architecture

Recall is a local-first TypeScript application. React handles chat and history. Express exposes a narrow HTTP API. SQLite stores conversations, messages and source snapshots attached to assistant responses. FTS5 retrieves relevant prior messages; explicit dates are resolved before retrieval so "on 3 November" narrows the search to that day.

The agent orchestrator classifies the request, retrieves historical context, resolves calendar dates in the user's IANA timezone, and calls a local Ollama model. The model has one callable tool: web_search. A deterministic fallback invokes the same tool when a request clearly asks for current information but the small model declines to call it. For follow-ups about a previous shortlist, a bounded query planner issues separate searches for recovered entities. The final synthesis receives a single stable, numbered evidence list so citations map to the displayed sources.

## Why this design

- Local model: Qwen3 4B through Ollama avoids per-token charges and keeps conversation history off hosted model services. It is a practical CPU-first starting point for a 16 GB laptop.
- SQLite + FTS5: no database service to operate. Exact terms and date filters are an inspectable baseline for the challenge examples.
- One search tool: the model has a deliberately small tool surface. The backend owns persistence and retrieval; only web search is exposed as an agent tool.
- Evidence-led comparison: the model must distinguish changed, apparently unchanged and unverified. A recent snippet is not proof of a historical change.

## Search and evidence limitations

The no-key search adapter parses DuckDuckGo's public HTML and Lite pages. These are public interfaces, not a contracted API; they can throttle automated traffic or change markup. The application has a fallback endpoint and surfaces failures. It does not silently use paid providers. Search snippets are leads, not authoritative proof; Recall also extracts a bounded amount of text from a small number of public result pages. Search terms are sent to DuckDuckGo and the selected public source domains receive page requests; full conversation history and model prompts stay local. Page extraction is best-effort, and sites may block automated requests or render content only in JavaScript. It stores source URLs, snippets, extracted text, search queries and available publication metadata, but is not a complete historical price archive.

## Alternatives considered

- Hosted LLM + commercial search API: rejected because this project must have zero API billing.
- Public SearXNG JSON only: rejected as sole provider because many public instances disable JSON output or rate-limit automated requests.
- Vector database from day one: rejected until FTS5 is measured against a retrieval benchmark.
- Multi-agent orchestration: rejected because it increases latency and failure modes without improving the core retrieval-and-compare task.
- Cloud database: rejected; local SQLite is adequate for the first release.

## Evaluation

The CI pipeline runs unit and HTTP integration tests, a deterministic evaluation dataset for date resolution, intent classification and shortlist query planning, a dependency audit, and a production build. These checks do not claim to measure local-model answer quality. Live evaluation remains manual and should cover historical recall, missing baselines, plan/billing/region mismatches, conflicting sources and search outages. Track date-window accuracy, retrieval recall, per-entity search coverage, citation coverage and unsupported-claim rate.

## With another week

Grow the labeled evaluation corpus with real conversations and graded expected evidence; add local semantic retrieval only if FTS5 misses paraphrases; fetch and normalize first-party pricing/release pages with source snapshots; improve publication and effective-date extraction; and test model/tool behavior on the target laptop. Any deployment remains optional and must not introduce unannounced paid dependencies.
