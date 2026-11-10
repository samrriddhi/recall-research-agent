import { env } from "./config/env.js";
import { app } from "./app.js";
import { db } from "./db/database.js";

const server = app.listen(env.PORT, "127.0.0.1", () => {
  console.log("Recall API listening at http://127.0.0.1:" + env.PORT);
  console.log("Model: " + env.OLLAMA_MODEL);
});

function shutdown(signal: string) {
  console.log("Received " + signal + "; closing Recall.");
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
