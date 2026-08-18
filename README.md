# Lesson Assistant

An AI tutor for your students that answers **only from your own lessons**.

Students reach it two ways from the same brain:

- **A web app** — you share one link (in your WhatsApp class group, for example). It installs to their phone home screen like an app. No account, no download, no approval from anyone.
- **A Telegram bot** — for students who prefer chatting in a messaging app.

It reads PDFs (**including scans and handwritten notes**), Word documents, PowerPoint slides and plain notes. It works in Arabic, French and English, right-to-left included.

> **دليل الاستعمال بالعربية: [GUIDE-AR.md](GUIDE-AR.md)**

It also gives you a **teacher dashboard** showing what your students are actually asking — and, most usefully, which questions your lessons don't answer.

---

## Why not WhatsApp directly?

Because Meta stands between you and your students, and the wait is not worth it.

The official WhatsApp Business API needs a Meta Business account, a phone number **not already registered on WhatsApp**, and business verification before you can message a real class. Meta's free test number only reaches 5 pre-registered people. Even once approved, you can only reply within 24 hours of a student's message.

This project skips that entirely. You keep WhatsApp as the *place* — you just share a link into your existing class group instead of routing messages through Meta.

If you still want WhatsApp later, nothing here is wasted: the lesson brain (`src/tutor.js`) is separate from the channels (`src/server.js`, `src/telegram.js`). Adding WhatsApp means writing one more channel file, not rebuilding.

---

## Setup

You need [Node.js](https://nodejs.org) 20 or newer.

### 1. Install

```bash
npm install
```

### 2. Get an API key

Create one at [console.anthropic.com](https://console.anthropic.com) → API Keys. Add credit to the account — this is what pays for the answers.

### 3. Configure

```bash
cp .env.example .env
```

Open `.env` and fill in at least:

```ini
ANTHROPIC_API_KEY=sk-ant-...
SUBJECT=Sciences de la Vie et de la Terre (SVT)
TEACHER_NAME=Mr Omari
CLASS_CODE=svt2026
TEACHER_PASSWORD=something-only-you-know
```

> **Set `CLASS_CODE`.** Without it, anyone who gets the link can ask unlimited questions on your API bill. With it, students type the code once and never again.

### 4. Add your lessons

Drop your files into the `lessons/` folder:

```
lessons/
  01-la-cellule.pdf
  02-la-mitose.pdf
  semestre-2/03-geologie.pptx
```

The filename becomes the lesson name students see, so name them clearly.

### 5. Read them in

```bash
npm run ingest
```

PDFs are sent to Claude to be read — this handles scanned pages, photographed handwriting, Arabic script and diagrams. On a labelled schema it transcribes every legend and annotation, since on an SVT diagram the labels are the lesson content. Results are cached, so **you only ever pay to read a file once**. Re-run this whenever you add or change a lesson.

### 6. Start

```bash
npm start
```

Open http://localhost:3000 — that's what your students see.
Open http://localhost:3000/teacher — that's your dashboard (log in with any username and your `TEACHER_PASSWORD`).

### 7. Telegram (optional)

Message [@BotFather](https://t.me/botfather) on Telegram, send `/newbot`, follow the prompts, and paste the token into `.env`:

```ini
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
```

> **Never paste a bot token into a chat, an issue, or a commit.** Anyone holding it can send
> messages as your bot. If one leaks, BotFather's `/revoke` issues a new one immediately.
> `.env` is gitignored so the token stays out of the repository.

Give the bot its name, description and command menu — in Arabic, French and English at once:

```bash
npm run telegram:setup
```

Run that once now, and again whenever you change `SUBJECT` or `BOT_NAME`. The profile picture is
the only thing it can't do: set that with BotFather's `/setuserpic`.

Then, in a second terminal:

```bash
npm run telegram
```

It prints the `t.me/...` link to share with students.

---

## Putting it online

Right now it only runs on your computer. To give students a real link, deploy to any Node host — [Railway](https://railway.app), [Render](https://render.com) and [Fly.io](https://fly.io) all work and have free or near-free tiers.

You need to:

1. Push this repository to GitHub and connect it to the host.
2. Set the same environment variables from your `.env` in the host's dashboard.
3. Run `npm run ingest` **before** deploying, and commit the generated `data/index.json` — or run the ingest step as part of your deploy. The server needs that file to answer anything.

> `data/` is gitignored by default because it also holds your students' conversation logs. If you want to ship the index with your deploy, commit `data/index.json` on its own.

Then share the URL in your class group. On Android and iPhone, students can tap "Add to home screen" and it behaves like an installed app.

---

## What it costs

You pay Anthropic per question. Two things dominate the bill:

**Reading your lessons** — a one-off, cached forever. A 30-page PDF is a few cents.

**Answering questions** — this is the recurring cost, and it depends on the model:

| `CLAUDE_MODEL` | Best for | Relative cost |
|---|---|---|
| `claude-opus-5` (default) | Hard maths, physics, multi-step reasoning | Highest |
| `claude-sonnet-5` | Most subjects | Moderate |
| `claude-haiku-4-5` | Definitions, mechanisms, reading documents | Lowest |

**For SVT specifically**, the subject is definitions, mechanisms and document reading rather than
multi-step calculation, so `CLAUDE_MODEL=claude-haiku-4-5` with `CLAUDE_EFFORT=low` is very likely
enough and costs a fraction of the default. Start there, watch the dashboard for a week, and only
move up to `claude-sonnet-5` if answers feel shallow on a particular lesson.

Two things already keep the bill down:

- **`RATE_LIMIT_PER_HOUR`** (default 40) caps how many questions one student can ask per hour.
- **Prompt caching.** If your whole course fits under `FULL_CONTEXT_LIMIT` characters, the entire course is sent with every question but cached, so repeat questions cost a fraction of the first. Larger courses automatically switch to sending only the relevant excerpts.

---

## How it answers

The bot is deliberately kept on a short leash:

- **It answers from your lessons, not from the internet.** If you teach a method or notation that differs from the standard one, your lesson wins.
- **If your material doesn't cover it, it says so** and points the student to you, rather than inventing something. Those questions show up in your dashboard under *Not covered by your lessons* — that list is genuinely useful for planning what to teach next.
- **It won't do homework.** Asked to solve an exercise, it names the relevant rule, walks through the first step and asks the student to try the next. It marks their attempt when they come back. Set `HINT_MODE=false` if you'd rather it give full solutions.
- **It replies in the student's language** by default. Set `DEFAULT_LANG=ar`, `fr` or `en` to force one.

---

## Settings

Everything lives in `.env`. See `.env.example` for the full list with comments.

| Setting | What it does |
|---|---|
| `SUBJECT`, `TEACHER_NAME`, `BOT_NAME` | Shown to students and used in the bot's instructions |
| `DEFAULT_LANG` | `ar`, `fr`, `en`, or `auto` to mirror the student |
| `CLASS_CODE` | Shared code students enter once. **Set this.** |
| `TEACHER_PASSWORD` | Password for `/teacher` |
| `RATE_LIMIT_PER_HOUR` | Questions per student per hour (default 40) |
| `CLAUDE_MODEL` | See the cost table above |
| `CLAUDE_EFFORT` | `low` … `max`. How hard it thinks. `medium` suits most tutoring |
| `HINT_MODE` | `true` coaches with hints; `false` gives full solutions |
| `TELEGRAM_BOT_TOKEN` | From @BotFather. Leave empty for web only. Never commit it |

---

## How it's put together

```
lessons/            your course files (gitignored)
data/               generated index + conversation log (gitignored)
src/
  ingest.js         lessons/ -> searchable index. Run after changing lessons
  extract/          pdf (via Claude, handles scans), docx, pptx, text
  chunk.js          splits lessons, keeping page and heading labels
  retrieve.js       BM25 search with Arabic/French normalisation
  tutor.js          THE BRAIN: system prompt, context, streaming answers
  store.js          conversation log and dashboard stats
  server.js         web channel
  telegram.js       telegram channel
  telegram-api.js   shared Bot API caller
  telegram-setup.js one-off: bot name, description, command menu
public/             the student web app (no build step, plain JS)
```

The important separation: `tutor.js` knows nothing about HTTP or Telegram. Both channels call it the same way. That's what makes adding WhatsApp later a small job.

### Why no vector database?

Retrieval is plain BM25 keyword search with Arabic and French normalisation (it folds tashkeel, hamza forms, `ة`/`ه`, French accents and elisions, and strips the Arabic definite article, so `الدالة` matches `دالة`). At one-teacher scale this works as well as embeddings, needs no second API key or service, and costs nothing per question. If your course grows past a few hundred pages and recall gets worse, that's the moment to add embeddings — not before.
