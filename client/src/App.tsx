import { useEffect, useRef, useState } from "react";
import {
  ArrowUp, BrainCircuit, Check, ChevronDown, CircleHelp, Clock3,
  ExternalLink, Globe2, LoaderCircle, MessageSquare, Plus, Search,
  Sparkles, WifiOff
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Source = { title: string; url: string; snippet: string };
type ChatMessage = {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  sources: Source[];
};
type Conversation = {
  id: string;
  title: string;
  updatedAt: string;
  preview?: string | null;
};
type Health = {
  status: string;
  ollama: "connected" | "not_connected";
  modelInstalled?: boolean;
  model: string;
};

const suggestions = [
  { icon: Clock3, title: "Recall a conversation", prompt: "What did I ask you in our previous conversations?" },
  { icon: Globe2, title: "Check what changed", prompt: "What are the latest changes in PostgreSQL?" },
  { icon: Search, title: "Research a decision", prompt: "Compare the current free tiers of Neon and Supabase." }
];

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "The request could not be completed.");
  return payload;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function domainFromUrl(value: string): string {
  try { return new URL(value).hostname.replace(/^www\./, ""); }
  catch { return value; }
}

function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState("");
  const [historyFilter, setHistoryFilter] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function refreshConversations() {
    const response = await fetch("/api/conversations");
    const data = await readJson<{ conversations: Conversation[] }>(response);
    setConversations(data.conversations);
    return data.conversations;
  }

  async function refreshHealth() {
    try {
      const response = await fetch("/api/health");
      setHealth(await readJson<Health>(response));
    } catch {
      setHealth({ status: "offline", ollama: "not_connected", modelInstalled: false, model: "qwen3:4b" });
    }
  }

  useEffect(() => {
    void refreshConversations().then((items) => {
      if (items.length > 0 && !activeId) setActiveId(items[0]!.id);
    }).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Could not load local history.");
    });
    void refreshHealth();
    const interval = window.setInterval(() => void refreshHealth(), 15000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    fetch("/api/conversations/" + activeId + "/messages")
      .then((response) => readJson<{ messages: ChatMessage[] }>(response))
      .then((data) => { if (!cancelled) setMessages(data.messages); })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load conversation.");
      });
    return () => { cancelled = true; };
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 180) + "px";
  }, [input]);

  function startNewConversation() {
    setActiveId(null);
    setMessages([]);
    setInput("");
    setError("");
  }

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setActiveId(null);
        setMessages([]);
        setInput("");
        setError("");
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  function selectConversation(id: string) {
    if (loading) return;
    setError("");
    setActiveId(id);
  }

  async function sendPrompt(prompt: string) {
    const content = prompt.trim();
    if (!content || loading) return;

    setLoading(true);
    setError("");
    setInput("");
    const optimisticId = "pending-" + Date.now();
    const optimistic: ChatMessage = {
      id: optimisticId,
      conversationId: activeId ?? "",
      role: "user",
      content,
      createdAt: new Date().toISOString(),
      sources: []
    };
    setMessages((current) => [...current, optimistic]);

    try {
      let conversationId = activeId;
      if (!conversationId) {
        const createResponse = await fetch("/api/conversations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: content.slice(0, 56) })
        });
        const created = await readJson<{ conversation: { id: string } }>(createResponse);
        conversationId = created.conversation.id;
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId,
          content,
          referenceTime: new Date().toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        })
      });
      const result = await readJson<{
        conversationId: string;
        userMessage: ChatMessage;
        message: ChatMessage;
      }>(response);

      setMessages((current) => [
        ...current.filter((message) => message.id !== optimisticId),
        result.userMessage,
        result.message
      ]);
      setActiveId(result.conversationId);
      await refreshConversations();
      await refreshHealth();
    } catch (cause) {
      setMessages((current) => current.filter((message) => message.id !== optimisticId));
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
      await refreshConversations().catch(() => undefined);
    } finally {
      setLoading(false);
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }

  const filteredConversations = conversations.filter((conversation) => {
    const haystack = (conversation.title + " " + (conversation.preview ?? "")).toLowerCase();
    return haystack.includes(historyFilter.toLowerCase());
  });
  const isReady = health?.ollama === "connected" && health.modelInstalled === true;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><BrainCircuit size={21} strokeWidth={1.8} /></div>
          <div><div className="brand-name">recall</div><div className="brand-caption">RESEARCH WORKSPACE</div></div>
        </div>

        <button className="new-chat-button" onClick={startNewConversation}>
          <Plus size={16} /><span>New conversation</span><span className="shortcut">Ctrl K</span>
        </button>

        <div className="sidebar-section">
          <div className="section-heading">
            <span>YOUR HISTORY</span><span className="history-count">{conversations.length}</span>
          </div>
          <div className="history-search">
            <Search size={14} />
            <input value={historyFilter} onChange={(event) => setHistoryFilter(event.target.value)}
              placeholder="Find a conversation" aria-label="Find a conversation" />
          </div>
          <div className="conversation-list">
            {filteredConversations.length === 0 ? (
              <div className="empty-history">
                {conversations.length === 0 ? "Your conversations will appear here." : "No matching conversations."}
              </div>
            ) : filteredConversations.map((conversation) => (
              <button key={conversation.id}
                className={"conversation-item " + (activeId === conversation.id ? "active" : "")}
                onClick={() => selectConversation(conversation.id)}>
                <MessageSquare size={15} />
                <span className="conversation-copy">
                  <span className="conversation-title">{conversation.title}</span>
                  <span className="conversation-date">{formatDate(conversation.updatedAt)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="privacy-note">
            <div className="privacy-icon"><Check size={13} /></div>
            <div><strong>Private by default</strong><span>Your history stays on this device.</span></div>
          </div>
          <div className="sidebar-version">RECALL · LOCAL EDITION</div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-divider">/</span><strong>Research assistant</strong></div>
          <div className="topbar-actions">
            <div className={"model-status " + (isReady ? "ready" : "offline")}>
              <span className="status-dot" /><span>{isReady ? "LOCAL MODEL READY" : "MODEL OFFLINE"}</span>
            </div>
            <div className="model-name"><span className="model-name-main">Qwen3 4B</span><span className="model-name-sub">ON DEVICE</span><ChevronDown size={13} /></div>
          </div>
        </header>

        <div className="workspace">
          <div className="conversation-column">
            {messages.length === 0 ? (
              <section className="welcome-screen">
                <div className="welcome-eyebrow"><Sparkles size={14} /> MEMORY-FIRST RESEARCH</div>
                <h1>Good research<br /><span>starts with context.</span></h1>
                <p className="welcome-description">
                  Ask something new, revisit a previous decision, or find out what has changed.
                  Recall connects your conversation history with the live web.
                </p>
                <div className="capability-row">
                  <div><BrainCircuit size={15} /><span>Conversation memory</span></div>
                  <div><Globe2 size={15} /><span>Live web search</span></div>
                  <div><Clock3 size={15} /><span>Temporal context</span></div>
                </div>
                <div className="suggestion-grid">
                  {suggestions.map((suggestion) => {
                    const Icon = suggestion.icon;
                    return (
                      <button className="suggestion-card" key={suggestion.title} onClick={() => void sendPrompt(suggestion.prompt)}>
                        <div className="suggestion-icon"><Icon size={17} /></div>
                        <span>{suggestion.title}</span><p>{suggestion.prompt}</p>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : (
              <section className="message-list" aria-live="polite">
                {messages.map((message) => (
                  <article className={"message " + message.role} key={message.id}>
                    <div className="message-avatar">
                      {message.role === "assistant" ? <BrainCircuit size={17} /> : <span>Y</span>}
                    </div>
                    <div className="message-body">
                      <div className="message-meta">
                        <strong>{message.role === "assistant" ? "Recall" : "You"}</strong>
                        <span>{new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(message.createdAt))}</span>
                      </div>
                      <div className="message-content">
                        {message.role === "assistant"
                          ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                          : <p>{message.content}</p>}
                      </div>
                      {message.sources?.length > 0 && (
                        <div className="sources-panel">
                          <div className="sources-heading"><Globe2 size={13} /> SOURCES CHECKED <span>{message.sources.length}</span></div>
                          <div className="source-list">
                            {message.sources.map((source, index) => (
                              <a className="source-card" key={source.url} href={source.url} target="_blank" rel="noreferrer">
                                <span className="source-number">{index + 1}</span>
                                <span className="source-copy"><strong>{source.title}</strong><small>{domainFromUrl(source.url)}</small></span>
                                <ExternalLink size={13} />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
                {loading && (
                  <div className="thinking-row">
                    <div className="message-avatar assistant-avatar"><BrainCircuit size={17} /></div>
                    <div className="thinking-copy">
                      <div className="thinking-label"><LoaderCircle size={14} className="spin" /> Working through your context</div>
                      <span>Retrieving memory and checking evidence where needed</span>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </section>
            )}

            {error && (
              <div className="error-banner"><CircleHelp size={16} /><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error">×</button></div>
            )}

            <div className="composer-wrap">
              {!isReady && (
                <div className="model-hint"><WifiOff size={13} /> Start Ollama and install the Qwen3 model to begin chatting.</div>
              )}
              <form className="composer" onSubmit={(event) => {
                event.preventDefault();
                void sendPrompt(input);
              }}>
                <textarea ref={textareaRef} value={input} onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendPrompt(input);
                    }
                  }}
                  placeholder="Ask Recall anything..." rows={1} disabled={loading} aria-label="Message Recall" />
                <div className="composer-bottom">
                  <div className="composer-info">
                    <span><BrainCircuit size={13} /> Memory enabled</span>
                    <span><Globe2 size={13} /> Web search on demand</span>
                  </div>
                  <button className="send-button" type="submit" disabled={!input.trim() || loading}>
                    {loading ? <LoaderCircle size={16} className="spin" /> : <ArrowUp size={17} />}
                  </button>
                </div>
              </form>
              <div className="composer-disclaimer">Chat history stays local; search queries go to DuckDuckGo. Check sources for important decisions.</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
