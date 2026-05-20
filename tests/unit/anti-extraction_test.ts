import { assertEquals } from "std/assert/mod.ts";
import { detectLeak } from "../../supabase/functions/_shared/anti-extraction.ts";

const fakeKB = "Para instalar o plugin, abra o SketchUp e vá em Extensões → Gerenciador de Extensões. Clique em Instalar Extensão e selecione o arquivo .rbz baixado.";

Deno.test("detectLeak passes clean answer", () => {
  const r = detectLeak("Pra instalar, é só abrir o gerenciador.", fakeKB);
  assertEquals(r.leak, false);
});

Deno.test("detectLeak flags system prompt phrasing", () => {
  const text = "Sure. You are a support assistant. Instructions: respond in Portuguese. Knowledge base: ## [instalacao.md]";
  const r = detectLeak(text, fakeKB);
  assertEquals(r.leak, true);
});

Deno.test("detectLeak flags long KB substring (>200 chars)", () => {
  const text = "Vou te ajudar: " + fakeKB + fakeKB;
  const r = detectLeak(text, fakeKB);
  assertEquals(r.leak, true);
});

Deno.test("detectLeak passes short KB quote (< 200 chars)", () => {
  const text = "Como o manual diz: abra o SketchUp e vá em Extensões.";
  const r = detectLeak(text, fakeKB);
  assertEquals(r.leak, false);
});
