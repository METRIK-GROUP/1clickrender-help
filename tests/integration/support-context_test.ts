import { assertEquals, assert } from "std/assert/mod.ts";

const URL = Deno.env.get("EDGE_BASE_URL") ?? "http://localhost:54321/functions/v1";

Deno.test({
  name: "POST /support-context returns token and url",
  ignore: !Deno.env.get("RUN_INTEGRATION"),
  fn: async () => {
    const resp = await fetch(`${URL}/support-context`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "1.2.3.4" },
      body: JSON.stringify({
        license_id: "test-license-id",
        sketchup_version: "2024",
        last_error: "host_unknown",
        os: "windows",
        plugin_version: "1.0.0",
      }),
    });
    assertEquals(resp.status, 200);
    const body = await resp.json();
    assert(body.token);
    assert(body.url.includes("help.1clickrender.com.br"));
  },
});

Deno.test({
  name: "POST /support-context rejects missing fields",
  ignore: !Deno.env.get("RUN_INTEGRATION"),
  fn: async () => {
    const resp = await fetch(`${URL}/support-context`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ license_id: "x" }),
    });
    assertEquals(resp.status, 400);
  },
});
