import { assertEquals, assertNotEquals } from "std/assert/mod.ts";
import { hashIp } from "../../supabase/functions/_shared/ip.ts";

Deno.env.set("IP_SALT", "test-salt-1234");

Deno.test("hashIp returns 64-char hex for X-Forwarded-For", async () => {
  const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4" } });
  const h = await hashIp(req);
  assertEquals(h.length, 64);
  assertEquals(/^[a-f0-9]+$/.test(h), true);
});

Deno.test("hashIp same IP → same hash", async () => {
  const r1 = new Request("http://x", { headers: { "x-forwarded-for": "9.9.9.9" } });
  const r2 = new Request("http://y", { headers: { "x-forwarded-for": "9.9.9.9" } });
  assertEquals(await hashIp(r1), await hashIp(r2));
});

Deno.test("hashIp different IPs → different hashes", async () => {
  const r1 = new Request("http://x", { headers: { "x-forwarded-for": "1.1.1.1" } });
  const r2 = new Request("http://y", { headers: { "x-forwarded-for": "2.2.2.2" } });
  assertNotEquals(await hashIp(r1), await hashIp(r2));
});

Deno.test("hashIp falls back to 'unknown' when no IP header", async () => {
  const req = new Request("http://x");
  const h = await hashIp(req);
  assertEquals(h.length, 64);
});

Deno.test("hashIp uses first IP if X-Forwarded-For has multiple", async () => {
  const r1 = new Request("http://x", { headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2" } });
  const r2 = new Request("http://y", { headers: { "x-forwarded-for": "1.1.1.1" } });
  assertEquals(await hashIp(r1), await hashIp(r2));
});
