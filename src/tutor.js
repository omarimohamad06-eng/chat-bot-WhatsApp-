import Anthropic from "@anthropic-ai/sdk";
import {
  MODEL, EFFORT, SUBJECT, TEACHER_NAME, BOT_NAME,
  DEFAULT_LANG, HINT_MODE, TOP_K, FULL_CONTEXT_LIMIT,
} from "./config.js";
import { search } from "./retrieve.js";

const client = new Anthropic();

const LANG_RULE = {
  ar: "Always reply in Arabic.",
  fr: "Always reply in French.",
  en: "Always reply in English.",
  auto: "Reply in the same language the student wrote in (Arabic, French or English). If they mix languages, follow their lead.",
};

function systemPrompt() {
  return `You are ${BOT_NAME}, a patient tutor for ${SUBJECT}. You help students of ${TEACHER_NAME} revise between classes.

## Your one hard rule
Answer from the LESSON MATERIAL you are given, not from general knowledge.
- ${TEACHER_NAME} may teach a method, notation or convention that differs from what is common elsewhere. The lesson always wins.
- If the lesson material does not cover the question, say so plainly — for example "we haven't covered that in class yet" — and suggest the student ask ${TEACHER_NAME}. Never invent content and never fill the gap from outside knowledge.
- If the material only partly covers it, answer the part it covers and say clearly which part is missing.
- Mention where something comes from when it helps ("in Lesson 3, page 2..."), but do not append a bibliography.

## How to teach
- ${LANG_RULE[DEFAULT_LANG] || LANG_RULE.auto}
- Match the student's level. Short paragraphs, plain words, one idea at a time.
- Lead with the direct answer, then explain. Do not open with pleasantries.
- Use the same symbols and vocabulary as the lesson.
- Write mathematics in LaTeX: $...$ inline, $$...$$ for display.
- Worked examples beat abstract description. Where the lesson gives one, reuse it.
- Be concise. A student on a phone will not read ten paragraphs.
${
  HINT_MODE
    ? `
## Exercises and homework
When a student asks you to solve an exercise, a homework problem or an exam question, do NOT hand over the finished answer. Instead:
- Name the method or rule from the lesson that applies.
- Walk them through the first step, then ask them to try the next one.
- If they come back with an attempt, check it and correct it kindly, whether right or wrong.
- If they are stuck after genuinely trying, give the next step — not the whole solution.
Explaining a concept, checking their work, and worked examples that are already in the lesson are always fine — this rule is only about doing their assignment for them.`
    : ""
}
## Boundaries
- You only discuss ${SUBJECT} and the course. If asked about something unrelated, say so warmly in one line and steer back.
- You do not know students' grades, exam dates or administrative details unless the lesson material states them. Send those questions to ${TEACHER_NAME}.`;
}

function renderChunks(chunks) {
  return chunks
    .map((c) => {
      const where = [c.title, c.heading, c.page ? `page ${c.page}` : null]
        .filter(Boolean)
        .join(" — ");
      return `<excerpt from="${where}">\n${c.text}\n</excerpt>`;
    })
    .join("\n\n");
}

/** Total characters of lesson text in the index. */
function corpusSize(index) {
  return index.chunks.reduce((n, c) => n + c.text.length, 0);
}

/**
 * Picks the lesson context for a question.
 *
 * Small courses are sent whole — perfect recall, and because the block is
 * identical on every request it sits in the prompt cache and costs little.
 * Larger courses fall back to BM25 retrieval of the most relevant excerpts.
 */
export function buildContext(index, question, { lesson = null } = {}) {
  const full = corpusSize(index) <= FULL_CONTEXT_LIMIT && !lesson;
  if (full) {
    return { cacheable: true, chunks: index.chunks, text: renderChunks(index.chunks) };
  }
  const hits = search(index, question, { k: TOP_K, lesson });
  const chunks = hits.map((h) => h.chunk);
  return { cacheable: false, chunks, text: renderChunks(chunks) };
}

const REFUSAL_REPLY =
  "I can't help with that one. If it's about the course, try rephrasing it — otherwise ask your teacher directly.";

/**
 * Streams an answer. Yields {type:"text"} deltas, then a final {type:"done"}
 * carrying the sources used and token usage.
 */
export async function* answer({ index, question, history = [], lesson = null }) {
  const context = buildContext(index, question, { lesson });

  const system = [
    { type: "text", text: systemPrompt(), cache_control: { type: "ephemeral" } },
  ];

  const messages = [];
  // Keep the last few turns so follow-ups like "and the second one?" work.
  for (const turn of history.slice(-8)) {
    if (turn.role === "user" || turn.role === "assistant") {
      messages.push({ role: turn.role, content: String(turn.content).slice(0, 4000) });
    }
  }

  if (context.cacheable) {
    // Whole course is stable across every student and question — cache it.
    system.push({
      type: "text",
      text: `# LESSON MATERIAL\n\n${context.text}`,
      cache_control: { type: "ephemeral" },
    });
    messages.push({ role: "user", content: question });
  } else {
    const material = context.text
      ? `# LESSON MATERIAL (the excerpts most relevant to this question)\n\n${context.text}`
      : "# LESSON MATERIAL\n\n(No lesson excerpt matched this question.)";
    messages.push({ role: "user", content: `${material}\n\n# STUDENT'S QUESTION\n\n${question}` });
  }

  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    system,
    messages,
    thinking: { type: "adaptive" },
    output_config: { effort: EFFORT },
    // If a safety classifier declines, the API retries on a fallback model
    // rather than handing the student an empty reply.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });

  let produced = false;
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      produced = true;
      yield { type: "text", text: event.delta.text };
    }
  }

  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal" && !produced) {
    yield { type: "text", text: REFUSAL_REPLY };
  }

  yield {
    type: "done",
    sources: context.chunks.map((c) => ({ title: c.title, page: c.page, heading: c.heading })),
    usage: final.usage,
    grounded: context.chunks.length > 0,
  };
}

/** Non-streaming convenience wrapper, used by the Telegram bot. */
export async function answerText(opts) {
  let text = "";
  let meta = {};
  for await (const event of answer(opts)) {
    if (event.type === "text") text += event.text;
    else if (event.type === "done") meta = event;
  }
  return { text: text.trim(), ...meta };
}
