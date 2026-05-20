import { assertEquals, assertRejects } from "std/assert/mod.ts";
import { signJWT, verifyJWT } from "../../supabase/functions/_shared/auth.ts";

Deno.env.set("JWT_SECRET", "test-secret-with-enough-entropy-32chars");

Deno.test("signJWT then verifyJWT round-trip", async () => {
  const token = await signJWT({ sub: "session-123", scope: "chat" }, 3600);
  const payload = await verifyJWT(token);
  assertEquals(payload.sub, "session-123");
  assertEquals(payload.scope, "chat");
});

Deno.test("verifyJWT rejects expired token", async () => {
  const token = await signJWT({ sub: "x" }, -1);
  await assertRejects(() => verifyJWT(token), Error, "expired");
});

Deno.test("verifyJWT rejects tampered token", async () => {
  const token = await signJWT({ sub: "x" }, 3600);
  const tampered = token.slice(0, -3) + "AAA";
  await assertRejects(() => verifyJWT(tampered), Error);
});

Deno.test("verifyJWT rejects token signed with different secret", async () => {
  const token = await signJWT({ sub: "x" }, 3600);
  Deno.env.set("JWT_SECRET", "different-secret-with-32chars-ok-yep");
  await assertRejects(() => verifyJWT(token), Error);
  Deno.env.set("JWT_SECRET", "test-secret-with-enough-entropy-32chars");
});
