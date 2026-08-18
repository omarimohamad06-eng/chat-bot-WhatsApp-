import fs from "node:fs/promises";
import { INDEX_PATH, TELEGRAM_TOKEN, BOT_NAME, SUBJECT, TEACHER_NAME, RATE_LIMIT_PER_HOUR, CLASS_CODE } from "./config.js";
import { answerText } from "./tutor.js";
import { logExchange } from "./store.js";
import { call } from "./telegram-api.js";

if (!TELEGRAM_TOKEN) {
  console.error(
    "TELEGRAM_BOT_TOKEN is not set.\n\n" +
      "Open Telegram, message @BotFather, send /newbot, follow the prompts,\n" +
      "then put the token it gives you in your .env file:\n\n" +
      "  TELEGRAM_BOT_TOKEN=123456:ABC-DEF...\n",
  );
  process.exit(1);
}

/** Telegram rejects messages over 4096 characters, so split on paragraph breaks. */
function splitMessage(text, limit = 3900) {
  if (text.length <= limit) return [text];
  const parts = [];
  let current = "";
  for (const para of text.split("\n\n")) {
    if ((current + "\n\n" + para).length > limit && current) {
      parts.push(current);
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  if (current) parts.push(current);
  return parts.flatMap((p) =>
    p.length <= limit ? [p] : (p.match(new RegExp(`[\\s\\S]{1,${limit}}`, "g")) || []),
  );
}

let lessonIndex;
try {
  lessonIndex = JSON.parse(await fs.readFile(INDEX_PATH, "utf8"));
} catch {
  console.error(`No lesson index found. Run:  npm run ingest`);
  process.exit(1);
}

// Per-chat state, kept in memory. Restarting the bot simply clears context.
const sessions = new Map();
function session(chatId) {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, { history: [], lesson: null, hits: [], verified: !CLASS_CODE });
  }
  return sessions.get(chatId);
}

function rateLimited(state) {
  const hourAgo = Date.now() - 3600_000;
  state.hits = state.hits.filter((t) => t > hourAgo);
  if (state.hits.length >= RATE_LIMIT_PER_HOUR) return true;
  state.hits.push(Date.now());
  return false;
}

const HELP = `I answer questions about ${SUBJECT}, using ${TEACHER_NAME}'s lessons.

Just type your question — in Arabic, French or English.

/lessons — pick one lesson to focus on
/all — search all lessons again
/reset — start a fresh conversation
/help — show this message`;

async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  if (!text) return;

  const state = session(chatId);
  const name = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || "student";

  if (text.startsWith("/start")) {
    await call("sendMessage", {
      chat_id: chatId,
      text: `Hello ${name}. I'm ${BOT_NAME}.\n\n${HELP}${
        CLASS_CODE && !state.verified ? "\n\nFirst, send me the class code your teacher gave you." : ""
      }`,
    });
    return;
  }
  if (text.startsWith("/help")) return void (await call("sendMessage", { chat_id: chatId, text: HELP }));
  if (text.startsWith("/reset")) {
    state.history = [];
    return void (await call("sendMessage", { chat_id: chatId, text: "Fresh start. Ask away." }));
  }
  if (text.startsWith("/all")) {
    state.lesson = null;
    return void (await call("sendMessage", { chat_id: chatId, text: "Searching all lessons now." }));
  }
  if (text.startsWith("/lessons")) {
    const list = lessonIndex.lessons
      .map((l, i) => `${i + 1}. ${l.title}`)
      .join("\n");
    state.awaitingLesson = true;
    return void (await call("sendMessage", {
      chat_id: chatId,
      text: `Reply with a number to focus on one lesson, or /all for everything.\n\n${list}`,
    }));
  }

  if (state.awaitingLesson && /^\d+$/.test(text)) {
    const chosen = lessonIndex.lessons[Number(text) - 1];
    state.awaitingLesson = false;
    if (chosen) {
      state.lesson = chosen.source;
      return void (await call("sendMessage", { chat_id: chatId, text: `Focused on: ${chosen.title}` }));
    }
  }
  state.awaitingLesson = false;

  if (CLASS_CODE && !state.verified) {
    if (text.toLowerCase() === CLASS_CODE.toLowerCase()) {
      state.verified = true;
      return void (await call("sendMessage", { chat_id: chatId, text: "Thanks. Ask me anything about the course." }));
    }
    return void (await call("sendMessage", { chat_id: chatId, text: "Please send the class code your teacher gave you." }));
  }

  if (rateLimited(state)) {
    return void (await call("sendMessage", {
      chat_id: chatId,
      text: `You've asked ${RATE_LIMIT_PER_HOUR} questions this hour. Take a break and come back later.`,
    }));
  }

  await call("sendChatAction", { chat_id: chatId, action: "typing" });

  let reply;
  let meta = {};
  try {
    const result = await answerText({
      index: lessonIndex,
      question: text,
      history: state.history,
      lesson: state.lesson,
    });
    reply = result.text;
    meta = result;
  } catch (err) {
    console.error("answer error:", err);
    reply = "Something went wrong on my side. Please try again in a moment.";
  }

  for (const part of splitMessage(reply)) {
    await call("sendMessage", { chat_id: chatId, text: part });
  }

  state.history.push({ role: "user", content: text });
  state.history.push({ role: "assistant", content: reply });
  state.history = state.history.slice(-8);

  await logExchange({
    channel: "telegram",
    student: name,
    question: text,
    reply: reply.slice(0, 4000),
    sources: meta.sources || [],
    grounded: meta.grounded ?? null,
    usage: meta.usage || null,
  }).catch(() => {});
}

async function main() {
  const me = await call("getMe", {});
  console.log(`\n  Telegram bot running as @${me.username}`);
  console.log(`  Share this link with your students: https://t.me/${me.username}`);
  console.log(`  Lessons: ${lessonIndex.lessons.length} indexed\n`);

  let offset = 0;
  for (;;) {
    try {
      // Long polling: no public URL, no webhook, no port to open.
      const updates = await call("getUpdates", { offset, timeout: 50, allowed_updates: ["message"] });
      for (const update of updates) {
        offset = update.update_id + 1;
        if (update.message) handleMessage(update.message).catch((err) => console.error("handler:", err.message));
      }
    } catch (err) {
      console.error("poll error:", err.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
