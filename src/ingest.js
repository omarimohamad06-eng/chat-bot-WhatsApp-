import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { LESSONS_DIR, DATA_DIR, INDEX_PATH } from "./config.js";
import { extractPdf } from "./extract/pdf.js";
import { extractDocx } from "./extract/docx.js";
import { extractPptx } from "./extract/pptx.js";
import { extractText } from "./extract/text.js";
import { chunkDocument } from "./chunk.js";
import { buildIndex } from "./retrieve.js";

const CACHE_DIR = path.join(DATA_DIR, "extracted");
const SUPPORTED = new Set([".pdf", ".docx", ".pptx", ".md", ".txt"]);

function prettyTitle(relPath) {
  return relPath
    .replace(/\.[^.]+$/, "")
    .split(path.sep)
    .join(" / ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function walk(dir, base = dir) {
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    // The folder's own instructions file is not course material.
    if (entry.isFile() && entry.name.toLowerCase() === "readme.md") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, base)));
    else if (SUPPORTED.has(path.extname(entry.name).toLowerCase()))
      out.push({ full, rel: path.relative(base, full) });
  }
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

/** Transcriptions are cached against file size+mtime so PDFs are only read once. */
async function extractCached(file) {
  const stat = await fs.stat(file.full);
  const fingerprint = crypto
    .createHash("sha1")
    .update(`${file.rel}:${stat.size}:${Math.floor(stat.mtimeMs)}`)
    .digest("hex");
  const cacheFile = path.join(CACHE_DIR, `${fingerprint}.md`);

  try {
    const cached = await fs.readFile(cacheFile, "utf8");
    process.stdout.write(`  cached  ${file.rel}\n`);
    return cached;
  } catch {
    /* not cached yet */
  }

  const ext = path.extname(file.full).toLowerCase();
  process.stdout.write(`  reading ${file.rel}`);
  let markdown;
  if (ext === ".pdf") {
    process.stdout.write(" (sending to Claude — scans and handwriting included)");
    markdown = await extractPdf(file.full);
  } else if (ext === ".docx") markdown = await extractDocx(file.full);
  else if (ext === ".pptx") markdown = await extractPptx(file.full);
  else markdown = await extractText(file.full);
  process.stdout.write("\n");

  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(cacheFile, markdown, "utf8");
  return markdown;
}

async function main() {
  await fs.mkdir(LESSONS_DIR, { recursive: true });
  await fs.mkdir(DATA_DIR, { recursive: true });

  const files = await walk(LESSONS_DIR);
  if (!files.length) {
    console.error(
      `No lesson files found in ${LESSONS_DIR}\n` +
        `Drop your PDFs, Word documents, slides or notes in there and run this again.\n` +
        `Supported: ${[...SUPPORTED].join(" ")}`,
    );
    process.exit(1);
  }

  console.log(`Found ${files.length} lesson file(s).\n`);

  const allChunks = [];
  const lessons = [];
  const failures = [];

  for (const file of files) {
    let markdown;
    try {
      markdown = await extractCached(file);
    } catch (err) {
      console.error(`  FAILED  ${file.rel}: ${err.message}`);
      failures.push({ file: file.rel, error: err.message });
      continue;
    }

    const title = prettyTitle(file.rel);
    const chunks = chunkDocument(markdown, { source: file.rel, title });
    if (!chunks.length) {
      console.error(`  EMPTY   ${file.rel}: no readable text found`);
      failures.push({ file: file.rel, error: "no readable text found" });
      continue;
    }
    allChunks.push(...chunks);
    lessons.push({ source: file.rel, title, chunks: chunks.length, chars: markdown.length });
  }

  if (!allChunks.length) {
    console.error("\nNothing could be read from your lesson files. Nothing was written.");
    process.exit(1);
  }

  const index = buildIndex(allChunks);
  const totalChars = allChunks.reduce((n, c) => n + c.text.length, 0);

  await fs.writeFile(
    INDEX_PATH,
    JSON.stringify({ ...index, lessons, builtAt: new Date().toISOString() }),
    "utf8",
  );

  console.log(`\nIndexed ${lessons.length} lesson(s), ${allChunks.length} chunks, ${totalChars.toLocaleString()} characters.`);
  for (const l of lessons) console.log(`  ${l.title}  (${l.chunks} chunks)`);
  if (failures.length) {
    console.log(`\n${failures.length} file(s) could not be read:`);
    for (const f of failures) console.log(`  ${f.file}: ${f.error}`);
  }
  console.log(`\nWrote ${INDEX_PATH}\nNow run:  npm start`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
