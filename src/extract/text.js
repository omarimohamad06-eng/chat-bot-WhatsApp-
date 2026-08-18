import fs from "node:fs/promises";

export async function extractText(filePath) {
  return (await fs.readFile(filePath, "utf8")).trim();
}
