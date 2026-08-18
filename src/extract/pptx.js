import AdmZip from "adm-zip";

/** Slide files are zipped XML; slideN.xml holds the text in <a:t> nodes. */
function slideNumber(entryName) {
  const m = entryName.match(/slide(\d+)\.xml$/);
  return m ? Number(m[1]) : 0;
}

function decodeXmlEntities(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

function textOf(xml) {
  const lines = [];
  // Each <a:p> is a paragraph; <a:t> nodes inside it are its text runs.
  for (const [, para] of xml.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)) {
    const runs = [...para.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g)].map((m) =>
      decodeXmlEntities(m[1]),
    );
    const line = runs.join("").trim();
    if (line) lines.push(line);
  }
  return lines;
}

export async function extractPptx(filePath) {
  const zip = new AdmZip(filePath);
  const slides = zip
    .getEntries()
    .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
    .sort((a, b) => slideNumber(a.entryName) - slideNumber(b.entryName));

  const notesFor = (n) => {
    const entry = zip.getEntry(`ppt/notesSlides/notesSlide${n}.xml`);
    if (!entry) return [];
    return textOf(entry.getData().toString("utf8"));
  };

  const out = [];
  for (const entry of slides) {
    const n = slideNumber(entry.entryName);
    const lines = textOf(entry.getData().toString("utf8"));
    if (!lines.length) continue;

    // The first line of a slide is nearly always its title.
    const [title, ...body] = lines;
    out.push(`--- slide ${n} ---`);
    out.push(`## ${title}`);
    if (body.length) out.push(body.join("\n"));

    const notes = notesFor(n).filter((l) => l !== String(n));
    if (notes.length) out.push(`\n_Speaker notes:_ ${notes.join(" ")}`);
  }
  return out.join("\n\n").trim();
}
