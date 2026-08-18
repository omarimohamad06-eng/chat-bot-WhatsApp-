import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..");

export const LESSONS_DIR = path.join(ROOT, "lessons");
export const DATA_DIR = path.join(ROOT, "data");
export const INDEX_PATH = path.join(DATA_DIR, "index.json");
export const LOG_PATH = path.join(DATA_DIR, "conversations.jsonl");
export const PUBLIC_DIR = path.join(ROOT, "public");

/** Model used for answering students. Override with CLAUDE_MODEL in .env. */
export const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5";

/**
 * Reasoning depth. "medium" is a good balance for tutoring; raise to "high"
 * for heavy maths/physics, drop to "low" to cut cost on simple recall subjects.
 */
export const EFFORT = process.env.CLAUDE_EFFORT || "medium";

/** Model used to read (OCR) scanned PDFs during ingestion. */
export const OCR_MODEL = process.env.OCR_MODEL || MODEL;

export const SUBJECT = process.env.SUBJECT || "the course";
export const TEACHER_NAME = process.env.TEACHER_NAME || "your teacher";
export const BOT_NAME = process.env.BOT_NAME || "Lesson Assistant";

/** Default reply language: "ar", "fr", "en", or "auto" to always mirror the student. */
export const DEFAULT_LANG = process.env.DEFAULT_LANG || "auto";

/** When true, the bot coaches with hints instead of handing over exercise answers. */
export const HINT_MODE = process.env.HINT_MODE !== "false";

/** Optional shared code students must enter once. Keeps a public link from burning your credits. */
export const CLASS_CODE = (process.env.CLASS_CODE || "").trim();

/** Password for the /teacher dashboard. */
export const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || "";

export const PORT = Number(process.env.PORT || 3000);
export const TELEGRAM_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || "").trim();

/** Per-student rate limiting. */
export const RATE_LIMIT_PER_HOUR = Number(process.env.RATE_LIMIT_PER_HOUR || 40);

/** How many lesson chunks to feed Claude per question. */
export const TOP_K = Number(process.env.TOP_K || 8);

/**
 * If the whole course is smaller than this many characters, skip retrieval and
 * send everything. Perfect recall for small courses — most single classes fit.
 */
export const FULL_CONTEXT_LIMIT = Number(process.env.FULL_CONTEXT_LIMIT || 60000);
