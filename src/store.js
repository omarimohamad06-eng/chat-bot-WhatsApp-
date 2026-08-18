import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { DATA_DIR, LOG_PATH } from "./config.js";

fs.mkdirSync(DATA_DIR, { recursive: true });

/** One JSON object per line — append-only, no database to run. */
export async function logExchange(entry) {
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry });
  await fsp.appendFile(LOG_PATH, line + "\n", "utf8");
}

export async function readExchanges({ limit = 500 } = {}) {
  let raw;
  try {
    raw = await fsp.readFile(LOG_PATH, "utf8");
  } catch {
    return [];
  }
  const lines = raw.split("\n").filter(Boolean);
  return lines
    .slice(-limit)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .reverse();
}

/** What the teacher actually wants to know: what are they stuck on? */
export async function stats() {
  const all = await readExchanges({ limit: 5000 });
  const byLesson = new Map();
  const byDay = new Map();
  const students = new Set();
  let ungrounded = 0;

  for (const e of all) {
    if (e.student) students.add(e.student);
    if (e.grounded === false) ungrounded++;

    const day = (e.at || "").slice(0, 10);
    byDay.set(day, (byDay.get(day) || 0) + 1);

    for (const title of new Set((e.sources || []).map((s) => s.title).filter(Boolean))) {
      byLesson.set(title, (byLesson.get(title) || 0) + 1);
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return {
    total: all.length,
    today: byDay.get(today) || 0,
    students: students.size,
    // Questions the lessons didn't cover — the gaps worth teaching next.
    uncovered: ungrounded,
    byLesson: [...byLesson.entries()].sort((a, b) => b[1] - a[1]).map(([title, count]) => ({ title, count })),
    byDay: [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-30).map(([day, count]) => ({ day, count })),
    recent: all.slice(0, 200),
  };
}

export { path };
