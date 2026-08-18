import mammoth from "mammoth";

/** Word documents: mammoth maps Word styles onto Markdown-ish structure. */
export async function extractDocx(filePath) {
  const { value } = await mammoth.convertToMarkdown({ path: filePath });
  return value.trim();
}
