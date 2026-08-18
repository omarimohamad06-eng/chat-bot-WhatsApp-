/**
 * Configures how the bot presents itself inside Telegram: its name, the
 * "What can this bot do?" description, the profile blurb, and the command
 * menu students see when they type "/".
 *
 * Run once after creating the bot, and again whenever you change SUBJECT or
 * BOT_NAME. Everything is set in Arabic, French and a default fallback, so
 * each student sees it in their own Telegram language.
 *
 *   npm run telegram:setup
 */
import { TELEGRAM_TOKEN, BOT_NAME, SUBJECT, TEACHER_NAME } from "./config.js";
import { call } from "./telegram-api.js";

if (!TELEGRAM_TOKEN) {
  console.error(
    "TELEGRAM_BOT_TOKEN is not set in .env\n\n" +
      "Get one from @BotFather on Telegram (/newbot), then add it to .env:\n" +
      "  TELEGRAM_BOT_TOKEN=123456:ABC-DEF...\n",
  );
  process.exit(1);
}

const COMMANDS = {
  default: [
    { command: "start", description: "Start" },
    { command: "lessons", description: "Focus on one lesson" },
    { command: "all", description: "Search all lessons" },
    { command: "reset", description: "Start a new conversation" },
    { command: "help", description: "How to use this bot" },
  ],
  ar: [
    { command: "start", description: "البداية" },
    { command: "lessons", description: "التركيز على درس واحد" },
    { command: "all", description: "البحث في كل الدروس" },
    { command: "reset", description: "بدء محادثة جديدة" },
    { command: "help", description: "كيف أستعمل هذا البوت" },
  ],
  fr: [
    { command: "start", description: "Commencer" },
    { command: "lessons", description: "Se concentrer sur un cours" },
    { command: "all", description: "Chercher dans tous les cours" },
    { command: "reset", description: "Nouvelle conversation" },
    { command: "help", description: "Comment utiliser ce bot" },
  ],
};

// Shown on the empty-chat screen, under "What can this bot do?". Max 512 chars.
const DESCRIPTION = {
  default: `I answer your questions about ${SUBJECT}, using ${TEACHER_NAME}'s lessons.

Just type your question in Arabic, French or English.

I answer from what we covered in class. If a topic hasn't been taught yet, I'll tell you instead of making something up. I won't solve exercises for you either — I'll guide you step by step.`,
  ar: `أجيب عن أسئلتكم في مادة ${SUBJECT}، انطلاقًا من دروس ${TEACHER_NAME}.

اكتب سؤالك بالعربية أو بالفرنسية.

أجيب من الدروس التي شرحناها في القسم. إن كان الموضوع لم يُدرَّس بعد، سأقول لك ذلك بدل أن أخترع جوابًا. ولا أحل لك التمارين، بل أوجّهك خطوة بخطوة.`,
  fr: `Je réponds à tes questions en ${SUBJECT}, à partir des cours de ${TEACHER_NAME}.

Écris simplement ta question en arabe ou en français.

Je réponds à partir de ce qu'on a vu en classe. Si un sujet n'a pas encore été traité, je te le dirai au lieu d'inventer. Je ne résous pas les exercices à ta place : je te guide étape par étape.`,
};

// Shown on the bot's profile page. Max 120 chars.
const SHORT = {
  default: `Ask me about ${SUBJECT}. I answer from our class lessons.`,
  ar: `اسألني في مادة ${SUBJECT}. أجيب من دروس القسم.`,
  fr: `Pose-moi tes questions en ${SUBJECT}. Je réponds à partir des cours.`,
};

/** Telegram rejects an over-long field outright, so trim before sending. */
function fit(text, limit) {
  return text.length <= limit ? text : text.slice(0, limit - 1).trimEnd() + "…";
}

/** A failure on one field shouldn't abort the rest of the setup. */
async function attempt(label, fn) {
  try {
    await fn();
    console.log(`  ok      ${label}`);
  } catch (err) {
    console.log(`  skipped ${label} — ${err.message}`);
  }
}

async function main() {
  const me = await call("getMe", {});
  console.log(`\nConfiguring @${me.username}\n`);

  for (const lang of ["default", "ar", "fr"]) {
    const language_code = lang === "default" ? undefined : lang;
    const suffix = lang === "default" ? "(default)" : `(${lang})`;

    await attempt(`commands ${suffix}`, () =>
      call("setMyCommands", { commands: COMMANDS[lang], language_code }),
    );
    await attempt(`description ${suffix}`, () =>
      call("setMyDescription", { description: fit(DESCRIPTION[lang], 512), language_code }),
    );
    await attempt(`short description ${suffix}`, () =>
      call("setMyShortDescription", { short_description: fit(SHORT[lang], 120), language_code }),
    );
  }

  // Telegram rate-limits name changes, so this one often reports "skipped".
  await attempt("display name", () => call("setMyName", { name: fit(BOT_NAME, 64) }));

  console.log(`\nDone. Open https://t.me/${me.username} to see it.`);
  console.log("A profile picture is the one thing you still set by hand:");
  console.log("  BotFather -> /setuserpic -> pick your bot -> send an image.\n");
}

main().catch((err) => {
  console.error(`\nSetup failed: ${err.message}`);
  if (/unauthorized/i.test(err.message)) {
    console.error("That usually means TELEGRAM_BOT_TOKEN is wrong or has been revoked.\n");
  }
  process.exit(1);
});
