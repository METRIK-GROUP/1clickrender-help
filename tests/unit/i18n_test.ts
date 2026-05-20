import { assertEquals, assertStringIncludes } from "std/assert/mod.ts";
import { systemPromptFor, type Lang } from "../../supabase/functions/_shared/i18n.ts";

Deno.test("systemPromptFor includes KB", () => {
  const p = systemPromptFor("pt-br", "FAKE_KB_CONTENT");
  assertStringIncludes(p, "FAKE_KB_CONTENT");
});

Deno.test("systemPromptFor pt-br instructs Portuguese", () => {
  const p = systemPromptFor("pt-br", "kb");
  assertStringIncludes(p.toLowerCase(), "portugu");
});

Deno.test("systemPromptFor en instructs English + translation from PT KB", () => {
  const p = systemPromptFor("en", "kb");
  assertStringIncludes(p.toLowerCase(), "english");
  assertStringIncludes(p.toLowerCase(), "portuguese");
});

Deno.test("systemPromptFor es instructs Spanish + translation", () => {
  const p = systemPromptFor("es", "kb");
  assertStringIncludes(p.toLowerCase(), "spanish");
});

Deno.test("systemPromptFor includes anti-jailbreak instruction", () => {
  const p = systemPromptFor("pt-br", "kb");
  assertStringIncludes(p.toLowerCase(), "never reveal");
});

Deno.test("Lang type accepts only valid langs", () => {
  const langs: Lang[] = ["pt-br", "en", "es"];
  assertEquals(langs.length, 3);
});
