const EDGE = "https://fpyabrrjtwrsodyvjjlp.supabase.co/functions/v1"; // replaced at deploy via env

// Cleanup any legacy persistent sessionId from earlier builds — chat session
// should NOT survive page reloads (sessionStorage only).
try { localStorage.removeItem("sessionId"); } catch {}

const STATE = {
  lang: localStorage.getItem("lang") || (navigator.language.startsWith("en") ? "en" : navigator.language.startsWith("es") ? "es" : "pt-br"),
  sessionId: sessionStorage.getItem("sessionId") || null,
  i18n: {},
  pendingImage: null,
};

const $ = (id) => document.getElementById(id);

async function loadI18n(lang) {
  const r = await fetch(`assets/i18n/${lang}.json`);
  STATE.i18n = await r.json();
  document.documentElement.lang = lang;
  document.title = STATE.i18n.title;

  const titleEl = $("title");
  if (titleEl) titleEl.textContent = STATE.i18n.title;

  // hero-title is now an <img> (logo), no textContent needed.

  const heroSubEl = $("hero-sub");
  if (heroSubEl) heroSubEl.textContent = STATE.i18n.hero_sub;

  $("input").placeholder = STATE.i18n.placeholder;
  $("attach").title = STATE.i18n.attach;
  $("error-log-toggle").textContent = "+ " + STATE.i18n.error_log_label;

  // Update suggestion labels
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (STATE.i18n[key]) el.textContent = STATE.i18n[key];
  });

  document.querySelectorAll("#lang-switch button").forEach((b) => {
    b.classList.toggle("active", b.dataset.lang === lang);
  });
}

function showWelcomeState() {
  const ws = $("welcome-state");
  const cs = $("chat-state");
  if (ws) ws.hidden = false;
  if (cs) cs.hidden = true;
}

function showChatState() {
  const ws = $("welcome-state");
  const cs = $("chat-state");
  if (ws) ws.hidden = true;
  if (cs) cs.hidden = false;
}

function renderMarkdown(text) {
  return DOMPurify.sanitize(marked.parse(text));
}

function appendMessage(role, content, messageId = null) {
  showChatState();

  const div = document.createElement("div");
  div.className = `msg ${role}`;
  const body = document.createElement("div");
  body.className = "msg-body";
  body.innerHTML = renderMarkdown(content);
  div.appendChild(body);
  if (role === "assistant" && messageId) attachFeedback(div, messageId);

  $("chat-state").appendChild(div);

  // Smooth scroll so the new message is clearly above the sticky input.
  // We use window scroll (not container scroll) because the input bar is sticky
  // at the bottom of the viewport — block:'end' alone hides the message behind it.
  requestAnimationFrame(() => {
    const inputArea = document.querySelector(".input-area");
    const inputH = inputArea ? inputArea.getBoundingClientRect().height : 200;
    const rect = div.getBoundingClientRect();
    const target = window.scrollY + rect.bottom - window.innerHeight + inputH + 24;
    window.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  });

  return div;
}

const ICON_THUMB_UP = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H7V10l4.34-7.71a1.5 1.5 0 0 1 2.74.41z"/></svg>`;
const ICON_THUMB_DOWN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H17v12l-4.34 7.71a1.5 1.5 0 0 1-2.74-.41z"/></svg>`;

function attachFeedback(messageDiv, messageId) {
  if (messageDiv.querySelector(".feedback")) return;
  const fb = document.createElement("div");
  fb.className = "feedback";
  fb.innerHTML =
    `<button class="fb-btn" data-rating="1" aria-label="Útil">${ICON_THUMB_UP}</button>` +
    `<button class="fb-btn" data-rating="-1" aria-label="Não útil">${ICON_THUMB_DOWN}</button>`;
  fb.querySelectorAll("button").forEach((b) => {
    b.onclick = () => sendFeedback(messageId, Number(b.dataset.rating), b);
  });
  messageDiv.appendChild(fb);
}

function setMessageBody(messageDiv, html) {
  const body = messageDiv.querySelector(".msg-body");
  if (body) body.innerHTML = html;
}

async function sendFeedback(messageId, rating, button) {
  try {
    await fetch(`${EDGE}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message_id: messageId, rating }),
    });
    button.parentElement.innerHTML = `<span style="color:var(--text-muted);font-size:13px">${STATE.i18n.feedback_thanks}</span>`;
  } catch { /* silently fail */ }
}

async function fileToBase64(file) {
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function compressIfNeeded(file) {
  if (file.size < 1024 * 1024) return file;
  const img = await new Promise((resolve) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.src = URL.createObjectURL(file);
  });
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85));
}

function showImagePreview(dataUrl) {
  $("preview-img").src = dataUrl;
  $("image-preview").hidden = false;
}

function clearImagePreview() {
  STATE.pendingImage = null;
  $("image-preview").hidden = true;
  $("preview-img").src = "";
  $("file-input").value = "";
}

async function handleFile(file) {
  if (!file) return;
  if (file.size > 4 * 1024 * 1024) {
    alert(STATE.i18n.image_too_large);
    return;
  }
  const compressed = await compressIfNeeded(file);
  const b64 = await fileToBase64(compressed);
  STATE.pendingImage = b64;
  showImagePreview(b64);
}

async function sendMessage() {
  const message = $("input").value.trim();
  if (!message && !STATE.pendingImage) return;
  const errorLog = $("error-log") ? $("error-log").value.trim() || null : null;

  appendMessage("user", message + (STATE.pendingImage ? "\n\n*(imagem anexada)*" : ""));
  $("input").value = "";
  if ($("error-log")) $("error-log").value = "";
  $("error-log-area").hidden = true;
  const pendingImage = STATE.pendingImage;
  clearImagePreview();

  const placeholder = appendMessage("assistant", "");
  setMessageBody(placeholder, '<div class="typing-dots" aria-label="' + (STATE.i18n.thinking || "Pensando") + '"><span></span><span></span><span></span></div>');
  let fullText = "";
  let assistantMessageId = null;

  try {
    const payload = { message, lang: STATE.lang };
    if (STATE.sessionId) payload.session_id = STATE.sessionId;
    if (pendingImage) payload.image_base64 = pendingImage;
    if (errorLog) payload.error_log = errorLog;
    const resp = await fetch(`${EDGE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      if (resp.status === 429) {
        setMessageBody(placeholder, renderMarkdown(STATE.i18n.rate_limit));
        return;
      }
      throw new Error("HTTP " + resp.status);
    }

    const reader = resp.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "";
    setMessageBody(placeholder, "");

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += value;
      let i;
      while ((i = buf.indexOf("\n\n")) !== -1) {
        const event = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const lines = event.split("\n");
        const evType = lines.find((l) => l.startsWith("event:"))?.slice(6).trim();
        const data = lines.find((l) => l.startsWith("data:"))?.slice(5).trim();
        if (!data) continue;
        const obj = JSON.parse(data);
        if (evType === "session") {
          STATE.sessionId = obj.session_id;
          sessionStorage.setItem("sessionId", obj.session_id);
        } else if (evType === "chunk") {
          fullText += obj.text;
          setMessageBody(placeholder, renderMarkdown(fullText));
          // Keep the streaming message above the sticky input as it grows.
          const inputArea = document.querySelector(".input-area");
          const inputH = inputArea ? inputArea.getBoundingClientRect().height : 200;
          const rect = placeholder.getBoundingClientRect();
          const target = window.scrollY + rect.bottom - window.innerHeight + inputH + 24;
          if (target > window.scrollY) window.scrollTo({ top: target, behavior: "instant" });
        } else if (evType === "replace") {
          fullText = obj.text;
          setMessageBody(placeholder, renderMarkdown(fullText));
        } else if (evType === "done") {
          assistantMessageId = obj.message_id ?? null;
          if (assistantMessageId) attachFeedback(placeholder, assistantMessageId);
        }
      }
    }
  } catch (e) {
    setMessageBody(placeholder, renderMarkdown(STATE.i18n.error_generic));
    console.error(e);
  }
}

// ── Wire up events ──────────────────────────────────────────

document.querySelectorAll("#lang-switch button").forEach((b) => {
  b.onclick = async () => {
    STATE.lang = b.dataset.lang;
    localStorage.setItem("lang", STATE.lang);
    await loadI18n(STATE.lang);
  };
});

$("send").onclick = sendMessage;

$("input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Auto-resize textarea
$("input").addEventListener("input", () => {
  const el = $("input");
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 200) + "px";
});

$("attach").onclick = () => $("file-input").click();

$("file-input").addEventListener("change", (e) => handleFile(e.target.files[0]));

$("preview-remove").onclick = clearImagePreview;

$("error-log-toggle").onclick = () => {
  $("error-log-area").hidden = !$("error-log-area").hidden;
};

// Suggestion card click
document.querySelectorAll(".suggestion").forEach((s) => {
  const activate = () => {
    const question = s.dataset.question;
    if (!question) return;
    $("input").value = question;
    $("input").style.height = "auto";
    $("input").style.height = Math.min($("input").scrollHeight, 200) + "px";
    $("input").focus();
    sendMessage();
  };

  s.addEventListener("click", activate);
  s.querySelector(".card")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate();
    }
  });
});

// Paste image
document.addEventListener("paste", async (e) => {
  for (const item of e.clipboardData.items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      await handleFile(file);
      break;
    }
  }
});

// Resolve token from deeplink
async function maybeResolveToken() {
  const params = new URLSearchParams(location.search);
  const token = params.get("t");
  if (!token) return;
  try {
    const r = await fetch(`${EDGE}/resolve-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!r.ok) return;
    const data = await r.json();
    STATE.sessionId = data.session_id;
    sessionStorage.setItem("sessionId", data.session_id);
    if (data.lang) {
      STATE.lang = data.lang;
      localStorage.setItem("lang", data.lang);
    }
    appendMessage("assistant", data.greeting);
  } catch { /* ignore */ }
}

// Theme toggle
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try { localStorage.setItem("theme", theme); } catch {}
}
const themeToggleBtn = $("theme-toggle");
if (themeToggleBtn) {
  themeToggleBtn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    applyTheme(current === "dark" ? "light" : "dark");
  });
}

(async () => {
  await loadI18n(STATE.lang);
  await maybeResolveToken();
})();
