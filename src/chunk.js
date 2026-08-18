const TARGET = 1400; // characters per chunk — roughly a screenful of a lesson
const MIN = 250;

/** Page/slide markers emitted by the extractors. */
const MARKER = /^---\s*(page|slide)\s+(\d+)\s*---$/i;
const HEADING = /^(#{1,4})\s+(.*)$/;

/**
 * Splits a lesson into retrievable chunks, keeping each one labelled with the
 * heading trail and page it came from so the bot can cite "page 4 of Lesson 3".
 */
export function chunkDocument(markdown, { source, title }) {
  const lines = markdown.split(/\r?\n/);
  const chunks = [];

  let trail = [];
  let page = null;
  let buf = [];
  let bufPage = null;
  let bufTrail = [];

  const flush = () => {
    const text = buf.join("\n").trim();
    buf = [];
    if (!text) return;
    chunks.push({
      source,
      title,
      page: bufPage,
      heading: bufTrail.join(" › "),
      text,
    });
  };

  const size = () => buf.join("\n").length;

  for (const line of lines) {
    const marker = line.match(MARKER);
    if (marker) {
      // A page break is a natural chunk boundary once we have enough material.
      if (size() >= MIN) flush();
      page = Number(marker[2]);
      // A chunk opened before the first marker still belongs to this page.
      if (!buf.length || bufPage === null) bufPage = page;
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      if (size() >= MIN) flush();
      const level = heading[1].length;
      trail = trail.slice(0, level - 1);
      trail[level - 1] = heading[2].trim();
      trail = trail.filter(Boolean);
    }

    if (!buf.length) {
      bufPage = page;
      bufTrail = [...trail];
    }
    buf.push(line);

    if (size() >= TARGET) {
      // Overlap the tail so a sentence split across chunks stays findable.
      const kept = buf.slice(-3);
      flush();
      bufPage = page;
      bufTrail = [...trail];
      buf = kept;
    }
  }
  flush();

  return chunks.filter((c) => c.text.replace(/\s/g, "").length > 20);
}
