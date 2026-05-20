import { assertEquals, assert } from "std/assert/mod.ts";

const URL = Deno.env.get("EDGE_BASE_URL") ?? "http://localhost:54321/functions/v1";

Deno.test({
  name: "admin-auth issues cookie with correct password",
  ignore: !Deno.env.get("RUN_INTEGRATION"),
  fn: async () => {
    const r = await fetch(`${URL}/admin-auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: Deno.env.get("ADMIN_PASSWORD") }),
    });
    assertEquals(r.status, 200);
    const cookie = r.headers.get("set-cookie") ?? "";
    assert(cookie.includes("admin_token="));
    assert(cookie.includes("HttpOnly"));
  },
});

Deno.test({
  name: "admin-auth rejects wrong password",
  ignore: !Deno.env.get("RUN_INTEGRATION"),
  fn: async () => {
    const r = await fetch(`${URL}/admin-auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "wrong" }),
    });
    assertEquals(r.status, 401);
  },
});

Deno.test({
  name: "admin-data requires auth",
  ignore: !Deno.env.get("RUN_INTEGRATION"),
  fn: async () => {
    const r = await fetch(`${URL}/admin-data?endpoint=overview`);
    assertEquals(r.status, 401);
    await r.body?.cancel();
  },
});
