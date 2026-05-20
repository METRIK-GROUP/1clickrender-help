import { assertEquals } from "std/assert/mod.ts";
import { validateImageBase64 } from "../../supabase/functions/_shared/validate-image.ts";

// 1px PNG (8 magic bytes + minimal payload)
const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

// "Hello World" as base64
const TEXT_B64 = "SGVsbG8gV29ybGQ=";

Deno.test("validateImageBase64 accepts valid PNG", () => {
  const r = validateImageBase64(TINY_PNG_B64);
  assertEquals(r.valid, true);
  assertEquals(r.mime, "image/png");
});

Deno.test("validateImageBase64 rejects text disguised as image", () => {
  const r = validateImageBase64(TEXT_B64);
  assertEquals(r.valid, false);
});

Deno.test("validateImageBase64 rejects > 4MB", () => {
  const bigB64 = "A".repeat(6_000_000); // ~4.5MB decoded
  const r = validateImageBase64(bigB64);
  assertEquals(r.valid, false);
  assertEquals(r.reason, "too_large");
});

Deno.test("validateImageBase64 rejects empty string", () => {
  const r = validateImageBase64("");
  assertEquals(r.valid, false);
});

Deno.test("validateImageBase64 strips data URL prefix", () => {
  const r = validateImageBase64("data:image/png;base64," + TINY_PNG_B64);
  assertEquals(r.valid, true);
  assertEquals(r.mime, "image/png");
});
