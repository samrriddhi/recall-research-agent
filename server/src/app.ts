import express from "express";
import cors from "cors";
import { chatRouter } from "./routes/chat.routes.js";
import { conversationRouter } from "./routes/conversation.routes.js";
import { healthRouter } from "./routes/health.routes.js";

export const app = express();

app.disable("x-powered-by");
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json({ limit: "1mb" }));

app.use("/api/health", healthRouter);
app.use("/api/chat", chatRouter);
app.use("/api/conversations", conversationRouter);

app.use((_request, response) => {
  response.status(404).json({ error: "Route not found." });
});

app.use((
  error: unknown,
  _request: express.Request,
  response: express.Response,
  _next: express.NextFunction
) => {
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  console.error("[api]", error);
  response.status(500).json({ error: message });
});
