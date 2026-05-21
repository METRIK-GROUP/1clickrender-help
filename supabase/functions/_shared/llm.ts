import type { Lang } from "./i18n.ts";

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ImagePart = { mime: string; base64: string };

export type LLMRequest = {
  system: string;
  history: ChatMessage[];
  userMessage: string;
  lang: Lang;
  image?: ImagePart;
};

// ---------- Gemini ----------

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent`;

// Gemini Flash request payload shape (subset we use)
// deno-lint-ignore no-explicit-any
export function buildGeminiRequest(req: LLMRequest): any {
  const contents = req.history.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  // deno-lint-ignore no-explicit-any
  const userParts: any[] = [{ text: req.userMessage }];
  if (req.image) {
    userParts.push({ inlineData: { mimeType: req.image.mime, data: req.image.base64 } });
  }
  contents.push({ role: "user", parts: userParts });

  // deno-lint-ignore no-explicit-any
  const payload: any = {
    systemInstruction: { parts: [{ text: req.system }] },
    contents,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 2048,
    },
  };

  if (req.system.length >= 4096) {
    payload.cachedContent = "__system_cache_marker__";
  }

  return payload;
}

async function* callGemini(req: LLMRequest): AsyncGenerator<string> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");

  const payload = buildGeminiRequest(req);
  delete payload.cachedContent;

  const resp = await fetch(`${GEMINI_ENDPOINT}?alt=sse&key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!resp.ok || !resp.body) {
    throw new Error(`Gemini error ${resp.status}: ${await resp.text()}`);
  }

  const reader = resp.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += value;
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const json = line.slice(5).trim();
      if (!json || json === "[DONE]") continue;
      try {
        const obj = JSON.parse(json);
        const text = obj?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) yield text;
      } catch { /* skip malformed */ }
    }
  }
}

// ---------- Groq (fallback) ----------

const GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

async function* callGroq(req: LLMRequest): AsyncGenerator<string> {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) throw new Error("GROQ_API_KEY missing");

  // Groq uses OpenAI-compatible Chat Completions. No native image support on the
  // text models we use, so images are silently dropped when falling back.
  const messages = [
    { role: "system", content: req.system },
    ...req.history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: req.userMessage },
  ];

  const resp = await fetch(GROQ_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0.3,
      max_tokens: 2048,
      stream: true,
    }),
  });
  if (!resp.ok || !resp.body) {
    throw new Error(`Groq error ${resp.status}: ${await resp.text()}`);
  }

  const reader = resp.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += value;
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const json = line.slice(5).trim();
      if (!json || json === "[DONE]") continue;
      try {
        const obj = JSON.parse(json);
        const delta = obj?.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch { /* skip malformed */ }
    }
  }
}

// ---------- Public entry: tries Gemini, falls back to Groq on quota/server errors ----------

function isRetryableProviderError(err: unknown): boolean {
  const msg = String(err);
  return /\b(429|503|500|RESOURCE_EXHAUSTED|UNAVAILABLE|quota)\b/i.test(msg);
}

export async function* callLLM(req: LLMRequest): AsyncGenerator<string> {
  let firstChunk = true;
  try {
    for await (const chunk of callGemini(req)) {
      firstChunk = false;
      yield chunk;
    }
    return;
  } catch (err) {
    if (!firstChunk) {
      // Already streaming — can't safely restart mid-response. Bubble up.
      throw err;
    }
    const groqKey = Deno.env.get("GROQ_API_KEY");
    if (!groqKey || !isRetryableProviderError(err)) {
      throw err;
    }
    console.warn("[llm] Gemini failed, falling back to Groq:", String(err).slice(0, 200));
  }

  // Fallback path (Gemini failed before producing any token, Groq key present)
  for await (const chunk of callGroq(req)) {
    yield chunk;
  }
}
