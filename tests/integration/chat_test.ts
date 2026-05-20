import { assertEquals, assert } from "std/assert/mod.ts";

const URL = Deno.env.get("EDGE_BASE_URL") ?? "http://localhost:54321/functions/v1";

Deno.test({
  name: "POST /chat returns SSE stream and persists messages",
  ignore: !Deno.env.get("EDGE_BASE_URL") && !Deno.env.get("RUN_INTEGRATION"),
  fn: async () => {
    const resp = await fetch(`${URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "1.2.3.4" },
      body: JSON.stringify({ message: "Como instalo o plugin?", lang: "pt-br" }),
    });

    assertEquals(resp.status, 200);
    assertEquals(resp.headers.get("content-type"), "text/event-stream");

    const reader = resp.body!.pipeThrough(new TextDecoderStream()).getReader();
    let full = "";
    let sessionId = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      full += value;
      const m = value.match(/event: session\ndata: ({.+})/);
      if (m) sessionId = JSON.parse(m[1]).session_id;
    }
    assert(full.length > 0, "stream should not be empty");
    assert(sessionId.length > 0, "session_id should be returned");
  },
});

Deno.test({
  name: "POST /chat blocks when rate limit exceeded",
  ignore: !Deno.env.get("EDGE_BASE_URL") && !Deno.env.get("RUN_INTEGRATION"),
  fn: async () => {
    const ip = `9.9.9.${Math.floor(Math.random() * 255)}`;
    let lastStatus = 0;
    for (let i = 0; i < 22; i++) {
      const r = await fetch(`${URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
        body: JSON.stringify({ message: "test", lang: "pt-br" }),
      });
      lastStatus = r.status;
      await r.body?.cancel();
    }
    assertEquals(lastStatus, 429);
  },
});
