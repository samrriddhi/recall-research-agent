import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  OLLAMA_BASE_URL: z.string().url().default("http://127.0.0.1:11434"),
  OLLAMA_MODEL: z.string().min(1).default("qwen3:4b"),
  OLLAMA_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  DATABASE_PATH: z.string().min(1).default("./data/recall.sqlite"),
  APP_TIMEZONE: z.string().min(1).default("Asia/Kolkata"),
  WEB_SEARCH_TIMEOUT_MS: z.coerce.number().int().positive().default(12000),
  WEB_SEARCH_MAX_RESULTS: z.coerce.number().int().min(1).max(10).default(6)
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => issue.path.join(".") + ": " + issue.message)
    .join("\n");
  throw new Error("Invalid environment configuration:\n" + details);
}

export const env = parsed.data;
