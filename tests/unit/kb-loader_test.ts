import { assertEquals, assertStringIncludes } from "std/assert/mod.ts";
import { loadKB } from "../../supabase/functions/_shared/kb-loader.ts";

const FIXTURE = new URL("../fixtures/kb-cache.json", import.meta.url).pathname;

Deno.test("loadKB returns pt-br content", async () => {
  const kb = await loadKB("pt-br", FIXTURE);
  assertStringIncludes(kb, "Bem-vindo");
  assertStringIncludes(kb, "instalacao.md");
});

Deno.test("loadKB returns empty string for unbuilt en", async () => {
  const kb = await loadKB("en", FIXTURE);
  assertEquals(kb, "");
});

Deno.test("loadKB caches in memory (no second read)", async () => {
  const kb1 = await loadKB("pt-br", FIXTURE);
  const kb2 = await loadKB("pt-br", FIXTURE);
  assertEquals(kb1, kb2);
});
