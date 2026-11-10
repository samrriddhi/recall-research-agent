# Recall — a memory-first research agent

Recall is a local-first chat agent for questions that depend on both conversation history and the live web.

Examples:
- What did I ask you on 3 November?
- Last Tuesday we compared Postgres hosts. Has pricing changed?
- Is your earlier answer still correct today?

## Design goals

- Historical accuracy: conversations and source snapshots are stored locally and remain searchable.
- Temporal retrieval: explicit date references are resolved before searching message history.
- Evidence-led research: the agent has one web-search tool and cites returned sources.
- Honest uncertainty: missing history, failed search and unverifiable changes are reported rather than guessed.
- Zero paid API dependencies: the model runs locally through Ollama; web search uses public DuckDuckGo HTML/Lite pages.

## Stack

- React + TypeScript + Vite
- Node.js + Express
- Ollama + Qwen3 4B (local inference)
- DuckDuckGo HTML/Lite (keyless web search)
- SQLite + FTS5 (persistent history and retrieval)
- Zod + Vitest

## Requirements

- Node.js 22.12+
- Ollama installed
- About 2.5 GB for the Qwen3 4B model, plus dependencies and local conversation data
- Internet access for model download and web search

Recall does not require OpenAI, Tavily, a credit card, an API key, or a hosted database.

## Run locally

1. Install Node.js and Ollama.
2. Copy .env.example to .env. In PowerShell, run: Copy-Item .env.example .env
3. Pull the model once:

   ollama pull qwen3:4b

4. Install dependencies and start both applications:

   npm install
   npm run dev

5. Open http://127.0.0.1:5173.

Ollama must be running in the background. If it is not running, start it with: ollama serve

## Commands

| Command | Purpose |
|---|---|
| npm run dev | Start API and UI |
| npm run build | Type-check and build both applications |
| npm test | Run automated tests |
| npm run evaluate | Run deterministic recall, date and search-planning evaluation |

## Cost and privacy

- Model inference happens on your machine.
- Conversation data is stored in ./data/recall.sqlite.
- No API keys or paid search plans are configured.
- Conversation history and model inference stay on this device; full conversation prompts are not sent to a hosted model.
- Search terms (including extracted product names for shortlist follow-ups) are sent to DuckDuckGo's public search pages. Recall also requests a small number of returned public result pages directly from their domains to read source evidence. Those services can see normal network request metadata, including your IP address.
- Public search can be throttled or change markup; Recall reports provider failures instead of silently switching to a paid service.
- Source-page requests use redirect checks, public-host validation, timeouts and response-size limits. If page reading fails, Recall falls back to the search snippet.
- When an older conversation contains a shortlist, the comparison planner issues separate bounded searches for each recovered entity so one broad search does not hide the rest of the list.
- No hosted model receives conversation history.

## Scope and limitations

Recall remembers conversations created inside this local application. It does not automatically access or import ChatGPT conversations from another product. Search uses public DuckDuckGo HTML/Lite pages rather than a contracted search API; those pages may temporarily rate-limit automated requests.

## Project status

Under active development. See DESIGN.md for architecture, trade-offs and evaluation priorities.
