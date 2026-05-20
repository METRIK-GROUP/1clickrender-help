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

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent`;

export async function* callLLM(req: LLMRequest): AsyncGenerator<string> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");

  const payload = buildGeminiRequest(req);
  delete payload.cachedContent; // sentinel was for the unit test only

  const resp = await fetch(`${ENDPOINT}?alt=sse&key=${apiKey}`, {
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
