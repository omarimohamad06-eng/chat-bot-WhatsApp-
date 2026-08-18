import fs from "node:fs/promises";
import express from "express";
import {
  PORT, PUBLIC_DIR, INDEX_PATH, BOT_NAME, SUBJECT, TEACHER_NAME,
  CLASS_CODE, TEACHER_PASSWORD, RATE_LIMIT_PER_HOUR, DEFAULT_LANG, MODEL,
} from "./config.js";
import { answer } from "./tutor.js";
import { logExchange, stats } from "./store.js";

const app = express();
app.use(express.json({ limit: "256kb" }));
app.set("trust proxy", true);

let index = null;
async function loadIndex() {
  try {
    index = JSON.parse(await fs.readFile(INDEX_PATH, "utf8"));
  } catch {
    index = null;
  }
}
await loadIndex();

// ---------------------------------------------------------------- rate limit
const buckets = new Map();
function rateLimit(key) {
  const now = Date.now();
  const hourAgo = now - 3600_000;
  const hits = (buckets.get(key) || []).filter((t) => t > hourAgo);
  if (hits.length >= RATE_LIMIT_PER_HOUR) return false;
  hits.push(now);
  buckets.set(key, hits);
  return true;
}
// Keep the map from growing forever on a long-running server.
setInterval(() => {
  const hourAgo = Date.now() - 3600_000;
  for (const [key, hits] of buckets) {
    const live = hits.filter((t) => t > hourAgo);
    if (live.length) buckets.set(key, live);
    else buckets.delete(key);
  }
}, 600_000).unref();

// -------------------------------------------------------------------- public
app.get("/api/config", (_req, res) => {
  res.json({
    botName: BOT_NAME,
    subject: SUBJECT,
    teacher: TEACHER_NAME,
    lang: DEFAULT_LANG,
    requiresCode: Boolean(CLASS_CODE),
    ready: Boolean(index),
    lessons: index?.lessons?.map((l) => ({ source: l.source, title: l.title })) || [],
  });
});

app.post("/api/verify-code", (req, res) => {
  if (!CLASS_CODE) return res.json({ ok: true });
  const given = String(req.body?.code || "").trim();
  res.json({ ok: given.toLowerCase() === CLASS_CODE.toLowerCase() });
});

function codeOk(req) {
  if (!CLASS_CODE) return true;
  return String(req.body?.code || "").trim().toLowerCase() === CLASS_CODE.toLowerCase();
}

app.post("/api/chat", async (req, res) => {
  if (!index) return res.status(503).json({ error: "No lessons indexed yet. Run: npm run ingest" });
  if (!codeOk(req)) return res.status(403).json({ error: "invalid_code" });

  const question = String(req.body?.message || "").trim().slice(0, 2000);
  if (!question) return res.status(400).json({ error: "empty_message" });

  const student = String(req.body?.student || "").trim().slice(0, 60) || "anonymous";
  const key = `${req.ip}:${student}`;
  if (!rateLimit(key)) {
    return res.status(429).json({
      error: "rate_limited",
      message: `You've reached ${RATE_LIMIT_PER_HOUR} questions this hour. Try again later.`,
    });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = (event, data) => {
    if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // A student closing the tab should stop the answer, not keep spending tokens.
  let aborted = false;
  req.on("close", () => { aborted = true; });

  let full = "";
  let meta = {};
  try {
    for await (const chunk of answer({
      index,
      question,
      history: Array.isArray(req.body?.history) ? req.body.history : [],
      lesson: req.body?.lesson || null,
    })) {
      if (aborted) break;
      if (chunk.type === "text") {
        full += chunk.text;
        send("delta", { text: chunk.text });
      } else if (chunk.type === "done") {
        meta = chunk;
        send("done", { sources: chunk.sources, grounded: chunk.grounded });
      }
    }
  } catch (err) {
    console.error("chat error:", err);
    send("error", { message: "Something went wrong on my side. Please try again." });
  } finally {
    res.end();
  }

  await logExchange({
    channel: "web",
    student,
    question,
    reply: full.slice(0, 4000),
    sources: meta.sources || [],
    grounded: meta.grounded ?? null,
    usage: meta.usage || null,
  }).catch(() => {});
});

// ------------------------------------------------------------------- teacher
function teacherAuth(req, res, next) {
  if (!TEACHER_PASSWORD) {
    return res.status(503).send("Set TEACHER_PASSWORD in your .env to enable the dashboard.");
  }
  const header = req.headers.authorization || "";
  const [, encoded] = header.split(" ");
  const [, password] = Buffer.from(encoded || "", "base64").toString().split(":");
  if (password === TEACHER_PASSWORD) return next();
  res.set("WWW-Authenticate", 'Basic realm="Teacher dashboard"').status(401).send("Authentication required");
}

app.get("/teacher", teacherAuth, (_req, res) => res.sendFile("teacher.html", { root: PUBLIC_DIR }));
app.get("/api/teacher/stats", teacherAuth, async (_req, res) => res.json(await stats()));
app.post("/api/teacher/reload", teacherAuth, async (_req, res) => {
  await loadIndex();
  res.json({ ok: true, lessons: index?.lessons?.length || 0 });
});

app.use(express.static(PUBLIC_DIR));

app.listen(PORT, () => {
  console.log(`\n  ${BOT_NAME} is running`);
  console.log(`  Students:  http://localhost:${PORT}`);
  console.log(`  Teacher:   http://localhost:${PORT}/teacher`);
  console.log(`  Model:     ${MODEL}`);
  if (!index) console.log(`\n  No lessons indexed yet — run: npm run ingest`);
  else console.log(`  Lessons:   ${index.lessons.length} indexed`);
  if (!CLASS_CODE) console.log(`\n  WARNING: CLASS_CODE is not set. Anyone with the link can use your API credits.`);
  console.log("");
});
