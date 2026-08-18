/**
 * Lexical (BM25) retrieval with Arabic and French normalisation.
 *
 * Deliberately dependency-free: no embedding provider, no vector database and
 * no second API key. At one-course scale this matches semantic search closely
 * enough, and it costs nothing per question.
 */

const K1 = 1.5;
const B = 0.75;

const STOPWORDS = new Set([
  // Arabic
  "في","من","على","الى","إلى","عن","مع","هذا","هذه","ذلك","التي","الذي","ما","هل",
  "كيف","لماذا","ماذا","اين","أين","متى","هو","هي","ان","أن","كان","يكون","قد","لا","نعم",
  // French
  "le","la","les","un","une","des","de","du","et","ou","est","sont","que","qui","quoi",
  "dans","pour","sur","avec","par","ce","cette","ces","je","tu","il","elle","nous","vous",
  "comment","pourquoi","quand","ne","pas","au","aux","en",
  // English
  "the","a","an","of","and","or","is","are","to","in","for","on","with","this","that",
  "what","how","why","when","it","be","can","do","does","i","you",
]);

/** Folds away the spelling variation that makes naive Arabic/French search miss. */
export function normalize(text) {
  return text
    .normalize("NFD")
    // Strips Latin accents AND Arabic tashkeel/hamza marks in one pass. NFD turns
    // \u00e9 into e+mark and \u0623 into alef+hamza-mark, so both fold away here.
    .replace(/\p{M}+/gu, "")
    .replace(/\u0640/g, "") // Arabic tatweel, a letter-category padding character
    .replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627") // any leftover precomposed alef -> bare alef
    .replace(/\u0649/g, "\u064a") // alef maqsura -> ya
    .replace(/\u0629/g, "\u0647") // ta marbuta -> ha
    .replace(/\u0624/g, "\u0648") // waw hamza -> waw
    .replace(/\u0626/g, "\u064a") // ya hamza -> ya
    .replace(/[\u2019']/g, "'")
    .toLowerCase();
}

export function tokenize(text) {
  const normalized = normalize(text)
    // French elision: l'eau -> eau, qu'il -> il
    .replace(/\b(l|d|j|n|s|t|c|m|qu)'/g, " ");

  const tokens = [];
  for (const [word] of normalized.matchAll(/[\p{L}\p{N}]+/gu)) {
    if (word.length < 2) continue;
    // Arabic definite article: الدالة and دالة should match.
    const stem = word.length > 4 && word.startsWith("ال") ? word.slice(2) : word;
    if (STOPWORDS.has(stem) || STOPWORDS.has(word)) continue;
    tokens.push(stem);
  }
  return tokens;
}

/** Precomputes term frequencies and document frequencies for the chunk set. */
export function buildIndex(chunks) {
  const docs = chunks.map((chunk) => {
    const tokens = tokenize(`${chunk.heading} ${chunk.title} ${chunk.text}`);
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    return { tf: Object.fromEntries(tf), length: tokens.length };
  });

  const df = new Map();
  for (const doc of docs) {
    for (const term of Object.keys(doc.tf)) df.set(term, (df.get(term) || 0) + 1);
  }

  const totalLength = docs.reduce((sum, d) => sum + d.length, 0);
  return {
    chunks,
    docs,
    df: Object.fromEntries(df),
    avgLength: docs.length ? totalLength / docs.length : 0,
  };
}

/** Returns the top-k chunks for a question, best first. */
export function search(index, query, { k = 8, lesson = null } = {}) {
  const terms = tokenize(query);
  if (!terms.length) return [];

  const N = index.docs.length;
  const scored = [];

  for (let i = 0; i < N; i++) {
    if (lesson && index.chunks[i].source !== lesson) continue;

    const doc = index.docs[i];
    let score = 0;
    for (const term of terms) {
      const freq = doc.tf[term];
      if (!freq) continue;
      const df = index.df[term] || 0;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      const norm = 1 - B + (B * doc.length) / (index.avgLength || 1);
      score += idf * ((freq * (K1 + 1)) / (freq + K1 * norm));
    }
    if (score > 0) scored.push({ score, chunk: index.chunks[i] });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}
