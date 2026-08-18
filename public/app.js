(() => {
  "use strict";

  const I18N = {
    ar: {
      dir: "rtl",
      yourName: "اسمك",
      classCode: "رمز القسم",
      start: "ابدأ",
      placeholder: "اسأل عن الدرس…",
      allLessons: "كل الدروس",
      welcome: "اسألني أي سؤال عن دروسنا. أجيب انطلاقا من الدروس التي شرحناها في القسم.",
      badCode: "رمز القسم غير صحيح.",
      needName: "اكتب اسمك من فضلك.",
      sources: "المصدر",
      error: "حدث خطأ. حاول مرة أخرى.",
      rate: "لقد وصلت إلى الحد الأقصى من الأسئلة هذه الساعة.",
      notReady: "لم يتم رفع الدروس بعد. اتصل بأستاذك.",
      samples: ["اشرح لي الدرس الأخير", "ما الفرق بين ...؟", "أعطني مثالا محلولا"],
    },
    fr: {
      dir: "ltr",
      yourName: "Ton prénom",
      classCode: "Code de la classe",
      start: "Commencer",
      placeholder: "Pose ta question sur le cours…",
      allLessons: "Tous les cours",
      welcome: "Pose-moi une question sur nos cours. Je réponds à partir des leçons vues en classe.",
      badCode: "Code de classe incorrect.",
      needName: "Écris ton prénom, s'il te plaît.",
      sources: "Source",
      error: "Une erreur est survenue. Réessaie.",
      rate: "Tu as atteint la limite de questions pour cette heure.",
      notReady: "Les cours ne sont pas encore chargés. Préviens ton professeur.",
      samples: ["Explique-moi le dernier cours", "Quelle est la différence entre ... ?", "Donne-moi un exemple corrigé"],
    },
    en: {
      dir: "ltr",
      yourName: "Your name",
      classCode: "Class code",
      start: "Start",
      placeholder: "Ask about the lesson…",
      allLessons: "All lessons",
      welcome: "Ask me anything about our lessons. I answer from the material we covered in class.",
      badCode: "That class code isn't right.",
      needName: "Please enter your name.",
      sources: "Source",
      error: "Something went wrong. Please try again.",
      rate: "You've reached the question limit for this hour.",
      notReady: "No lessons loaded yet. Let your teacher know.",
      samples: ["Explain the last lesson", "What's the difference between ...?", "Give me a worked example"],
    },
  };

  const $ = (id) => document.getElementById(id);
  const store = {
    get: (k, d = "") => { try { return localStorage.getItem("tutor:" + k) ?? d; } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem("tutor:" + k, v); } catch {} },
  };

  let lang = store.get("lang") || (navigator.language || "en").slice(0, 2);
  if (!I18N[lang]) lang = "en";
  let t = I18N[lang];
  let config = null;
  const history = [];
  let busy = false;

  // ------------------------------------------------------------- rendering
  const esc = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  /**
   * Small Markdown subset renderer. Everything is escaped first, so the model's
   * output can never inject HTML.
   */
  function markdown(src) {
    const codeBlocks = [];
    const s = esc(src).replace(/```(\w*)\n?([\s\S]*?)```/g, (_, _lang, body) => {
      codeBlocks.push(`<pre><code>${body.replace(/\n$/, "")}</code></pre>`);
      return ` CODEBLOCK${codeBlocks.length - 1} `;
    });

    const out = [];
    let list = null;
    const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };

    for (const line of s.split("\n")) {
      const heading = line.match(/^(#{1,4})\s+(.*)$/);
      const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
      const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);

      if (heading) {
        closeList();
        const level = Math.min(heading[1].length + 1, 4);
        out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      } else if (bullet) {
        if (list !== "ul") { closeList(); out.push("<ul>"); list = "ul"; }
        out.push(`<li>${inline(bullet[1])}</li>`);
      } else if (numbered) {
        if (list !== "ol") { closeList(); out.push("<ol>"); list = "ol"; }
        out.push(`<li>${inline(numbered[1])}</li>`);
      } else if (!line.trim()) {
        closeList();
      } else {
        closeList();
        out.push(`<p>${inline(line)}</p>`);
      }
    }
    closeList();

    return out.join("").replace(/ CODEBLOCK(\d+) /g, (_, i) => codeBlocks[i]);
  }

  function inline(s) {
    return s
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }

  function typeset(el) {
    if (!window.renderMathInElement) return;
    try {
      window.renderMathInElement(el, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "\\[", right: "\\]", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\(", right: "\\)", display: false },
        ],
        throwOnError: false,
      });
    } catch { /* math rendering is a bonus, never a blocker */ }
  }

  // ------------------------------------------------------------------- chat
  const chat = $("chat");

  const atBottom = () => chat.scrollHeight - chat.scrollTop - chat.clientHeight < 120;
  const scroll = (force) => { if (force || atBottom()) chat.scrollTop = chat.scrollHeight; };

  function addMessage(role, html) {
    const msg = document.createElement("div");
    msg.className = `msg ${role}`;
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.innerHTML = html;
    msg.appendChild(bubble);
    chat.appendChild(msg);
    scroll(true);
    return { msg, bubble };
  }

  function showWelcome() {
    chat.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "hint";
    wrap.textContent = config && config.ready === false ? t.notReady : t.welcome;
    if (!config || config.ready !== false) {
      const row = document.createElement("div");
      row.className = "chip-row";
      for (const sample of t.samples) {
        const chip = document.createElement("button");
        chip.className = "chip";
        chip.type = "button";
        chip.textContent = sample;
        chip.onclick = () => { $("input").value = sample; $("input").focus(); };
        row.appendChild(chip);
      }
      wrap.appendChild(row);
    }
    chat.appendChild(wrap);
  }

  async function ask(question) {
    if (busy) return;
    busy = true;
    $("send").disabled = true;

    if (chat.querySelector(".hint")) chat.innerHTML = "";
    addMessage("you", esc(question).replace(/\n/g, "<br>"));

    const { msg, bubble } = addMessage("bot", '<div class="typing"><i></i><i></i><i></i></div>');
    let text = "";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          student: store.get("name"),
          code: store.get("code"),
          lesson: $("lesson-filter").value || null,
          history: history.slice(-8),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        bubble.textContent = res.status === 429 ? t.rate : body.message || t.error;
        return;
      }

      // Parse the SSE stream by hand: fetch gives a byte stream, not EventSource.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const frames = buffer.split("\n\n");
        buffer = frames.pop() || "";

        for (const frame of frames) {
          const event = (frame.match(/^event: (.*)$/m) || [])[1];
          const raw = (frame.match(/^data: (.*)$/m) || [])[1];
          if (!raw) continue;
          let data;
          try { data = JSON.parse(raw); } catch { continue; }

          if (event === "delta") {
            text += data.text;
            bubble.innerHTML = markdown(text);
            scroll(false);
          } else if (event === "done") {
            bubble.innerHTML = markdown(text);
            typeset(bubble);
            const titles = [...new Set((data.sources || []).map((s) => s.title))].slice(0, 3);
            if (titles.length && data.grounded) {
              const note = document.createElement("div");
              note.className = "sources";
              note.textContent = `${t.sources}: ${titles.join(" - ")}`;
              msg.appendChild(note);
            }
          } else if (event === "error") {
            bubble.textContent = data.message || t.error;
          }
        }
      }

      if (text) {
        history.push({ role: "user", content: question });
        history.push({ role: "assistant", content: text });
      }
    } catch {
      bubble.textContent = t.error;
    } finally {
      busy = false;
      $("send").disabled = false;
      scroll(false);
    }
  }

  // ------------------------------------------------------------------- i18n
  function applyLang(next) {
    lang = next;
    t = I18N[lang];
    store.set("lang", lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = t.dir;

    for (const el of document.querySelectorAll("[data-i18n]")) {
      el.textContent = t[el.dataset.i18n] || el.textContent;
    }
    for (const el of document.querySelectorAll("[data-i18n-ph]")) {
      el.placeholder = t[el.dataset.i18nPh] || el.placeholder;
    }
    for (const b of document.querySelectorAll(".lang")) {
      b.setAttribute("aria-pressed", String(b.dataset.lang === lang));
    }

    const filter = $("lesson-filter");
    if (filter.options.length) filter.options[0].textContent = t.allLessons;
    if (chat.querySelector(".hint")) showWelcome();
  }

  // -------------------------------------------------------------- bootstrap
  async function init() {
    try {
      config = await (await fetch("/api/config")).json();
    } catch {
      config = { botName: "Lesson Assistant", lessons: [], ready: false };
    }

    $("bot-name").textContent = config.botName;
    $("gate-title").textContent = config.botName;
    $("bot-sub").textContent = config.subject || "";
    $("gate-sub").textContent = config.subject || "";
    document.title = config.botName;

    if (config.lang && I18N[config.lang] && !store.get("lang")) applyLang(config.lang);
    else applyLang(lang);

    const filter = $("lesson-filter");
    filter.innerHTML = `<option value="">${t.allLessons}</option>`;
    for (const lesson of config.lessons || []) {
      const opt = document.createElement("option");
      opt.value = lesson.source;
      opt.textContent = lesson.title;
      filter.appendChild(opt);
    }
    filter.hidden = (config.lessons || []).length < 2;

    showWelcome();

    // Returning students skip the gate.
    const known = store.get("name") && (!config.requiresCode || store.get("code"));
    if (!known) {
      $("gate").hidden = false;
      $("code-field").hidden = !config.requiresCode;
      $("student-name").value = store.get("name");
    }
  }

  $("gate-go").onclick = async () => {
    const name = $("student-name").value.trim();
    const code = $("class-code").value.trim();
    const error = $("gate-error");
    error.hidden = true;

    if (!name) { error.textContent = t.needName; error.hidden = false; return; }

    if (config.requiresCode) {
      $("gate-go").disabled = true;
      const ok = await fetch("/api/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      }).then((r) => r.json()).then((d) => d.ok).catch(() => false);
      $("gate-go").disabled = false;
      if (!ok) { error.textContent = t.badCode; error.hidden = false; return; }
      store.set("code", code);
    }

    store.set("name", name);
    $("gate").hidden = true;
    $("input").focus();
  };

  for (const b of document.querySelectorAll(".lang")) {
    b.onclick = () => applyLang(b.dataset.lang);
  }

  const input = $("input");
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 140) + "px";
  });
  input.addEventListener("keydown", (e) => {
    // Enter sends on desktop; on touch keyboards the send button is the way.
    if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(hover: hover)").matches) {
      e.preventDefault();
      $("composer").requestSubmit();
    }
  });

  $("composer").addEventListener("submit", (e) => {
    e.preventDefault();
    const question = input.value.trim();
    if (!question || busy) return;
    input.value = "";
    input.style.height = "auto";
    ask(question);
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }

  init();
})();
