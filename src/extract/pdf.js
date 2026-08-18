import fs from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { OCR_MODEL } from "../config.js";

const client = new Anthropic();

const TRANSCRIBE_PROMPT = `Transcribe this lesson document into clean Markdown, page by page.

Rules:
- Transcribe faithfully and completely. Do NOT summarise, shorten, translate, or "improve" anything.
- Keep the original language exactly as written (Arabic, French, English, or mixed).
- Start each page with a line: --- page N ---
- Use Markdown headings (#, ##) for the document's own titles and section headers.
- Write mathematics as LaTeX between $...$ (inline) or $$...$$ (display).
- Render tables as Markdown tables.
- For a diagram, chart, or photo, write [Figure: <a precise description of what it shows>] so a student can understand it from the text alone.
- If handwriting or a scan is unreadable, write [unreadable] rather than guessing.

Output only the transcription, with no preamble or closing remarks.`;

/**
 * Reads a PDF via Claude's document support, which covers scanned and
 * handwritten pages as well as digital text — no OCR toolchain required.
 */
export async function extractPdf(filePath, { onProgress = () => {} } = {}) {
  const bytes = await fs.readFile(filePath);
  const sizeMb = bytes.length / (1024 * 1024);
  if (sizeMb > 30) {
    throw new Error(
      `PDF is ${sizeMb.toFixed(1)} MB — the API limit is 32 MB per request. ` +
        `Split it into smaller files (one per chapter works well).`,
    );
  }

  const messages = [
    {
      role: "user",
      content: [
        {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: bytes.toString("base64"),
          },
          cache_control: { type: "ephemeral" },
        },
        { type: "text", text: TRANSCRIBE_PROMPT },
      ],
    },
  ];

  let out = "";
  // Long documents can exceed one response; ask Claude to continue where it stopped.
  for (let round = 0; round < 6; round++) {
    const stream = client.messages.stream({
      model: OCR_MODEL,
      max_tokens: 64000,
      messages,
    });

    let piece = "";
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        piece += event.delta.text;
        onProgress(event.delta.text.length);
      }
    }

    const final = await stream.finalMessage();
    out += (out ? "\n" : "") + piece.trim();

    if (final.stop_reason !== "max_tokens") return out;

    messages.push({ role: "assistant", content: final.content });
    messages.push({
      role: "user",
      content:
        "Continue the transcription from exactly where you stopped. " +
        "Do not repeat anything you already transcribed, and do not add a preamble.",
    });
  }

  return out;
}
