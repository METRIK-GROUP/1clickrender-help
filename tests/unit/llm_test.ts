import { assertEquals, assertStringIncludes } from "std/assert/mod.ts";
import { buildGeminiRequest } from "../../supabase/functions/_shared/llm.ts";

Deno.test("buildGeminiRequest includes system in systemInstruction", () => {
  const r = buildGeminiRequest({
    system: "You are X.",
    history: [],
    userMessage: "hi",
    lang: "pt-br",
  });
  assertEquals(r.systemInstruction.parts[0].text, "You are X.");
});

Deno.test("buildGeminiRequest converts history roles correctly", () => {
  const r = buildGeminiRequest({
    system: "x",
    history: [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ],
    userMessage: "and again",
    lang: "pt-br",
  });
  assertEquals(r.contents[0].role, "user");
  assertEquals(r.contents[1].role, "model");
  assertEquals(r.contents[2].role, "user");
  assertEquals(r.contents[2].parts[0].text, "and again");
});

Deno.test("buildGeminiRequest attaches inline image", () => {
  const r = buildGeminiRequest({
    system: "x",
    history: [],
    userMessage: "what is this",
    lang: "pt-br",
    image: { mime: "image/png", base64: "iVBORw0KGgo=" },
  });
  const parts = r.contents[0].parts;
  assertEquals(parts.length, 2);
  assertEquals(parts[1].inlineData.mimeType, "image/png");
});

Deno.test("buildGeminiRequest enables prompt caching for system", () => {
  const r = buildGeminiRequest({
    system: "x".repeat(5000),
    history: [],
    userMessage: "hi",
    lang: "pt-br",
  });
  assertStringIncludes(JSON.stringify(r), "cachedContent");
});
