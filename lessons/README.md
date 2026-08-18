# Put your lesson files here

Drop your course material into this folder, then run `npm run ingest`.

Supported formats:

| Format | Notes |
|---|---|
| `.pdf`  | Digital **and scanned/photographed** pages. Claude reads them directly, including handwriting, Arabic script and diagrams. |
| `.docx` | Word documents |
| `.pptx` | PowerPoint slides, including speaker notes |
| `.md` / `.txt` | Plain notes |

## Tips

- **Name files clearly.** The filename becomes the lesson name students see:
  `03-fonctions-exponentielles.pdf` shows as *03 fonctions exponentielles*.
- **Subfolders work.** `term-1/lesson-2.pdf` becomes *term-1 / lesson 2*.
- **One chapter per file** reads best, and keeps each PDF under the 32 MB limit.
- **Re-run `npm run ingest`** whenever you add or change a file. Files that
  haven't changed are not re-read, so you never pay twice for the same PDF.
